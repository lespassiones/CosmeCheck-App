// profile-restriction-inference — worker BACK-END (invisible pour l'utilisateur).
//
// À partir du PROFIL (types de peau, préoccupations, objectifs, allergies) et
// des restrictions DÉJÀ cochées, déduit les restrictions PROBABLES de
// l'utilisateur (jamais activées : simple récapitulatif « items » affiché en
// lecture seule dans le profil et injecté comme INDICES dans personal-insights
// et le Beauty Advisor).
//
// ASSURANCE multi-modèles (demande user) : proposition gpt-4o-mini → relecture
// gpt-5-mini → relecture Mistral (fournisseur différent) → relecture finale
// gpt-5-mini SEULEMENT si la passe précédente a encore modifié la liste.
// ARRÊT ANTICIPÉ dès qu'un relecteur répond « complet, rien à changer ».
//
// FILE D'ATTENTE : la table cosme_check.profile_restriction_inference EST la
// queue (status pending/processing/done/error). Claim ATOMIQUE via la RPC
// claim_profile_inference() (FOR UPDATE SKIP LOCKED + reprise des processing
// morts > 15 min). Le cron appelle ce worker à cadence douce ; chaque run
// traite AU PLUS `MAX_USERS_PER_RUN` comptes → jamais de saturation API.
//
// Déploiement --no-verify-jwt : auth par header partagé `x-dispatch-secret`
// (fail-closed), même mécanique que push-dispatch / call_edge.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasMistral, hasOpenAI, mistralChat, MISTRAL_MODEL, openai, sha256Hex } from "../_shared/aiClient.ts";
import { loadUserContext } from "../synthesis/lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DISPATCH_SECRET = Deno.env.get("NOTIF_DISPATCH_SECRET") || "";

const MAX_USERS_PER_RUN = 3; // pool doux : le cron repassera
const MAX_ITEMS = 8;
const MAX_ATTEMPTS = 5;

