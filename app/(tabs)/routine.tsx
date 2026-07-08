/**
 * RoutineScreen — onglet « Ma routine ».
 *
 * Écran ÉPURÉ : trois cartes résumé qui ouvrent chacune une page détail, plus
 * la chip « Mes restrictions ». Toute la gestion produits (sections matin/soir,
 * drag, conflits, suggestions) vit sur app/routine/produits.tsx.
 *
 * Cartes :
 *   1. Exposition cumulée      -> app/routine/exposition.tsx
 *   2. Ma routine soin         -> app/routine/produits.tsx (kind = 'routine')
 *   3. Produits du quotidien   -> app/routine/quotidien.tsx (kind = 'staple')
 *   4. Score de peau           -> app/peau/index.tsx (si flag_skin_score)
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
import { SkinScoreCard } from '@/components/peau/SkinScoreCard'

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

  // Split par bucket. Routine soin : répartition matin / soir (un 'both' compte
  // des deux côtés). Quotidien (staples) : simple compte.
  const { total, morning, evening, stapleCount } = useMemo(() => {
    const usable = items.filter((it) => it.analysis)
    const soin = usable.filter((it) => it.kind !== 'staple')
    return {
      total: soin.length,
      morning: soin.filter((it) => it.time_of_day !== 'evening').length,
      evening: soin.filter((it) => it.time_of_day !== 'morning').length,
      stapleCount: usable.filter((it) => it.kind === 'staple').length,
    }
  }, [items])

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
                  morning={morning}
                  evening={evening}
                  iconImage={require('@/assets/icons/analyse/soin.png')}
                  onPress={() => router.push(ROUTES.ROUTINE.PRODUITS)}
                />
                <Text style={styles.cardLegend}>
                  Tes soins visage, suivis matin et soir et reliés à ton score de peau.
                </Text>
              </View>

              <View style={styles.card}>
                <RoutineProductsCard
                  total={stapleCount}
                  morning={0}
                  evening={0}
                  showSlots={false}
                  title="Produits du quotidien"
                  iconImage={require('@/assets/icons/analyse/quotidien.png')}
                  emptyText="Déo, dentifrice, gel douche... garde tes essentiels ici"
                  onPress={() => router.push(ROUTES.ROUTINE.QUOTIDIEN)}
                />
                <Text style={styles.cardLegend}>
                  Tes essentiels d'hygiène (déo, dentifrice, gel douche...), en simple liste sans
                  matin ni soir.
                </Text>
              </View>

              {appConfig.flag_skin_score && (
                <View style={styles.card}>
                  <SkinScoreCard />
                </View>
              )}
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
