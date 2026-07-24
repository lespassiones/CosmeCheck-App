/**
 * E2E « Alternatives » — garantit que les recommandations « produits similaires »
 * de l'écran d'analyse restent TOUJOURS dans la bonne famille de produits, quelle
 * que soit la qualité de la catégorie catalogue.
 *
 * Reproduit le bug remonté par le bêta-testeur Nono Jimmy (juil 2026) :
 *   « Gel de Limpeza Facial CeraVe » (un NETTOYANT VISAGE) proposait comme
 *   alternatives un savon pour les mains, un gel gingival bébé, un gel pour les
 *   jambes, des lingettes… Cause : la catégorie catalogue du produit était le
 *   bucket poubelle « gel » et le moteur pivotait dessus en match exact.
 *
 * Le test :
 *   1. crée un VRAI compte éphémère (signup + signin + profil avec restrictions) ;
 *   2. pour une batterie de VRAIS produits (dont le cas CeraVe exact), REPRODUIT
 *      le pipeline client EXACT (mêmes modules que l'app : resolveAlternativesQuery
 *      + buildExclusionSet + filterAlternatives) contre les RPCs de PROD ;
 *   3. vérifie que chaque alternative est dans la bonne famille (préfixe taxonomie),
 *      que les produits hors-sujet du bug sont ABSENTS, que le filtre restrictions
 *      retire bien les produits interdits, et que les cas insignifiables S'ABSTIENNENT ;
 *   4. supprime le compte de test.
 *
 * Node 24 exécute ce .ts nativement (type-stripping). Lancer :
 *   node scripts/alternatives-e2e.ts
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  resolveAlternativesQuery,
  type AlternativesQuery,
} from '../lib/catalog/productTypeCategory.ts'
import {
  buildExclusionSet,
  filterAlternatives,
  type AlternativeProduct,
} from '../lib/analysis/alternativesFilter.ts'
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

const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m'
const ok = (m: string) => console.log(`  ${G}✓${X} ${m}`)
const ko = (m: string) => console.log(`  ${R}✗${X} ${m}`)
const info = (m: string) => console.log(`  ${C}·${X} ${m}`)
let failures = 0
function expect(cond: boolean, label: string, note = '') {
  if (cond) ok(label + (note ? ` ${D}(${note})${X}` : ''))
  else { ko(label + (note ? ` — ${note}` : '')); failures++ }
}

// ── auth + profil (service role) ───────────────────────────────────────────
async function signUp(email: string, password: string) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  return r.json()
}
async function signIn(email: string, password: string) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  return r.json()
}
async function deleteUser(userId: string) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
}
async function setProfile(userId: string, restrictions: UserRestrictions) {
  await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Accept-Profile': 'cosme_check',
      'Content-Profile': 'cosme_check',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      first_name: 'TestAlt',
      preferences: {
        skin: { skinTypeFace: 'grasse', skinTypeBody: 'normale', concerns: [], goals: [] },
        onboardingShown: true,
        restrictions,
      },
    }),
  })
}

// ── RPC (JWT utilisateur, schéma public par défaut, comme l'app) ─────────────
async function rpc(name: string, params: Record<string, unknown>, token: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  })
  if (!r.ok) throw new Error(`${name} ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

interface AltRow {
  ean: string
  brand: string | null
  name: string | null
  category: string | null
  image_url: string | null
  score: number | null
  score_label: string | null
  score_tone: string | null
  count_total: number | null
  ingredients_text: string | null
  count_orange: number | null
  count_rouge: number | null
}
/** L'app mappe vers AlternativeProduct (sans `category`) ; on garde `category`
 *  EN PLUS uniquement pour les assertions de cohérence du test. */
type AltProduct = AlternativeProduct & { category: string | null }
const mapRow = (r: AltRow): AltProduct => ({
  ean: r.ean, brand: r.brand, name: r.name, category: r.category, imageUrl: r.image_url, score: r.score,
  scoreLabel: r.score_label, scoreTone: r.score_tone, countTotal: r.count_total,
  ingredientsText: r.ingredients_text, countOrange: r.count_orange ?? 0, countRouge: r.count_rouge ?? 0,
})