type InferredItem = { label: string; slug: string | null; reason: string };
type Review = { complete: boolean; add: InferredItem[]; remove: string[] };

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  let t = raw.trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try {
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

function cleanItems(
  raw: unknown,
  familyBySlug: Map<string, string>,
  slugByName: Map<string, string>,
  explicitNorms: Set<string>,
): InferredItem[] {
  if (!Array.isArray(raw)) return [];
  const out: InferredItem[] = [];
  const seen = new Set<string>();
  for (const it of raw as Record<string, unknown>[]) {
    if (!it || typeof it !== "object") continue;
    const label = typeof it.label === "string" ? it.label.trim().slice(0, 40) : "";
    if (!label) continue;
    const key = norm(label);
    if (!key || seen.has(key) || explicitNorms.has(key)) continue;
    seen.add(key);
    let slug = typeof it.slug === "string" && familyBySlug.has(it.slug) ? it.slug : null;
    if (!slug) slug = slugByName.get(key) ?? null;
    const reason = typeof it.reason === "string" ? it.reason.trim().slice(0, 90) : "";
    out.push({ label, slug, reason });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function applyReview(items: InferredItem[], review: Review, ...cleanArgs: [Map<string, string>, Map<string, string>, Set<string>]): { items: InferredItem[]; changed: boolean } {
  let changed = false;
  let next = items.slice();
  const removeNorms = new Set((review.remove ?? []).map(norm).filter(Boolean));
  if (removeNorms.size > 0) {
    const before = next.length;
    next = next.filter((i) => !removeNorms.has(norm(i.label)));
    if (next.length !== before) changed = true;
  }
  const adds = cleanItems(review.add, ...cleanArgs).filter(
    (a) => !next.some((i) => norm(i.label) === norm(a.label)),
  );
  if (adds.length > 0) {
    next = [...next, ...adds].slice(0, MAX_ITEMS);
    changed = true;
  }
  return { items: next, changed };
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Auth fail-closed par secret partagé (même mécanique que push-dispatch).
  if (!DISPATCH_SECRET) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), { status: 500 });
  }
  if ((req.headers.get("x-dispatch-secret") || "") !== DISPATCH_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  if (!hasOpenAI() && !hasMistral()) {
    return new Response(JSON.stringify({ error: "no_ai_provider" }), { status: 503 });
  }

  const service = createClient(SUPABASE_URL, SERVICE_KEY);
  const db = service.schema("cosme_check");

  // Familles de restrictions connues (mapping label → slug canonique).
  const { data: fams } = await db.from("ingredient_families").select("slug, name").limit(200);
  const familyBySlug = new Map<string, string>();
  const slugByName = new Map<string, string>();
  for (const f of fams ?? []) {
    if (f.slug && f.name) {
      familyBySlug.set(f.slug as string, f.name as string);
      slugByName.set(norm(f.name as string), f.slug as string);
    }
  }
  const familyCatalog = [...familyBySlug.entries()]
    .map(([slug, name]) => `${name} (slug: ${slug})`)
    .join(", ");

  const results: Record<string, unknown>[] = [];

  for (let n = 0; n < MAX_USERS_PER_RUN; n++) {
    const { data: claimed } = await db.rpc("claim_profile_inference");
    const userId = (claimed ?? null) as string | null;
    if (!userId) break;

    const fail = async (msg: string) => {
      const { data: row } = await db
        .from("profile_restriction_inference")
        .select("attempts")
        .eq("user_id", userId)
        .maybeSingle();
      const attempts = (row?.attempts as number | undefined) ?? 0;
      await db
        .from("profile_restriction_inference")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "error" : "pending",
          error: msg.slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      results.push({ userId, ok: false, error: msg });
    };

    try {
      // Profil + restrictions EXPLICITES via le même chemin que personal-insights.
      const ctx = await loadUserContext(service as never, userId);
      const profileBlock = ctx.profileBlock;
      const restrictionsBlock = ctx.restrictions.block;

      // Profil vide → rien à inférer (ligne done, items vides).
      if (!profileBlock) {
        await db
          .from("profile_restriction_inference")
          .update({
            status: "done", items: [], passes: 0, models: [], error: null,
            profile_hash: await sha256Hex("empty"),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
        results.push({ userId, ok: true, skipped: "empty_profile" });
        continue;
      }

      const hash = await sha256Hex(`${profileBlock}|${restrictionsBlock ?? ""}|v1`);
      const { data: existing } = await db
        .from("profile_restriction_inference")
        .select("profile_hash, items")
        .eq("user_id", userId)
        .maybeSingle();
      if (existing?.profile_hash === hash) {
        await db
          .from("profile_restriction_inference")
          .update({ status: "done", error: null, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
        results.push({ userId, ok: true, skipped: "unchanged" });
        continue;
      }

      const explicitNorms = new Set(
        (restrictionsBlock ?? "")
          .split(/[,;•\n]/)
          .map((s) => norm(s))
          .filter((s) => s.length >= 3),
      );

      const baseContext = [
        "PROFIL DE L'UTILISATEUR :",
        profileBlock,
        restrictionsBlock ? `RESTRICTIONS DÉJÀ COCHÉES PAR L'UTILISATEUR (ne JAMAIS les re-proposer) : ${restrictionsBlock}` : "RESTRICTIONS DÉJÀ COCHÉES : aucune.",
        `FAMILLES CONNUES de l'app (si une suggestion correspond, renvoie son slug ; sinon slug null) : ${familyCatalog || "(aucune)"}`,
      ].join("\n");

      const rules = [
        "Tu déduis les RESTRICTIONS PROBABLES d'un utilisateur de cosmétiques à partir de son profil : les ingrédients/familles qu'il aurait intérêt à ÉVITER même s'il ne les a pas cochés (il connaît son problème, pas toujours la cause).",
        "Exemples de liens fondés : peau sèche/sensible → alcool asséchant ; peau sensible/rougeurs/eczéma → parfum et allergènes de parfum, huiles essentielles ; acné/peau grasse → huiles comédogènes (coco, cacao…) ; cuir chevelu sensible/pellicules → sulfates agressifs ; cheveux secs/cassants → sulfates, alcools asséchants ; allergie déclarée → la famille correspondante.",
        "UNIQUEMENT des liens dermatologiquement RECONNUS et justifiés par CE profil. Ne remplis pas pour remplir : 0 item est une réponse valable. Maximum 8.",
        "label : nom court grand public (ex « Alcool asséchant », « Sulfates », « Parfum / allergènes »). reason : justification COURTE liée au profil (ex « peau sensible déclarée »). slug : slug de la famille connue correspondante, sinon null.",
      ].join("\n");

      let items: InferredItem[] = [];
      const models: string[] = [];
      let passes = 0;

      // ── Passe 1 : PROPOSITION (gpt-4o-mini) ─────────────────────────────
      if (hasOpenAI()) {
        const r1 = await openai().chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.2,
          max_tokens: 600,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `${rules}\nRéponds en JSON strict : {"items":[{"label":"","slug":null,"reason":""}]}` },
            { role: "user", content: baseContext },
          ],
        });
        const parsed = parseJson<{ items: unknown }>(r1.choices?.[0]?.message?.content);
        items = cleanItems(parsed?.items, familyBySlug, slugByName, explicitNorms);
        models.push("gpt-4o-mini");
        passes++;
      }

      // ── Passes 2-4 : RELECTURES (gpt-5-mini → mistral → gpt-5-mini) ──────
      const reviewSystem = `${rules}\nOn te montre la liste ACTUELLE des restrictions probables déduites. RELIS-la de façon critique : manque-t-il un lien fondé ? Y a-t-il un item injustifié pour CE profil ? Réponds en JSON strict : {"complete":true|false,"add":[{"label":"","slug":null,"reason":""}],"remove":["label à retirer"]} — complete=true si la liste est bonne telle quelle (add et remove vides).`;
      const reviewUser = () =>
        `${baseContext}\n\nLISTE ACTUELLE :\n${items.length ? items.map((i) => `- ${i.label} (${i.reason})`).join("\n") : "(vide)"}`;

      const reviewers: { name: string; call: () => Promise<string | null> }[] = [];
      if (hasOpenAI()) {
        const gpt5 = async () => {
          // gpt-5 : pas de temperature/max_tokens (params non supportés), effort bas.
          // deno-lint-ignore no-explicit-any
          const args: any = {
            model: "gpt-5-mini",
            reasoning_effort: "low",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: reviewSystem },
              { role: "user", content: reviewUser() },
            ],
          };
          const r = await openai().chat.completions.create(args);
          return r.choices?.[0]?.message?.content ?? null;
        };
        reviewers.push({ name: "gpt-5-mini", call: gpt5 });
        if (hasMistral()) {
          reviewers.push({
            name: MISTRAL_MODEL,
            call: () =>
              mistralChat({
                model: MISTRAL_MODEL,
                temperature: 0.2,
                maxTokens: 500,
                messages: [
                  { role: "system", content: `${reviewSystem}\nRéponds UNIQUEMENT avec l'objet JSON.` },
                  { role: "user", content: reviewUser() },
                ],
              }),
          });
        }
        reviewers.push({ name: "gpt-5-mini", call: gpt5 }); // passe 4 conditionnelle
      }

      let lastChanged = true;
      for (let i = 0; i < reviewers.length; i++) {
        // La passe finale (4e) ne tourne que si la précédente a ENCORE modifié.
        if (i === reviewers.length - 1 && !lastChanged) break;
        const rev = reviewers[i];
        try {
          const raw = await rev.call();
          const review = parseJson<Review>(raw);
          if (!review) continue;
          models.push(rev.name);
          passes++;
          const applied = applyReview(items, review, familyBySlug, slugByName, explicitNorms);
          items = applied.items;
          lastChanged = applied.changed;
          // « Tout bon, rien à changer » → on s'arrête là (demande user).
          if (review.complete && !applied.changed) break;
        } catch {
          // Relecteur indisponible (quota/panne) : on continue avec la liste courante.
        }
      }

      await db
        .from("profile_restriction_inference")
        .update({
          status: "done",
          items,
          passes,
          models,
          error: null,
          profile_hash: hash,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      results.push({ userId, ok: true, items: items.length, passes });
    } catch (e) {
      await fail(e instanceof Error ? e.message : String(e));
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
