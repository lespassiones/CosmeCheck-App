/**
 * RoutineItemScreen — sous-page d'un produit de la routine.
 *
 * Atteinte au tap sur une carte (les cartes sont désormais épurées : photo +
 * nom + marque + donut). Porte toute l'édition, sortie des cartes pour les
 * garder propres :
 *   - fréquence d'utilisation (quotidien / hebdo / mensuel) ;
 *   - voir l'analyse complète du produit ;
 *   - retirer de la routine.
 *
 * Pas de date d'utilisation / péremption (choix produit).
 */

import { type FC, useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { decodeHtml } from '@/lib/decodeHtml'
import { parseAnalyseResponse, type AnalyseResponse } from '@/lib/analysis/types'
import { useRoutine, type RoutineItem } from '@/hooks/useRoutine'
import { useProductImage } from '@/hooks/useProductImage'
import type { BlobCounts } from '@/components/design/IngredientBlob'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { PressableScale } from '@/components/design/motion'
import { Reveal } from '@/components/design/Reveal'
import { RoutineMiniDonut } from '@/components/routine/RoutineMiniDonut'
import { FrequencySelect } from '@/components/routine/FrequencySelect'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { displayTitle } from '@/lib/analysis/displayTitle'
import { runAfterModalClose, waitForModalClose } from '@/lib/navigation/afterModalClose'

function titleFor(item: RoutineItem): string {
  return decodeHtml(displayTitle(item.analysis ?? {}, '')) || 'Produit'
}

function countsOf(item: RoutineItem): BlobCounts | null {
  const parsed = item.analysis?.result_json
    ? (parseAnalyseResponse(item.analysis.result_json) as AnalyseResponse | null)
    : null
  const c = parsed?.counts
  return c ? { vert: c.vert, jaune: c.jaune, orange: c.orange, rouge: c.rouge } : null
}

function fallbackImage(item: RoutineItem): string | null {
  return item.analysis?.result_json && typeof item.analysis.result_json === 'object'
    ? ((item.analysis.result_json as { imageUrl?: string }).imageUrl ?? null)
    : null
}

const RoutineItemScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { items, isLoading, updateFrequency, removeFromRoutine } = useRoutine()

  const item = useMemo(() => items.find((it) => it.id === id) ?? null, [items, id])
  const imageUrl = useProductImage(
    item?.analysis_id ?? '',
    item?.analysis?.ean ?? null,
    item ? fallbackImage(item) : null,
  )

  const handleFrequency = useCallback(
    (f: RoutineItem['frequency']) => {
      if (item) void updateFrequency(item.id, f).catch(() => {})
    },
    [item, updateFrequency],
  )

  const [confirmOpen, setConfirmOpen] = useState(false)

  const confirmRemove = useCallback(() => {
    setConfirmOpen(false)
    if (!item) return
    // Retour et alerte APRÈS la sortie de la fenêtre de confirmation : l'écran
    // quittait la pile (ou l'alerte se présentait) pendant son fondu (iOS).
    void Promise.all([removeFromRoutine(item.id), waitForModalClose()])
      .then(() => {
        if (router.canGoBack()) router.back()
      })
      .catch(() =>
        runAfterModalClose(() => Alert.alert('Erreur', 'La suppression a échoué.')),
      )
  }, [item, removeFromRoutine])

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top']}>
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
          <Text style={styles.topTitle}>Réglages du produit</Text>
          <View style={styles.topSpacer} />
        </View>

        {isLoading && !item ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.rose} />
          </View>
        ) : !item ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.inkLight} />
            <Text style={styles.emptyText}>Ce produit n'est plus dans ta routine.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['3xl'] }]}
            showsVerticalScrollIndicator={false}
          >
            <Reveal stagger={70}>
            {/* ── Identité produit ── */}
            <View style={styles.hero}>
              <View style={styles.heroImageWrap}>
                {imageUrl ? (
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.heroImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={120}
                  />
                ) : (
                  <Ionicons name="flask-outline" size={28} color={colors.inkLight} />
                )}
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroName} numberOfLines={3}>
                  {titleFor(item)}
                </Text>
                {item.analysis?.brand ? (
                  <Text style={styles.heroBrand} numberOfLines={1}>
                    {item.analysis.brand}
                  </Text>
                ) : null}
              </View>
              <RoutineMiniDonut counts={countsOf(item)} size={44} />
            </View>

            {/* ── Fréquence : titre + contrôle segmenté pleine largeur ── */}
            <View style={styles.freqSection}>
              <Text style={styles.sectionTitle}>Fréquence</Text>
              <FrequencySelect value={item.frequency} onChange={handleFrequency} />
            </View>

            {/* ── Actions ── */}
            <PressableScale
              style={styles.primaryBtn}
              onPress={() => item.analysis && router.push(ROUTES.ANALYSE.DETAIL(item.analysis_id))}
              haptic="primary"
              accessibilityRole="button"
            >
              <Ionicons name="document-text-outline" size={16} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Voir l'analyse</Text>
            </PressableScale>

            <PressableScale
              style={styles.deleteBtn}
              onPress={() => setConfirmOpen(true)}
              haptic="secondary"
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={15} color={colors.rose} />
              <Text style={styles.deleteBtnText}>Retirer de ma routine</Text>
            </PressableScale>
            </Reveal>
          </ScrollView>
        )}
      </SafeAreaView>

      <ConfirmDialog
        visible={confirmOpen}
        title="Retirer ce produit ?"
        message="Il ne comptera plus dans ton exposition."
        confirmLabel="Retirer"
        cancelLabel="Annuler"
        destructive
        centered
        onConfirm={confirmRemove}
        onCancel={() => setConfirmOpen(false)}
      />
    </View>
  )
}

export default RoutineItemScreen

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  topTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  topSpacer: { width: 78 },
  content: { paddingHorizontal: spacing.base, paddingTop: spacing.xs },
  center: { paddingTop: spacing['3xl'], alignItems: 'center', flex: 1, gap: spacing.sm },
  emptyText: { ...typography.small, color: colors.inkMuted, textAlign: 'center' },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingRight: spacing.base,
    minHeight: 64 + spacing.base * 2,
    marginBottom: spacing.lg,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  // Visuel collé aux bords gauche, haut et bas de la carte (comme les cartes de
  // l'onglet routine) : il reprend l'ancienne marge pour que le texte ne bouge pas.
  heroImageWrap: {
    width: 64 + spacing.base,
    alignSelf: 'stretch',
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    backgroundColor: colors.gray50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // En absolu : la photo remplit la zone sans jamais dicter la hauteur de la
  // carte (sinon sa hauteur naturelle étire toute la carte).
  heroImage: StyleSheet.absoluteFillObject,
  heroText: { flex: 1, paddingVertical: spacing.base },
  heroName: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  heroBrand: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.inkMuted, marginTop: 1 },
  freqSection: { gap: spacing.md, marginBottom: spacing.xl },
  sectionTitle: { fontFamily: fontFamilies.bold, fontSize: 20, color: colors.ink },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.success,
    borderRadius: radius.full,
    paddingVertical: 13,
    marginBottom: spacing.sm,
  },
  primaryBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: '#FFFFFF' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  deleteBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.rose },
})

// Erreur de rendu : seule cette page est remplacée (pas toute l'app).
export { RouteErrorBoundary as ErrorBoundary } from '@/components/shared/RouteErrorBoundary'
