/**
 * RoutineSimulationModal — « et si je retire les produits les plus pénalisants ? »
 *
 * Port mobile de RoutineSimulationModal (web). Pilotée par les métriques du
 * moteur (lib/routine/engine). Affiche, dans une feuille modale :
 *   - le gain de score (actuel → simulé + delta) ;
 *   - chaque produit suggéré au retrait avec ses pastilles de familles
 *     d'ingrédients (« pourquoi le retirer ») + conséquences possibles ;
 *   - des conseils « à privilégier ».
 *
 * Le bouton de confirmation appelle onConfirmRemoval(analysisId) — la mère
 * traduit l'id d'analyse en id de routine_item pour la mutation de suppression.
 * Affichée seulement si metrics.simulation.removableCount > 0.
 */

import { memo, useMemo } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { RoutineMetrics } from '@/lib/routine/engine'

type ColorTone = 'Rouge' | 'Orange' | 'Jaune' | 'Vert' | null

const TAG_LABELS: Record<string, string> = {
  paraben: 'Parabens',
  silicone: 'Silicones',
  sulfate: 'Sulfates',
  'huile-minerale': 'Huiles minérales',
  ethoxyle: 'Composés éthoxylés',
  'colorant-synthese': 'Colorants de synthèse',
  'ammonium-quaternaire': 'Ammoniums quaternaires',
  'allergene-parfumant': 'Allergènes parfumants',
  conservateur: 'Conservateurs',
  'parfum-synthese': 'Parfums de synthèse',
  'huile-essentielle': 'Huiles essentielles',
}

const TAG_CONSEQUENCES: Record<string, string> = {
  sulfate: 'Cuir chevelu desséché, cheveux qui ternissent et perdent en volume à long terme.',
  silicone: "Cheveux plus lourds avec un effet « film » qui s'accumule lavage après lavage.",
  paraben: 'Conservateurs régulièrement pointés du doigt comme perturbateurs endocriniens présumés.',
  'huile-minerale': 'Pores qui s’obstruent et peau qui peine à respirer sur la durée.',
  ethoxyle: 'Procédé de fabrication qui peut laisser des traces de résidus indésirables.',
  'colorant-synthese': 'Risque d’allergie ou de sensibilisation cutanée, surtout sur peau réactive.',
  'ammonium-quaternaire': 'Effet doux immédiat mais irritation et accumulation possibles à long terme.',
  'allergene-parfumant': 'Risque accru d’allergie ou de réaction cutanée, surtout sur peau sensible.',
  'parfum-synthese': 'Fréquente source d’irritation, notamment chez les peaux réactives ou atopiques.',
  conservateur: 'Certains conservateurs sont irritants ou allergisants après un usage prolongé.',
  'huile-essentielle': 'Peut sensibiliser la peau, à éviter sur peaux fragiles ou pendant la grossesse.',
}

const TAG_BROAD_TIPS: Record<string, string> = {
  'allergene-parfumant': 'Privilégier des soins sans parfum, ou marqués « peaux sensibles ».',
  'parfum-synthese': "Privilégier des soins sans parfum, ou un parfum d'origine naturelle.",
  conservateur: 'Privilégier des soins avec conservateurs doux, ou des produits certifiés bio.',
  paraben: 'Privilégier des produits affichés « sans paraben ».',
  sulfate: 'Privilégier des shampoings et nettoyants moussants doux.',
  silicone: "Privilégier des soins sans silicone si tes cheveux s'alourdissent vite.",
  'huile-minerale': 'Privilégier des huiles végétales aux huiles minérales / paraffine.',
  ethoxyle: 'Privilégier des formules courtes, idéalement certifiées clean ou bio.',
  'ammonium-quaternaire': 'Privilégier des après-shampoings doux, sans agents adoucissants agressifs.',
  'colorant-synthese': 'Privilégier des produits sans colorant ajouté.',
  'huile-essentielle': 'Si peau sensible, éviter les soins riches en huiles essentielles.',
}

const RATING_RANK: Record<string, number> = { Rouge: 4, Orange: 3, Jaune: 2, Vert: 1 }

type TagAggregate = { tag: string; worstColor: ColorTone; count: number }

