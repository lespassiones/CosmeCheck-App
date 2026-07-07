// Passe les produits résolus par MA recherche web (agents, zéro OpenAI) dans
// l'outil de notation admin-score-upsert (moteur analyser, zéro OpenAI aussi).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = "https://rogesnduejmqpxolhbif.supabase.co";
const SERVICE = readFileSync(resolve(import.meta.dirname, "..", ".env"), "utf8")
  .split(/\r?\n/).find((l) => l.startsWith("SUPABASE_SERVICE_ROLE_KEY="))
  .split("=")[1].trim();

const SP = "C:/Users/clark/AppData/Local/Temp/claude/d--MesApps-deploy-CosmeCheck-App/fe700fd9-4996-4817-8d81-ae1f2f3c449e/scratchpad";
const files = [
  "resolved_batch_1.json", "resolved_batch_2.json", "resolved_batch_3.json",
  "resolved_batch3_patch.json", "resolved_batch_4.json", "resolved_batch_5.json",
];

const all = [];
for (const f of files) {
  const arr = JSON.parse(readFileSync(`${SP}/${f}`, "utf8"));
  all.push(...arr);
}
// Dédoublonnage par EAN (le patch batch3 doit gagner sur l'entrée null d'origine).
const byEan = new Map();
for (const item of all) {
  const prev = byEan.get(item.ean);
  if (!prev || (!prev.inci && item.inci)) byEan.set(item.ean, item);
}
const candidates = [...byEan.values()].filter((x) => x.inci && x.inci.trim().length >= 8);
console.log(`Candidats avec INCI: ${candidates.length} / ${byEan.size} EAN traités\n`);

const ok = [], failed = [];
for (const c of candidates) {
  try {
    const r = await fetch(`${BASE}/functions/v1/admin-score-upsert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ean: c.ean, name: c.name, brand: c.brand, inci: c.inci,
        category: c.category, source_url: c.source_url,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (d?.ok) {
      ok.push(d);
      console.log(`OK  ${c.ean}  [${d.score}/${d.scoreLabel}]  ${c.brand ?? ""} ${(c.name ?? "").slice(0, 45)}`);
    } else {
      failed.push({ ean: c.ean, reason: d?.reason ?? `http ${r.status}` });
      console.log(`--  ${c.ean}  (${d?.reason ?? "http " + r.status})`);
    }
  } catch (e) {
    failed.push({ ean: c.ean, reason: e.message });
    console.log(`ERR ${c.ean}  ${e.message}`);
  }
}
console.log(`\n=== NOTÉS ET UPSERTÉS: ${ok.length} / ${candidates.length} candidats ===`);
if (failed.length) console.log("Échecs notation:", JSON.stringify(failed));
