/**
 * Corrige le produit Attitude « Lait Corps Enfant » (EAN 0626232181173) :
 *   - applique la COMPOSITION corrigée signalée par l'utilisatrice (Angel),
 *   - re-note via l'edge `admin-score-upsert` (moteur V2 exact, aucune duplication),
 *   - attache la PHOTO soumise par l'utilisatrice.
 * Réversible : la valeur avant a été relevée (voir bilan). --apply pour écrire.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const APPLY = process.argv.includes('--apply')
const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY

const inci = 'Aqua / Water / Eau, Glycerin, Caprylic/Capric Triglyceride, Cocos Nucifera (Coconut) Oil, Cetearyl Alcohol, Tapioca Starch, Butyrospermum Parkii (Shea) Butter, Polyglyceryl-2 Stearate, Glyceryl Stearate, Caprylyl Glycol, Stearyl Alcohol, Xanthan Gum, Sodium Benzoate, Potassium Sorbate, Honokiol, Magnolol, Citric Acid, Sodium Hydroxide, Vaccinium Myrtillus (Blueberry) Leaf Extract, Dimethyl Heptenal, Gamma-Decalactone, Maltol, Triethyl Citrate, Vanillin, Fragrance (Parfum)'

const body = {
  ean: '0626232181173',
  name: 'Lait Corps Enfant, Certifié Ewg, Crème Hydratante Testée Dermatologiquement, à Base de Plantes et Minéraux, Végan, Pastèque & Coco - 473 ml',
  brand: 'Attitude',
  inci,
  category: 'soin-du-corps-et-visage/creme-hydratante/hydratant-corps',
  image_url: 'https://rogesnduejmqpxolhbif.supabase.co/storage/v1/object/public/cosmetwiki-products/submissions/cc54e9e4-f23d-4904-a67a-20c8c25f4819/1784914359064_1.webp',
}

;(async () => {
  console.log(`\n=== Fix Attitude 0626232181173 — ${APPLY ? 'APPLY' : 'DRY-RUN'} ===`)
  console.log(`  INCI (${inci.split(',').length} tokens): ${inci.slice(0, 90)}…`)
  if (!APPLY) { console.log('\n  DRY-RUN — --apply pour appeler admin-score-upsert.\n'); return }
  const r = await fetch(`${URL_}/functions/v1/admin-score-upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${SERVICE}` },
    body: JSON.stringify(body),
  })
  const txt = await r.text()
  console.log(`  HTTP ${r.status}: ${txt}`)
})()
