/**
 * Batterie de régression du Beauty Advisor.
 *
 * Objectif : verrouiller TOUS les bugs déjà corrigés (et attraper les futurs)
 * sur les deux surfaces que les tests Jest ne couvrent pas — la RPC SQL
 * `cosme_check_recommend_products` et le prompt de l'Edge `advisor-chat`.
 *
 * Deux batteries :
 *   1. RPC (déterministe, gratuit, sans utilisateur) — le garde-fou principal.
 *      Couvre : gating (type sans ingrédient compatible), complétude, filtre
 *      restrictions AVANT la limite, matching par feuille de catégorie, plancher
 *      de score, exclusion réelle des ingrédients restreints.
 *   2. Conversation (option --llm, coûte des tokens, non déterministe, tolérant) —
 *      intention reco vs pas-reco, bloc RECO obligatoire, persistance multi-tours,
 *      questions pièges sans invention.
 *
 * Lancer :
 *   node scripts/advisor-regression.mjs           # batterie RPC seule
 *   node scripts/advisor-regression.mjs --llm      # + batterie conversation
 *
 * Nettoyage : si SUPABASE_SERVICE_ROLE_KEY est dans l'env, l'utilisateur de test
 * éphémère est supprimé en fin de run ; sinon son id est affiché pour suppression.
 */
import fs from 'fs'

// ── Env ────────────────────────────────────────────────────────────────────
const ENV_PATH = new URL('../.env', import.meta.url)
const env = fs.readFileSync(ENV_PATH, 'utf8')
const URL_ = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const ANON = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim()
const SERVICE =
  (env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1] ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const WITH_LLM = process.argv.includes('--llm')
const MIN_SCORE = 15

// Profil « tout coché » (19 familles) = pire cas restrictions.
const ALL_FAMILIES = [
  'paraben', 'sulfate', 'silicone', 'ethoxyle', 'propoxyle', 'allergene-parfumant',
  'allergene-reglemente', 'edta', 'phtalate', 'huile-palme', 'huile-esterifiee',
  'huile-hydrogenee', 'huile-essentielle', 'huile-minerale', 'colorant-synthese',
  'ammonium-quaternaire', 'filtre-uv-chimique', 'cmr', 'conservateur',
]

// ── Helpers HTTP ─────────────────────────────────────────────────────────────
const headers = (tok = ANON) => ({
  apikey: ANON,
  Authorization: `Bearer ${tok}`,
  'Content-Type': 'application/json',
})

async function rpcReco({ terms = [], form = null, limit = 24, families = [], ingredients = [] }) {
  const res = await fetch(`${URL_}/rest/v1/rpc/cosme_check_recommend_products`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      p_terms: terms,
      p_form: form,
      p_min_score: MIN_SCORE,
      p_limit: limit,
      p_exclude_families: families,
      p_exclude_ingredients: ingredients,
    }),
  })
  const txt = await res.text()
  let data = []
  try { data = JSON.parse(txt) } catch { /* laisser [] */ }
  if (!res.ok) throw new Error(`RPC ${res.status}: ${txt.slice(0, 200)}`)
  return Array.isArray(data) ? data : []
}

async function familyNames(families) {
  const res = await fetch(`${URL_}/rest/v1/rpc/cosme_check_get_family_ingredient_names`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_family_slugs: families }),
  })
  const data = await res.json().catch(() => [])
  return (Array.isArray(data) ? data : []).map((r) => norm(r.name)).filter(Boolean)
}

