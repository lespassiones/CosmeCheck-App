/**
 * ExpositionScreen — détail de l'exposition cumulée de la routine.
 *
 * Atteinte au tap sur la carte « Exposition cumulée » de l'onglet Routine
 * (chevron « > »). Regroupe le détail qui alourdissait la page routine :
 *   - rappel du score /20 + jauge (ExposureSummaryCard, sans chevron) ;
 *   - exposition cumulée par catégorie d'ingrédients (TagExposureBar, top 8) ;
 *   - allergènes parfumants en doublon.
 *
 * Les métriques sont recalculées à partir de useRoutine + computeRoutineMetrics
 * (même moteur que l'onglet Routine) : aucune donnée dupliquée.
 */

import { type FC, useMemo } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography, fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { decodeHtml } from '@/lib/decodeHtml'
import { parseAnalyseResponse } from '@/lib/analysis/types'
import { computeRoutineMetrics, type RoutineProduct } from '@/lib/routine/engine'
import { useRoutine, type RoutineItem } from '@/hooks/useRoutine'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { WhiteCard } from '@/components/design/WhiteCard'
import { Reveal } from '@/components/design/Reveal'
import { type BlobCounts } from '@/components/design/IngredientBlob'
import { TagExposureBar } from '@/components/routine/TagExposureBar'
import { ExposureSummaryCard } from '@/components/routine/ExposureSummaryCard'

function titleFor(item: RoutineItem): string {
  return decodeHtml(item.analysis?.product_label?.trim() || item.analysis?.name?.trim()) || 'Produit'
}

const ExpositionScreen: FC = () => {
  const { items, isLoading } = useRoutine()

  const products: RoutineProduct[] = useMemo(() => {
    return items
      .map((it) => {
        const result = parseAnalyseResponse(it.analysis?.result_json)
        if (!result || !it.analysis) return null
        return {
          id: it.analysis.id,
          name: titleFor(it),
          frequency: it.frequency,
          score: it.analysis.score,
          result,
        } satisfies RoutineProduct
      })
      .filter((p): p is RoutineProduct => p !== null)
  }, [items])

  const metrics = useMemo(() => computeRoutineMetrics(products), [products])
  const tagsTop = metrics.tagExposure.slice(0, 8)

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Barre supérieure : pilule "< Retour" à gauche. */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.TABS.ROUTINE))}
            hitSlop={12}
            style={styles.backPill}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={16} color={colors.ink} />
            <Text style={styles.backPillText}>Retour</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Exposition cumulée</Text>
          <Text style={styles.subtitle}>
            Le détail de ce à quoi ta routine t’expose au quotidien.
          </Text>

          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.rose} />
            </View>
          ) : products.length === 0 ? (
            <Text style={styles.empty}>
              Ajoute des produits à ta routine pour voir ton exposition détaillée.
            </Text>
          ) : (
            <Reveal stagger={70}>
              {/* Rappel du score (mêmes valeurs que l'onglet Routine). */}
              <ExposureSummaryCard
                exposureScore={metrics.exposureScore}
                exposureLabel={metrics.exposureLabel}
                colorCounts={metrics.colorCounts as BlobCounts}
                style={styles.summary}
              />

              {/* Exposition par catégorie d'ingrédients. */}
              <WhiteCard padding={spacing.lg} style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>
                  Exposition cumulée par catégorie d’ingrédients
                </Text>
                <Text style={styles.sectionHint}>
                  Plus la barre est longue, plus la catégorie est présente dans ta routine.
                </Text>
                {tagsTop.length === 0 ? (
                  <Text style={styles.mutedText}>
                    Aucune catégorie pénalisante détectée dans cette routine.
                  </Text>
                ) : (
                  <View style={styles.tagList}>
                    {tagsTop.map((t, i) => (
                      <TagExposureBar
                        key={t.tag}
                        label={t.label}
                        count={t.cumulativeCount}
                        max={tagsTop[0].cumulativeCount || 1}
                        colorSegments={t.colorSegments}
                        index={i}
                      />
                    ))}
                  </View>
                )}
              </WhiteCard>

              {/* Allergènes parfumants en doublon. */}
              {metrics.allergenOverlap.length > 0 && (
                <View style={[styles.sectionCard, styles.allergenCard]}>
                  <Text style={styles.allergenTitle}>⚠️ Allergènes parfumants en doublon</Text>
                  <Text style={styles.allergenText}>
                    Ces substances UE apparaissent dans plusieurs de tes produits :
                  </Text>
                  <View style={styles.allergenPills}>
                    {metrics.allergenOverlap.map((a) => (
                      <View key={a.inciName} style={styles.allergenPill}>
                        <Text style={styles.allergenPillText}>{a.label}</Text>
                        <Text style={styles.allergenPillCount}>×{a.productCount}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </Reveal>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

export default ExpositionScreen

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  backPillText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.ink },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  title: { ...typography.h3, color: colors.ink },
  subtitle: {
    ...typography.small,
    color: colors.inkMuted,
    marginTop: 4,
    marginBottom: spacing.base,
  },
  center: { paddingTop: spacing['3xl'], alignItems: 'center' },
  empty: {
    ...typography.small,
    color: colors.inkMuted,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  summary: { marginBottom: spacing.base },
  sectionCard: { marginBottom: spacing.base },
  sectionTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  sectionHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.gray700,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  mutedText: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  tagList: { marginTop: 2 },
  allergenCard: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  allergenTitle: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.rating.jaune.ink },
  allergenText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.rating.jaune.ink,
    marginTop: 6,
    marginBottom: spacing.sm,
  },
  allergenPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  allergenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  allergenPillText: { fontFamily: fontFamilies.medium, fontSize: 12, color: colors.rating.jaune.ink },
  allergenPillCount: { fontFamily: fontFamilies.regular, fontSize: 10, color: colors.warning },
})
