/**
 * PASSE LLM — récupère les pénalisants au nom MUTILÉ (OCR/typo) que le match
 * exact ne peut pas retrouver (classe « Corinne »).
 *
 * Pour chaque candidat (solaires verts à 0-pénalité, table _llm_candidates) :
 *   1. LLM re-parse le texte INCI (prompt EXACT de l'app parseInciWithAI :
 *      corrige typos/OCR, N'INVENTE RIEN) → liste propre.
 *   2. parseInciList + match RPC live (les noms corrigés matchent maintenant).
 *   3. buildAnalysisCore (moteur V2 réel) → nouveau score + counts.
 *   4. Si BAISSE → écrit dans _catalog_rescore_llm (staging). AUCUNE écriture catalog.
 *
 * Dry-run par nature : sortie en staging, revue SQL avant tout push.
 * Usage : npx tsx scripts/rescore-sunscreens-llm.ts
 */
import 'dotenv/config'
import { parseInciList } from '../supabase/functions/analyser/parse.ts'
import { buildAnalysisCore, type MatchRow } from '../supabase/functions/analyser/core.ts'
import { scoreLabel } from '../supabase/functions/analyser/score.ts'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''
if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_KEY) {
  console.error('EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY manquants')
  process.exit(1)
}

const MODEL = 'gpt-4o-mini'
const CONCURRENCY = 6      // appels LLM simultanés max (respect rate-limit)
const MATCH_CHUNK = 200

// Prompt VERBATIM de supabase/functions/analyser/ai.ts (parseInciWithAI)
const PARSE_SYSTEM = `Tu es un parseur INCI (International Nomenclature of Cosmetic Ingredients). L'utilisateur a collé une liste d'ingrédients cosmétiques qui peut être mal formatée : mots collés sans séparateurs, ponctuation absente, fautes de frappe, sortie OCR. Reconstruis la liste selon la nomenclature INCI standard.

RÈGLES STRICTES :
- N'invente AUCUN ingrédient absent du texte source.
- INTERDIT de remplacer un nom INCI par son synonyme botanique, son ancien nom ou sa version "moderne", même si tu sais que c'est la même substance. Tu retournes le nom EXACT donné par l'utilisateur. C'est le rôle du matcher en aval de gérer les synonymes, pas le tien.
- Tu peux corriger des FAUTES DE FRAPPE manifestes (ex : "glyceryne" → "glycerin", "tocoferol" → "tocopherol") mais PAS substituer un nom valide par un autre nom valide.
- Garde l'ordre exact d'apparition.
- Sépare correctement les ingrédients même s'ils sont collés sans espace ni virgule.
- Conserve les synonymes officiels DÉJÀ groupés par l'utilisateur comme UN seul ingrédient (ex : "AQUA/WATER/EAU"). Mais n'ajoute jamais tes propres synonymes.
- Conserve les colorants "CI 12345" tels quels.
- Ignore les codes/identifiants produit non-INCI.
- Les marqueurs "*", "**", "***", "°", "†" signalent un statut et NE FONT PAS partie du nom INCI. Retire-les.
- Réponds UNIQUEMENT en JSON : { "ingredients": ["AQUA / WATER / EAU", ...] }
- Pas de commentaire, pas de markdown, juste le JSON.`

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra }
}
async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, init)
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const txt = await res.text()
  return (txt ? JSON.parse(txt) : null) as T
}
const cc = (extra: Record<string, string> = {}) => headers({ 'Accept-Profile': 'cosme_check', ...extra })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function llmReparse(text: string): Promise<string[] | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, temperature: 0, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PARSE_SYSTEM },
          { role: 'user', content: `Liste à parser :\n"""\n${text.slice(0, 6000)}\n"""` },
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json() as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(content) as { ingredients?: unknown }
    if (!Array.isArray(parsed.ingredients)) return null
    return parsed.ingredients.map((s) => String(s).trim()).filter((s) => s.length > 0 && s.length < 200)
  } catch { return null }
}

