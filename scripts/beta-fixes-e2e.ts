/**
 * E2E « correctifs bêta 14 sept 2026 » — contre la PROD, avec un VRAI compte.
 *
 * Couvre les quatre correctifs demandés après les retours de Stela :
 *   1. SCORES ALIGNÉS  : la note servie par `analyser` == `catalog.score`, donc
 *      la pastille de la recherche et les étoiles de la fiche tombent dans la
 *      même bande. Cas de référence : Anua Azelaic Acid 10 (catalogue 12,9 vs
 *      live 16,51 → la fiche affichait 4 étoiles vertes, la recherche un œil
 *      jaune).
 *   2. ALTERNATIVES    : pour de VRAIES analyses lancées par ce compte (avec ses
 *      restrictions), le carrousel n'est ni vide ni hors-sujet.
 *   3. RENOMMER        : l'update part bien en base sous RLS, et le nom
 *      personnalisé est celui qu'on affiche (sans casser l'identité catalogue).
 *   4. COUVERTURE      : l'icône reload recalcule bien après un changement de
 *      routine, et ne redébite rien quand la routine n'a pas bougé.
 *   5. INGRÉDIENTS     : l'annuaire du menu répond (liste alphabétique paginée
 *      par curseur + recherche au fil de la frappe, accents et casse ignorés).
 *   6. DOUBLONS        : plus aucun doublon strict (même marque + même nom +
 *      même INCI) ne peut réapparaître dans une recherche.
 *
 * Le compte est créé puis SUPPRIMÉ à la fin (y compris en cas d'échec).
 *
 * Node 24 exécute ce .ts nativement (type-stripping). Lancer :
 *   node scripts/beta-fixes-e2e.ts
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { resolveAlternativesQuery, type AlternativesQuery } from '../lib/catalog/productTypeCategory.ts'
import {
  buildExclusionSet,
  filterAlternatives,
  type AlternativeProduct,
} from '../lib/analysis/alternativesFilter.ts'
import { applyColorCap, resolveDisplayScore, scoreToneFromScore } from '../lib/analysis/scoreCap.ts'
import { normalizeToken } from '../lib/analysis/alternativesFilter.ts'
import { displayTitle, catalogTitle } from '../lib/analysis/displayTitle.ts'
import type { UserRestrictions } from '../lib/supabase/types.ts'

// ── env ──────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL
const ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) throw new Error('.env incomplet')

const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', B = '\x1b[1m', D = '\x1b[2m', Y = '\x1b[33m', X = '\x1b[0m'
const ok = (m: string) => console.log(`  ${G}OK${X} ${m}`)
const ko = (m: string) => console.log(`  ${R}KO${X} ${m}`)
const info = (m: string) => console.log(`  ${C}.${X} ${m}`)
const warn = (m: string) => console.log(`  ${Y}!${X} ${m}`)
const head = (m: string) => console.log(`\n${B}> ${m}${X}`)
let failures = 0
function expect(cond: boolean, label: string, note = '') {
  if (cond) ok(label + (note ? ` ${D}(${note})${X}` : ''))
  else { ko(label + (note ? ` — ${note}` : '')); failures++ }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
const svcHeaders = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Accept-Profile': 'cosme_check',
  'Content-Profile': 'cosme_check',
}
const userHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  apikey: ANON_KEY,
  Authorization: `Bearer ${token}`,
  'Accept-Profile': 'cosme_check',
  'Content-Profile': 'cosme_check',
})

async function signUp(email: string, password: string) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  return r.json() as Promise<{ user?: { id: string }; id?: string }>
}
async function signIn(email: string, password: string) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  return r.json() as Promise<{ access_token?: string; user?: { id: string } }>
}
async function deleteUser(userId: string) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
}
async function setProfile(userId: string, restrictions: UserRestrictions, goals: string[]) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { ...svcHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      first_name: 'TestBeta',
      preferences: {
        skin: { skinTypeFace: 'grasse', skinTypeBody: 'normale', concerns: [], goals },
        onboardingShown: true,
        restrictions,
      },
    }),
  })
  if (!r.ok) throw new Error(`setProfile ${r.status}: ${(await r.text()).slice(0, 200)}`)
}
/** Crédite le compte de test. Le quota NE vient PAS de `user_credits.daily_limit`
 *  (c'est `credit_config_for` + tier qui décident, 5/jour en free) : les crédits
 *  supplémentaires passent par `credit_grants.remaining`, comme un octroi admin.
 *  Nécessaire ici parce que la couverture coûte 3 crédits et qu'un compte neuf ne
 *  pourrait l'évaluer qu'une seule fois. */
