/**
 * RÉPARATION des lignes `cosme_check.analyses` dont le `result_json` ne décrivait
 * pas leur propre `input_text` (incident bêta du 21 août 2026).
 *
 * Causes constatées (toutes réparées de la même façon : on recalcule depuis
 * l'INCI stocké, qui est correct dans les 10 cas) :
 *   - cache EAN `product_analyses` périmé → analyse d'un AUTRE produit servie
 *     (ex. EAN 3770035517084 Vagance → analyse d'une eau micellaire) ;
 *   - pipelines anciens (mai-juin 2026) → items tronqués (4 items sur 20+) ou
 *     typo-correction fautive (« ALCOHOL » → « ISOAMYL ALCOHOL »).
 *
 * MOTEUR : le VRAI code de prod, aucune ré-implémentation — parse.ts
 * (parseInciList) + core.ts (buildAnalysisCore) + score.ts (scoreLabel,
 * reconcileScore), alimenté par la RPC LIVE `cosme_check_match_inci_batch`.
 * Mirror exact de la branche live de l'edge `analyser` (index.ts ~475-485) :
 * pour un EAN catalogué, `score = reconcileScore(catalog, live, matched, total)`
 * et la catégorie catalogue s'impose.
 *
 * ENRICHISSEMENTS PERSONNELS : `personalBlocks`, `personalBlocksKey` et
 * `compatibility` sont SUPPRIMÉS — ils avaient été calculés sur les mauvais
 * items (d'où les « 3 blocs » parlant d'une crème pour le corps sur un soin
 * capillaire). L'app les régénère à l'ouverture depuis les bons items.
 *
 * Cible : `cosme_check.analyses_repair_audit` (batch en argument), qui contient
 * déjà la sauvegarde du `result_json` d'origine → rollback possible.
 *
 * Usage :
 *   npx tsx scripts/repair-contaminated-analyses.ts --dry
 *   npx tsx scripts/repair-contaminated-analyses.ts
 */
import 'dotenv/config'
import { parseInciList } from '../supabase/functions/analyser/parse.ts'
import { buildAnalysisCore, type MatchRow } from '../supabase/functions/analyser/core.ts'
import { reconcileScore, scoreLabel } from '../supabase/functions/analyser/score.ts'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env')
  process.exit(1)
}

