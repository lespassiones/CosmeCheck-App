/**
 * Edge Function `routine-organize-ai` — réorganise la routine SOIN par IA.
 *
 * Pipeline :
 *   1. Gate : auth Bearer + rate-limit IP (10/min) + débit DIFFÉRÉ (costCredits 0).
 *   2. Validation du body { products: [{ itemId, name, category?, ingredients? }] }.
 *   3. Lecture du profil peau (personnalisation légère).
 *   4. Débit 1 crédit (l'action est explicite : 1 tap = 1 crédit).
 *   5. Appel gpt-4o-mini (json_object) fallback Mistral : renvoie, par produit,
 *      un créneau binaire 'morning' | 'evening' (règles cosmétiques + profil).
 *   6. Parse défensif -> { ok, placements: [{ itemId, timeOfDay }] }.
 *
 * Le client applique les placements + anime (RoutineSectionList.applyPlacements).
 * Choix binaire matin/soir volontaire (l'utilisateur peut passer un produit en
 * « les deux » manuellement depuis la sous-page de l'item).
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { callWithFallback, mistralChat, openai, AI_MODEL } from "../_shared/aiClient.ts";
import { sanitizePromptValue } from "../_shared/sanitizePrompt.ts";

const PROMPT_VERSION = "v2";

type InProduct = { itemId: string; name: string; category: string | null; ingredients: string[] };

function validate(body: unknown): InProduct[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { products?: unknown }).products;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 60) return null;
  const out: InProduct[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    if (typeof o.itemId !== "string" || !o.itemId) continue;
    const name = typeof o.name === "string" ? o.name : "";
    const category = typeof o.category === "string" ? o.category : null;
    const ingredients = Array.isArray(o.ingredients)
      ? (o.ingredients as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 40)
      : [];
    out.push({ itemId: o.itemId, name, category, ingredients });
  }
  return out.length > 0 ? out : null;
}

function buildPrompt(products: InProduct[], skin: Record<string, unknown> | null) {
  const skinType = typeof skin?.skinType === "string" ? skin.skinType : null;
  const concerns = Array.isArray(skin?.concerns) ? (skin!.concerns as string[]).slice(0, 8) : [];

  const system = [
    "Tu es un dermo-cosmétologue. Tu ranges une routine de SOIN visage en deux créneaux : matin (morning) ou soir (evening).",
    "Règles cosmétiques PRIORITAIRES (elles priment sur ton jugement) :",
    "- Protection solaire (SPF/filtres UV) : TOUJOURS morning.",
    "- Antioxydants (vitamine C, ferulique) : de préférence morning.",
    "- Rétinoïdes (retinol, retinal, rétinaldéhyde) : TOUJOURS evening (photosensibles).",
    "- Exfoliants AHA/BHA/PHA (acide glycolique, lactique, salicylique, mandélique) : de préférence evening.",
    "- Nettoyants : evening si un seul créneau (démaquillage), sinon morning.",
    "ÉVALUATION LIBRE — pour TOUT produit non tranché par les règles ci-dessus (hydratants, sérums, contour des yeux, huiles, masques, actifs non listés) :",
    "- NE retombe JAMAIS sur « morning par défaut ». DÉCIDE d'après les PROPRIÉTÉS RÉELLES des ingrédients fournis :",
    "  - actifs irritants/photosensibilisants (acides doux, actifs éclaircissants) -> evening ;",
    "  - actifs protecteurs/de jour (antioxydants, caféine, niacinamide anti-pollution) -> morning ;",
    "  - actifs réparateurs/occlusifs/riches (céramides, beurres, peptides, panthénol, cica, huiles) -> plutôt evening (régénération nocturne) ;",
    "  - textures légères hydratantes neutres -> le créneau le moins chargé, pour équilibrer.",
    "- Justifie CHAQUE produit par une raison COURTE tirée de SES ingrédients (champ reason), y compris ceux couverts par une règle. Cette raison SERT à fiabiliser et rendre cohérent ton classement (raisonne AVANT de trancher).",
    "Chaque produit reçoit EXACTEMENT un créneau : 'morning' OU 'evening'. Jamais les deux.",
    "Réponds en JSON strict : {\"placements\":[{\"itemId\":\"...\",\"timeOfDay\":\"morning|evening\",\"reason\":\"...\"}]}. Aucun texte hors JSON.",
  ].join("\n");

  const profileLine = skinType || concerns.length
    ? `Profil : type de peau ${skinType ?? "non précisé"}${concerns.length ? `, préoccupations ${concerns.join(", ")}` : ""}.`
    : "Profil : non précisé.";

  const list = products
    .map((p, i) => {
      const ing = p.ingredients.slice(0, 12).join(", ");
      return `${i + 1}. itemId=${p.itemId} | ${p.name}${p.category ? ` (${p.category})` : ""}${ing ? ` | ingrédients: ${ing}` : ""}`;
    })
    .join("\n");

  const user = `${profileLine}\n\nProduits à répartir (${products.length}) :\n${list}\n\nRenvoie un placement pour CHAQUE itemId.`;
  return { system, user };
}

function parsePlacements(
  rawText: string,
  known: Set<string>,
): { itemId: string; timeOfDay: "morning" | "evening"; reason: string }[] {
  let obj: unknown;
  try {
    obj = JSON.parse(rawText);
  } catch {
    return [];
  }
  const arr = (obj as { placements?: unknown })?.placements;
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: { itemId: string; timeOfDay: "morning" | "evening"; reason: string }[] = [];
  for (const p of arr) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const id = typeof o.itemId === "string" ? o.itemId : "";
    if (!id || !known.has(id) || seen.has(id)) continue;
    const tod = o.timeOfDay === "evening" ? "evening" : "morning";
    // `reason` : raison courte tirée des ingrédients. FORCÉE dans le prompt pour
    // fiabiliser le classement (le modèle raisonne avant de trancher). Non
    // affichée côté front, mais renvoyée pour debug/logs éventuels.
    const reason = typeof o.reason === "string" ? o.reason.trim().slice(0, 160) : "";
    seen.add(id);
    out.push({ itemId: id, timeOfDay: tod, reason });
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  const g = await gate(req, { feature: "routine_organize", costCredits: 0, rateMax: 10 });
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }
  const products = validate(body);
  if (!products) {
    return jsonResponse({ error: "Routine vide ou invalide." }, { status: 400 });
  }

  // Anti-injection : noms nettoyés.
  const safe = products.map((p) => ({ ...p, name: sanitizePromptValue(p.name, 120) }));

  // Profil peau (personnalisation légère).
  let skin: Record<string, unknown> | null = null;
  try {
    const { data } = await g.supabase
      .schema("cosme_check")
      .from("user_profiles")
      .select("preferences")
      .eq("id", g.user.id)
      .maybeSingle();
    const prefs = (data as { preferences?: unknown } | null)?.preferences;
    if (prefs && typeof prefs === "object") {
      const s = (prefs as { skin?: unknown }).skin;
      if (s && typeof s === "object") skin = s as Record<string, unknown>;
    }
  } catch {
    // profil optionnel
  }

  // Débit 1 crédit (action explicite).
  const charge = await g.consumeCredit("routine_organize", 1);
  if (!charge.ok) return charge.response;

  const { system, user } = buildPrompt(safe, skin);
  const known = new Set(safe.map((p) => p.itemId));

  let rawText = "";
  try {
    rawText = await callWithFallback<string>({
      feature: "routine_organize",
      userId: g.user.id,
      model: AI_MODEL,
      timeoutMs: 22_000,
      primary: async () => {
        const r = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0.2,
          max_tokens: 1500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });
        return {
          value: r.choices?.[0]?.message?.content ?? "",
          tokensIn: r.usage?.prompt_tokens,
          tokensOut: r.usage?.completion_tokens,
        };
      },
      fallback: async () => ({
        value: await mistralChat({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.2,
          maxTokens: 1500,
          responseFormat: { type: "json_object" },
        }),
        provider: "mistral" as const,
      }),
    });
  } catch {
    return jsonResponse({ error: "Réorganisation indisponible." }, { status: 502 });
  }

  const placements = parsePlacements(rawText, known);
  if (placements.length === 0) {
    return jsonResponse({ error: "Réponse IA invalide." }, { status: 502 });
  }

  return jsonResponse({
    ok: true,
    version: PROMPT_VERSION,
    placements,
    credits: charge.credits,
  });
});
