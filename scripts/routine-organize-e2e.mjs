/**
 * E2E de l'Edge Function `routine-organize-ai` (réorganisation IA matin/soir).
 *
 * Utilisateur éphémère (JWT réel) contre la fonction DÉPLOYÉE, avec de VRAIS
 * produits aux règles cosmétiques non ambiguës :
 *   - SPF (crème solaire)        -> morning (attendu ferme)
 *   - Rétinol sérum              -> evening (attendu ferme, photosensible)
 *   - Vitamine C sérum           -> morning (attendu, antioxydant)
 *   - Acide glycolique (AHA)     -> evening (attendu, exfoliant)
 *   - Nettoyant / hydratant      -> libre (pas d'assertion dure)
 *
 * On vérifie : 401 sans token, placement pour CHAQUE itemId, valeurs
 * morning|evening, et les 4 règles fermes ci-dessus. Débite 1 crédit réel.
 *
 * Lancer : node scripts/routine-organize-e2e.mjs
 */
import fs from 'fs'

const ENV_PATH = new URL('../.env', import.meta.url)
const env = fs.readFileSync(ENV_PATH, 'utf8')
const URL_ = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const ANON = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim()
const SERVICE =
  (env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1] ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

const headers = (tok = ANON) => ({
  apikey: ANON,
  Authorization: `Bearer ${tok}`,
  'Content-Type': 'application/json',
})

const results = []
function check(name, ok, detail = '') {
  results.push({ ok: !!ok })
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
  console.log(`  ${tag}  ${name}${detail ? `\n        ${detail}` : ''}`)
}

async function makeUser() {
  const email = `cc_org_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`
  const su = await (
    await fetch(`${URL_}/auth/v1/signup`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password: 'Zx9-Kq72_Vbn!mP4tR' }),
    })
  ).json()
  return { token: su.access_token, uid: su.user?.id }
}

async function deleteUser(uid) {
  if (!uid || !SERVICE) return
  await fetch(`${URL_}/auth/v1/admin/users/${uid}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  }).catch(() => {})
}

const PRODUCTS = [
  { itemId: 'spf', name: 'Anthelios UVMune 400 Crème Solaire SPF50+', category: 'creme-solaire',
    ingredients: ['Aqua', 'Homosalate', 'Octocrylene', 'Titanium Dioxide', 'Glycerin'] },
  { itemId: 'retinol', name: 'Retinol 0.3% + Vitamin B5 Sérum', category: 'soin-anti-age',
    ingredients: ['Aqua', 'Retinol', 'Panthenol', 'Glycerin', 'Tocopherol'] },
  { itemId: 'vitc', name: 'Sérum Vitamine C 15% Éclat', category: 'soin-anti-age',
    ingredients: ['Aqua', 'Ascorbic Acid', 'Ferulic Acid', 'Tocopherol'] },
  { itemId: 'aha', name: 'Glycolic Acid 7% Exfoliating Toner', category: 'nettoyant-visage',
    ingredients: ['Aqua', 'Glycolic Acid', 'Aloe Barbadensis'] },
  { itemId: 'cleanser', name: 'Gel Nettoyant Doux Hydratant', category: 'nettoyant-visage',
    ingredients: ['Aqua', 'Coco-Glucoside', 'Glycerin'] },
]

async function main() {
  console.log('\n\x1b[1mroutine-organize-ai E2E\x1b[0m')

  // 1. 401 sans token utilisateur (anon seul).
  const noAuth = await fetch(`${URL_}/functions/v1/routine-organize-ai`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ products: PRODUCTS }),
  })
  check('401/403 sans JWT utilisateur', noAuth.status === 401 || noAuth.status === 403, `status ${noAuth.status}`)

  // 2. Vrai user + vrais produits.
  const { token, uid } = await makeUser()
  if (!token) {
    check('création user éphémère', false, 'pas de token')
    return
  }
  const res = await fetch(`${URL_}/functions/v1/routine-organize-ai`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ products: PRODUCTS }),
  })
  const data = await res.json().catch(() => ({}))
  console.log('        réponse:', JSON.stringify(data))

  check('HTTP 200', res.status === 200, `status ${res.status}`)
  const placements = Array.isArray(data.placements) ? data.placements : []
  const byId = new Map(placements.map((p) => [p.itemId, p.timeOfDay]))

  check('placement pour chaque produit', byId.size === PRODUCTS.length, `${byId.size}/${PRODUCTS.length}`)
  check(
    'valeurs morning|evening uniquement',
    placements.every((p) => p.timeOfDay === 'morning' || p.timeOfDay === 'evening'),
  )
  check('SPF -> morning', byId.get('spf') === 'morning', `got ${byId.get('spf')}`)
  check('Rétinol -> evening', byId.get('retinol') === 'evening', `got ${byId.get('retinol')}`)
  check('Vitamine C -> morning', byId.get('vitc') === 'morning', `got ${byId.get('vitc')}`)
  check('AHA glycolique -> evening', byId.get('aha') === 'evening', `got ${byId.get('aha')}`)

  await deleteUser(uid)

  const passed = results.filter((r) => r.ok).length
  console.log(`\n${passed}/${results.length} PASS\n`)
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