/** Reproduit fidèlement le chemin de fetch de useAlternatives. */
async function fetchAlternatives(q: AlternativesQuery, token: string): Promise<AltProduct[]> {
  const rows: AltRow[] = q.kind === 'prefix'
    ? await rpc('cosme_check_alternatives_by_category_prefix', { p_prefix: q.value, p_limit: 60, p_offset: 0 }, token)
    : await rpc('cosme_check_alternatives_by_category_exact', { p_category: q.value, p_limit: 60, p_offset: 0 }, token)
  return (rows ?? []).map(mapRow)
}

/** Le bucket taxonomique (l1/l2) attendu à partir de la requête résolue. */
function bucketOf(q: AlternativesQuery): string {
  const v = q.value.replace(/\/%$/, '')
  return v.split('/').slice(0, 2).join('/')
}

// ── batterie de produits réels ───────────────────────────────────────────────
interface Case {
  label: string
  ean?: string
  /** override catégorie (cas hors-catalogue). */
  catalogCategory?: string | null
  productName?: string | null
  productType?: string | null
  expectBucket?: string
  expectAbstain?: boolean
  forbidEans?: string[]
}
const CASES: Case[] = [
  {
    label: 'CeraVe Gel de Limpeza Facial — BUG BÊTA (catégorie « gel », product_type null)',
    ean: '7899706172745',
    productType: null,
    expectBucket: 'soin-du-corps-et-visage/nettoyant-visage',
    // Les produits hors-sujet effectivement affichés au bêta-testeur :
    forbidEans: [
      '3538394651517', // gel lavant mains — COSLYS
      '3596710421138', // gel gingival première dent — Auchan
      '4305615915333', // 99% Wasser Feuchttücher — Babydream
    ],
  },
  {
    label: 'CeraVe (même produit) — product_type = « Nettoyant visage » (analyseur)',
    ean: '7899706172745',
    productType: 'Nettoyant visage',
    expectBucket: 'soin-du-corps-et-visage/nettoyant-visage',
  },
  {
    label: 'Nettoyant visage à catégorie catalogue PROPRE (match exact feuille)',
    ean: '8809647390497', // SOME BY MI — gel-nettoyant-visage
    productType: null,
    expectBucket: 'soin-du-corps-et-visage/nettoyant-visage',
  },
  {
    label: 'Shampooing à catégorie propre',
    ean: '8800289461965', // Medicube — coiffure/shampooing/shampooing-classique
    productType: null,
    expectBucket: 'coiffure/shampooing',
  },
  {
    label: 'ABSTENTION : catégorie « gel » + product_type null + nom sans mot-clé',
    catalogCategory: 'gel',
    productName: 'Machin Truc Édition 42',
    productType: null,
    expectAbstain: true,
  },
]

// Restriction : ingrédient très courant → PROUVE que le filtre retire des candidats.
const RESTRICTIONS: UserRestrictions = { families: [], ingredients: [{ slug: 'parfum', name: 'Parfum' }] }
const EXCLUSION = buildExclusionSet({ restrictions: RESTRICTIONS, familyIngredientNames: [], allergiesFreeform: null })

const lastSeg = (c: string | null) => (c ?? '').split('/').pop() ?? ''

