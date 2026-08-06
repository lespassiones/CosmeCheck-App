// Commit: pour chaque produit -> edge admin-score-upsert (score + upsert catalog),
// puis marque la soumission approved. Lit l'env depuis CosmeCheckAdmin/.env.
// Usage: node commit.ts <products.json>
// products.json = [{ submission_id, ean, name, brand, inci, category, photo_path_1, source_url }, ...]
import { readFileSync } from "node:fs";

const ENV_PATH = process.env.CC_ENV_PATH ?? "c:/Projet/CosmeCheckAdmin/.env";
function readEnv() {
  const raw = readFileSync(ENV_PATH, "utf8");
  const url = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(raw)![1].trim();
  const key = /SUPABASE_SERVICE_ROLE_KEY=(.+)/.exec(raw)![1].trim();
  return { url, key };
}
const IMG_BASE = "/storage/v1/object/public/cosmetwiki-products/";

async function publish(url: string, key: string, p: any) {
  const image_url = p.photo_path_1 ? `${url}${IMG_BASE}${p.photo_path_1}` : null;
  const res = await fetch(`${url}/functions/v1/admin-score-upsert`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ean: p.ean, name: p.name, brand: p.brand, inci: p.inci, category: p.category, image_url, source_url: p.source_url ?? null }),
  });
  const j = await res.json().catch(() => ({ ok: false, reason: `HTTP ${res.status}` }));
  return { httpStatus: res.status, ...j };
}
async function approve(url: string, key: string, submissionId: string) {
  const res = await fetch(`${url}/rest/v1/catalog_photo_submissions?id=eq.${submissionId}`, {
    method: "PATCH",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Content-Profile": "cosme_check", Prefer: "return=minimal" },
    body: JSON.stringify({ status: "approved", reviewed_at: new Date().toISOString() }),
  });
  return res.status;
}
async function main() {
  const { url, key } = readEnv();
  const items = JSON.parse(readFileSync(process.argv[2], "utf8"));
  for (const p of items) {
    const r = await publish(url, key, p);
    let approveStatus = "-";
    if (r.ok && p.submission_id) approveStatus = String(await approve(url, key, p.submission_id));
    console.log(JSON.stringify({ name: p.name, ean: p.ean, ok: r.ok, score: r.score, scoreLabel: r.scoreLabel, countOrange: r.countOrange, countRouge: r.countRouge, category: r.category, reason: r.reason, approve: approveStatus }));
  }
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
