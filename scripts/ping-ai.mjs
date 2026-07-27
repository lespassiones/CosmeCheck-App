/**
 * Ping OpenAI + Mistral et teste le scénario de fallback (OpenAI KO -> Mistral).
 * Usage : node --env-file=.env scripts/ping-ai.mjs
 * Pur Node (fetch natif), aucune dépendance.
 */
const OPENAI = process.env.OPENAI_API_KEY;
const MISTRAL = process.env.MISTRAL_API_KEY;

async function openaiChat(key, model, extraBody = {}) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Réponds uniquement par le mot: pong" }],
      ...extraBody,
    }),
  });
  const text = await res.text();
  let content = null;
  try { content = JSON.parse(text).choices?.[0]?.message?.content?.trim() ?? null; } catch {}
  return { ok: res.ok, status: res.status, content, raw: text.slice(0, 160) };
}

async function mistralChat(key, model = "mistral-small-latest") {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Réponds uniquement par le mot: pong" }],
      max_tokens: 5,
      temperature: 0,
    }),
  });
  const text = await res.text();
  let content = null;
  try { content = JSON.parse(text).choices?.[0]?.message?.content?.trim() ?? null; } catch {}
  return { ok: res.ok, status: res.status, content, raw: text.slice(0, 160) };
}

const line = (s) => console.log(s);

(async () => {
  line(`Clés présentes : OpenAI=${OPENAI ? "oui" : "NON"}  Mistral=${MISTRAL ? "oui" : "NON"}\n`);

  // 1. OpenAI gpt-4o-mini (usage général : synthèse, insights, typo…)
  const a = await openaiChat(OPENAI, "gpt-4o-mini", { max_tokens: 5, temperature: 0 });
  line(`[1] OpenAI gpt-4o-mini        → ${a.ok ? "OK ✅" : "KO ❌"}  (HTTP ${a.status})  réponse="${a.content ?? a.raw}"`);

  // 2. OpenAI gpt-4o-mini-search-preview (le modèle de promesse-identify)
  const b = await openaiChat(OPENAI, "gpt-4o-mini-search-preview", {});
  line(`[2] OpenAI search-preview     → ${b.ok ? "OK ✅" : "KO ❌"}  (HTTP ${b.status})  réponse="${b.content ?? b.raw}"`);

  // 3. Mistral (le fallback)
  const c = await mistralChat(MISTRAL);
  line(`[3] Mistral small             → ${c.ok ? "OK ✅" : "KO ❌"}  (HTTP ${c.status})  réponse="${c.content ?? c.raw}"`);

  // 4. Scénario FALLBACK réel : OpenAI en échec (clé bidon) → Mistral prend le relais
  line(`\n[4] Test du FALLBACK (OpenAI KO -> Mistral) :`);
  const failed = await openaiChat("sk-bidon-invalide", "gpt-4o-mini", { max_tokens: 5 });
  line(`     - OpenAI (clé invalide)  → ${failed.ok ? "a répondu (inattendu)" : `échoue comme prévu (HTTP ${failed.status}) ✅`}`);
  if (!failed.ok) {
    const fb = await mistralChat(MISTRAL);
    line(`     - Fallback Mistral       → ${fb.ok ? `OK ✅  réponse="${fb.content}"` : `KO ❌ (HTTP ${fb.status})`}`);
    line(`\n=> FALLBACK ${fb.ok ? "FONCTIONNEL ✅ : si OpenAI tombe, Mistral répond." : "NON FONCTIONNEL ❌"}`);
  }
})();