;(async () => {
  console.log(`\n${B}=== Alternatives — E2E cohérence catégorie (fix bug bêta Nono Jimmy) ===${X}`)
  const email = `alt_e2e_${Date.now()}@cosmecheck.test`
  const pass = `Ab3!${Date.now().toString(36)}Xy9`
  let userId: string | null = null

  try {
    const su = await signUp(email, pass)
    userId = su.user?.id ?? su.id ?? null
    const si = await signIn(email, pass)
    const token = si.access_token
    if (!userId || !token) throw new Error(`setup auth échoué: ${JSON.stringify(su).slice(0, 200)}`)
    await setProfile(userId, RESTRICTIONS)
    info(`compte test: ${userId}  ${D}(restriction: Parfum)${X}`)

    for (const c of CASES) {
      console.log(`\n${B}▸ ${c.label}${X}`)

      // Signaux : soit via la ligne catalogue de l'EAN, soit fournis directement.
      let catalogCategory = c.catalogCategory ?? null
      let productName = c.productName ?? null
      if (c.ean) {
        const row = (await rpc('cosme_check_get_product_by_ean', { p_ean: c.ean }, token))?.[0] ?? null
        catalogCategory = row?.category ?? null
        productName = row?.name ?? null
        info(`catégorie catalogue = ${JSON.stringify(catalogCategory)} | nom = « ${productName ?? ''} »`)
      }

      const q = resolveAlternativesQuery({ catalogCategory, productType: c.productType, productName })

      if (c.expectAbstain) {
        expect(q === null, 'ABSTENTION (aucune requête → carrousel masqué, jamais de hors-sujet)',
          q ? `résolu à ${q.kind}:${q.value}` : 'null')
        continue
      }

      if (!q) { expect(false, 'une requête catégorie est résolue', 'null (abstention inattendue)'); continue }
      info(`résolu → ${q.source} / ${q.kind}:${q.value}`)

      const bucket = bucketOf(q)
      expect(bucket === c.expectBucket, `pivot sur la BONNE famille`, `${bucket} vs attendu ${c.expectBucket}`)
      // Ne JAMAIS pivoter sur le bucket poubelle « gel ».
      expect(q.value !== 'gel' && bucket !== 'gel', 'ne pivote pas sur le bucket poubelle « gel »')

      const raw = await fetchAlternatives(q, token)
      const filtered = filterAlternatives(raw, EXCLUSION) as AltProduct[]
      const cats = [...new Set(raw.map((p) => lastSeg(p.category)))]
      info(`candidats: ${raw.length} → après filtre restriction: ${filtered.length} | sous-cats: ${cats.slice(0, 6).join(', ')}`)

      expect(filtered.length > 0, 'au moins une alternative pertinente', `${filtered.length}`)

      // Cohérence : tout candidat est dans le préfixe/famille résolu.
      const prefix = q.kind === 'prefix' ? q.value.replace(/\/%$/, '') : q.value
      const outliers = raw.filter((p) => {
        const cat = p.category ?? ''
        return q.kind === 'prefix' ? !cat.startsWith(prefix) : cat !== prefix
      })
      expect(outliers.length === 0, 'toutes les alternatives sont dans la famille résolue',
        outliers.length ? `${outliers.length} hors-famille: ${outliers.slice(0, 3).map((o) => o.category).join(' | ')}` : '')

      // Régression : les produits hors-sujet du bug sont absents.
      if (c.forbidEans?.length) {
        const leaked = raw.filter((p) => c.forbidEans!.includes(p.ean))
        expect(leaked.length === 0, 'aucun des produits hors-sujet du bug ne réapparaît',
          leaked.length ? leaked.map((l) => `${l.brand} ${l.name}`).join(' | ') : '')
      }

      // Filtre restrictions effectif : aucune alternative finale ne contient « parfum » en token.
      const withParfum = filtered.filter((p) =>
        (p.ingredientsText ?? '').split(/[,;]/).some((t) => t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === 'parfum'),
      )
      expect(withParfum.length === 0, 'le filtre restriction retire bien les produits contenant « Parfum »',
        `${raw.length - filtered.length} produit(s) retiré(s)`)
    }

    console.log(`\n${B}${failures === 0 ? G + 'TOUS LES TESTS PASSENT' : R + failures + ' échec(s)'}${X}\n`)
    process.exitCode = failures === 0 ? 0 : 1
  } catch (err) {
    ko(`Fatal: ${(err as Error).message}`)
    process.exitCode = 1
  } finally {
    if (userId) { await deleteUser(userId); info('compte test supprimé') }
  }
})()
