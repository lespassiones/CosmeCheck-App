/**
 * Chemin rapide (alternative tapée, produit gardé en favori) : l'app insère la
 * ligne `analyses` directement depuis le cache par EAN, sans passer par l'edge
 * `analyser`. Ce module fixe la NOTE de cette ligne.
 *
 * Avant (bug bêta 28 sept 2026) : `score: cached.score ?? 0`, où `cached.score`
 * était la note au moment du calcul du cache (souvent juillet), pas la note
 * actuelle du catalogue ; et un cache sans note enregistrait 0/20 (pénalité
 * maximale dans l'exposition, base 0 pour la compatibilité).
 *
 * Maintenant : la RPC `cosme_check_get_product_analysis` renvoie déjà la note
 * du catalogue (migration 20260928_unify_product_score_engine) ; à défaut on
 * prend la note affichée sur la carte ; jamais 0 inventé. Libellé et tonalité
 * sont recalculés depuis cette même note, pour que l'historique affiche
 * exactement ce que la carte montrait.
 */
import { scoreLabelFromScore, scoreToneFromScore } from '@/lib/analysis/scoreCap'

const asScore = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

export function alignCachedResult(
  cached: Record<string, unknown>,
  cardScore: number | null | undefined,
): { resultJson: Record<string, unknown>; score: number | null } {
  const raw = asScore(cached.score) ?? asScore(cardScore)
  if (raw == null) return { resultJson: { ...cached, synthesis: null }, score: null }
  const score = Number(raw.toFixed(2))
  return {
    resultJson: {
      ...cached,
      synthesis: null,
      score,
      scoreLabel: scoreLabelFromScore(score),
      scoreTone: scoreToneFromScore(score),
    },
    score,
  }
}
