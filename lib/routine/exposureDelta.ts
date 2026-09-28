/**
 * Évolution de l'« Exposition cumulée » après une modification de la routine.
 *
 * Contexte (retour bêta, 28 sept 2026) : « Et la note de l'exposition ne change
 * pas ? ». La note est une MOYENNE des notes des produits, pondérée par leur
 * fréquence (lib/routine/engine.ts) : ajouter des produits proches de sa
 * moyenne ne la fait pas bouger. Décision éditeur : garder le calcul, mais
 * l'expliquer et montrer l'évolution après chaque changement de routine.
 *
 * Deux instantanés sont gardés : `baseline` (avant le dernier changement) et
 * `current`. Quand la signature de la routine change, l'ancien `current`
 * devient `baseline`. Le message d'évolution reste affiché jusqu'au changement
 * suivant. Module pur (stockage géré par hooks/useExposureChange.ts).
 */

export interface ExposureSnapshot {
  score: number
  count: number
  /** Signature de la routine : `analysis_id:frequency` triés. */
  sig: string
}

export interface ExposureHistory {
  baseline: ExposureSnapshot | null
  current: ExposureSnapshot | null
}

/** Signature stable d'une routine (ordre des items indifférent). */
export function routineSignature(items: { analysisId: string; frequency: string }[]): string {
  return items
    .map((i) => `${i.analysisId}:${i.frequency}`)
    .sort()
    .join('|')
}

/** Nouvel historique après observation de l'état courant. */
export function nextExposureHistory(prev: ExposureHistory, cur: ExposureSnapshot): ExposureHistory {
  if (!prev.current) return { baseline: null, current: cur }
  if (prev.current.sig === cur.sig) {
    // Même routine : la note peut bouger (une note produit réalignée), on la
    // met à jour sans perdre la référence d'avant le dernier changement.
    return { baseline: prev.baseline, current: cur }
  }
  return { baseline: prev.current, current: cur }
}

export type ExposureChange =
  | { kind: 'none' }
  | { kind: 'up' | 'down' | 'same'; delta: number; addedCount: number }

/** Seuil sous lequel la note affichée (1 décimale) ne bouge pas. */
const SAME_EPS = 0.05

export function exposureChange(history: ExposureHistory): ExposureChange {
  const { baseline, current } = history
  if (!baseline || !current || baseline.count === 0) return { kind: 'none' }
  const delta = Math.round((current.score - baseline.score) * 10) / 10
  const addedCount = current.count - baseline.count
  if (Math.abs(current.score - baseline.score) < SAME_EPS) return { kind: 'same', delta: 0, addedCount }
  return { kind: delta > 0 ? 'up' : 'down', delta, addedCount }
}

/** Texte court affiché sous la note (virgule décimale française). */
export function exposureChangeText(change: ExposureChange): string | null {
  if (change.kind === 'none') return null
  if (change.kind === 'same') {
    return change.addedCount > 0
      ? 'Inchangée : tes ajouts ont une note proche de ta moyenne.'
      : 'Inchangée depuis ta dernière modification.'
  }
  const abs = Math.abs(change.delta).toFixed(1).replace('.', ',')
  return `${change.kind === 'up' ? '+' : '-'}${abs} depuis ta dernière modification`
}
