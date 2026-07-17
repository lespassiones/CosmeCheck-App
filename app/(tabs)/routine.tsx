/**
 * RoutineScreen — onglet « Ma routine ».
 *
 * Écran ÉPURÉ : trois cartes résumé qui ouvrent chacune une page détail, plus
 * la chip « Mes restrictions ». Toute la gestion produits (sections matin/soir,
 * drag, conflits, suggestions) vit sur app/routine/produits.tsx.
 *
 * Cartes :
 *   1. Exposition cumulée      -> app/routine/exposition.tsx
 *   2. Ma routine soin         -> app/routine/produits.tsx (liste unifiée)
 */

import { type FC, useMemo } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { parseAnalyseResponse } from '@/lib/analysis/types'
import { computeRoutineMetrics, type RoutineProduct } from '@/lib/routine/engine'
import { decodeHtml } from '@/lib/decodeHtml'
import { useRoutine, type RoutineItem } from '@/hooks/useRoutine'
import { useProfile } from '@/hooks/useProfile'
import { useAppConfig } from '@/hooks/useAppConfig'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { Reveal } from '@/components/design/Reveal'
import { type BlobCounts } from '@/components/design/IngredientBlob'
import { ScreenHeader } from '@/components/shared/ScreenHeader'
import { ExposureSummaryCard } from '@/components/routine/ExposureSummaryCard'
import { RoutineProductsCard } from '@/components/routine/RoutineProductsCard'
import { GoalsCoverageCard } from '@/components/routine/GoalsCoverageCard'

function titleFor(item: RoutineItem): string {
  return decodeHtml(item.analysis?.product_label?.trim() || item.analysis?.name?.trim()) || 'Produit'
}

const RoutineScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const { items, isLoading } = useRoutine()
  const { restrictions } = useProfile()
  const { config: appConfig } = useAppConfig()
  const restrictionsCount = restrictions.families.length + restrictions.ingredients.length

  // Exposition : mêmes métriques que la page détail (dérivées du cache useRoutine).
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

  // Liste unifiée : simple compte de tous les produits de la routine.
  const total = useMemo(() => items.filter((it) => it.analysis).length, [items])

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <ScreenHeader
        title="Ma routine"
        titleAdornment={<Ionicons name="leaf-outline" size={20} color={colors.success} />}
      />
      <SafeAreaView style={styles.safe} edges={[]}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.rose} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 64 + spacing.xl }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.chipRow}>
              <RestrictionsChip count={restrictionsCount} />
            </View>

            <Reveal stagger={70}>
              <ExposureSummaryCard
                exposureScore={metrics.exposureScore}
                exposureLabel={metrics.exposureLabel}
                colorCounts={metrics.colorCounts as BlobCounts}
                empty={products.length === 0}
                onPress={() => router.push(ROUTES.ROUTINE.EXPOSITION)}
                showChevron
                style={styles.card}
              />

              <View style={styles.card}>
                <RoutineProductsCard
                  total={total}
                  morning={0}
                  evening={0}
                  showSlots={false}
                  iconImage={require('@/assets/icons/analyse/soin.png')}
                  emptyText="Ajoute tes produits pour suivre ton exposition cumulée"
                  onPress={() => router.push(ROUTES.ROUTINE.PRODUITS)}
                />
                <Text style={styles.cardLegend}>
                  Tous tes produits, reliés à ton exposition cumulée.
                </Text>
              </View>

              <View style={styles.card}>
                <GoalsCoverageCard />
              </View>
            </Reveal>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  )
}

/** Bouton « Mes restrictions » avec badge de compte → écran restrictions. */
function RestrictionsChip({ count }: { count: number }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.restrictChip, pressed && styles.restrictChipPressed]}
      onPress={() => router.push(ROUTES.PROFILE.RESTRICTIONS)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Mes restrictions"
    >
      <Ionicons name="shield-checkmark-outline" size={16} color={colors.accent} />
      <Text style={styles.restrictText}>Mes restrictions</Text>
      {count > 0 && (
        <View style={styles.restrictBadge}>
          <Text style={styles.restrictBadgeText}>{count}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={14} color={colors.accent} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  center: { paddingTop: spacing['3xl'], alignItems: 'center', flex: 1 },
  chipRow: { alignItems: 'flex-start', marginBottom: spacing.md },
  card: { marginBottom: spacing.base },
  cardLegend: {
    fontFamily: fontFamilies.regular,
    fontStyle: 'italic',
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkLight,
    paddingHorizontal: spacing.sm,
    marginTop: 6,
  },
  restrictChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  restrictChipPressed: { opacity: 0.7 },
  restrictText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.accent },
  restrictBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  restrictBadgeText: { fontFamily: fontFamilies.bold, fontSize: 10, color: '#FFFFFF' },
})

export default RoutineScreen
