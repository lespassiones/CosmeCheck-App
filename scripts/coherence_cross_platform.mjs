// Test croisé : le MÊME produit + la MÊME promesse via l'EDGE (chemin mobile)
// puis via la ROUTE WEB locale → doivent servir le MÊME résultat (cache v4
// partagé) et la ré-analyse doit être une lecture des deux côtés.
const BASE = "https://rogesnduejmqpxolhbif.supabase.co";
const WEB = "http://localhost:3123";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ2VzbmR1ZWptcXB4b2xoYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDIxNzUsImV4cCI6MjA4OTYxODE3NX0.CIjUhlSqqkx6YdSFON4JSDy-ggqrWXpOdvTKLT_1Hkw";

const analysisId = process.argv[2];
const a = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test-advisor@cosmecheck.test", password: "Test123456!" }),
});
const session = await a.json();
const H = { apikey: ANON, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };

// Cookie SSR : "base64-" + base64url(JSON session), éventuellement chunké.
const raw = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
const name = "sb-rogesnduejmqpxolhbif-auth-token";
let cookie;
if (raw.length <= 3180) {
  cookie = `${name}=${raw}`;
} else {
  const chunks = [];
  for (let i = 0; i < raw.length; i += 3180) chunks.push(raw.slice(i, i + 3180));
  cookie = chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");
}

const DESC = "Ce shampooing doux fortifie la fibre capillaire et apporte de la brillance. Sans sulfate ni allergène parfumant.";

// 1) EDGE (mobile) : premier passage
let t = Date.now();
const e1 = await fetch(`${BASE}/functions/v1/coherence-analyze`, {
  method: "POST", headers: H, body: JSON.stringify({ analysis_id: analysisId, description: DESC }),
});
const ed1 = await e1.json();
console.log(`EDGE #1: ${Date.now() - t} ms | cache=${ed1?.cache} | promesses=${(ed1?.result?.promises ?? []).map((p) => `${p.label}:${p.verdict}`).join(" | ")}`);

// 2) WEB (route locale) : même produit, même description → doit servir le cache partagé
t = Date.now();
const w1 = await fetch(`${WEB}/api/coherence`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ analysis_id: analysisId, description: DESC }),
});
const wd1 = await w1.json().catch(() => null);
console.log(`WEB  #1: ${Date.now() - t} ms | status=${w1.status} | cache=${wd1?.cache} (attendu user/full : cache partagé)`);
if (wd1?.result?.promises) {
  console.log(`  promesses=${wd1.result.promises.map((p) => `${p.label}:${p.verdict}`).join(" | ")}`);
  const same = JSON.stringify((ed1?.result?.promises ?? []).map((p) => [p.slug, p.verdict, p.score]))
    === JSON.stringify(wd1.result.promises.map((p) => [p.slug, p.verdict, p.score]));
  console.log(`  VERDICTS IDENTIQUES edge vs web: ${same ? "OUI ✅" : "NON ❌"}`);
} else {
  console.log("  body:", JSON.stringify(wd1).slice(0, 300));
}
