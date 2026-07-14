/**
 * REPEUPLEMENT de `cosme_check.product_analyses` (breakdown pré-calculé par EAN).
 *
 * Pourquoi : pour un produit du catalogue, l'analyse doit être une LECTURE
 * (instantanée) — pas un recalcul. L'edge `analyser` court-circuite déjà sur
 * cette table ; ce script la remplit pour tout le catalogue.
 *
 * GARANTIE "MÊME SYSTÈME" : ce script importe le MÊME code que l'edge live —
 * `parse.ts` (tokenisation INCI) et `core.ts` (enrichissement, dédup, comptes,
 * observations, seuils, allergènes UE, spectre, items, score propriétaire) —
 * et appelle la MÊME RPC de match (`cosme_check_match_inci_batch`). Les lignes
 * produites sont strictement identiques à ce que l'edge écrirait au premier
 * scan (validé par `--validate`).
 *
 * Différence assumée vs live : PAS de correction typo LLM (les tokens
 * `suggestion` restent non reconnus). Sur un INCI catalogue propre c'est
 * marginal, et un scan live ultérieur ré-écrit la ligne avec la version LLM.
 *
 * Usage :
 *   npx tsx scripts/backfill_product_analyses.ts --validate 3662361001927,...
 *   npx tsx scripts/backfill_product_analyses.ts --seen            # EANs déjà analysés
 *   npx tsx scripts/backfill_product_analyses.ts --limit 2000      # tranche
 *   npx tsx scripts/backfill_product_analyses.ts                   # tout (resumable)
 *
 * Doux avec la base : lots de PAGE_SIZE produits, CONCURRENCY appels match en
 * parallèle max, pause PAUSE_MS entre lots, reprise via curseur EAN persisté
 * (scripts/.backfill_checkpoint.json) + anti-jointure sur les lignes déjà
 * présentes. Arrêt propre par Ctrl+C (le checkpoint est déjà écrit).
 */
import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parseInciList } from '../supabase/functions/analyser/parse.ts'
import { buildAnalysisCore, type MatchRow } from '../supabase/functions/analyser/core.ts'
import { scoreLabel } from '../supabase/functions/analyser/score.ts'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env')
  process.exit(1)
}

const PAGE_SIZE = 400 // produits par lot (fetch catalogue + upsert bulk)
const CONCURRENCY = 8 // constructions de produits simultanées max
const PAUSE_MS = 250 // pause entre lots (douceur DB)
const MIN_TOKENS = 5 // en-dessous : liste trop courte pour un breakdown fiable
const CHECKPOINT = 'scripts/.backfill_checkpoint.json'
const ALGO_VERSION = 'v1.2'

