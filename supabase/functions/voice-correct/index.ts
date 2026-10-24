/**
 * Edge Function `voice-correct` : relecture IA d'une question DICTÉE au Beauty
 * Advisor (micro à côté du bouton d'envoi).
 *
 * L'app affiche d'abord la transcription corrigée localement
 * (`lib/voice/transcript.ts`), puis remplace le texte par cette version si
 * elle passe le garde-fou client (`acceptServerCorrection`) et que la personne
 * n'a pas retouché la saisie entre-temps.
 *
 *   - Connexion requise (Bearer), AUCUN crédit débité : c'est une aide à la
 *     saisie, la question elle-même sera facturée par `advisor-agent`.
 *   - Limite propre à la personne (`voice:<user_id>`, 20/min) : ne consomme pas
 *     le compteur IP partagé de `gate()` utilisé par les fonctions payantes.
 *   - gpt-4o-mini, température 0, 6 s max. En cas d'échec : `{ text: null }`,
 *     l'app garde sa correction locale.
 *
 * Entrée : { text } (500 caractères max). Sortie : { text: string | null }.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest, serviceClient } from "../_shared/auth.ts";
import { AI_MODEL, hasOpenAI, logAI, openai } from "../_shared/aiClient.ts";
import {
  buildVoiceUserMessage,
  parseVoiceCorrection,
  sanitizeVoiceInput,
  VOICE_CORRECT_SYSTEM,
} from "./prompt.ts";

const RATE_MAX = 20;
const RATE_WINDOW_SEC = 60;
const TIMEOUT_MS = 6_000;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  const auth = await getUserFromRequest(req);
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const { data: rateData } = await serviceClient().rpc("cosme_check_check_rate_limit", {
    p_key: `voice:${userId}`,
    p_max: RATE_MAX,
    p_window_sec: RATE_WINDOW_SEC,
  });
  if (rateData && (rateData as { ok?: boolean }).ok === false) {
    return jsonResponse({ text: null, error: "rate_limited" }, { status: 429 });
  }

  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    text = sanitizeVoiceInput(body.text);
  } catch {
    text = "";
  }
  if (!text) return jsonResponse({ error: "Texte requis." }, { status: 400 });
  if (!hasOpenAI()) return jsonResponse({ text: null });

  const t0 = Date.now();
  try {
    const r = await openai().chat.completions.create(
      {
        model: AI_MODEL,
        temperature: 0,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: VOICE_CORRECT_SYSTEM },
          { role: "user", content: buildVoiceUserMessage(text) },
        ],
      },
      { timeout: TIMEOUT_MS, maxRetries: 0 },
    );
    const corrected = parseVoiceCorrection(r.choices?.[0]?.message?.content);
    logAI({
      feature: "voice_correct",
      provider: "openai",
      status: corrected ? "success" : "error",
      model: AI_MODEL,
      tokens_in: r.usage?.prompt_tokens ?? null,
      tokens_out: r.usage?.completion_tokens ?? null,
      duration_ms: Date.now() - t0,
      user_id: userId,
    });
    return jsonResponse({ text: corrected });
  } catch {
    logAI({
      feature: "voice_correct",
      provider: "openai",
      status: "error",
      model: AI_MODEL,
      duration_ms: Date.now() - t0,
      user_id: userId,
    });
    return jsonResponse({ text: null });
  }
});