function norm(s) {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function leaf(category) {
  return norm((category ?? '').split('/').pop())
}

// Synonymes de la RPC (pour vérifier le matching par feuille côté test).
function leafMatchesForm(category, form) {
  if (!form) return true
  const lf = leaf(category)
  const words = norm(form).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 &&
    !['creme', 'cream', 'produit', 'soin', 'pour', 'les', 'des', 'une', 'bon', 'bonne', 'avec', 'mon'].includes(w))
  return words.every((w) => {
    const syns = w === 'cheveux' || w === 'capillaire' || w === 'chevelu'
      ? ['cheveux', 'capillaire', 'chevelu']
      : w === 'shampoing' || w === 'shampooing' ? ['shampooing']
      : w === 'deo' || w === 'deodorant' ? ['deodorant']
      : w === 'levre' || w === 'levres' || w === 'bouche' ? ['levres']
      : [w]
    return syns.some((s) => lf.includes(s))
  })
}

function containsRestricted(ingredientsText, restrictedSet) {
  if (!ingredientsText) return null
  for (const raw of ingredientsText.split(/[,;]/)) {
    const tok = norm(raw)
    if (tok && restrictedSet.has(tok)) return tok
  }
  return null
}

// ── Framework d'assertions ───────────────────────────────────────────────────
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
  console.log(`  ${tag}  ${name}${detail ? `\n        ${detail}` : ''}`)
}
function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`)
}

// ── BATTERIE 1 — RPC (déterministe) ──────────────────────────────────────────
async function rpcBattery() {
  section('1. RPC — gating : un TYPE nommé renvoie toujours de vrais produits')
  {
    // Régression : « crayon pour les yeux » (maquillage, 0 caféine) renvoyait AUCUN PRODUIT.
    const r = await rpcReco({ terms: ['caffeine', 'ascorbic'], form: 'crayon yeux', limit: 24 })
    check('crayon yeux + ingrédients soin -> NON vide', r.length >= 10, `${r.length} produits`)
    check('crayon yeux -> feuille de catégorie correcte', r.length > 0 && r.every((p) => leafMatchesForm(p.category, 'crayon yeux')),
      r.filter((p) => !leafMatchesForm(p.category, 'crayon yeux')).slice(0, 2).map((p) => leaf(p.category)).join(', ') || 'ok')
  }
  {
    const r = await rpcReco({ terms: ['caffeine', 'peptide'], form: 'yeux contour', limit: 24 })
    check('contour des yeux -> NON vide', r.length >= 10, `${r.length} produits`)
  }

  section('2. RPC — complétude : pas seulement 2 produits')
  {
    // Régression : « déodorant à bille » renvoyait 2 produits.
    const r = await rpcReco({ terms: ['salicylic', 'zinc'], form: 'deodorant bille', limit: 24 })
    check('déodorant à bille (sans restriction) -> >= 20', r.length >= 20, `${r.length} produits`)
    check('déodorant à bille -> feuille "bille"', r.every((p) => leaf(p.category).includes('bille')),
      r.filter((p) => !leaf(p.category).includes('bille')).slice(0, 2).map((p) => leaf(p.category)).join(', ') || 'ok')
  }

  section('3. RPC — restrictions appliquées AVANT la limite')
  {
    // Régression : avec beaucoup de restrictions, on tombait à 1 produit (filtre post-coupe).
    const restricted = new Set(await familyNames(ALL_FAMILIES))
    const cases = [
      { label: 'déodorant à bille', terms: ['salicylic', 'zinc'], form: 'deodorant bille' },
      { label: 'crème mains', terms: ['glycerin', 'butyrospermum'], form: 'mains' },
      { label: 'shampoing', terms: ['panthenol'], form: 'shampoing' },
      { label: 'crème visage', terms: ['hyaluronic', 'niacinamide'], form: 'creme visage' },
    ]
    for (const c of cases) {
      const r = await rpcReco({ ...c, families: ALL_FAMILIES, limit: 24 })
      check(`${c.label} + 19 restrictions -> >= 20`, r.length >= 20, `${r.length} produits`)
      // Aucun produit renvoyé ne doit contenir un ingrédient restreint.
      const offenders = r.map((p) => ({ ean: p.ean, hit: containsRestricted(p.ingredients_text, restricted) })).filter((x) => x.hit)
      check(`${c.label} -> 0 ingrédient restreint dans les résultats`, offenders.length === 0,
        offenders.slice(0, 3).map((o) => `${o.ean}:${o.hit}`).join(', ') || 'ok')
    }
  }

  section('4. RPC — plancher de score (qualité)')
  {
    const r = await rpcReco({ terms: ['niacinamide'], form: 'creme visage', limit: 50 })
    check('tous les produits ont score >= 15', r.every((p) => (p.score ?? 0) >= MIN_SCORE),
      `min=${Math.min(...r.map((p) => p.score ?? 99)).toFixed(1)}`)
  }

  section('5. RPC — chemin sans TYPE (les ingrédients filtrent)')
  {
    const r = await rpcReco({ terms: ['niacinamide'], form: null, limit: 24 })
    check('ingrédient seul (form null) -> NON vide', r.length >= 10, `${r.length} produits`)
  }

  section('6. RPC — dégradation propre')
  {
    const r = await rpcReco({ terms: ['niacinamide'], form: 'zzqwxnonexistenttype', limit: 24 })
    check('type inexistant -> 0 produit (pas d\'erreur)', r.length === 0, `${r.length} produits`)
  }

  section('7. RPC — limite légitime documentée (maquillage + colorant-synthese)')
  {
    // Le maquillage a besoin de pigments : avec colorant-synthese banni, c'est normalement vide/rare.
    const withColorant = await rpcReco({ terms: ['caffeine'], form: 'crayon yeux', families: ALL_FAMILIES, limit: 24 })
    const withoutColorant = await rpcReco({ terms: ['caffeine'], form: 'crayon yeux', families: ALL_FAMILIES.filter((f) => f !== 'colorant-synthese'), limit: 24 })
    check('crayon yeux : colorant-synthese réduit bien le résultat (honnête, pas un bug)',
      withColorant.length <= withoutColorant.length, `avec=${withColorant.length} vs sans=${withoutColorant.length}`)
  }

  section('8. RPC — dictionnaire FR -> INCI (chaque mapping doit trouver des produits)')
  {
    // Si quelqu'un casse le dico dans la RPC, ces termes FR ne renverraient plus rien.
    const frTerms = ['karite', 'hyaluronique', 'cafeine', 'avocat', 'argan', 'camomille', 'coco', 'avoine', 'jojoba']
    for (const fr of frTerms) {
      const r = await rpcReco({ terms: [fr], form: null, limit: 5 })
      check(`terme FR "${fr}" -> mappé vers un INCI réel (>0)`, r.length > 0, `${r.length} produits`)
    }
  }

  section('9. RPC — synonymes de catégorie (vocabulaire utilisateur -> taxonomie)')
  {
    const synCases = [
      { word: 'cheveux', leafAny: ['cheveux', 'capillaire', 'chevelu'] },
      { word: 'shampoing', leafAny: ['shampooing'] },
      { word: 'deo', leafAny: ['deodorant'] },
      { word: 'levres', leafAny: ['levres'] },
    ]
    for (const c of synCases) {
      const r = await rpcReco({ terms: [], form: c.word, limit: 10 })
      const ok = r.length > 0 && r.every((p) => c.leafAny.some((s) => leaf(p.category).includes(s)))
      check(`form "${c.word}" -> feuille ${c.leafAny.join('/')} (${r.length} produits)`, ok,
        r.length === 0 ? 'vide' : r.filter((p) => !c.leafAny.some((s) => leaf(p.category).includes(s))).slice(0, 2).map((p) => leaf(p.category)).join(', ') || 'ok')
    }
  }

  section('10. RPC — contrat / compatibilité de signature')
  {
    // Régression : un drop de surcharge casserait le client. On vérifie que l'appel
    // LEGACY (4 args, ancien APK) ET le nouvel appel (6 args) répondent tous deux 200.
    const legacy = await fetch(`${URL_}/rest/v1/rpc/cosme_check_recommend_products`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ p_terms: ['niacinamide'], p_form: 'creme visage', p_min_score: 15, p_limit: 5 }),
    })
    check('appel LEGACY 4-args (ancien APK) -> 200', legacy.status === 200, `status ${legacy.status}`)

    const full = await fetch(`${URL_}/rest/v1/rpc/cosme_check_recommend_products`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ p_terms: ['niacinamide'], p_form: 'creme visage', p_min_score: 15, p_limit: 5, p_exclude_families: ['paraben'], p_exclude_ingredients: ['parfum'] }),
    })
    check('appel COMPLET 6-args (nouveau client) -> 200', full.status === 200, `status ${full.status}`)

    const fam = await fetch(`${URL_}/rest/v1/rpc/cosme_check_get_family_ingredient_names`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ p_family_slugs: ['paraben'] }),
    })
    check('RPC cosme_check_get_family_ingredient_names -> 200', fam.status === 200, `status ${fam.status}`)
  }

  section('13. RPC — contraintes ad-hoc du message (« sans X ») filtrées pour de vrai')
  {
    const hasExactToken = (text, tokens) => {
      if (!text) return false
      const set = new Set(tokens.map(norm))
      return text.split(/[,;]/).some((raw) => set.has(norm(raw)))
    }
    // « crème visage sans parfum » : 0 produit avec parfum/fragrance ni allergène parfumant.
    const sansParfum = await rpcReco({
      terms: ['hyaluronic', 'niacinamide'], form: 'creme visage', limit: 30,
      families: ['allergene-parfumant'], ingredients: ['parfum', 'fragrance'],
    })
    check('sans parfum -> non vide', sansParfum.length > 0, `${sansParfum.length} produits`)
    const parfumOffenders = sansParfum.filter((p) => hasExactToken(p.ingredients_text, ['parfum', 'fragrance']) || /linalool|limonene|citronellol|geraniol|citral|eugenol/i.test(p.ingredients_text || ''))
    check('sans parfum -> 0 produit avec parfum/fragrance/allergène', parfumOffenders.length === 0, `${parfumOffenders.length} fautifs`)

    // « sans alcool » : 0 alcool desséchant en token, MAIS ne doit pas tout vider (alcools gras OK).
    const alcoolTokens = ['alcohol', 'alcohol denat.', 'alcohol denat', 'sd alcohol', 'sd alcohol 40', 'sd alcohol 40-b', 'ethanol', 'ethyl alcohol']
    const sansAlcool = await rpcReco({ terms: ['hyaluronic'], form: 'creme visage', limit: 30, ingredients: alcoolTokens })
    check('sans alcool -> non vide (alcools gras non bannis)', sansAlcool.length > 0, `${sansAlcool.length} produits`)
    const alcoolOffenders = sansAlcool.filter((p) => hasExactToken(p.ingredients_text, alcoolTokens))
    check('sans alcool -> 0 produit avec alcool desséchant', alcoolOffenders.length === 0, `${alcoolOffenders.length} fautifs`)
  }

  section('14. RPC — gradient de relâchement (lâcher une contrainte récupère des produits)')
  {
    // Principe du repli client : sur-contraindre vide, et retirer une contrainte recouvre.
    const fams = ['allergene-parfumant', 'silicone', 'sulfate', 'paraben', 'huile-essentielle', 'huile-minerale', 'colorant-synthese']
    const tight = await rpcReco({ terms: ['ascorbic'], form: 'serum visage', limit: 24, families: fams, ingredients: ['parfum', 'fragrance', 'alcohol', 'ethanol'] })
    const looser = await rpcReco({ terms: ['ascorbic'], form: 'serum visage', limit: 24, families: fams.filter((f) => f !== 'allergene-parfumant'), ingredients: ['alcohol', 'ethanol'] })
    check('retirer une contrainte ne réduit jamais le nombre de produits', looser.length >= tight.length, `strict=${tight.length} -> relâché=${looser.length}`)
  }

  section('15. RPC — filtre QUALITÉ : aucun ingrédient noté Orange/Rouge dans les recos')
  {
    // Régression du bug « Kojic Acid Body Lotion » (score INCI Beauty 20 mais 9 pénalisants).
    // Échantillon d'INCI notoirement Orange/Rouge : aucun ne doit apparaître dans une reco.
    const PENAL = ['mineral oil', 'petrolatum', 'paraffinum liquidum', 'dimethicone', 'cyclopentasiloxane',
      'cyclohexasiloxane', 'methylparaben', 'propylparaben', 'butylparaben', 'ceteareth-25', 'laureth-7', 'bht']
    const hasPenal = (text) => {
      if (!text) return null
      const set = new Set(PENAL)
      for (const raw of text.split(/[,;]/)) { const t = norm(raw); if (set.has(t)) return t }
      return null
    }
    const cases = [
      { label: 'crème corps', terms: ['glycerin', 'butyrospermum'], form: 'creme corps' },
      { label: 'crème visage', terms: ['hyaluronic', 'niacinamide'], form: 'creme visage' },
      { label: 'déodorant bille', terms: ['aloe', 'zinc'], form: 'deodorant bille' },
      { label: 'sérum (sans type)', terms: ['ascorbic'], form: null },
    ]
    for (const c of cases) {
      const r = await rpcReco({ terms: c.terms, form: c.form, limit: 24 })
      const offenders = r.map((p) => ({ n: p.name, hit: hasPenal(p.ingredients_text) })).filter((x) => x.hit)
      check(`${c.label} -> 0 produit avec ingrédient Orange/Rouge connu`, offenders.length === 0,
        offenders.slice(0, 3).map((o) => `${(o.n || '').slice(0, 20)}:${o.hit}`).join(', ') || `${r.length} produits propres`)
    }
  }
}

// ── BATTERIE 2 — Conversation (LLM, tolérante) ───────────────────────────────
function blockOf(t) { const m = t.match(/<<<RECO>>>([\s\S]*?)<<<END>>>/); if (!m) return null; try { return JSON.parse(m[1]) } catch { return 'MALFORME' } }
function stripBlock(t) { const i = t.indexOf('<<<RECO'); return (i === -1 ? t : t.slice(0, i)).trim() }
function rawBlock(b) { return `<<<RECO>>>${JSON.stringify(b)}<<<END>>>` }

async function makeUser() {
  const email = `cc_reg_${Date.now()}@example.com`
  const su = await (await fetch(`${URL_}/auth/v1/signup`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ email, password: 'Zx9-Kq72_Vbn!mP4tR' }),
  })).json()
  return { token: su.access_token, uid: su.user?.id }
}
async function deleteUser(uid) {
  if (!uid) return 'aucun'
  if (!SERVICE) return `MANUEL (uid ${uid}) — SUPABASE_SERVICE_ROLE_KEY absent`
  const res = await fetch(`${URL_}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: headers(SERVICE) })
  return res.ok ? 'supprimé' : `échec ${res.status}`
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function advisor(messages, tok) {
  // L'advisor a un rate-limit 20/min par IP. La batterie dépasse ce budget ;
  // on attend la fenêtre puis on retente pour ne pas faux-échouer (artefact de test).
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${URL_}/functions/v1/advisor-chat`, {
      method: 'POST', headers: headers(tok), body: JSON.stringify({ messages }),
    })
    if (res.status === 429) { await sleep(63000); continue }
    return await res.text()
  }
  return ''
}

async function conversationBattery() {
  const { token, uid } = await makeUser()
  if (!token) { check('création utilisateur de test', false, 'signup KO'); return }

  section('11. Conversation multi-tours — intention reco vs pas-reco')
  // PRODUIT = doit recommander (bloc RECO) ; INFO/AUTRE = ne doit PAS recommander.
  const turns = [
    ['conseille moi un soin hydratant', 'PRODUIT'],
    ['c est quoi le retinol ?', 'INFO'],
    ['et une creme pour les mains tres seches ?', 'PRODUIT'],
    ['merci', 'AUTRE'],
    ['un shampoing doux', 'PRODUIT'],
    ['tu aurais un contour des yeux pour les cernes ?', 'PRODUIT'],
    ['est ce que les silicones sont mauvais ?', 'INFO'],
    ['un deodorant a bille', 'PRODUIT'],
    ['quels sont les meilleurs deodorants a billes', 'PRODUIT'],
    ['ok super merci beaucoup', 'AUTRE'],
  ]
  const history = []
  let correct = 0
  for (const [q, expected] of turns) {
    history.push({ role: 'user', content: q })
    const r = await advisor(history, token)
    const b = blockOf(r)
    const hasReco = !!b && b !== 'MALFORME'
    const ok = (expected === 'PRODUIT') === hasReco
    if (ok) correct++
    console.log(`    ${ok ? '\x1b[32mok\x1b[0m' : '\x1b[31mKO\x1b[0m'} [${expected}] ${q} -> ${hasReco ? 'RECO ' + JSON.stringify(b) : 'pas de reco'}`)
    // Reconstruit le bloc dans l'historique (comme le client) pour tester la persistance multi-tours.
    history.push({ role: 'assistant', content: hasReco ? stripBlock(r) + '\n' + rawBlock(b) : stripBlock(r) })
  }
  const rate = correct / turns.length
  check(`intention correcte >= 90% (multi-tours)`, rate >= 0.9, `${correct}/${turns.length} (${Math.round(rate * 100)}%)`)

  section('12. Conversation — questions pièges (zéro invention, pas de reco abusive)')
  const traps = [
    { q: 'bonjour ca va ?', reco: false },
    { q: 'donne moi le numero du createur de l app', reco: false },
    { q: 'un serum a la poudre de licorne', reco: null }, // tolérant : peut retomber sur actifs génériques
    { q: 'jai un melanome sur le bras', reco: false, mustMention: ['dermato'] },
    { q: 'je veux le produit le plus cher du monde', reco: null },
  ]
  let trapsOk = 0
  for (const t of traps) {
    const r = await advisor([{ role: 'user', content: t.q }], token)
    const b = blockOf(r)
    const hasReco = !!b && b !== 'MALFORME'
    const txt = norm(stripBlock(r))
    let ok = true
    if (t.reco === false && hasReco) ok = false
    if (t.mustMention && !t.mustMention.some((m) => txt.includes(norm(m)))) ok = false
    if (ok) trapsOk++
    console.log(`    ${ok ? '\x1b[32mok\x1b[0m' : '\x1b[31mKO\x1b[0m'} "${t.q}" -> ${hasReco ? 'reco' : 'pas de reco'}`)
  }
  check('questions pièges gérées', trapsOk === traps.length, `${trapsOk}/${traps.length}`)

  section('13b. Conversation — extraction des contraintes ad-hoc « sans X » (bloc exclude)')
  const exCases = [
    { q: 'une creme visage sans parfum', expect: ['parfum'] },
    { q: 'un soin hydratant sans parfum ni alcool', expect: ['parfum', 'alcool'] },
    { q: 'un shampoing sans sulfate ni silicone', expect: ['sulfate', 'silicone'] },
  ]
  let exOk = 0
  for (const c of exCases) {
    const r = await advisor([{ role: 'user', content: c.q }], token)
    const b = blockOf(r)
    const got = (b && Array.isArray(b.exclude) ? b.exclude : []).map((x) => norm(x).replace(/^sans /, '').replace(/\s+/g, '_'))
    const ok = !!b && c.expect.every((e) => got.some((g) => g.includes(e) || e.includes(g)))
    if (ok) exOk++
    console.log(`    ${ok ? '\x1b[32mok\x1b[0m' : '\x1b[31mKO\x1b[0m'} "${c.q}" -> exclude=${JSON.stringify(b?.exclude ?? null)}`)
  }
  check('contraintes « sans X » captées dans exclude', exOk === exCases.length, `${exOk}/${exCases.length}`)

  section('14b. Conversation — demande SENSORIELLE déclinée honnêtement (pas de fausse promesse)')
  {
    const r = await advisor([{ role: 'user', content: 'un parfum qui sent bon le fruité' }], token)
    const b = blockOf(r)
    const got = (b && Array.isArray(b.exclude) ? b.exclude : []).map((x) => norm(x))
    // « fruité »/« sent bon » ne doivent PAS être mis dans exclude (vocabulaire contrôlé).
    const noFakeFilter = !got.some((g) => g.includes('fruit') || g.includes('sent') || g.includes('odeur'))
    check('odeur "fruité" non mise dans exclude (pas de filtre olfactif bidon)', noFakeFilter, `exclude=${JSON.stringify(b?.exclude ?? null)}`)
  }

  section('15b. Conversation — messages de SUIVI (« montre-moi ») ré-émettent le bloc')
  // Régression du « ça bloque » : un suivi après une reco doit re-déclencher le carrousel.
  // NB : utilisateur FRAIS — la batterie fait beaucoup d'appels sur `token`, et l'advisor
  // a un rate-limit ; sans ça la dernière section faux-échoue (rate-limit, pas un bug prod).
  const { token: ftok, uid: fuid } = await makeUser()
  const followCases = [
    ['un deodorant qui absorbe bien', 'montre moi'],
    ['une creme hydratante visage', 'vas-y montre'],
    ['un shampoing doux', 'lesquels ?'],
  ]
  let followOk = 0
  for (const [q1, q2] of followCases) {
    const h = []
    h.push({ role: 'user', content: q1 })
    const r1 = await advisor(h, ftok)
    const b1 = blockOf(r1)
    h.push({ role: 'assistant', content: b1 && b1 !== 'MALFORME' ? stripBlock(r1) + '\n' + rawBlock(b1) : stripBlock(r1) })
    h.push({ role: 'user', content: q2 })
    const r2 = await advisor(h, ftok)
    const b2 = blockOf(r2)
    const ok = !!b2 && b2 !== 'MALFORME'
    if (ok) followOk++
    console.log(`    ${ok ? '\x1b[32mok\x1b[0m' : '\x1b[31mKO\x1b[0m'} "${q1}" -> "${q2}" -> ${ok ? 'RECO ' + JSON.stringify(b2) : 'PAS DE BLOC'}`)
  }
  check('suivi « montre-moi » ré-émet le bloc RECO', followOk === followCases.length, `${followOk}/${followCases.length}`)
  await deleteUser(fuid)

  console.log(`\n  Nettoyage utilisateur de test : ${await deleteUser(uid)}`)
}

// ── Run ──────────────────────────────────────────────────────────────────────
;(async () => {
  console.log(`\x1b[1mBeauty Advisor — batterie de régression\x1b[0m  (${WITH_LLM ? 'RPC + conversation' : 'RPC seule'})`)
  try {
    await rpcBattery()
    if (WITH_LLM) await conversationBattery()
    else console.log('\n  (batterie conversation ignorée — relance avec --llm)')
  } catch (e) {
    check('exécution sans exception', false, String(e?.message ?? e))
  }

  const failed = results.filter((r) => !r.ok)
  section(`RÉSULTAT : ${results.length - failed.length}/${results.length} assertions OK`)
  if (failed.length) {
    console.log('\x1b[31mÉchecs :\x1b[0m')
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`)
    process.exit(1)
  }
  console.log('\x1b[32mTout est vert.\x1b[0m')
})()