const BATCH = 'repair_2026_08_21'
const MATCH_CHUNK = 200

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}
const cc = (extra: Record<string, string> = {}) => headers({ 'Accept-Profile': 'cosme_check', ...extra })
const ccw = (extra: Record<string, string> = {}) => headers({ 'Content-Profile': 'cosme_check', ...extra })

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status}: ${body.slice(0, 300)}`)
  }
  const txt = await res.text()
  return (txt ? JSON.parse(txt) : null) as T
}

// ─── Match RPC (même RPC que le live) avec cache token ──────────────────────
const tokenCache = new Map<string, Omit<MatchRow, 'input_token' | 'position_idx'>>()

async function matchTokens(normalized: string[]): Promise<MatchRow[]> {
  const unknown = [...new Set(normalized.filter((t) => !tokenCache.has(t)))]
  for (let i = 0; i < unknown.length; i += MATCH_CHUNK) {
    const chunk = unknown.slice(i, i + MATCH_CHUNK)
    const rows = await rest<MatchRow[]>('/rest/v1/rpc/cosme_check_match_inci_batch', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_tokens: chunk }),
    })
    for (const r of rows) {
      const { input_token: _i, position_idx: _p, ...rest_ } = r
      tokenCache.set(r.input_token, rest_)
    }
    for (const t of chunk) {
      if (!tokenCache.has(t)) {
        tokenCache.set(t, {
          inci_id: null, slug: null, name: null, color_rating: null, cas_number: null,
          translation_fr: null, primary_function: null, all_functions: null,
          tags: null, match_kind: null, confidence: 0,
        })
      }
    }
  }
  return normalized.map((t, i) => ({ ...tokenCache.get(t)!, input_token: t, position_idx: i }))
}

type AuditRow = { analysis_id: string; ean: string | null }
type AnalysisRow = {
  id: string
  input_text: string | null
  ean: string | null
  product_type: string | null
  category: string | null
  result_json: Record<string, unknown>
}
type CatalogRow = { ean: string; score: number | null; category: string | null }

async function main() {
  const dry = process.argv.includes('--dry')
  const audit = await rest<AuditRow[]>(
    `/rest/v1/analyses_repair_audit?select=analysis_id,ean&batch=eq.${BATCH}&repaired_at=is.null`,
    { headers: cc() },
  )
  console.log(`${audit.length} analyse(s) à réparer (batch ${BATCH})${dry ? ' — DRY RUN' : ''}\n`)

  let fixed = 0
  let skipped = 0

  for (const a of audit) {
    const rows = await rest<AnalysisRow[]>(
      `/rest/v1/analyses?select=id,input_text,ean,product_type,category,result_json&id=eq.${a.analysis_id}`,
      { headers: cc() },
    )
    const row = rows[0]
    if (!row) { console.log(`  ${a.analysis_id}: introuvable, skip`); skipped++; continue }

    const inci = (row.input_text ?? '').trim()
    const tokens = parseInciList(inci.slice(0, 8000))
    if (tokens.length < 2) {
      console.log(`  ${row.id}: INCI inexploitable (${tokens.length} token), skip`)
      skipped++
      continue
    }

    const matchRows = await matchTokens(tokens.map((t) => t.normalized))
    const core = buildAnalysisCore({ tokens, rows: matchRows })

    // Score : mirror de la branche live de l'edge analyser.
    let score = core.score
    let scoreLabelText = core.scoreLabelText
    let scoreTone: string = core.scoreTone
    let catalogCategory: string | null = null
    if (row.ean) {
      const cat = await rest<CatalogRow[]>(
        `/rest/v1/catalog?select=ean,score,category&is_active=eq.true&ean=eq.${row.ean}`,
        { headers: cc() },
      )
      const catScore = cat[0]?.score ?? null
      catalogCategory = cat[0]?.category ?? null
      if (typeof catScore === 'number') {
        score = reconcileScore(catScore, score, core.countsPayload.matched, core.countsPayload.total)
        const lab = scoreLabel(score)
        scoreLabelText = lab.label
        scoreTone = lab.tone
      }
    }

    const old = row.result_json ?? {}
    const resultJson: Record<string, unknown> = {
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
      // Identité conservée (ce n'est pas de l'analyse) ; le slug catalogue primve.
      productType: (old.productType as string | null) ?? row.product_type ?? null,
      category: catalogCategory ?? (old.category as string | null) ?? row.category ?? null,
    }
    if (catalogCategory) resultJson.catalogCategory = catalogCategory
    else if (old.catalogCategory) resultJson.catalogCategory = old.catalogCategory
    // personalBlocks / personalBlocksKey / compatibility volontairement ABSENTS.

    const oldItems = Array.isArray(old.items) ? (old.items as unknown[]).length : 0
    const oldScore = typeof old.score === 'number' ? old.score : null
    const { matched, total, unknown } = core.countsPayload
    const ident = total > 0 ? matched / total : 0

    // GARDE-FOU ANTI-FAUX-VERT. Ce recalcul n'a PAS la correction typo LLM du
    // live : sur un INCI collé par l'OCR (« CANOLAOIL », « DICAPRYLYLETHER »),
    // les pénalisants ne sont pas reconnus, disparaissent du compte et la note
    // MONTE à tort (cf. incident « faux Très bien »). On n'écrit donc que si
    // l'INCI stocké est propre (≥80 % identifiés) OU si la note ne monte pas.
    const rises = oldScore != null && score > oldScore + 0.01
    const unsafe = rises && ident < 0.8
    const flag = unsafe ? '  ⚠ SAUTÉ (hausse + INCI sale)' : ''
    console.log(
      `  ${row.id}  items ${oldItems} -> ${core.items.length}` +
      `  score ${oldScore ?? '?'} -> ${score.toFixed(2)} (${scoreLabelText})` +
      `  ident ${matched}/${total}${unknown ? ` (${unknown} inconnus)` : ''}` +
      `${row.ean ? `  ean=${row.ean}` : ''}${flag}`,
    )
    if (unsafe) { skipped++; continue }

    if (!dry) {
      await rest(`/rest/v1/analyses?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: ccw({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ result_json: resultJson, score: Number(score.toFixed(2)) }),
      })
      await rest(`/rest/v1/analyses_repair_audit?analysis_id=eq.${row.id}`, {
        method: 'PATCH',
        headers: ccw({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ repaired_at: new Date().toISOString() }),
      })
    }
    fixed++
  }

  console.log(`\n${dry ? 'Simulé' : 'Réparé'} : ${fixed} · sauté : ${skipped}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
