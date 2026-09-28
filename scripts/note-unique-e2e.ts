/**
 * E2E « note unique + alternatives + analyse par zone » (28 sept 2026), contre
 * la PROD, avec un VRAI compte éphémère.
 *
 *   1. NOTE UNIQUE : pour de vrais produits (dont « pielsana gel de ducha »,
 *      EAN 11831525, le cas de la bêta), la note est IDENTIQUE partout :
 *      catalogue, fiche par EAN, recherche, cache EAN (chemin rapide des
 *      alternatives), note servie par l'edge `analyser`, ligne d'historique.
 *   2. SANS CODE-BARRES : une analyse photo/saisie garde SA note (moteur sur
 *      ses ingrédients), jamais celle d'un autre produit trouvé par le nom.
 *   3. PÉPITES : note réelle, égale au catalogue (plus d'arrondi).
 *   4. ALTERNATIVES : même type de formule que le produit analysé, aucun type
 *      opposé, et note de la carte == note de la fiche.
 *   5. ZONE : crème capillaire + profil visage gras/acnéique/sensible → aucune
 *      pénalité « peau » dans la compatibilité.
 *
 * Usage (Node 24, type-stripping) :
 *   node scripts/note-unique-e2e.ts            → crée le compte, teste, SUPPRIME le compte
 *   node scripts/note-unique-e2e.ts --keep     → garde le compte (captures) et écrit
 *                                                ses identifiants dans --creds <fichier>
 *   node scripts/note-unique-e2e.ts --cleanup <userId>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { applyColorCap } from '../lib/analysis/scoreCap.ts'
import { classifyFormulation, formulationAffinity } from '../lib/inci/formulation.ts'
import { parseInciList } from '../supabase/functions/analyser/parse.ts'
import { buildAnalysisCore, type MatchRow } from '../supabase/functions/analyser/core.ts'

const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !ANON || !SERVICE) throw new Error('.env incomplet')

const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m'
let failures = 0
const ok = (m: string) => console.log(`  ${G}OK${X} ${m}`)
const ko = (m: string) => { console.log(`  ${R}KO${X} ${m}`); failures++ }
const info = (m: string) => console.log(`  ${C}.${X} ${m}`)
const head = (m: string) => console.log(`\n${B}> ${m}${X}`)
const expect = (cond: boolean, label: string, note = '') => (cond ? ok(label + (note ? ` ${D}(${note})${X}` : '')) : ko(label + (note ? ` : ${note}` : '')))

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', 'Accept-Profile': 'cosme_check', 'Content-Profile': 'cosme_check' }
const userH = (t: string) => ({ apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })
const stars = (s: number | null) => (s == null ? 0 : s >= 17 ? 5 : s >= 13 ? 4 : s >= 9 ? 3 : s >= 5 ? 2 : 1)
const same = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(a - b) < 0.006

async function rpc<T>(name: string, args: unknown, token?: string): Promise<T> {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: token ? userH(token) : { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  if (!r.ok) throw new Error(`${name} ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json() as Promise<T>
}
async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...svc, ...(init.headers ?? {}) } })
  if (!r.ok) throw new Error(`${path} ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const t = await r.text()
  return (t ? JSON.parse(t) : null) as T
}
async function edge<T>(fn: string, body: unknown, token: string): Promise<{ status: number; data: T }> {
  const r = await fetch(`${URL_}/functions/v1/${fn}`, { method: 'POST', headers: userH(token), body: JSON.stringify(body) })
  return { status: r.status, data: (await r.json().catch(() => null)) as T }
}

// ── Compte ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const KEEP = args.includes('--keep')
const CREDS = args.includes('--creds') ? args[args.indexOf('--creds') + 1] : null

async function deleteUser(id: string) {
  await fetch(`${URL_}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
}
if (args.includes('--cleanup')) {
  const id = args[args.indexOf('--cleanup') + 1]
  await deleteUser(id)
  console.log(`compte ${id} supprimé`)
  process.exit(0)
}

const stamp = Date.now().toString(36)
const EMAIL = `e2e-note-unique-${stamp}@cosme-check.com`
const PASSWORD = `E2e!${stamp}${Math.random().toString(36).slice(2, 8)}`

async function createAccount(): Promise<{ id: string; token: string }> {
  const r = await fetch(`${URL_}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }) })
  const u = (await r.json()) as { id?: string }
  if (!u.id) throw new Error(`création compte: ${JSON.stringify(u).slice(0, 200)}`)
  const s = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const tok = (await s.json()) as { access_token?: string }
  if (!tok.access_token) throw new Error('connexion impossible')
  // Profil réaliste : visage gras, acnéique, sensible ; cheveux secs ; restrictions.
  await rest(`user_profiles?id=eq.${u.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      first_name: 'Stela',
      preferences: {
        onboardingShown: true,
        skin: { skinTypeFace: 'grasse', skinTypeBody: 'seche', concerns: ['acne', 'sensible'], hairConcerns: ['secs'], goals: ['peau_douce', 'cheveux_brillants'] },
        restrictions: { ingredients: [{ slug: 'methylisothiazolinone', name: 'METHYLISOTHIAZOLINONE' }], families: [] },
      },
    }),
  })
  await rest('credit_grants', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: u.id, amount: 100, remaining: 100, note: 'e2e note unique', created_by: 'note-unique-e2e', grant_type: 'admin' }) })
  return { id: u.id, token: tok.access_token }
}

// ── Moteur local (même code que l'edge, sans LLM) ───────────────────────────
async function engineScore(inci: string): Promise<number> {
  const tokens = parseInciList(inci)
  const rows = await rpc<MatchRow[]>('cosme_check_match_inci_batch', { p_tokens: tokens.map((t) => t.normalized) })
  return buildAnalysisCore({ tokens, rows }).score
}

type Cat = { ean: string; brand: string | null; name: string | null; score: number | null; category: string | null; ingredients_text: string | null; count_orange: number | null; count_rouge: number | null }
const catRow = async (ean: string) => (await rest<Cat[]>(`catalog?ean=eq.${ean}&select=ean,brand,name,score,category,ingredients_text,count_orange,count_rouge`))[0]

let userId: string | null = null
try {
  console.log(`${B}=== E2E note unique / alternatives / zone ===${X}`)
  const acc = await createAccount()
  userId = acc.id
  const token = acc.token
  info(`compte éphémère ${EMAIL} (${userId})`)

  // ── 1. Note unique ────────────────────────────────────────────────────────
  head('1. Une seule note par produit, sur toutes les surfaces')
  const sampleCats = ['hygiene-du-corps/produit-de-bain/gel-douche', 'soin-du-corps-et-visage/creme-hydratante/creme-visage', 'coiffure/shampooing/shampooing-classique', 'soin-du-corps-et-visage/nettoyant-visage/gel-nettoyant-visage']
  const eans = ['11831525']
  for (const c of sampleCats) {
    const page = await rpc<{ ean: string }[]>('cosme_check_alternatives_by_category_exact', { p_category: c, p_limit: 40, p_offset: 0 }, token)
    for (const p of page.filter((_, i) => i % 13 === 0).slice(0, 3)) eans.push(p.ean)
  }
  for (const ean of eans) {
    const before = await catRow(ean)
    if (!before?.ingredients_text) { info(`${ean} : pas d'INCI, ignoré`); continue }
    const an = await edge<{ score?: number; analysisId?: string; error?: string }>('analyser', { text: before.ingredients_text, productEan: ean, productLabel: before.name, brand: before.brand, withSynthesis: false }, token)
    const after = await catRow(ean)
    const byEan = (await rpc<{ score: number; count_orange: number; count_rouge: number }[]>('cosme_check_get_product_by_ean', { p_ean: ean }, token))[0]
    const pa = await rpc<{ score?: number } | null>('cosme_check_get_product_analysis', { p_ean: ean }, token)
    const hist = an.data?.analysisId ? (await rest<{ score: number; result_json: { score: number } }[]>(`analyses?id=eq.${an.data.analysisId}&select=score,result_json->score`))[0] : null
    const q = [before.brand, before.name].filter(Boolean).join(' ').slice(0, 60)
    const found = (await rpc<{ ean: string; score: number; count_orange: number; count_rouge: number }[]>('cosme_check_search_catalog', { p_query: q, p_limit: 50, p_offset: 0 }, token)).find((r) => r.ean === ean)
    const listShown = found ? applyColorCap(found.score, found.count_orange, found.count_rouge) : null
    const ficheShown = byEan ? applyColorCap(byEan.score, byEan.count_orange, byEan.count_rouge) : null
    const served = an.data?.score ?? null
    const values = { analyser: served, catalogue: after.score, fiche: ficheShown, recherche: listShown, cacheEAN: pa?.score ?? null, historique: hist ? Number(hist.score) : null }
    const allSame = Object.values(values).every((v) => v == null || same(v, served))
    const label = `${(before.name ?? '').slice(0, 38)} (${ean})`
    const moved = !same(before.score, after.score) ? ` ; catalogue réaligné au scan ${before.score} -> ${after.score}` : ''
    expect(an.status === 200 && allSame && stars(served) === stars(after.score), label, `${JSON.stringify(values)}${moved}`)
    if (ean === '11831525') expect(same(served, 7.44) && stars(served) === 2, 'pielsana : 7,44 « Faible », 2 étoiles partout')
  }

  // ── 2. Sans code-barres ───────────────────────────────────────────────────
  head('2. Analyse sans code-barres : sa propre note, jamais celle d’un autre produit')
  const fa = (await rest<Cat[]>(`catalog?select=ean,brand,name,score,category,ingredients_text,count_orange,count_rouge&name=ilike.*deodorant*&brand=ilike.Fa&is_active=eq.true&limit=1`))[0]
  if (fa?.ingredients_text) {
    const local = await engineScore(fa.ingredients_text)
    const an = await edge<{ score?: number; analysisId?: string }>('analyser', { text: fa.ingredients_text, productLabel: 'Déodorant Fa', withSynthesis: false }, token)
    const nameMatch = (await rpc<{ ean: string; score: number }[]>('cosme_check_search_catalog', { p_query: 'Déodorant Fa', p_limit: 1, p_offset: 0 }, token))[0]
    // Le live corrige les fautes de frappe par IA (pas le moteur local) : on
    // exige les mêmes étoiles et un écart minime, et surtout PAS la note du
    // produit trouvé par le nom.
    const served = an.data?.score ?? null
    expect(
      served != null && stars(served) === stars(local) && Math.abs(served - local) < 0.5,
      'note servie = moteur sur les ingrédients saisis',
      `servie ${served}, moteur local ${local}, 1er résultat par nom (ignoré par la fiche) ${nameMatch?.score}`,
    )
  } else info('aucun déodorant Fa au catalogue, test ignoré')

  // ── 3. Pépites ────────────────────────────────────────────────────────────
  head('3. Pépites : note réelle, égale au catalogue')
  const needs = (await rest<{ need: string }[]>('weekly_picks_pool?select=need&limit=200')).map((r) => r.need)
  const picks = await rpc<{ ean: string; score: number }[]>('cosme_check_weekly_picks_candidates', { p_needs: [...new Set(needs)], p_per_need: 40 }, token)
  const cats = await rest<{ ean: string; score: number }[]>(`catalog?select=ean,score&ean=in.(${picks.map((p) => `"${p.ean}"`).join(',')})`)
  const byE = new Map(cats.map((c) => [c.ean, c.score]))
  const mism = picks.filter((p) => !same(p.score, byE.get(p.ean)))
  const nonInt = picks.filter((p) => Math.abs(p.score - Math.round(p.score)) > 0.001).length
  expect(picks.length > 0 && mism.length === 0, `${picks.length} pépites, note == catalogue`, `${mism.length} écarts, ${nonInt} notes non entières`)

  // ── 4. Alternatives : même forme, note carte == fiche ─────────────────────
  head('4. Alternatives : même type de formule, note de la carte == note de la fiche')
  const cream = (await rest<Cat[]>(`catalog?select=ean,brand,name,score,category,ingredients_text,count_orange,count_rouge&category=eq.soin-du-corps-et-visage/creme-hydratante/creme-visage&ingredients_text=ilike.AQUA*&is_active=eq.true&limit=1`))[0]
  if (cream?.ingredients_text) {
    const src = classifyFormulation(cream.ingredients_text)
    const page = await rpc<{ ean: string; score: number; count_orange: number; count_rouge: number; ingredients_text: string }[]>('cosme_check_alternatives_by_category_exact', { p_category: cream.category, p_limit: 40, p_offset: 0 }, token)
    const kept = page.filter((p) => formulationAffinity(src, classifyFormulation(p.ingredients_text)) !== 'opposite')
    const opposite = page.length - kept.length
    info(`source « ${cream.name?.slice(0, 40)} » : ${src.galenic} ; ${page.length} candidats, ${opposite} écartés (forme opposée)`)
    let diff = 0
    for (const p of kept.slice(0, 5)) {
      const card = applyColorCap(p.score, p.count_orange, p.count_rouge)
      const fiche = (await rpc<{ score: number; count_orange: number; count_rouge: number }[]>('cosme_check_get_product_by_ean', { p_ean: p.ean }, token))[0]
      const pa = await rpc<{ score?: number } | null>('cosme_check_get_product_analysis', { p_ean: p.ean }, token)
      if (!same(card, applyColorCap(fiche.score, fiche.count_orange, fiche.count_rouge)) || !same(card, pa?.score)) diff++
    }
    expect(kept.every((p) => formulationAffinity(src, classifyFormulation(p.ingredients_text)) !== 'opposite'), 'aucune alternative de forme opposée')
    expect(diff === 0, '5 premières alternatives : carte == fiche == cache EAN', `${diff} écarts`)
  }

  // ── 5. Zone : crème capillaire ────────────────────────────────────────────
  head('5. Crème capillaire : aucune règle « peau » appliquée')
  const hair = (await rest<Cat[]>(`catalog?select=ean,brand,name,score,category,ingredients_text,count_orange,count_rouge&category=like.coiffure/soin-capillaire/*&ingredients_text=ilike.*cocos nucifera*&is_active=eq.true&limit=1`))[0]
  if (hair?.ingredients_text) {
    const an = await edge<{ analysisId?: string }>('analyser', { text: hair.ingredients_text, productEan: hair.ean, productLabel: hair.name, brand: hair.brand, withSynthesis: false }, token)
    const pi = await edge<{ compatibility?: { score?: number; lines?: { text?: string; label?: string }[] }; personalContext?: { axis?: string } }>('personal-insights', { analysisId: an.data?.analysisId, compat: true }, token)
    const txt = JSON.stringify(pi.data ?? {}).toLowerCase()
    const skinWords = ['peau grasse', 'acné', 'acne', 'comédogène', 'comedogene', 'pores']
    const leak = skinWords.filter((w) => txt.includes(w))
    info(`« ${hair.name?.slice(0, 50)} » : statut ${pi.status}, compatibilité ${pi.data?.compatibility?.score ?? '?'}`)
    expect(pi.status === 200 && leak.length === 0, 'aucune pénalité peau sur un soin capillaire', leak.length ? `mots trouvés : ${leak.join(', ')}` : '')
  }

  console.log(`\n${failures === 0 ? G + 'TOUT EST VERT' : R + failures + ' ÉCHEC(S)'}${X}`)
  if (KEEP && CREDS) {
    writeFileSync(CREDS, JSON.stringify({ email: EMAIL, password: PASSWORD, userId }, null, 1))
    info(`compte GARDÉ pour les captures, identifiants écrits dans ${CREDS}`)
  }
} finally {
  if (userId && !KEEP) { await deleteUser(userId); info('compte supprimé') }
}
process.exit(failures === 0 ? 0 : 1)