// ─── Match RPC avec cache token ─────────────────────────────────────────────
const tokenCache = new Map<string, Omit<MatchRow, 'input_token' | 'position_idx'>>()
async function matchTokensCached(normalized: string[]): Promise<MatchRow[]> {
  const unknown = [...new Set(normalized.filter((t) => !tokenCache.has(t)))]
  for (let i = 0; i < unknown.length; i += MATCH_CHUNK) {
    const chunk = unknown.slice(i, i + MATCH_CHUNK)
    const rows = await rest<MatchRow[]>(`/rest/v1/rpc/cosme_check_match_inci_batch`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ p_tokens: chunk }),
    }).catch(() => [] as MatchRow[])
    for (const r of rows) {
      const { input_token: _i, position_idx: _p, ...rest } = r
      tokenCache.set(r.input_token, rest)
    }
    for (const t of chunk) if (!tokenCache.has(t)) tokenCache.set(t, {
      inci_id: null, slug: null, name: null, color_rating: null, cas_number: null,
      translation_fr: null, primary_function: null, all_functions: null, tags: null, match_kind: null, confidence: 0,
    })
  }
  return normalized.map((t, i) => ({ ...tokenCache.get(t)!, input_token: t, position_idx: i }))
}

type CatalogRow = { ean: string; ingredients_text: string | null; score: number | null }

async function processOne(row: CatalogRow): Promise<Record<string, unknown> | null> {
  const original = (row.ingredients_text ?? '').trim()
  if (!original) return null
  const reparsed = await llmReparse(original)
  const effective = reparsed && reparsed.length >= 2 ? reparsed.join(', ') : original
  const changed = !!(reparsed && reparsed.length >= 2)

  const tokens = parseInciList(effective.slice(0, 8000))
  if (tokens.length === 0) return null
  const rows = await matchTokensCached(tokens.map((t) => t.normalized))
  const core = buildAnalysisCore({ tokens, rows })
  const { label, tone } = scoreLabel(core.score)
  const newScore = Number(core.score.toFixed(2))

  // On ne stocke QUE les baisses réelles (le LLM a récupéré un pénalisant).
  if (row.score != null && newScore >= row.score - 0.01) return null

  return {
    ean: row.ean, old_score: row.score, new_score: newScore, new_tone: tone, new_label: label,
    new_orange: core.countsPayload.orange, new_rouge: core.countsPayload.rouge,
    n_ident: core.countsPayload.matched, n_total: core.countsPayload.total, changed_inci: changed,
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() { for (;;) { const idx = i++; if (idx >= items.length) return; out[idx] = await fn(items[idx]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function fetchAllCandidates(): Promise<{ ean: string }[]> {
  const out: { ean: string }[] = []
  let offset = 0
  const page = 1000
  for (;;) {
    const rows = await rest<{ ean: string }[]>(
      `/rest/v1/_llm_candidates?select=ean&order=ean.asc&limit=${page}&offset=${offset}`,
      { headers: cc() },
    )
    out.push(...rows)
    if (rows.length < page) break
    offset += page
  }
  return out
}

async function main() {
  const t0 = Date.now()
  const cands = await fetchAllCandidates()
  console.log(`${cands.length} candidats solaires à reparser (LLM).`)

  let done = 0, staged = 0
  for (let i = 0; i < cands.length; i += 60) {
    const batchEans = cands.slice(i, i + 60).map((r) => r.ean)
    const list = batchEans.map((e) => `"${e}"`).join(',')
    const catRows = await rest<CatalogRow[]>(
      `/rest/v1/catalog?select=ean,ingredients_text,score&ean=in.(${encodeURIComponent(list).replace(/%22/g, '"')})`,
      { headers: cc() },
    )
    const results = (await mapLimit(catRows, CONCURRENCY, processOne)).filter(Boolean) as Record<string, unknown>[]
    if (results.length) {
      await rest(`/rest/v1/_catalog_rescore_llm?on_conflict=ean`, {
        method: 'POST',
        headers: cc({ 'Content-Profile': 'cosme_check', Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(results),
      })
      staged += results.length
    }
    done += batchEans.length
    if (done % 300 < 60) {
      const rate = done / Math.max((Date.now() - t0) / 1000, 0.01)
      console.log(`  ${done}/${cands.length}  (${rate.toFixed(1)}/s)  baisses détectées=${staged}`)
    }
  }

  console.log(`\n=== Recap passe LLM (staging, AUCUNE écriture catalog) ===`)
  console.log(`  Candidats traités : ${done}`)
  console.log(`  Baisses détectées (pénalisant récupéré par LLM) : ${staged}`)
  console.log(`  Durée : ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`  Revue : SELECT sur cosme_check._catalog_rescore_llm avant tout push.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
