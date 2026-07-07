// Batterie v4 partie 2 : chemins "user-replay" et "cache cross-user full".
const BASE = "https://rogesnduejmqpxolhbif.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ2VzbmR1ZWptcXB4b2xoYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDIxNzUsImV4cCI6MjA4OTYxODE3NX0.CIjUhlSqqkx6YdSFON4JSDy-ggqrWXpOdvTKLT_1Hkw";
const SVC =
  "***REMOVED-SERVICE-ROLE-KEY***";

const analysisId = process.argv[2];
if (!analysisId) { console.log("usage: node battery2 <analysisId>"); process.exit(1); }

const a = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test-advisor@cosmecheck.test", password: "Test123456!" }),
});
const { access_token } = await a.json();
const H = { apikey: ANON, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };
const SH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", Prefer: "return=representation" };

async function credits() {
  const r = await fetch(`${BASE}/rest/v1/rpc/cosme_check_get_credits`, { method: "POST", headers: H, body: "{}" });
  const d = await r.json();
  return typeof d === "number" ? d : (d?.remaining ?? d?.credits ?? JSON.stringify(d));
}
async function callCoh(desc) {
  const t = Date.now();
  const r = await fetch(`${BASE}/functions/v1/coherence-analyze`, {
    method: "POST", headers: H, body: JSON.stringify({ analysis_id: analysisId, description: desc }),
  });
  const d = await r.json();
  return { ms: Date.now() - t, hdr: r.headers.get("x-coherence-cache"), idem: r.headers.get("x-idempotent-replay"), d };
}
async function sqlDelete(path, filter) {
  const r = await fetch(`${BASE}/rest/v1/${path}?${filter}`, { method: "DELETE", headers: { ...SH, "Accept-Profile": "cosme_check", "Content-Profile": "cosme_check" } });
  return r.status;
}

const DESC2 = "Ce soin lisse le grain de peau et matifie durablement. Sans allergène parfumant ni paraben.";

// A. MISS (nouvelle description) → pipeline + écriture cache v4
const c0 = await credits();
const r1 = await callCoh(DESC2);
console.log(`A. MISS: ${r1.ms} ms | cache=${r1.d?.cache} | crédits ${c0} -> ${await credits()} (attendu -1)`);

// B. Purge idempotence UNIQUEMENT → rejeu = chemin "user" (lecture de SA ligne)
await sqlDelete("idempotency", "key=like.coherence*");
const r2 = await callCoh(DESC2);
console.log(`B. USER-REPLAY: ${r2.ms} ms | cache=${r2.d?.cache} (attendu user) | même id=${r2.d?.id === r1.d?.id} | crédits -> ${await credits()} (attendu inchangé)`);

// C. Purge idempotence + SA ligne coherence_analyses → chemin "full" (cache cross-user, 0 IA)
await sqlDelete("idempotency", "key=like.coherence*");
const delSt = await sqlDelete("coherence_analyses", `id=eq.${r1.d?.id}`);
const r3 = await callCoh(DESC2);
console.log(`C. CROSS-USER FULL: ${r3.ms} ms | cache=${r3.d?.cache} (attendu full) | del=${delSt} | crédits -> ${await credits()} (attendu inchangé)`);
console.log(`   Conclusion identique servie du cache: ${Boolean(r3.d?.result?.conclusion)}`);