async function grantCredits(uid: string, amount: number) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/credit_grants`, {
    method: 'POST',
    headers: { ...svcHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: uid, amount, remaining: amount,
      note: 'e2e beta-fixes', created_by: 'beta-fixes-e2e', grant_type: 'admin',
    }),
  })
  if (!r.ok) throw new Error(`grantCredits ${r.status}: ${(await r.text()).slice(0, 200)}`)
}

/** Remet le solde à ZÉRO : on vide les octrois ET on consomme le quota du jour. */
async function drainCredits(uid: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/credit_grants?user_id=eq.${uid}`, {
    method: 'PATCH',
    headers: { ...svcHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ remaining: 0 }),
  })
  await fetch(`${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${uid}`, {
    method: 'PATCH',
    headers: { ...svcHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ used: 9999 }),
  })
}

async function rpc(name: string, params: Record<string, unknown>, token: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  })
  if (!r.ok) throw new Error(`${name} ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}
async function invoke(fn: string, body: unknown, token: string) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const txt = await r.text()
  let json: unknown = null
  try { json = JSON.parse(txt) } catch { /* texte brut */ }
  return { status: r.status, json: json as Record<string, unknown> | null, raw: txt }
}
/** Lecture PostgREST (service role). `path` est un chemin déjà encodé. */
async function select(path: string): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: svcHeaders })
  if (!r.ok) throw new Error(`select ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

// ── produits réels de la batterie ────────────────────────────────────────────
/** Le premier EAN est le cas EXACT remonté par Stela (catalogue 12,9 / live 16,51). */
const EANS = ['8809640739019', '8809640735851']

interface CatalogRow {
  ean: string
  brand: string | null
  name: string | null
  category: string | null
  score: number | null
  count_orange: number | null
  count_rouge: number | null
  ingredients_text: string | null
}

const COLS = 'ean,brand,name,category,score,count_orange,count_rouge,ingredients_text'

async function loadCatalogRows(): Promise<CatalogRow[]> {
  const inList = EANS.map((e) => `"${e}"`).join(',')
  const base = (await select(`catalog?select=${COLS}&ean=in.(${inList})`)) as unknown as CatalogRow[]
  // Complète la batterie avec d'autres familles + d'autres bandes de score.
  const families = [
    'coiffure/shampooing/shampooing-classique',
    'soin-du-corps-et-visage/creme-hydratante/creme-visage',
    'soin-du-corps-et-visage/nettoyant-visage/gel-nettoyant-visage',
  ]
  const extras: CatalogRow[] = []
  for (const fam of families) {
    const rows = (await select(
      `catalog?select=${COLS}&category=eq.${encodeURIComponent(fam)}` +
        `&score=not.is.null&ingredients_text=not.is.null&limit=1`,
    )) as unknown as CatalogRow[]
    extras.push(...rows)
  }
  const seen = new Set<string>()
  return [...base, ...extras].filter((r) => {
    if (!r.ingredients_text || seen.has(r.ean)) return false
    seen.add(r.ean)
    return true
  })
}

// ── alternatives : reproduction fidèle de useAlternatives ────────────────────
const RAW_PAGE = 40
const SCAN_CAP = 240
interface AltRow {
  ean: string; brand: string | null; name: string | null; category: string | null
  image_url: string | null; score: number | null; score_label: string | null
  score_tone: string | null; count_total: number | null; ingredients_text: string | null
  count_orange: number | null; count_rouge: number | null
}
type AltProduct = AlternativeProduct & { category: string | null }
const mapAlt = (r: AltRow): AltProduct => ({
  ean: r.ean, brand: r.brand, name: r.name, category: r.category, imageUrl: r.image_url,
  score: r.score, scoreLabel: r.score_label, scoreTone: r.score_tone, countTotal: r.count_total,
  ingredientsText: r.ingredients_text, countOrange: r.count_orange ?? 0, countRouge: r.count_rouge ?? 0,
})

/** Boucle d'accumulation identique au hook : pages de 40, plafond 240 lignes. */
async function runAlternativesPipeline(
  q: AlternativesQuery,
  restrictions: UserRestrictions,
  familyNames: string[],
  allergiesFreeform: string | null,
  token: string,
  poolTarget = 32,
  self: { ean: string | null; brand: string | null; name: string | null } | null = null,
) {
  const exclusion = buildExclusionSet({ restrictions, familyIngredientNames: familyNames, allergiesFreeform })
  const raw: AltProduct[] = []
  let offset = 0
  let exhausted = false
  while (filterAlternatives(raw, exclusion).length < poolTarget && !exhausted && offset < SCAN_CAP) {
    const rows: AltRow[] = q.kind === 'prefix'
      ? await rpc('cosme_check_alternatives_by_category_prefix', { p_prefix: q.value, p_limit: RAW_PAGE, p_offset: offset }, token)
      : await rpc('cosme_check_alternatives_by_category_exact', { p_category: q.value, p_limit: RAW_PAGE, p_offset: offset }, token)
    const page = (rows ?? []).map(mapAlt)
    offset += RAW_PAGE
    if (page.length < RAW_PAGE) exhausted = true
    if (page.length === 0) break
    raw.push(...page)
  }
  // Même exclusion « soi-même » que useAlternatives (EAN + marque+nom normalisé).
  const selfKey = self ? normalizeToken([self.brand, self.name].filter(Boolean).join(' ')) : ''
  const isSelf = (p: AltProduct) => {
    if (self?.ean && p.ean === self.ean) return true
    if (selfKey.length < 3) return false
    return normalizeToken([p.brand, p.name].filter(Boolean).join(' ')) === selfKey
  }
  const filtered = (filterAlternatives(raw, exclusion) as AltProduct[]).filter((p) => !isSelf(p))
  return { raw, filtered, scanned: offset, exhausted }
}

const bucketOf = (q: AlternativesQuery) => q.value.replace(/\/%$/, '').split('/').slice(0, 2).join('/')

// ── run ──────────────────────────────────────────────────────────────────────
const stamp = Date.now()
const EMAIL = `beta-e2e-${stamp}@cosme-check-test.com`
const PASSWORD = `Test!${stamp}aA`
/** Restrictions réalistes d'une bêta-testeuse : deux ingrédients courants. */
const RESTRICTIONS = {
  ingredients: [{ name: 'Parfum' }, { name: 'Phenoxyethanol' }],
  families: [],
} as unknown as UserRestrictions

let userId: string | null = null

async function main() {
  console.log(`${B}=== E2E correctifs beta (scores / alternatives / renommer / couverture) ===${X}`)

  const up = await signUp(EMAIL, PASSWORD)
  const si = await signIn(EMAIL, PASSWORD)
  const token = si.access_token
  userId = si.user?.id ?? up.user?.id ?? up.id ?? null
  if (!token || !userId) throw new Error(`auth echouee: ${JSON.stringify(up).slice(0, 200)}`)
  await setProfile(userId, RESTRICTIONS, ['hydrater_profondeur', 'peau_douce', 'decouvrir_clean'])
  await grantCredits(userId, 100)
  info(`compte test: ${userId}  ${D}(restrictions: Parfum, Phenoxyethanol)${X}`)

  const familyNames: string[] = []
  const rows = await loadCatalogRows()
  info(`batterie: ${rows.length} produits catalogue reels`)

  // ── 1. SCORES ALIGNÉS ──────────────────────────────────────────────────────
  head('1. Scores alignes — la note servie == la note catalogue (une seule bande partout)')
  const analyses: { row: CatalogRow; analysisId: string; served: number | null }[] = []
  for (const row of rows) {
    const res = await invoke('analyser', {
      text: row.ingredients_text,
      withSynthesis: false,
      productLabel: row.name,
      brand: row.brand,
      productEan: row.ean,
    }, token)
    if (res.status !== 200 || !res.json) {
      warn(`analyser ${row.ean} -> HTTP ${res.status} ${res.raw.slice(0, 140)}`)
      failures++
      continue
    }
    const result = (res.json.result ?? res.json) as Record<string, unknown>
    const served = typeof result.score === 'number' ? (result.score as number) : null
    const analysisId = (res.json.analysisId ?? res.json.id ?? '') as string
    analyses.push({ row, analysisId, served })

    const label = `${row.brand ?? ''} ${row.name ?? ''}`.trim().slice(0, 52)
    expect(
      served != null && row.score != null && Math.abs(served - row.score) < 0.011,
      `note servie == note catalogue · ${label}`,
      `servi ${served} / catalogue ${row.score}`,
    )

    // Ce que chaque surface AFFICHE, calculé avec le vrai code de l'app.
    const searchScore = applyColorCap(row.score ?? 0, row.count_orange ?? 0, row.count_rouge ?? 0)
    const sheetBase = resolveDisplayScore(row.score, served)
    const sheetScore = applyColorCap(sheetBase ?? 0, row.count_orange ?? 0, row.count_rouge ?? 0)
    expect(
      scoreToneFromScore(searchScore) === scoreToneFromScore(sheetScore),
      `recherche et fiche dans la MEME bande · ${label}`,
      `recherche ${searchScore.toFixed(2)} (${scoreToneFromScore(searchScore)}) / fiche ${sheetScore.toFixed(2)} (${scoreToneFromScore(sheetScore)})`,
    )
  }

  // ── 2. ALTERNATIVES ────────────────────────────────────────────────────────
  head('2. Alternatives — non vides et dans la bonne famille, avec les restrictions du compte')
  for (const { row } of analyses) {
    const q = resolveAlternativesQuery({
      catalogCategory: row.category,
      productType: null,
      productName: row.name,
    })
    const label = `${row.brand ?? ''} ${row.name ?? ''}`.trim().slice(0, 44)
    if (!q) {
      expect(false, `une requete categorie est resolue · ${label}`, `ABSTENTION (categorie « ${row.category} »)`)
      continue
    }
    const { raw, filtered, scanned } = await runAlternativesPipeline(
      q, RESTRICTIONS, familyNames, null, token, 32,
      { ean: row.ean, brand: row.brand, name: row.name },
    )
    const bucket = bucketOf(q)
    const offTopic = filtered.filter((p) => !(p.category ?? '').startsWith(bucket))
    info(`${label} -> ${q.kind}:${q.value} | brut ${raw.length} (scan ${scanned}) -> filtre ${filtered.length}`)
    expect(filtered.length > 0, `au moins une alternative · ${label}`, `${filtered.length} apres restrictions`)
    expect(offTopic.length === 0, `aucune alternative hors famille · ${label}`,
      offTopic.length ? `${offTopic.length} hors ${bucket} (ex. ${offTopic[0]?.category})` : bucket)
    expect(!filtered.some((p) => p.ean === row.ean), `ne se propose pas lui-meme · ${label}`)
    const sameName = filtered.filter(
      (p) => normalizeToken([p.brand, p.name].filter(Boolean).join(' ')) ===
             normalizeToken([row.brand, row.name].filter(Boolean).join(' ')),
    )
    expect(sameName.length === 0, `aucun doublon du produit consulte · ${label}`,
      sameName.length ? `${sameName.length} doublon(s)` : '')
  }

  // ── 3. RENOMMER ────────────────────────────────────────────────────────────
  head('3. Renommer — ecrit bien en base sous RLS, et seul le nom affiche change')
  const target = analyses.find((a) => a.analysisId)
  if (!target) {
    expect(false, 'au moins une analyse creee pour tester le renommage')
  } else {
    const custom = `Mon produit du matin ${stamp}`
    const r = await fetch(`${SUPABASE_URL}/rest/v1/analyses?id=eq.${target.analysisId}`, {
      method: 'PATCH',
      headers: { ...userHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify({ name: custom }),
    })
    const updated = (await r.json()) as { name?: string; product_label?: string }[]
    expect(r.ok, 'PATCH analyses.name accepte par RLS', `HTTP ${r.status}`)
    expect(updated.length === 1, 'exactement une ligne modifiee (la sienne)', `${updated.length} ligne(s)`)
    const rowAfter = updated[0] ?? {}
    expect(rowAfter.name === custom, 'le nom personnalise est bien persiste')
    expect(
      displayTitle(rowAfter) === custom,
      'la fiche et les listes affichent le nom personnalise',
      displayTitle(rowAfter),
    )
    expect(
      catalogTitle(rowAfter) === (rowAfter.product_label ?? '').trim(),
      'identite catalogue = nom REEL du produit (alternatives/image intactes)',
      catalogTitle(rowAfter).slice(0, 44),
    )
    const others = await select(`analyses?select=id&id=eq.${target.analysisId}&user_id=neq.${userId}`)
    expect(others.length === 0, 'le renommage reste prive (aucune ligne partagee)')
  }

  // ── 4. COUVERTURE DES OBJECTIFS ────────────────────────────────────────────
  head('4. Couverture des objectifs — le reload recalcule apres un changement de routine')
  const routineIds = analyses.filter((a) => a.analysisId).slice(0, 2).map((a) => a.analysisId)
  if (routineIds.length < 2) {
    warn('pas assez d analyses pour tester la couverture')
    failures++
  } else {
    const addRoutine = async (analysisId: string) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/routine_items`, {
        method: 'POST',
        headers: { ...userHeaders(token), Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: userId, analysis_id: analysisId, frequency: 'daily' }),
      })
      if (!r.ok) throw new Error(`routine_items ${r.status}: ${(await r.text()).slice(0, 160)}`)
    }
    // Les analyses ont debite des credits (et remis le quota par defaut a 5) :
    // on releve le quota ICI pour pouvoir enchainer plusieurs recalculs.
    await grantCredits(userId!, 100)
    await addRoutine(routineIds[0]!)

    const first = await invoke('goals-coverage', {}, token)
    expect(first.status === 200, 'premier calcul accepte', `HTTP ${first.status} ${first.raw.slice(0, 140)}`)
    const cov1 = (first.json?.coverage ?? []) as { key?: string; pct?: number }[]
    const sig1 = first.json?.routineSignature as string | undefined
    expect(Array.isArray(cov1) && cov1.length > 0, 'une couverture est renvoyee', `${cov1.length} objectif(s)`)
    expect(first.json?.cached !== true, 'premier appel = vrai calcul (pas du cache)')

    const again = await invoke('goals-coverage', {}, token)
    expect(again.status === 200, 'reload sans changement accepte', `HTTP ${again.status}`)
    expect(
      again.json?.cached === true || again.json?.routineSignature === sig1,
      'routine inchangee -> cache servi (aucun credit redebite)',
      `cached=${String(again.json?.cached)}`,
    )

    await addRoutine(routineIds[1]!)
    const after = await invoke('goals-coverage', {}, token)
    expect(after.status === 200, 'reload apres ajout accepte', `HTTP ${after.status} ${after.raw.slice(0, 140)}`)
    const sig2 = after.json?.routineSignature as string | undefined
    expect(!!sig2 && sig2 !== sig1, 'la signature de routine a change -> recalcul effectif', `${sig1} -> ${sig2}`)
    expect(after.json?.cached !== true, 'le reload apres ajout N EST PAS servi depuis le cache')
    const pc = after.json?.productCount as number | undefined
    expect(pc === 2, 'le recalcul prend bien les 2 produits de la routine', `productCount=${pc}`)

    const persisted = (await select(
      `routine_goal_coverage?select=routine_signature,product_count&user_id=eq.${userId}`,
    )) as unknown as { routine_signature: string; product_count: number }[]
    expect(
      persisted[0]?.routine_signature === sig2,
      'la ligne lue par l app porte la nouvelle signature',
      persisted[0]?.routine_signature,
    )

    // Crédits épuisés -> 429 « no_credits » : c'est ce que le hook mappe vers
    // la carte d'upsell Premium. On le vérifie plutôt que de le supposer.
    await drainCredits(userId!)
    // On RETIRE un produit pour rechanger la signature (le re-ajouter violerait
    // la contrainte d'unicite user_id+analysis_id).
    await fetch(
      `${SUPABASE_URL}/rest/v1/routine_items?user_id=eq.${userId}&analysis_id=eq.${routineIds[1]}`,
      { method: 'DELETE', headers: userHeaders(token) },
    )
    const broke = await invoke('goals-coverage', {}, token)
    expect(broke.status === 429, 'sans credits, le reload repond 429 (et pas une erreur muette)', `HTTP ${broke.status}`)
    expect(broke.json?.code === 'no_credits', 'le code d erreur attendu par le hook est bien renvoye', String(broke.json?.code))
  }

  // ── 5. ANNUAIRE DES INGRÉDIENTS ────────────────────────────────────────────
  head('5. Ingredients — liste alphabetique paginee + recherche au fil de la frappe')
  // NB : on ne compare PAS l'ordre en JS. Le tri vient de la collation Postgres,
  // qui ignore la ponctuation au premier niveau (« 1-naphthol » avant
  // « 1,10-decanediol »), alors qu'une comparaison JS se fait octet par octet.
  // Ce qui compte pour un scroll infini, c'est qu'aucune ligne ne soit vue deux
  // fois ni sautee : c'est ce qu'on verifie, sur 5 pages consecutives.
  const PAGES = 5
  const seenSlugs = new Set<string>()
  let cursor: { name: string; slug: string } | null = null
  let pagesRead = 0
  let dupAcrossPages = 0
  for (let i = 0; i < PAGES; i++) {
    const page = (await rpc('cosme_check_list_ingredients_page',
      { p_after_name: cursor?.name ?? null, p_after_slug: cursor?.slug ?? null, p_limit: 60 },
      token)) as IngredientRow[]
    if (page.length === 0) break
    pagesRead++
    for (const r of page) {
      if (seenSlugs.has(r.slug)) dupAcrossPages++
      seenSlugs.add(r.slug)
    }
    const last = page[page.length - 1]!
    cursor = { name: last.sort_name ?? last.name.toLowerCase(), slug: last.slug }
    if (page.length < 60) break
  }
  expect(pagesRead === PAGES, 'le curseur enchaine bien 5 pages', `${pagesRead} page(s)`)
  expect(dupAcrossPages === 0, 'aucune ligne servie deux fois', `${dupAcrossPages} doublon(s)`)
  expect(seenSlugs.size === pagesRead * 60, 'aucune ligne sautee entre les pages',
    `${seenSlugs.size} slugs distincts pour ${pagesRead * 60} attendus`)

  // Recherche au fil de la frappe : chaque prefixe doit deja renvoyer la cible.
  for (const typed of ['ni', 'nia', 'niac', 'niacin', 'niacinamide']) {
    const res = (await rpc('cosme_check_search_ingredients',
      { p_query: typed, p_limit: 40, p_offset: 0 }, token)) as IngredientRow[]
    const hit = res.some((r) => r.slug === 'niacinamide')
    expect(hit, `« ${typed} » propose deja NIACINAMIDE`, `${res.length} resultat(s)`)
  }
  const firstHit = (await rpc('cosme_check_search_ingredients',
    { p_query: 'niacinamide', p_limit: 5, p_offset: 0 }, token)) as IngredientRow[]
  expect(firstHit[0]?.slug === 'niacinamide', 'la correspondance exacte remonte en tete', firstHit[0]?.slug)

  // Insensible a la casse ET aux accents (wrapper f_unaccent).
  const upper = (await rpc('cosme_check_search_ingredients', { p_query: 'NIACINAMIDE', p_limit: 5, p_offset: 0 }, token)) as IngredientRow[]
  expect(upper[0]?.slug === 'niacinamide', 'recherche insensible a la casse')
  const accented = (await rpc('cosme_check_search_ingredients', { p_query: 'niacinamidé', p_limit: 5, p_offset: 0 }, token)) as IngredientRow[]
  expect(accented[0]?.slug === 'niacinamide', 'recherche insensible aux accents')

  // Sous 2 caracteres : aucune requete large (garde cote RPC).
  const tooShort = (await rpc('cosme_check_search_ingredients', { p_query: 'n', p_limit: 40, p_offset: 0 }, token)) as IngredientRow[]
  expect(tooShort.length === 0, 'un seul caractere ne declenche pas de balayage', `${tooShort.length}`)

  // Chaque resultat doit ouvrir une fiche existante.
  const detail = await rpc('cosme_check_get_ingredient', { p_slug: 'niacinamide' }, token)
  expect(!!detail, 'le slug renvoye ouvre bien une fiche ingredient')

  // ── 6. DOUBLONS SUPPRIMÉS ──────────────────────────────────────────────────
  head('6. Doublons — plus aucun doublon strict ne peut remonter dans une recherche')
  for (const q of ['anua azelaic', 'cerave', 'the ordinary niacinamide']) {
    const res = (await rpc('cosme_check_search_catalog',
      { p_query: q, p_limit: 40, p_offset: 0 }, token)) as
      { ean: string; brand: string | null; name: string | null; ingredients_text: string | null }[]
    const seen = new Map<string, string>()
    const dups: string[] = []
    for (const r of res) {
      if (!r.ingredients_text) continue
      const key = [
        normalizeToken(r.brand ?? ''),
        normalizeToken(r.name ?? ''),
        (r.ingredients_text ?? '').toLowerCase().replace(/\s+/g, ' '),
      ].join('|')
      if (seen.has(key)) dups.push(`${r.name} (${r.ean} == ${seen.get(key)})`)
      else seen.set(key, r.ean)
    }
    expect(dups.length === 0, `« ${q} » sans doublon strict`, dups.length ? dups[0] : `${res.length} resultat(s)`)
  }
}

main()
  .catch((e) => { ko(`ERREUR: ${(e as Error).message}`); failures++ })
  .finally(async () => {
    if (userId) { await deleteUser(userId); info('compte test supprime') }
    console.log(failures === 0 ? `\n${B}${G}TOUS LES TESTS PASSENT${X}` : `\n${B}${R}${failures} ECHEC(S)${X}`)
    process.exit(failures === 0 ? 0 : 1)
  })