function aggregateTagsByWorst(
  worstIngredients: { colorRating: ColorTone; tags: string[] }[],
): TagAggregate[] {
  const map = new Map<string, TagAggregate>()
  for (const ing of worstIngredients) {
    for (const t of ing.tags) {
      const existing = map.get(t)
      if (!existing) {
        map.set(t, { tag: t, worstColor: ing.colorRating, count: 1 })
      } else {
        existing.count += 1
        if ((RATING_RANK[ing.colorRating ?? ''] ?? 0) > (RATING_RANK[existing.worstColor ?? ''] ?? 0)) {
          existing.worstColor = ing.colorRating
        }
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const sa = RATING_RANK[a.worstColor ?? ''] ?? 0
    const sb = RATING_RANK[b.worstColor ?? ''] ?? 0
    if (sa !== sb) return sb - sa
    return b.count - a.count
  })
}

function pillTone(color: ColorTone): { bg: string; text: string } {
  switch (color) {
    case 'Rouge':
      return { bg: colors.rating.rouge.bg, text: colors.rating.rouge.text }
    case 'Orange':
      return { bg: colors.rating.orange.bg, text: colors.rating.orange.text }
    case 'Jaune':
      return { bg: colors.rating.jaune.bg, text: colors.rating.jaune.text }
    case 'Vert':
      return { bg: colors.rating.vert.bg, text: colors.rating.vert.text }
    default:
      return { bg: colors.gray100, text: colors.gray600 }
  }
}

function buildBroadTips(allTags: Set<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of allTags) {
    const tip = TAG_BROAD_TIPS[t]
    if (!tip || seen.has(tip)) continue
    seen.add(tip)
    out.push(tip)
    if (out.length >= 4) break
  }
  if (out.length === 0) {
    out.push("Cibler des formules courtes (< 20 ingrédients) avec une bonne note d'analyse.")
  }
  return out
}

function consequencesFor(tagAggregates: TagAggregate[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of tagAggregates) {
    const c = TAG_CONSEQUENCES[t.tag]
    if (!c || seen.has(c)) continue
    seen.add(c)
    out.push(c)
    if (out.length >= 3) break
  }
  return out
}

interface Props {
  visible: boolean
  onClose: () => void
  metrics: RoutineMetrics
  currentScore: number
  /** Reçoit l'id d'ANALYSE du produit à retirer (la mère mappe vers routine_item). */
  onConfirmRemoval: (analysisId: string) => void
}