type CatalogRow = {
  ean: string
  ingredients_text: string | null
  score: number | null
  category: string | null
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status}: ${body.slice(0, 300)}`)
  }
  const txt = await res.text()
  return (txt ? JSON.parse(txt) : null) as T
}

/** Page de catalogue actifs avec INCI, curseur keyset sur ean. */
async function fetchCatalogPage(afterEan: string, limit: number): Promise<CatalogRow[]> {
  const params = new URLSearchParams({
    select: 'ean,ingredients_text,score,category',
    is_active: 'eq.true',
    order: 'ean.asc',
    limit: String(limit),
  })
  params.append('ingredients_text', 'not.is.null')
  if (afterEan) params.append('ean', `gt.${afterEan}`)
  return rest<CatalogRow[]>(`/rest/v1/catalog?${params}`, {
    headers: headers({ 'Accept-Profile': 'cosme_check' }),
  })
}

/** EANs déjà présents dans product_analyses parmi ceux fournis. */
async function existingAnalyses(eans: string[]): Promise<Set<string>> {
  if (eans.length === 0) return new Set()
  const list = eans.map((e) => `"${e}"`).join(',')
  const rows = await rest<{ ean: string }[]>(
    `/rest/v1/product_analyses?select=ean&ean=in.(${encodeURIComponent(list).replace(/%22/g, '"')})`,
    { headers: headers({ 'Accept-Profile': 'cosme_check' }) },
  )
  return new Set(rows.map((r) => r.ean))
}

/** Même RPC de match que l'edge live (1 retry sur erreur transitoire). */
async function matchTokensRpc(normalized: string[]): Promise<MatchRow[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rest<MatchRow[]>(`/rest/v1/rpc/cosme_check_match_inci_batch`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ p_tokens: normalized }),
      })
    } catch (e) {
      if (attempt >= 1) throw e
      await sleep(1500)
    }
  }
}

/**
 * CACHE TOKEN → résultat de match. Le match est PAR TOKEN indépendant (le RPC
 * renvoie une ligne par token, position_idx = index d'entrée) : un même token
 * donne toujours le même match. Le vocabulaire INCI étant fini (~16k
 * ingrédients + alias), après quelques milliers de produits le taux de hit
 * dépasse 95 % → on divise les appels DB par ~20 (plus doux ET plus rapide).
 */
const tokenCache = new Map<string, Omit<MatchRow, 'input_token' | 'position_idx'>>()

async function matchTokensCached(normalized: string[]): Promise<MatchRow[]> {
  const unknown = [...new Set(normalized.filter((t) => !tokenCache.has(t)))]
  // Résout les tokens inconnus par paquets (même RPC que le live).
  for (let i = 0; i < unknown.length; i += 200) {
    const chunk = unknown.slice(i, i + 200)
    const rows = await matchTokensRpc(chunk)
    for (const r of rows) {
      const { input_token: _i, position_idx: _p, ...rest } = r
      tokenCache.set(r.input_token, rest)
    }
    // Filet : un token sans ligne retournée (ne devrait pas arriver) → non-match.
    for (const t of chunk) {
      if (!tokenCache.has(t)) {
        tokenCache.set(t, {
          inci_id: null, slug: null, name: null, color_rating: null,
          cas_number: null, translation_fr: null, primary_function: null,
          all_functions: null, tags: null, match_kind: null, confidence: 0,
        })
      }
    }
  }
  return normalized.map((t, i) => ({ ...tokenCache.get(t)!, input_token: t, position_idx: i }))
}

/** Construit la ligne product_analyses pour un produit catalogue (mirror edge). */
async function buildRow(row: CatalogRow): Promise<Record<string, unknown> | null> {
  const inci = (row.ingredients_text ?? '').trim()
  if (!inci) return null
  const tokens = parseInciList(inci.slice(0, 8000))
  if (tokens.length < MIN_TOKENS) return null

  const rows = await matchTokensCached(tokens.map((t) => t.normalized))
  const core = buildAnalysisCore({ tokens, rows })

  // RÈGLE QUALITÉ : on ne pré-calcule QUE les produits dont le passage
  // déterministe ne laisse AUCUN token en "suggestion". Pour eux, la ligne est
  // strictement identique à ce que l'edge live écrirait (validé). Les produits
  // avec suggestions sont laissés au premier scan live, qui applique en plus la
  // correction typo LLM → ligne de qualité maximale, auto-semée (fix 3a).
  if (core.suggestions.length > 0) return null

  // Mirror du handler : le score CATALOGUE écrase le score recalculé quand présent.
  let score = core.score
  let scoreLabelText = core.scoreLabelText
  let scoreTone: string = core.scoreTone
  if (typeof row.score === 'number') {
    score = row.score
    const lab = scoreLabel(score)
    scoreLabelText = lab.label
    scoreTone = lab.tone
  }

  // Mirror EXACT du responsePayload de l'edge (synthèse per-user → null,
  // productType hint client → null, catégorie = catalogue).
  const resultJson = {
    counts: core.countsPayload,
    score,
    scoreLabel: scoreLabelText,
    scoreTone,
    items: core.items,
    observations: core.observations,
    aliasesUsed: core.aliasesUsed,
    suggestions: core.suggestions,
    spectrum: core.spectrum,
    euFragranceAllergens: core.euFragranceAllergens,
    synthesis: null,
    productType: null,
    category: row.category ?? null,
  }

  const now = new Date().toISOString()
  return {
    ean: row.ean,
    result_json: resultJson,
    score: Number(score.toFixed(4)),
    score_label: scoreLabelText,
    score_tone: scoreTone,
    algo_version: ALGO_VERSION,
    computed_at: now,
    updated_at: now,
  }
}

/** Upsert bulk PostgREST (on_conflict=ean). */
async function upsertRows(rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return
  await rest(`/rest/v1/product_analyses?on_conflict=ean`, {
    method: 'POST',
    headers: headers({
      'Content-Profile': 'cosme_check',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(rows),
  })
}

/** Concurrence bornée. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    for (;;) {
      const idx = i++
      if (idx >= items.length) return
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

function readCheckpoint(): string {
  try {
    if (existsSync(CHECKPOINT)) {
      return (JSON.parse(readFileSync(CHECKPOINT, 'utf8')) as { lastEan?: string }).lastEan ?? ''
    }
  } catch { /* repart de zéro */ }
  return ''
}
function writeCheckpoint(lastEan: string, done: number) {
  writeFileSync(CHECKPOINT, JSON.stringify({ lastEan, done, at: new Date().toISOString() }))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Modes ───────────────────────────────────────────────────────────────────

/** --validate ean1,ean2 : compare la ligne script vs la ligne écrite par le LIVE. */
async function validate(eans: string[]) {
  let ok = 0
  for (const ean of eans) {
    const cat = await rest<CatalogRow[]>(
      `/rest/v1/catalog?select=ean,ingredients_text,score,category&ean=eq.${ean}`,
      { headers: headers({ 'Accept-Profile': 'cosme_check' }) },
    )
    if (!cat.length) { console.log(`  ${ean}: ABSENT du catalogue`); continue }
    const mine = await buildRow(cat[0])
    if (!mine) { console.log(`  ${ean}: INCI trop court, skip`); continue }
    const live = await rest<{ result_json: Record<string, unknown> }[]>(
      `/rest/v1/product_analyses?select=result_json&ean=eq.${ean}`,
      { headers: headers({ 'Accept-Profile': 'cosme_check' }) },
    )
    if (!live.length) { console.log(`  ${ean}: pas de ligne LIVE à comparer (scanne-le d'abord)`); continue }
    const a = JSON.stringify(mine.result_json, Object.keys(mine.result_json as object).sort())
    const liveJson = live[0].result_json
    const b = JSON.stringify(liveJson, Object.keys(liveJson).sort())
    const same = a === b
    if (!same) {
      const m = mine.result_json as Record<string, unknown>
      const diffKeys = [...new Set([...Object.keys(m), ...Object.keys(liveJson)])]
        .filter((k) => JSON.stringify(m[k]) !== JSON.stringify(liveJson[k]))
      console.log(`  ${ean}: DIFF sur [${diffKeys.join(', ')}]`)
    } else {
      ok++
      console.log(`  ${ean}: IDENTIQUE au live ✓`)
    }
  }
  console.log(`Validation : ${ok}/${eans.length} identiques`)
}

