/**
 * Edge Function `advisor-chat` — port de
 * `CosmetWiki/app/api/advisor/chat/route.ts` vers Supabase Edge (Deno).
 *
 * Assistant cosmétique factuel, EN STREAMING. Pipeline (ordre IDENTIQUE au web) :
 *   1. Rate-limit IP burst (service-role RPC cosme_check_check_rate_limit,
 *      20/min, clé `burst:chat:<ip>`). 429 si dépassé.
 *   2. Garde-fou clé IA : 503 si ni OpenAI ni Mistral.
 *   3. Parse {messages:[{role,content}]} : 12 derniers tours, contenu ≤2000.
 *   4. Auth Bearer (401 sinon) via le client lié au token utilisateur (RLS).
 *   5. Fan-out parallèle : compteur quotidien (ai_logs feature=synthesis du
 *      jour), profil (user_profiles.preferences) et routine
 *      (routine_items + analyses). Cap 30/jour → 429.
 *   6. Construit le system prompt (profil + restrictions + routine), puis
 *      STREAM text/plain : OpenAI streaming primaire -> Mistral streaming
 *      fallback (uniquement si OpenAI échoue AVANT toute émission).
 *
 * Crédit : 0 (aucun débit). Sortie : Response streaming text/plain + CORS,
 * ou JSON d'erreur (400/401/429/503).
 */
import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest, serviceClient } from "../_shared/auth.ts";
import { hasMistral, hasOpenAI, logAI, MISTRAL_API_URL, openai } from "../_shared/aiClient.ts";
import { NO_LONG_DASHES_RULE } from "../_shared/sanitize.ts";
import {
  loadFamilyLabels,
  readSkinProfile,
  readUserRestrictions,
  SKIN_CONCERN_LABEL,
  SKIN_TYPE_BODY_LABEL,
  SKIN_TYPE_FACE_LABEL,
} from "./lib.ts";
import { normalizeRoutineRows } from "./routineNormalize.ts";

const MODEL = "gpt-4o-mini";
const MISTRAL_MODEL = "mistral-small-latest";
const MAX_MESSAGES_PER_DAY = 30;

type ChatMessage = { role: "user" | "assistant"; content: string };

// Le détail de la normalisation routine vit dans ./routineNormalize.ts (pur,
// testé séparément en env node) — voir lib/__tests__/advisorRoutineNormalize.test.ts.

function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "0.0.0.0";
}

/**
 * Sanitization tiret par chunk (mirror web) : remplace cadratin/demi-cadratin
 * et " - " intercalaire par ", ". Conservateur : ne touche pas aux mots
 * composés (peut-être) ni aux puces markdown en début de ligne.
 */
function cleanChunk(s: string): string {
  return s.replace(/[ \t]*[–—][ \t]*/g, ", ").replace(/ - /g, ", ");
}

/**
 * Streame une réponse chat depuis Mistral (SSE compatible OpenAI). Émet chaque
 * token dans `controller`. Renvoie les compteurs de tokens pour le log.
 */