export const RoutineSimulationModal = memo(function RoutineSimulationModal({
  visible,
  onClose,
  metrics,
  currentScore,
  onConfirmRemoval,
}: Props) {
  const insets = useSafeAreaInsets()
  const worst = metrics.simulation.worstProducts
  const newScore = metrics.simulation.minus2.exposureScore
  const delta = newScore - currentScore
  const isSingle = worst.length === 1

  const allTagsInPlay = useMemo(() => {
    const s = new Set<string>()
    for (const p of worst) {
      for (const ing of p.worstIngredients) {
        for (const t of ing.tags) s.add(t)
      }
    }
    return s
  }, [worst])

  const tips = useMemo(() => buildBroadTips(allTagsInPlay), [allTagsInPlay])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerMain}>
              <Text style={styles.title}>
                {isSingle
                  ? 'Retirer ce produit pour gagner des points'
                  : 'Retirer ces 2 produits pour gagner des points'}
              </Text>
              <View style={styles.scoreRow}>
                <View style={styles.scorePill}>
                  <Text style={styles.scorePillVal}>{currentScore.toFixed(1)}</Text>
                  <Text style={styles.scorePillUnit}>/20</Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color={colors.inkLight} />
                <View style={[styles.scorePill, styles.scorePillGood]}>
                  <Text style={[styles.scorePillVal, styles.scorePillValGood]}>
                    {newScore.toFixed(1)}
                  </Text>
                  <Text style={[styles.scorePillUnit, styles.scorePillValGood]}>/20</Text>
                </View>
                <Text style={styles.deltaText}>+{delta.toFixed(1)}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {worst.map((p) => {
              const aggregates = aggregateTagsByWorst(
                p.worstIngredients.map((ing) => ({
                  colorRating: (ing.colorRating ?? null) as ColorTone,
                  tags: ing.tags,
                })),
              )
              const consequences = consequencesFor(aggregates)
              return (
                <View key={p.id} style={styles.productCard}>
                  <View style={styles.productHead}>
                    <Text style={styles.productName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <View style={styles.productScore}>
                      <Text style={styles.productScoreVal}>
                        {p.score !== null ? p.score.toFixed(1) : '–'}
                      </Text>
                      <Text style={styles.productScoreUnit}>/20</Text>
                    </View>
                  </View>

                  {aggregates.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>POURQUOI LE RETIRER</Text>
                      <View style={styles.pills}>
                        {aggregates.slice(0, 6).map((t) => {
                          const tone = pillTone(t.worstColor)
                          return (
                            <View
                              key={t.tag}
                              style={[styles.pill, { backgroundColor: tone.bg }]}
                            >
                              <Text style={[styles.pillText, { color: tone.text }]}>
                                {TAG_LABELS[t.tag] ?? t.tag}
                              </Text>
                            </View>
                          )
                        })}
                      </View>
                    </View>
                  )}

                  {consequences.length > 0 && (
                    <View style={styles.consequences}>
                      <Text style={styles.consequencesLabel}>
                        CONSÉQUENCES POSSIBLES À LONG TERME
                      </Text>
                      {consequences.map((c, i) => (
                        <View key={i} style={styles.consequenceRow}>
                          <View style={styles.bullet} />
                          <Text style={styles.consequenceText}>{c}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => {
                      onConfirmRemoval(p.id)
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.removeBtnText}>Retirer de ma routine</Text>
                  </Pressable>
                </View>
              )
            })}

            {tips.length > 0 && (
              <View style={styles.tipsCard}>
                <Text style={styles.tipsLabel}>À PRIVILÉGIER POUR LA SUITE</Text>
                {tips.map((tip, i) => (
                  <View key={i} style={styles.tipRow}>
                    <View style={styles.tipDot} />
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.disclaimer}>
              Conseils indicatifs basés sur ta routine actuelle. Aucun conseil médical.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
})

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  backdropPress: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    maxHeight: '88%',
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray300,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerMain: { flex: 1 },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    color: colors.ink,
    lineHeight: 22,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.gray100,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  scorePillGood: { backgroundColor: colors.successSoft },
  scorePillVal: { fontFamily: fontFamilies.bold, fontSize: 13, color: colors.ink },
  scorePillValGood: { color: colors.success },
  scorePillUnit: { fontFamily: fontFamilies.regular, fontSize: 10, color: colors.inkMuted },
  deltaText: { fontFamily: fontFamilies.bold, fontSize: 13, color: colors.success },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexGrow: 0 },
  scrollContent: { padding: spacing.lg, gap: spacing.md },
  productCard: {
    backgroundColor: colors.gray50,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  productHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  productName: { flex: 1, fontFamily: fontFamilies.semiBold, fontSize: 14, color: colors.ink },
  productScore: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.rating.rouge.bg,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  productScoreVal: { fontFamily: fontFamilies.bold, fontSize: 12, color: colors.rating.rouge.text },
  productScoreUnit: { fontFamily: fontFamilies.regular, fontSize: 9, color: colors.rating.rouge.text },
  section: { gap: 6 },
  sectionLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 9,
    letterSpacing: 0.6,
    color: colors.inkLight,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontFamily: fontFamilies.semiBold, fontSize: 11 },
  consequences: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  consequencesLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 9,
    letterSpacing: 0.6,
    color: colors.rating.jaune.ink,
    marginBottom: 2,
  },
  consequenceRow: { flexDirection: 'row', gap: 6 },
  bullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.warning,
    marginTop: 7,
  },
  consequenceText: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.rating.jaune.ink,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    borderRadius: radius.full,
    paddingVertical: 10,
    marginTop: 2,
  },
  removeBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: '#FFFFFF' },
  tipsCard: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.lg,
    padding: spacing.base,
    gap: 6,
  },
  tipsLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.rating.vert.text,
    marginBottom: 2,
  },
  tipRow: { flexDirection: 'row', gap: 8 },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
    marginTop: 6,
  },
  tipText: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.rating.vert.ink,
  },
  disclaimer: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 15,
    color: colors.inkLight,
    textAlign: 'center',
  },
})
