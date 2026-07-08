import 'dotenv/config';
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SVC) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant dans .env');
async function q(form, terms) {
  const r = await fetch(`${BASE}/rest/v1/rpc/cosme_check_recommend_products`, {
    method: "POST",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_terms: terms, p_form: form, p_min_score: 13, p_limit: 40, p_exclude_families: [], p_exclude_ingredients: [] }),
  });
  const d = await r.json();
  const n = Array.isArray(d) ? d.length : JSON.stringify(d).slice(0, 120);
  const ex = Array.isArray(d) ? d.slice(0, 6).map((x) => `${x.brand ?? ""} ${x.name ?? ""}`.trim().slice(0, 34)).join(" | ") : "";
  console.log(`form="${form}" terms=[${terms}] → ${n} candidats  ${ex}`);
}
await q("deodorant pieds", ["zinc"]);
await q("pieds", ["zinc", "triclosan"]);
await q("hydratants pieds", ["urea"]);
await q("deodorant", ["alun", "alum", "zinc"]);
await q("gommage pieds", ["urea", "salicylic"]);
