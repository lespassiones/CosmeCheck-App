// Test: reasoning_effort sur gpt-5-mini / gpt-5 — vitesse vs qualité.
const URL = "https://rogesnduejmqpxolhbif.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ2VzbmR1ZWptcXB4b2xoYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDIxNzUsImV4cCI6MjA4OTYxODE3NX0.CIjUhlSqqkx6YdSFON4JSDy-ggqrWXpOdvTKLT_1Hkw";
const EMAIL = "test-advisor@cosmecheck.test";
const PASSWORD = "Test123456!";

const SCENARIOS = [
  { id: "boutons_visage", msg: "j'ai des boutons sur le visage, tu as un produit ?" },
  { id: "vitc_explicite", msg: "je cherche un sérum à la vitamine C" },
  { id: "fille7_eczema", msg: "ma fille de 7 ans a de l'eczéma, qu'est-ce que je peux mettre ?" },
  { id: "fesses_boutons", msg: "j'ai des petits boutons sur les fesses, quoi mettre ?" },
  { id: "info_retinol", msg: "c'est quoi le rétinol exactement ?" },
  { id: "fils_gratte", msg: "mon fils a la peau qui gratte, un produit ?" },
];
// (modèle, reasoning_effort)
const COMBOS = [
  ["gpt-5-mini", "minimal"],
  ["gpt-5-mini", "low"],
  ["gpt-5", "minimal"],
  ["gpt-5", "low"],
];

async function signIn() {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("auth failed");
  return j.access_token;
}
async function call(token, model, effort, msg) {
  const t = Date.now();
  for (let a = 0; a < 4; a++) {
    const r = await fetch(`${URL}/functions/v1/advisor-agent`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, reasoning_effort: effort, charge: false, messages: [{ role: "user", content: msg }] }),
    });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 65000)); continue; }
    const j = await r.json().catch(() => ({}));
    return { ms: Date.now() - t, status: r.status, ...j };
  }
  return { ms: Date.now() - t, status: 429 };
}
function fmt(products) {
  if (!Array.isArray(products) || !products.length) return "(aucun)";
  return products.map((p) => `${p.brand ?? ""} ${p.name ?? ""}`.trim() + ` [${Math.round((p.score ?? 0) * 10) / 10}]`).join(" || ");
}
async function run() {
  const token = await signIn();
  console.log("AUTH OK\n");
  const tasks = [];
  for (const sc of SCENARIOS) for (const [m, e] of COMBOS) tasks.push({ sc, m, e });
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const { sc, m, e } = tasks[idx++];
      const res = await call(token, m, e, sc.msg);
      const fu = res.followup ? ` | FOLLOWUP: ${res.followup}` : "";
      console.log(`### ${sc.id} :: ${m} effort=${e}  (${(res.ms / 1000).toFixed(1)}s, searches=${res.searches ?? "?"})`);
      console.log(`PRODUITS: ${fmt(res.products)}`);
      console.log(`REPLY: ${(res.reply ?? "").replace(/\s+/g, " ").slice(0, 160)}${fu}\n`);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  console.log("=== FIN ===");
}
run().catch((e) => { console.error("FATAL", e); process.exit(1); });
