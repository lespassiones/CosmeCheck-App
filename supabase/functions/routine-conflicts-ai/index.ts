/**
 * Edge Function `routine-conflicts-ai` — analyse IA APPROFONDIE des conflits de
 * routine (nuance par-dessus le socle déterministe de lib/routine/conflicts.ts).
 *
 * Pipeline (design conflits section 7) :
 *   1. Gate : auth Bearer + rate-limit IP (10/min) + débit DIFFÉRÉ (costCredits 0).
 *   2. validateDeepCheckRequest -> 400 si forme invalide.
 *   3. Clé cache = 'routine-conflicts:v1:' + sha256Hex(buildCacheSeed(req)).
 *      HIT ai_cache serveur -> réponse SANS débit (cross-user, cross-device).
 *   4. MISS -> débit d'1 crédit APRÈS le miss (429 pass-through si épuisé), puis
 *      appel modèle (gpt-4o-mini json_object, fallback Mistral), parse défensif,
 *      setCached.
 *
 * Le modèle ne peut émettre que des sévérités medium/info (parseAiConflicts
 * coerce le reste en info) : le `high` reste réservé au moteur déterministe.
 * Aucun tiret cadratin, aucun score /20 (nettoyés par parseAiConflicts).
 *
 * Sortie : { additional_conflicts, overall_note, cached, credits }.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import {
  callWithFallback,
  getCached,
  mistralChat,
  openai,
  setCached,
  sha256Hex,
  AI_MODEL,
} from "../_shared/aiClient.ts";
import { sanitizePromptValue } from "../_shared/sanitizePrompt.ts";
import {
  buildCacheSeed,
  parseAiConflicts,
  validateDeepCheckRequest,
} from "./lib/normalize.ts";
import { buildPrompt, PROMPT_VERSION } from "./lib/prompt.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // ── 1. Gate : auth + rate-limit. Débit DIFFÉRÉ (costCredits 0). ────────────
  const g = await gate(req, { feature: "routine_conflicts", costCredits: 0, rateMax: 10 });
  if (!g.ok) return g.response;

  // ── 2. Parse + validation. ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }
  const parsed = validateDeepCheckRequest(body);
  if (!parsed || parsed.products.length === 0) {
    return jsonResponse({ error: "Routine vide ou invalide." }, { status: 400 });
  }

  // Anti-injection : les noms de produits sont nettoyés avant insertion prompt.
  parsed.products = parsed.products.map((p) => ({
    ...p,
    name: sanitizePromptValue(p.name, 120),
  }));

  // ── 3. Cache serveur (ai_cache) : hit = 0 crédit. ──────────────────────────
  // PROMPT_VERSION dans le préfixe : bumper la version invalide le cache serveur.
  const cacheKey = `routine-conflicts:${PROMPT_VERSION}:${await sha256Hex(buildCacheSeed(parsed))}`;
  const cached = await getCached<{ additional_conflicts: unknown[]; overall_note: string | null }>(
    cacheKey,
  );
  if (cached) {
    return jsonResponse({ ...cached, cached: true, credits: null });
  }

  // ── 4. Miss -> débit 1 crédit, puis appel modèle. ──────────────────────────
  const charge = await g.consumeCredit("routine_conflicts", 1);
  if (!charge.ok) return charge.response;

  const { system, user } = buildPrompt(parsed);

  let rawText: string;
  try {
    rawText = await callWithFallback<string>({
      feature: "routine_conflicts",
      userId: g.user.id,
      model: AI_MODEL,
      timeoutMs: 22_000,
      primary: async () => {
        const r = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0.3,
          max_tokens: 700,
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
          temperature: 0.3,
          maxTokens: 700,
          responseFormat: { type: "json_object" },
        }),
        provider: "mistral" as const,
      }),
    });
  } catch {
    // IA indisponible après débit : identique aux autres features (volume faible).
    return jsonResponse({ error: "Analyse indisponible pour le moment." }, { status: 503 });
  }

  const payload = parseAiConflicts(rawText);
  await setCached(cacheKey, payload);

  return jsonResponse({ ...payload, cached: false, credits: charge.credits });
});