async function streamMistralChat(opts: {
  system: string;
  messages: ChatMessage[];
  controller: ReadableStreamDefaultController<Uint8Array>;
  enc: TextEncoder;
}): Promise<{ tokensIn: number; tokensOut: number }> {
  const { system, messages, controller, enc } = opts;
  const resp = await fetch(MISTRAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("MISTRAL_API_KEY")}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      temperature: 0.4,
      max_tokens: 600,
      stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!resp.ok || !resp.body) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Mistral ${resp.status}: ${body.slice(0, 200)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let tokensIn = 0;
  let tokensOut = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return { tokensIn, tokensOut };
      try {
        const parsed = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) controller.enqueue(enc.encode(cleanChunk(delta)));
        if (parsed.usage) {
          tokensIn = parsed.usage.prompt_tokens ?? 0;
          tokensOut = parsed.usage.completion_tokens ?? 0;
        }
      } catch {
        // Skip malformed SSE payloads silently.
      }
    }
  }

  return { tokensIn, tokensOut };
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // ── 1. Rate-limit IP burst (Postgres, partagé) ──────────────────────────
  const ip = getClientIp(req.headers);
  const svc = serviceClient();
  const { data: rateData } = await svc.rpc("cosme_check_check_rate_limit", {
    p_key: `burst:chat:${ip}`,
    p_max: 20,
    p_window_sec: 60,
  });
  const rate = (rateData ?? { ok: true }) as { ok: boolean };
  if (!rate.ok) {
    return jsonResponse(
      { error: "Trop de messages récents. Patiente une minute." },
      { status: 429 },
    );
  }

  // ── 2. Garde-fou clé IA ──────────────────────────────────────────────────
  if (!hasOpenAI() && !hasMistral()) {
    return jsonResponse({ error: "Assistant indisponible pour le moment." }, { status: 503 });
  }

  // ── 3. Parse body ────────────────────────────────────────────────────────
  let body: { messages?: unknown };
  try {
    body = (await req.json()) as { messages?: unknown };
  } catch {
    return jsonResponse({ error: "Invalid body" }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatMessage[] = raw
    .filter((m): m is { role: string; content: string } =>
      typeof m === "object"
      && m !== null
      && typeof (m as { role?: unknown }).role === "string"
      && typeof (m as { content?: unknown }).content === "string",
    )
    .map<ChatMessage>((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content.slice(0, 2000),
    }))
    .slice(-12);
  if (messages.length === 0) {
    return jsonResponse({ error: "Pas de message" }, { status: 400 });
  }

  // ── 4. Auth Bearer (client lié au token → RLS) ───────────────────────────
  const auth = await getUserFromRequest(req);
  if (!auth.ok) {
    return jsonResponse({ error: "Non connecté." }, { status: 401 });
  }
  const { user, supabase: sb } = auth;

  // ── 5. Fan-out parallèle : cap quotidien + profil + routine ──────────────
  //
  // Optimisation : on essaie d'abord la RPC `cosme_check_get_routine_tags`,
  // qui agrège les `tags` côté Postgres et ÉVITE de transférer `result_json`
  // (gain : ~360 KB → ~3 KB par message). Si la RPC n'est pas déployée (ex.
  // édition en cours, ancien projet), on retombe sur le select classique
  // pour ne JAMAIS casser la fonction en prod.
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [usedTodayRes, profileRes, routineRpcRes] = await Promise.all([
    sb
      .schema("cosme_check")
      .from("ai_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("feature", "synthesis")
      .gte("created_at", since.toISOString()),
    sb
      .schema("cosme_check")
      .from("user_profiles")
      .select("first_name, preferences")
      .eq("id", user.id)
      .maybeSingle(),
    sb.rpc("cosme_check_get_routine_tags", { p_limit: 12 }),
  ]);

  // Fallback gracieux : si la RPC n'existe pas (404) ou retourne une erreur,
  // on relit la routine via le select classique avec result_json.
  let routineRes: { data: unknown; error: unknown };
  if (routineRpcRes.error) {
    routineRes = await sb
      .schema("cosme_check")
      .from("routine_items")
      .select("frequency, analyses(name, product_label, score, result_json)")
      .eq("user_id", user.id)
      .limit(12);
  } else {
    routineRes = routineRpcRes;
  }

  const usedToday = usedTodayRes.count;
  if ((usedToday ?? 0) > MAX_MESSAGES_PER_DAY) {
    return jsonResponse(
      { error: `Limite quotidienne atteinte (${MAX_MESSAGES_PER_DAY}/jour). À demain !` },
      { status: 429 },
    );
  }

  // Profil + restrictions
  const profileRow = profileRes.data as { preferences?: unknown } | null;
  const prefs = (profileRow?.preferences ?? null) as Record<string, unknown> | null;
  const skin = readSkinProfile(prefs);
  const restrictions = readUserRestrictions(prefs);
  const hasRestrictions =
    restrictions.families.length > 0 || restrictions.ingredients.length > 0;

  const familyLabelBySlug = hasRestrictions ? await loadFamilyLabels(sb) : new Map<string, string>();
  const restrictedFamilyNames = restrictions.families
    .map((s) => familyLabelBySlug.get(s))
    .filter((n): n is string => Boolean(n));
  const restrictedIngredientNames = restrictions.ingredients.map((i) => i.name);
  const restrictionsSummary = hasRestrictions
    ? [
        restrictedFamilyNames.length > 0
          ? `Familles évitées : ${restrictedFamilyNames.join(", ")}`
          : "",
        restrictedIngredientNames.length > 0
          ? `Ingrédients évités : ${restrictedIngredientNames.join(", ")}`
          : "",
      ].filter(Boolean).join("\n")
    : "Restrictions : aucune";

  // Routine — normalise les 2 formes possibles :
  //   A) Rows RPC          : { name, product_label, score, frequency, tags: string[] }
  //   B) Rows embed legacy : { frequency, analyses: { name, product_label, score, result_json } }
  const routineFacts = normalizeRoutineRows(routineRes.data);

  const faceLabel = skin.skinTypeFace
    ? SKIN_TYPE_FACE_LABEL[skin.skinTypeFace]
    : skin.otherSkinTypeFace;
  const bodyLabel = skin.skinTypeBody
    ? SKIN_TYPE_BODY_LABEL[skin.skinTypeBody]
    : skin.otherSkinTypeBody;
  const profileSummary = [
    faceLabel ? `Type de peau visage : ${faceLabel}` : "Type de peau visage : non renseigné",
    bodyLabel ? `Type de peau corps : ${bodyLabel}` : "Type de peau corps : non renseigné",
    skin.concerns && skin.concerns.length > 0
      ? `Préoccupations : ${skin.concerns.map((c) => SKIN_CONCERN_LABEL[c] ?? c).join(", ")}`
      : "Préoccupations : non renseignées",
    skin.allergiesFreeform
      ? `Allergies / intolérances : ${skin.allergiesFreeform}`
      : "",
  ].filter(Boolean).join("\n");

  const routineSummary = routineFacts.length === 0
    ? "Routine : (aucune)"
    : "Routine :\n" + routineFacts
        .map((r) => `- ${r.name} (${r.score?.toFixed(1) ?? "?"}/20, ${r.frequency}, tags: ${r.tags.join(", ") || "(aucun)"})`)
        .join("\n");

  const system = `Tu es un assistant cosmétique factuel pour Cosme Check. Tu réponds à un consommateur français à partir de FAITS et UNIQUEMENT à partir de faits. RÈGLES STRICTES :
- AUCUN conseil médical, AUCUN diagnostic, AUCUNE mention de marque.
- Si la question relève du soin médical (acné sévère, rosacée diagnostiquée, eczéma...), oriente vers un dermatologue.
- Tu peux mentionner des ingrédients (par leur nom INCI) connus pour une catégorie (ex. niacinamide, acide salicylique, panthénol) mais sans recommander un produit précis.
- Tu cites les FAITS PERSONNELS de l'utilisateur (type de peau, routine actuelle) si pertinents, en restant factuel.
- Si la question n'a rien à voir avec la cosmétique, redirige poliment en une phrase.
- CONTEXTE : tu AS déjà accès au profil complet et à la routine de l'utilisateur ci-dessous.
- LONGUEUR : Va droit au but.
- FOCUS : tu peux légèrement rappeler les fait connus mais de maniere très concise, donne directement le conseil ou la suggestion utile.
- FORMAT markdown : **gras** pour les ingrédients clés, *italique* pour les nuances, __souligné__ pour la conclusion, tirets - pour les listes courtes (3 items max).
- QUESTION DE SUIVI : termine TOUJOURS ta réponse par une question courte, intelligente et utile qui fait avancer la conversation (ex. approfondir le besoin, affiner le conseil, proposer un angle complémentaire). La question doit être naturelle, jamais générique.

${NO_LONG_DASHES_RULE}

CONTEXTE UTILISATEUR :
${profileSummary}

${restrictionsSummary}

${routineSummary}

Quand l'utilisateur évoque un produit, vérifie d'abord si la formule contient un ingrédient présent dans ses restrictions et signale-le explicitement. Ne propose jamais un produit qui contient un de ces ingrédients comme alternative.`;

  const t0 = Date.now();

  // ── 6. Streaming (OpenAI primaire -> Mistral fallback) ───────────────────
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let hasEmitted = false;

      const emit = (text: string) => {
        controller.enqueue(enc.encode(text));
        hasEmitted = true;
      };

      // ── 1) OpenAI streaming ────────────────────────────────────────────
      if (hasOpenAI()) {
        let totalIn = 0;
        let totalOut = 0;
        try {
          const completion = await openai().chat.completions.create({
            model: MODEL,
            temperature: 0.4,
            max_tokens: 600,
            stream: true,
            messages: [{ role: "system", content: system }, ...messages],
          });
          for await (const part of completion) {
            const delta = part.choices?.[0]?.delta?.content;
            if (delta) emit(cleanChunk(delta));
            const usage = (part as unknown as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
            if (usage) {
              totalIn = usage.prompt_tokens ?? 0;
              totalOut = usage.completion_tokens ?? 0;
            }
          }
          controller.close();
          logAI({
            feature: "synthesis",
            provider: "openai",
            status: "success",
            tokens_in: totalIn,
            tokens_out: totalOut,
            duration_ms: Date.now() - t0,
            user_id: user.id,
          });
          return;
        } catch (err) {
          if (hasEmitted || !hasMistral()) {
            logAI({
              feature: "synthesis",
              provider: "openai",
              status: "error",
              duration_ms: Date.now() - t0,
              user_id: user.id,
            });
            controller.error(err);
            return;
          }
          // OpenAI a échoué avant toute émission → fallback Mistral silencieux.
          logAI({
            feature: "synthesis",
            provider: "openai",
            status: "fallback",
            duration_ms: Date.now() - t0,
            user_id: user.id,
          });
        }
      }

      // ── 2) Mistral streaming (fallback, ou primaire sans clé OpenAI) ─────
      const tM = Date.now();
      try {
        const usage = await streamMistralChat({ system, messages, controller, enc });
        if (usage.tokensOut > 0) hasEmitted = true;
        controller.close();
        logAI({
          feature: "synthesis",
          provider: "mistral",
          status: hasOpenAI() ? "fallback" : "success",
          tokens_in: usage.tokensIn,
          tokens_out: usage.tokensOut,
          duration_ms: Date.now() - tM,
          user_id: user.id,
        });
      } catch (err) {
        logAI({
          feature: "synthesis",
          provider: "mistral",
          status: "error",
          duration_ms: Date.now() - tM,
          user_id: user.id,
        });
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "X-Accel-Buffering": "no",
    },
  });
});
