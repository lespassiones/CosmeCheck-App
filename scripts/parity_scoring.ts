/**
 * PARITÉ SCORING : recalcule le score propriétaire (pastille) depuis l'INCI
 * catalogue avec le MÊME code que le live (parse.ts + core.ts + match RPC) et
 * le compare à catalog.score (calculé par Cosme-Scraper/rescore_lab en batch).
 * Objectif : prouver que "coller une liste INCI" (recalcul live) et "produit en
 * base" (score pré-calculé) reposent sur le même système de calcul.
 */
import 'dotenv/config'
import { parseInciList } from '../supabase/functions/analyser/parse.ts'
import { buildAnalysisCore, type MatchRow } from '../supabase/functions/analyser/core.ts'

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function rest(path: string, init?: RequestInit) {
  const r = await fetch(`${URL}${path}`, init)
  if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text().then(t=>t.slice(0,150))}`)
  return r.json()
}

const cache = new Map<string, Omit<MatchRow, 'input_token' | 'position_idx'>>()
async function match(tokens: string[]): Promise<MatchRow[]> {
  const unknown = [...new Set(tokens.filter(t => !cache.has(t)))]
  for (let i = 0; i < unknown.length; i += 200) {
    const chunk = unknown.slice(i, i + 200)
    const rows = await rest(`/rest/v1/rpc/cosme_check_match_inci_batch`, { method: 'POST', headers: H, body: JSON.stringify({ p_tokens: chunk }) }) as MatchRow[]
    for (const r of rows) { const { input_token, position_idx, ...restRow } = r; cache.set(input_token, restRow) }
    for (const t of chunk) if (!cache.has(t)) cache.set(t, { inci_id: null, slug: null, name: null, color_rating: null, cas_number: null, translation_fr: null, primary_function: null, all_functions: null, tags: null, match_kind: null, confidence: 0 })
  }
  return tokens.map((t, i) => ({ ...cache.get(t)!, input_token: t, position_idx: i }))
}

async function main() {
  const rows: { ean: string; ingredients_text: string; score: number | null }[] = []
  for (let i = 0; i < 8; i++) {
    const offset = 500 + i * 60000
    rows.push(...await rest(
      `/rest/v1/catalog?select=ean,ingredients_text,score&is_active=eq.true&ingredients_text=not.is.null&score=not.is.null&order=ean.asc&limit=50&offset=${offset}`,
      { headers: { ...H, 'Accept-Profile': 'cosme_check' } },
    ))
  }
  let exact = 0, close = 0, far = 0, skipped = 0
  const farList: string[] = []
  const deltas: number[] = []
  for (const r of rows) {
    const tokens = parseInciList((r.ingredients_text ?? '').slice(0, 8000))
    if (tokens.length < 5) { skipped++; continue }
    const m = await match(tokens.map(t => t.normalized))
    const core = buildAnalysisCore({ tokens, rows: m })
    const delta = Math.abs(core.score - (r.score ?? 0))
    deltas.push(delta)
    if (delta <= 0.05) exact++
    else if (delta <= 0.5) close++
    else { far++; if (farList.length < 10) farList.push(`${r.ean}: recalc=${core.score} catalog=${r.score} (Δ${delta.toFixed(2)})`) }
  }
  deltas.sort((a, b) => a - b)
  const n = deltas.length
  console.log(`échantillon analysable: ${n} (skippés courts: ${skipped})`)
  console.log(`identiques (Δ≤0.05): ${exact} (${(100*exact/n).toFixed(1)}%)`)
  console.log(`proches   (Δ≤0.5) : ${close} (${(100*close/n).toFixed(1)}%)`)
  console.log(`écarts    (Δ>0.5) : ${far} (${(100*far/n).toFixed(1)}%)`)
  console.log(`médiane Δ: ${deltas[Math.floor(n/2)].toFixed(3)} | p90: ${deltas[Math.floor(n*0.9)].toFixed(3)} | max: ${deltas[n-1].toFixed(3)}`)
  if (farList.length) { console.log('exemples écarts:'); farList.forEach(l => console.log('  ' + l)) }
}
main().catch(e => { console.error(e); process.exit(1) })
