/**
 * Page « Voir plus » des recommandations du Beauty Advisor.
 *
 * Reçoit les critères (ingredients CSV + form) via les params, récupère jusqu'à
 * 50 produits sûrs (filtrés restrictions), et les affiche en grille paginée
 * (10, puis +10…). Clic sur un produit → analyse. Retour → revient dans la
 * conversation (l'écran advisor reste monté dans la pile).
 */
import { useEffect, useMemo, useState, type FC } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { ProcessingOverlay } from '@/components/shared/ProcessingOverlay'
import { CatalogPastille } from '@/components/shared/CatalogPastille'
import { useProfile } from '@/hooks/useProfile'
import { useLaunchAlternative } from '@/hooks/useLaunchAlternative'
import { fetchAdvisorRecommendations } from '@/lib/advisor/recommendations'
import { prefetchProductsAnalyses } from '@/lib/analysis/eanAnalysisPrefetch'
import { applyColorCap, scoreLabelFromScore } from '@/lib/analysis/scoreCap'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'

const PAGE = 10

const GridCard: FC<{
  product: AlternativeProduct
  disabled: boolean
  onPress: () => void
}> = ({ product, disabled, onPress }) => {
  const displayScore =
    product.score != null
      ? applyColorCap(product.score, product.countOrange, product.countRouge)
      : null
  const displayLabel =
    displayScore != null ? scoreLabelFromScore(displayScore) : product.scoreLabel
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.card, pressed && !disabled && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${product.name ?? 'Produit'}${product.brand ? `, ${product.brand}` : ''}`}
    >
      <View style={styles.imageWrap}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.image} contentFit="contain" cachePolicy="memory-disk" transition={120} />
        ) : (
          <Ionicons name="image-outline" size={30} color={colors.inkLight} />
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {product.name ?? 'Produit'}
      </Text>
      {product.brand ? (
        <Text style={styles.brand} numberOfLines={1}>
          {product.brand}
        </Text>
      ) : null}
      <View style={styles.scoreRow}>
        <CatalogPastille score={displayScore} size={18} />
        {displayLabel ? (
          <Text style={styles.scoreLabel} numberOfLines={1}>
            {displayLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

const AdvisorRecommendationsScreen: FC = () => {
  const params = useLocalSearchParams<{ ingredients?: string; form?: string; exclude?: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const { restrictions, skin } = useProfile()
  const { analyze, isAnalyzing } = useLaunchAlternative()

  const ingredients = useMemo(
    () => (params.ingredients ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    [params.ingredients],
  )
  const form = params.form && params.form.length > 0 ? params.form : null
  const exclude = useMemo(
    () => (params.exclude ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    [params.exclude],
  )

  const [all, setAll] = useState<AlternativeProduct[]>([])
  const [rawCount, setRawCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchAdvisorRecommendations({
      ingredients,
      form,
      exclude,
      restrictions,
      allergiesFreeform: skin.allergiesFreeform,
      limit: 50,
      fetchLimit: 50,
    })
      .then((res) => {
        if (!cancelled) {
          // La page « Voir plus » montre le set strict ; à défaut, le compromis relâché.
          const shownProducts = res.products.length > 0 ? res.products : (res.relaxation?.products ?? [])
          setAll(shownProducts)
          setRawCount(res.rawCount)
          // Préchargement lecture seule des premiers produits visibles (clic instantané).
          prefetchProductsAnalyses(qc, shownProducts.map((p) => p.ean), 8)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ingredients, params.form, params.exclude, restrictions])

  const back = () => {
    if (router.canGoBack()) router.back()
    else router.replace(ROUTES.ADVISOR.INDEX)
  }

  const visible = all.slice(0, shown)
  const hasMore = shown < all.length

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <BackgroundGlow variant="minimal" />

      <View style={styles.topBar}>
        <Pressable onPress={back} style={styles.backPill} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={18} color={colors.ink} />
          <Text style={styles.backText}>Retour</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>Produits recommandés</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {rawCount > 0
              ? 'Des produits correspondaient, mais aucun ne respecte tes restrictions actuelles. Assouplis-les dans ton profil pour voir des suggestions.'
              : 'Aucun produit sûr ne correspond à ce besoin. Reformule ta demande.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.ean}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <GridCard product={item} disabled={isAnalyzing} onPress={() => void analyze(item)} />
          )}
          ListFooterComponent={
            hasMore ? (
              <Pressable
                onPress={() => setShown((n) => n + PAGE)}
                style={({ pressed }) => [styles.moreBtn, pressed && styles.moreBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Voir plus de produits"
              >
                <Text style={styles.moreText}>Voir plus</Text>
              </Pressable>
            ) : null
          }
        />
      )}

      <ProcessingOverlay visible={isAnalyzing} message="On décode la composition…" />
    </SafeAreaView>
  )
}

export default AdvisorRecommendationsScreen

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: spacing.base, paddingTop: spacing.sm },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backText: { ...typography.smallSemiBold, color: colors.ink },
  title: { ...typography.h2, color: colors.ink, paddingHorizontal: spacing.base, marginTop: spacing.sm, marginBottom: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { ...typography.small, color: colors.inkMuted, textAlign: 'center' },
  listContent: { paddingHorizontal: spacing.base, paddingBottom: spacing.xl, gap: spacing.md },
  column: { gap: spacing.md },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 4,
  },
  cardPressed: { opacity: 0.7 },
  imageWrap: {
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 4,
  },
  image: { width: '100%', height: '100%' },
  name: { ...typography.smallSemiBold, color: colors.ink },
  brand: { ...typography.xs, color: colors.inkMuted },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  scoreLabel: { ...typography.xs, color: colors.inkMuted, flexShrink: 1 },
  moreBtn: {
    marginTop: spacing.base,
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  moreBtnPressed: { opacity: 0.7 },
  moreText: { ...typography.smallSemiBold, color: colors.accent },
})
