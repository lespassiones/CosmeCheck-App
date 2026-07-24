/**
 * Page « Voir tout » des alternatives — grille paginée façon Yuka.
 *
 * Reçoit l'EAN du produit courant en paramètre (résolu en amont par le
 * carrousel), affiche d'abord 15 recommandations puis « Voir plus » charge les
 * 10 suivantes (et ainsi de suite). Même filtrage restrictions/profil et même
 * pastille que le carrousel (via useAlternatives + CatalogPastille).
 */
import { type FC } from 'react'
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

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { PressableScale, StaggerItem } from '@/components/design/motion'
import { ProcessingOverlay } from '@/components/shared/ProcessingOverlay'
import { CatalogPastille } from '@/components/shared/CatalogPastille'
import { useAlternatives } from '@/hooks/useAlternatives'
import { useLaunchAlternative } from '@/hooks/useLaunchAlternative'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'
import { applyColorCap, scoreLabelFromScore } from '@/lib/analysis/scoreCap'

const INITIAL_COUNT = 15
const STEP = 10

const GridCard: FC<{
  product: AlternativeProduct
  disabled: boolean
  onPress: () => void
}> = ({ product, disabled, onPress }) => {
  // Plancher couleur : note affichée = celle qu'on verra au clic (cohérence).
  const displayScore =
    product.score != null
      ? applyColorCap(product.score, product.countOrange, product.countRouge)
      : null
  const displayLabel =
    displayScore != null ? scoreLabelFromScore(displayScore) : product.scoreLabel
  return (
  <PressableScale
    onPress={onPress}
    disabled={disabled}
    style={styles.card}
    accessibilityRole="button"
    accessibilityLabel={`${product.name ?? 'Produit'}${product.brand ? `, ${product.brand}` : ''}`}
  >
    <View style={styles.imageWrap}>
      {product.imageUrl ? (
        <Image
          source={{ uri: product.imageUrl }}
          style={styles.image}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={120}
        />
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
  </PressableScale>
  )
}

const AlternativesScreen: FC = () => {
  const { ean } = useLocalSearchParams<{ ean: string }>()
  const router = useRouter()
  const { analyze, isAnalyzing } = useLaunchAlternative()
  const { products, isInitialLoading, isLoadingMore, hasMore, isEmpty, loadMore } =
    useAlternatives({ ean, initialCount: INITIAL_COUNT, step: STEP })

  const back = () => {
    if (router.canGoBack()) router.back()
    else router.replace(ROUTES.TABS.HOME)
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <BackgroundGlow variant="minimal" />

      <View style={styles.topBar}>
        <Pressable onPress={back} style={styles.backPill} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={18} color={colors.ink} />
          <Text style={styles.backText}>Retour</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>Alternatives</Text>

      {isInitialLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.rose} />
        </View>
      ) : isEmpty || products.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            Aucune alternative sans tes restrictions dans cette catégorie pour le moment.
          </Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.ean}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <StaggerItem index={index} style={styles.cell}>
              <GridCard product={item} disabled={isAnalyzing} onPress={() => void analyze(item)} />
            </StaggerItem>
          )}
          ListFooterComponent={
            hasMore ? (
              <PressableScale
                onPress={loadMore}
                disabled={isLoadingMore}
                style={styles.moreBtn}
                accessibilityRole="button"
                accessibilityLabel="Voir plus d'alternatives"
              >
                {isLoadingMore ? (
                  <ActivityIndicator color={colors.rose} />
                ) : (
                  <Text style={styles.moreText}>Voir plus</Text>
                )}
              </PressableScale>
            ) : null
          }
        />
      )}

      <ProcessingOverlay visible={isAnalyzing} message="On décode la composition…" />
    </SafeAreaView>
  )
}

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
  title: {
    ...typography.h2,
    color: colors.ink,
    paddingHorizontal: spacing.base,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
  listContent: { paddingHorizontal: spacing.base, paddingBottom: spacing.xl, gap: spacing.md },
  column: { gap: spacing.md },
  // Cellule de grille : le wrapper animé doit garder le flex de la carte.
  cell: { flex: 1 },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 4,
  },
  imageWrap: {
    height: 130,
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
    marginTop: spacing.lg,
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rose,
    minWidth: 160,
    alignItems: 'center',
  },
  moreText: { ...typography.smallSemiBold, color: colors.roseDeep },
})

export default AlternativesScreen
