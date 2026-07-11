// Test d'intégration : durcissement de l'auth admin (juil 2026).
// Cible l'edge DÉPLOYÉE admin-score-upsert (choisie car elle court-circuite
// AVANT tout appel OpenAI / écriture DB quand l'INCI est trop court → aucun
// effet de bord, aucun coût).
//
// Vérifie :
//   A) sans Authorization                → 401
//   B) JWT forgé non signé (role=service_role, ref=projet) → 401  [l'ancien exploit]
//   C) anon key (JWT valide, role=anon)  → 401  [rejet par le CODE, pas que la plateforme]
//   D) vraie clé service_role            → PAS 401 (passe l'auth ; body inoffensif → ok:false)
//
// Lancer : node scripts/test_admin_auth_hardening.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = readFileSync(resolve(import.meta.dirname, "..", ".env"), "utf8");
const val = (k) =>
  (env.split(/\r?\n/).find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1) ?? "").trim();

const BASE = val("EXPO_PUBLIC_SUPABASE_URL");
const ANON = val("EXPO_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = val("SUPABASE_SERVICE_ROLE_KEY");
const PROJECT_REF = "rogesnduejmqpxolhbif";
const URL = `${BASE}/functions/v1/admin-score-upsert`;

if (!BASE || !ANON || !SERVICE) {
  console.error("Env manquant (.env)"); process.exit(2);
}

// Forge un JWT NON signé avec exactement les claims que l'ancienne faille acceptait.
const b64url = (o) =>
  Buffer.from(JSON.stringify(o)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const forged =
  `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ role: "service_role", ref: PROJECT_REF, exp: 9999999999 })}.Zm9yZ2Vk`;

// Body inoffensif : INCI < 20 chars → l'edge répond ok:false SANS écrire ni appeler d'IA.
const harmlessBody = JSON.stringify({ ean: "TEST_AUTH_PROBE", inci: "x" });

async function call(label, authHeader) {
  const headers = { "Content-Type": "application/json" };
  if (authHeader !== null) headers.Authorization = authHeader;
  // apikey requis par la gateway Supabase pour router ; on met anon (public).
  headers.apikey = ANON;
  const r = await fetch(URL, { method: "POST", headers, body: harmlessBody });
  let body = "";
  try { body = await r.text(); } catch { /* noop */ }
  return { label, status: r.status, body: body.slice(0, 160) };
}

const results = [];
results.push({ ...(await call("A/ sans Authorization", null)), expect: "401", ok: (s) => s === 401 });
results.push({ ...(await call("B/ JWT forgé non signé", `Bearer ${forged}`)), expect: "401", ok: (s) => s === 401 });
results.push({ ...(await call("C/ anon key (JWT valide non-admin)", `Bearer ${ANON}`)), expect: "401", ok: (s) => s === 401 });
results.push({ ...(await call("D/ vraie clé service_role", `Bearer ${SERVICE}`)), expect: "≠401", ok: (s) => s !== 401 });

let allOk = true;
console.log(`\nCible : ${URL}\n`);
for (const r of results) {
  const pass = r.ok(r.status);
  allOk = allOk && pass;
  console.log(`${pass ? "✅" : "❌"} ${r.label}\n   attendu=${r.expect} obtenu=${r.status}  ${r.body}\n`);
}
console.log(allOk ? "TOUS LES CAS PASSENT ✅" : "ÉCHEC : au moins un cas ne correspond pas ❌");
process.exit(allOk ? 0 : 1);