/** --seen : uniquement les EANs déjà rencontrés dans l'historique analyses. */
async function seenEans(): Promise<string[]> {
  const rows = await rest<{ ean: string }[]>(
    `/rest/v1/analyses?select=ean&ean=not.is.null`,
    { headers: headers({ 'Accept-Profile': 'cosme_check' }) },
  )
  return [...new Set(rows.map((r) => r.ean))]
}

async function processBatch(rows: CatalogRow[]): Promise<{ written: number; skipped: number }> {
  const existing = await existingAnalyses(rows.map((r) => r.ean))
  const todo = rows.filter((r) => !existing.has(r.ean))
  const built = await mapLimit(todo, CONCURRENCY, async (r) => {
    try { return await buildRow(r) } catch (e) {
      console.warn(`  ! ${r.ean}: ${(e as Error).message.slice(0, 120)}`)
      return null
    }
  })
  const payload = built.filter((b): b is Record<string, unknown> => b !== null)
  await upsertRows(payload)
  return { written: payload.length, skipped: rows.length - payload.length }
}

async function main() {
  const args = process.argv.slice(2)
  const has = (f: string) => args.includes(f)
  const val = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }

  if (has('--validate')) {
    await validate((val('--validate') ?? '').split(',').map((s) => s.trim()).filter(Boolean))
    return
  }

  let limit = Number(val('--limit') ?? Infinity)
  const t0 = Date.now()
  let done = 0, written = 0, skipped = 0

  if (has('--seen')) {
    const eans = await seenEans()
    console.log(`Mode --seen : ${eans.length} EANs de l'historique`)
    for (let i = 0; i < eans.length; i += PAGE_SIZE) {
      const chunk = eans.slice(i, i + PAGE_SIZE)
      const list = chunk.map((e) => `"${e}"`).join(',')
      const rows = await rest<CatalogRow[]>(
        `/rest/v1/catalog?select=ean,ingredients_text,score,category&is_active=eq.true&ean=in.(${encodeURIComponent(list).replace(/%22/g, '"')})`,
        { headers: headers({ 'Accept-Profile': 'cosme_check' }) },
      )
      const r = await processBatch(rows)
      written += r.written; skipped += r.skipped; done += chunk.length
      await sleep(PAUSE_MS)
    }
    console.log(`--seen terminé : ${written} écrits, ${skipped} sautés (déjà présents / INCI court)`)
    return
  }

  // Sweep complet resumable (curseur EAN).
  let cursor = has('--restart') ? '' : readCheckpoint()
  console.log(`Sweep catalogue (curseur='${cursor || 'début'}', limite=${limit === Infinity ? '∞' : limit})`)
  for (;;) {
    if (done >= limit) break
    const page = await fetchCatalogPage(cursor, Math.min(PAGE_SIZE, limit - done))
    if (page.length === 0) { console.log('Fin du catalogue atteinte.'); break }
    const r = await processBatch(page)
    written += r.written; skipped += r.skipped; done += page.length
    cursor = page[page.length - 1].ean
    writeCheckpoint(cursor, done)
    const rate = done / ((Date.now() - t0) / 1000)
    console.log(`  ${done} vus | ${written} écrits | ${skipped} sautés | ${rate.toFixed(1)}/s | curseur=${cursor}`)
    await sleep(PAUSE_MS)
  }
  console.log(`Terminé : ${done} produits vus, ${written} écrits, ${skipped} sautés en ${(((Date.now() - t0) / 1000) / 60).toFixed(1)} min`)
}

main().catch((e) => { console.error(e); process.exit(1) })
