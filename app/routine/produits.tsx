/**
 * ProduitsScreen — page détail « Ma routine soin ».
 *
 * Liste UNIFIÉE (juil 2026) : tous les produits de la routine (soins visage,
 * hygiène du quotidien…) sont dans une seule liste, sans distinction de bloc et
 * sans axe matin / soir. Parité avec le web (liste simple ordonnée par ajout).
 *
 * Cartes ÉPURÉES (photo + nom + marque + donut) : toute l'édition (fréquence,
 * suppression, voir l'analyse) se fait sur la sous-page de l'item
 * (/routine/item/[id]), atteinte au tap.
 *
 * Action unique « Proposer de meilleures alternatives » (deck via
 * useAlternativesDeck) : la logique du deck est INCHANGÉE.
 */

import { type FC, useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography, fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { decodeHtml } from '@/lib/decodeHtml'
import { parseAnalyseResponse, type AnalyseResponse } from '@/lib/analysis/types'
import { useRoutine, type RoutineItem } from '@/hooks/useRoutine'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useAlternativesDeck } from '@/hooks/useAlternativesDeck'
import type { BlobCounts } from '@/components/design/IngredientBlob'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { StaggerItem } from '@/components/design/motion'
import { Reveal } from '@/components/design/Reveal'
import { AddProductModal } from '@/components/routine/AddProductModal'
import { RoutineProductCard, ROUTINE_CARD_GAP } from '@/components/routine/RoutineProductCard'
import { SuggestionsDeck } from '@/components/routine/SuggestionsDeck'
import { SuggestionsLoadingOverlay } from '@/components/routine/SuggestionsLoadingOverlay'

function titleFor(item: RoutineItem): string {
  return decodeHtml(item.analysis?.product_label?.trim() || item.analysis?.name?.trim()) || 'Produit'
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

const ProduitsScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const { items, isLoading, addToRoutine, isInRoutine } = useRoutine()
  const { config: appConfig } = useAppConfig()

  const [addOpen, setAddOpen] = useState(false)

  // Liste unifiée : tous les produits de la routine (analyse jointe présente).
  const routineItems = useMemo(() => items.filter((it) => it.analysis), [items])

  const deck = useAlternativesDeck(routineItems)

  const handleAddFromHistory = useCallback(
    async (analysisId: string) => {
      try {
        await addToRoutine(analysisId, 'daily')
        setAddOpen(false)
      } catch {
        Alert.alert('Erreur', "Impossible d'ajouter ce produit à la routine.")
      }
    },
    [addToRoutine],
  )

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
          <Text style={styles.topTitle}>Routine produit</Text>
          <View style={styles.topSpacer} />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.rose} />
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.content, { paddingBottom: spacing.xl }]}
            showsVerticalScrollIndicator={false}
          >
            <Reveal>
              <Pressable
                style={styles.addBtn}
                onPress={() => setAddOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Ajouter un produit"
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.addBtnText}>Ajouter un produit</Text>
              </Pressable>
            </Reveal>

            {routineItems.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="sparkles-outline" size={40} color={colors.inkLight} />
                <Text style={styles.emptyText}>
                  Ta routine est vide. Ajoute des produits pour suivre ton exposition cumulée.
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {routineItems.map((item, index) => (
                  <StaggerItem key={item.id} index={index}>
                    <RoutineProductCard
                      itemId={item.id}
                      analysisId={item.analysis_id}
                      displayIndex={0}
                      name={titleFor(item)}
                      brand={item.analysis?.brand ?? null}
                      ean={item.analysis?.ean ?? null}
                      fallbackImageUrl={fallbackImage(item)}
                      counts={countsOf(item)}
                      onPress={(itemId) =>
                        router.push({ pathname: '/routine/item/[id]', params: { id: itemId } })
                      }
                    />
                  </StaggerItem>
                ))}
              </View>
            )}
          </ScrollView>
        )}

        {/* Barre d'action fixe : toujours visible (hors scroll). Bouton alternatives
            (vert) + lien « Voir mes favoris » juste en dessous. */}
        {!isLoading && routineItems.length > 0 && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
            {appConfig.flag_suggestions && (
              <Pressable
                style={styles.suggestBtn}
                onPress={deck.openSuggestions}
                disabled={deck.deckLoading}
                accessibilityRole="button"
                accessibilityLabel="Proposer de meilleures alternatives"
              >
                {deck.deckLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                    <Text style={styles.suggestBtnText}>Proposer de meilleures alternatives</Text>
                  </>
                )}
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push(ROUTES.ROUTINE.FAVORIS)}
              hitSlop={8}
              style={styles.favLinkWrap}
              accessibilityRole="link"
              accessibilityLabel="Voir mes favoris"
            >
              <Text style={styles.favLink}>Voir mes favoris</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>

      <AddProductModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onOpenScanner={() => router.push(ROUTES.TABS.SCAN)}
        onSelectFromHistory={handleAddFromHistory}
        isInRoutine={isInRoutine}
      />

      <SuggestionsLoadingOverlay visible={deck.deckLoading && !deck.deckOpen} />

      <SuggestionsDeck
        visible={deck.deckOpen}
        suggestions={deck.deck}
        keepingKey={deck.keepingKey}
        comparingKey={deck.comparingKey}
        keptKeys={deck.keptKeys}
        onClose={deck.closeDeck}
        onKeep={deck.handleKeep}
        onCompare={deck.handleCompare}
        onOpenAlternative={deck.handleOpenAlternative}
      />
    </View>
  )
}

export default ProduitsScreen

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
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  center: { paddingTop: spacing['3xl'], alignItems: 'center', flex: 1 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.success,
    borderRadius: radius.full,
    paddingVertical: 10,
    marginBottom: spacing.base,
  },
  addBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: '#FFFFFF' },
  list: { gap: ROUTINE_CARD_GAP },
  // Barre d'action fixe collée au bas de l'écran (hors ScrollView).
  footer: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#c5ccd6',
  },
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.success,
    borderRadius: radius.full,
    paddingVertical: 13,
    minHeight: 46,
  },
  suggestBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: '#FFFFFF' },
  favLinkWrap: { alignSelf: 'center', paddingVertical: spacing.sm, marginTop: 2 },
  favLink: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: colors.success,
    textDecorationLine: 'underline',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    gap: spacing.sm,
  },
  emptyText: { ...typography.small, color: colors.inkMuted, textAlign: 'center' },
})
