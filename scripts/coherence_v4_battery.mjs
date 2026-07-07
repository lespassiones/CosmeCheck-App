// Batterie d'intégration coherence-analyze v4 (edge = chemin PROD mobile).
// Preuves : (1) verdict dual-use corrigé, (2) réanalyse même user = lecture
// (0 IA, 0 crédit), (3) cache cross-user complet = 0 IA, (4) latences.
const BASE = "https://rogesnduejmqpxolhbif.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ2VzbmR1ZWptcXB4b2xoYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDIxNzUsImV4cCI6MjA4OTYxODE3NX0.CIjUhlSqqkx6YdSFON4JSDy-ggqrWXpOdvTKLT_1Hkw";

const a = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test-advisor@cosmecheck.test", password: "Test123456!" }),
});
const { access_token } = await a.json();
const H = { apikey: ANON, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };

async function credits() {
  const r = await fetch(`${BASE}/rest/v1/rpc/cosme_check_get_credits`, { method: "POST", headers: H, body: "{}" });
  const d = await r.json();
  return typeof d === "number" ? d : (d?.remaining ?? d?.credits ?? JSON.stringify(d));
}

// ── 1. Créer l'analyse INCI de test (Benzyl Alcohol + Parfum déclaré) ──
const inci = "Aqua, Glycerin, Parfum, Benzyl Alcohol";
const an = await fetch(`${BASE}/functions/v1/analyser`, {
  method: "POST", headers: H,
  body: JSON.stringify({ text: inci, productLabel: "Test Parité Promesse v4", withSynthesis: false }),
});
const anData = await an.json();
const analysisId = anData?.analysis_id ?? anData?.id ?? anData?.analysisId;
console.log("ANALYSE CRÉÉE:", analysisId, "| items:", (anData?.result?.items ?? anData?.items ?? []).length);
if (!analysisId) { console.log("ABORT — réponse analyser:", JSON.stringify(anData).slice(0, 400)); process.exit(1); }

const DESC = "Cette crème corps hydrate intensément la peau et apaise les irritations. Sans allergène parfumant.";

// ── 2. Premier passage (MISS attendu) : verdict + crédit + latence ──
const c0 = await credits();
let t = Date.now();
const r1 = await fetch(`${BASE}/functions/v1/coherence-analyze`, {
  method: "POST", headers: H, body: JSON.stringify({ analysis_id: analysisId, description: DESC }),
});
const ms1 = Date.now() - t;
const d1 = await r1.json();
const c1 = await credits();
const absence1 = (d1?.result?.promises ?? []).find((p) => (p.slug ?? "").includes("allergene") || (p.label ?? "").toLowerCase().includes("allergène"));
console.log(`\nAPPEL 1 (attendu miss): ${ms1} ms | header=${r1.headers.get("x-coherence-cache")} | cache=${d1?.cache}`);
console.log(`  Verdict 'sans allergène parfumant' = ${absence1?.verdict} (ATTENDU: contredite, car Parfum déclaré + Benzyl Alcohol)`);
console.log(`  Fautifs cités: ${(absence1?.contradictingActives ?? []).map((x) => x.name).join(", ")}`);
console.log(`  Crédits: ${c0} -> ${c1} (attendu: -1)`);

// ── 3. Ré-analyse immédiate (même body) → idempotence OU lecture user ──
t = Date.now();
const r2 = await fetch(`${BASE}/functions/v1/coherence-analyze`, {
  method: "POST", headers: H, body: JSON.stringify({ analysis_id: analysisId, description: DESC }),
});
const ms2 = Date.now() - t;
const d2 = await r2.json();
const c2 = await credits();
console.log(`\nAPPEL 2 (rejeu immédiat): ${ms2} ms | idem=${r2.headers.get("x-idempotent-replay")} | cache-header=${r2.headers.get("x-coherence-cache")} | cache=${d2?.cache}`);
console.log(`  Même id renvoyé: ${d2?.id === d1?.id} | Crédits: ${c1} -> ${c2} (attendu: 0 débit)`);

console.log("\nID_ANALYSE=" + analysisId);
console.log("ID_COHERENCE=" + d1?.id);
