/**
 * Recalcul CIBLÉ des scores catalogue pour les produits « affected »
 * (faux vert : un pénalisant orange/rouge est présent dans l'INCI mais n'a pas
 * été compté → score trop beau).
 *
 * MOTEUR : le VRAI code de l'app — parse.ts (parseInciList) + core.ts
 * (buildAnalysisCore = pastille V2, IDENTIQUE à Cosme-Scraper/derive_product_pastille.py)
 * + score.ts (scoreLabel). AUCUNE ré-implémentation.
 *
 * DONNÉES : Supabase ACTUEL (match via la RPC live cosme_check_match_inci_batch),
 * surtout PAS la copie locale périmée du scraper (qui est la SOURCE du bug).
 *
 * SORTIE : écrit UNIQUEMENT dans cosme_check._catalog_rescore (staging, sans
 * trigger). N'écrit RIEN dans catalog. L'application se fait ensuite par un
 * UPDATE ... FROM staging ciblé + batché (revu avant exécution).
 *
 * Cible : les EAN présents dans cosme_check.catalog_affected.
 *
 * Usage : npx tsx scripts/rescore-affected-catalog.ts
 */
import 'dotenv/config'
import { parseInciList } from '../supabase/functions/analyser/parse.ts'
import { buildAnalysisCore, type MatchRow } from '../supabase/functions/analyser/core.ts'
import { scoreLabel } from '../supabase/functions/analyser/score.ts'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env')
  process.exit(1)
}

const CHUNK = 120          // EAN par lot (fetch catalog + upsert staging)
const MATCH_CHUNK = 200    // tokens inconnus par appel RPC
const PAUSE_MS = 120       // douceur entre lots

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

const cc = (extra: Record<string, string> = {}) => headers({ 'Accept-Profile': 'cosme_check', ...extra })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Match RPC avec cache token (identique au backfill) ─────────────────────
const tokenCache = new Map<string, Omit<MatchRow, 'input_token' | 'position_idx'>>()

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

async function matchTokensCached(normalized: string[]): Promise<MatchRow[]> {
  const unknown = [...new Set(normalized.filter((t) => !tokenCache.has(t)))]
  for (let i = 0; i < unknown.length; i += MATCH_CHUNK) {
    const chunk = unknown.slice(i, i + MATCH_CHUNK)
    const rows = await matchTokensRpc(chunk)
    for (const r of rows) {
      const { input_token: _i, position_idx: _p, ...rest } = r
      tokenCache.set(r.input_token, rest)
    }
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

type CatalogRow = {
  ean: string
  ingredients_text: string | null
  score: number | null
  count_orange: number | null
  count_rouge: number | null
}

type StagingRow = {
  ean: string
  old_score: number | null
  old_orange: number | null
  old_rouge: number | null
  new_score: number | null
  new_tone: string | null
  new_label: string | null
  new_orange: number
  new_rouge: number
  n_ident: number
  n_total: number
}

/** Recalcule via le moteur RÉEL (parse + match live + pastille V2). */
async function computeForRow(row: CatalogRow): Promise<StagingRow | null> {
  const inci = (row.ingredients_text ?? '').trim()
  if (!inci) return null
  const tokens = parseInciList(inci.slice(0, 8000))
  if (tokens.length === 0) return null

  const rows = await matchTokensCached(tokens.map((t) => t.normalized))
  const core = buildAnalysisCore({ tokens, rows })
  const { label, tone } = scoreLabel(core.score)

  return {
    ean: row.ean,
    old_score: row.score,
    old_orange: row.count_orange,
    old_rouge: row.count_rouge,
    new_score: Number(core.score.toFixed(2)),
    new_tone: tone,
    new_label: label,
    new_orange: core.countsPayload.orange,
    new_rouge: core.countsPayload.rouge,
    n_ident: core.countsPayload.matched,
    n_total: core.countsPayload.total,
  }
}

async function fetchAffectedEans(): Promise<string[]> {
  const out: string[] = []
  let offset = 0
  const page = 1000
  for (;;) {
    const rows = await rest<{ ean: string }[]>(
      `/rest/v1/catalog_affected?select=ean&order=ean.asc&limit=${page}&offset=${offset}`,
      { headers: cc() },
    )
    out.push(...rows.map((r) => r.ean))
    if (rows.length < page) break
    offset += page
  }
  return out
}

async function fetchCatalogChunk(eans: string[]): Promise<CatalogRow[]> {
  const list = eans.map((e) => `"${e}"`).join(',')
  return rest<CatalogRow[]>(
    `/rest/v1/catalog?select=ean,ingredients_text,score,count_orange,count_rouge&ean=in.(${encodeURIComponent(list).replace(/%22/g, '"')})`,
    { headers: cc() },
  )
}

async function upsertStaging(rows: StagingRow[]): Promise<void> {
  if (rows.length === 0) return
  await rest(`/rest/v1/_catalog_rescore?on_conflict=ean`, {
    method: 'POST',
    headers: cc({ 'Content-Profile': 'cosme_check', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  })
}

async function main() {
  const t0 = Date.now()
  console.log('Lecture des EAN affected…')
  const eans = await fetchAffectedEans()
  console.log(`${eans.length} produits à recalculer.`)

  let done = 0
  let lowered = 0
  let unchanged = 0
  let raised = 0
  const toneDist: Record<string, number> = {}

  for (let i = 0; i < eans.length; i += CHUNK) {
    const chunk = eans.slice(i, i + CHUNK)
    const catRows = await fetchCatalogChunk(chunk)
    const staging: StagingRow[] = []
    for (const row of catRows) {
      try {
        const s = await computeForRow(row)
        if (!s) continue
        staging.push(s)
        toneDist[s.new_tone ?? 'null'] = (toneDist[s.new_tone ?? 'null'] ?? 0) + 1
        if (s.old_score != null && s.new_score != null) {
          if (s.new_score < s.old_score - 0.01) lowered++
          else if (s.new_score > s.old_score + 0.01) raised++
          else unchanged++
        }
      } catch (e) {
        console.warn(`  ! ${row.ean}: ${(e as Error).message.slice(0, 120)}`)
      }
    }
    await upsertStaging(staging)
    done += chunk.length
    if (done % 1200 < CHUNK) {
      const rate = done / Math.max((Date.now() - t0) / 1000, 0.01)
      console.log(`  ${done}/${eans.length}  (${rate.toFixed(0)}/s)  baissés=${lowered} inchangés=${unchanged} montés=${raised}`)
    }
    await sleep(PAUSE_MS)
  }

  console.log(`\n=== Recap compute (staging, AUCUNE écriture catalog) ===`)
  console.log(`  Recalculés : ${done}`)
  console.log(`  Score BAISSÉ (corrigé vers le bas) : ${lowered}`)
  console.log(`  Score inchangé : ${unchanged}`)
  console.log(`  Score monté : ${raised}`)
  console.log(`  Distribution nouveau ton :`, toneDist)
  console.log(`  Durée : ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`\nRésultats dans cosme_check._catalog_rescore. Revue via SQL avant tout push.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
