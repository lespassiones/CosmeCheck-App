/**
 * Logique pure de l'« optimisation de routine » (Suggestions intelligentes).
 *
 * À partir d'une analyse (result_json, restrictions DÉJÀ appliquées via
 * applyRestrictions → flag `is_restricted` sur les items), on détermine :
 *   - si le produit est « à optimiser » ;
 *   - une note de sévérité (pour trier du plus dangereux au moins) ;
 *   - l'élément UNIQUE le plus dangereux à afficher (badge).
 *
 * Aucune dépendance React → testable en Jest.
 */
import type { AnalyseResponse, AnalyseItem } from '@/lib/analysis/types'
import { applyColorCap } from '@/lib/analysis/scoreCap'

type ItemWithRestriction = AnalyseItem & { is_restricted?: boolean }

/** Tags pénalisants → libellé court FR (sinon on retombe sur le nom INCI). */
const TAG_LABELS: Record<string, string> = {
  'parfum-synthese': 'Parfum de synthèse',
  'allergene-parfumant': 'Allergène parfumant',
  'allergene-reglemente': 'Allergène réglementé',
  silicone: 'Silicone',
  sulfate: 'Sulfate',
  paraben: 'Parabène',
  'huile-minerale': 'Huile minérale',
  ethoxyle: 'PEG / éthoxylé',
  propoxyle: 'Composé propoxylé',
  'colorant-synthese': 'Colorant de synthèse',
  'ammonium-quaternaire': 'Ammonium quaternaire',
  conservateur: 'Conservateur',
  cmr: 'CMR',
  'filtre-uv': 'Filtre UV',
}

function labelForItem(it: ItemWithRestriction): string {
  for (const t of (Array.isArray(it.tags) ? it.tags : [])) {
    if (TAG_LABELS[t]) return TAG_LABELS[t]
  }
  return it.name || it.input || 'Ingrédient'
}

export type OptimizeInfo = {
  isToOptimize: boolean
  severity: number
  /** Le seul élément à afficher en badge (le plus dangereux), ou null. */
  dangerLabel: string | null
  dangerColor: 'rouge' | 'orange' | null
  /** Score plafonné (blocus orange/rouge), comme l'app l'affiche. */
  cappedScore: number | null
}

/**
 * Calcule l'info d'optimisation d'UN produit. `result` doit avoir reçu
 * applyRestrictions (is_restricted positionné) pour la dimension restrictions.
 */
export function computeOptimizeInfo(result: AnalyseResponse): OptimizeInfo {
  const items = (Array.isArray(result.items) ? result.items : []) as ItemWithRestriction[]
  const cOrange = result.counts?.orange ?? 0
  const cRouge = result.counts?.rouge ?? 0
  const score = typeof result.score === 'number' ? result.score : null
  const cappedScore = score != null ? applyColorCap(score, cOrange, cRouge) : null

  const restricted = items.filter((it) => it.is_restricted)
  // Le plus dangereux : restriction d'abord, puis 1er rouge, puis 1er orange.
  const dangerItem =
    restricted[0] ??
    items.find((it) => it.colorRating === 'Rouge') ??
    items.find((it) => it.colorRating === 'Orange') ??
    null

  const dangerLabel = dangerItem ? labelForItem(dangerItem) : null
  // Badge ALIGNÉ sur la couleur de tier du PRODUIT (mêmes seuils que TierDots :
  // score plafonné < 5 = rouge, sinon orange/jaune). Ainsi deux produits de même
  // couleur affichent le MÊME badge (plus de « à éviter » sur un produit orange à
  // cause d'un seul ingrédient rouge). Une restriction force « À éviter » (rouge).
  const dangerColor: OptimizeInfo['dangerColor'] =
    restricted.length > 0 || (cappedScore != null && cappedScore < 5) ? 'rouge' : 'orange'

  // « À optimiser » : note plafonnée hors zone verte (< 13) OU viole une restriction.
  const isToOptimize = (cappedScore != null && cappedScore < 13) || restricted.length > 0

  // Sévérité : restriction >> rouge > orange > (déficit de note).
  const severity =
    (restricted.length > 0 ? 1000 : 0) +
    cRouge * 40 +
    cOrange * 15 +
    (cappedScore != null ? Math.max(0, 20 - cappedScore) : 0)

  return { isToOptimize, severity, dangerLabel, dangerColor, cappedScore }
}

export type OptimizeCandidate<T> = { product: T; info: OptimizeInfo }

/**
 * Sélectionne les produits à optimiser, triés du plus dangereux au moins,
 * limités à `max` (défaut 5). `getResult` extrait l'AnalyseResponse (restrictions
 * appliquées) d'un produit.
 */
export function selectToOptimize<T>(
  products: T[],
  getResult: (p: T) => AnalyseResponse | null,
  max = 5,
): OptimizeCandidate<T>[] {
  const out: OptimizeCandidate<T>[] = []
  for (const product of products) {
    const result = getResult(product)
    if (!result) continue
    const info = computeOptimizeInfo(result)
    if (info.isToOptimize) out.push({ product, info })
  }
  out.sort((a, b) => b.info.severity - a.info.severity)
  return out.slice(0, Math.max(0, max))
}
