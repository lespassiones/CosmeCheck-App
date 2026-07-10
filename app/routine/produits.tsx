/**
 * ProduitsScreen — page détail « Ma routine soin » (kind = 'routine').
 *
 * Ne montre QUE les soins visage. Les « Produits du quotidien » (kind =
 * 'staple') vivent sur `/routine/quotidien`.
 *
 * Cartes ÉPURÉES (photo + nom + marque + donut) : toute l'édition (fréquence,
 * créneau, déplacement, suppression, voir l'analyse) se fait sur la sous-page
 * de l'item (/routine/item/[id]), atteinte au tap. Drag = appui long.
 *
 * Actions : « Suggestions » -> chooser :
 *   - Réorganiser ma routine : IA (1 crédit) place chaque soin matin/soir puis
 *     anime (fallback moteur local si l'IA échoue).
 *   - Proposer de meilleures alternatives : deck (hook useAlternativesDeck).
 */

import { type FC, useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography, fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { supabase } from '@/lib/supabase/client'
import { decodeHtml } from '@/lib/decodeHtml'
import { parseAnalyseResponse, type AnalyseResponse } from '@/lib/analysis/types'
import { useRoutine, type RoutineItem } from '@/hooks/useRoutine'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useAlternativesDeck } from '@/hooks/useAlternativesDeck'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { AddProductModal } from '@/components/routine/AddProductModal'
import { SuggestionsDeck } from '@/components/routine/SuggestionsDeck'
import { SuggestionsLoadingOverlay } from '@/components/routine/SuggestionsLoadingOverlay'
import {
  RoutineSectionList,
  type RoutineSectionListHandle,
} from '@/components/routine/RoutineSectionList'
import { RoutineActionsRow } from '@/components/routine/RoutineActionsRow'
import { SuggestionsChooserSheet } from '@/components/routine/SuggestionsChooserSheet'
import { showToast } from '@/components/shared/Toast'

function titleFor(item: RoutineItem): string {
  return decodeHtml(item.analysis?.product_label?.trim() || item.analysis?.name?.trim()) || 'Produit'
}

const ProduitsScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const { items, isLoading, addToRoutine, reorderItems, isInRoutine } = useRoutine()
  const { config: appConfig } = useAppConfig()
  const qc = useQueryClient()

  // Cette page ne pilote QUE les soins (kind = 'routine').
  const routineItems = useMemo(() => items.filter((it) => it.kind === 'routine'), [items])
  const usableCount = routineItems.filter((it) => it.analysis).length

  const [addOpen, setAddOpen] = useState(false)
  const [chooserOpen, setChooserOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [reorganizing, setReorganizing] = useState(false)
  const sectionListRef = useRef<RoutineSectionListHandle>(null)

  const deck = useAlternativesDeck(routineItems)

  const handleAddFromHistory = useCallback(
    async (analysisId: string, kind: RoutineItem['kind']) => {
      try {
        await addToRoutine(analysisId, 'daily', kind)
        setAddOpen(false)
      } catch {
        Alert.alert('Erreur', "Impossible d'ajouter ce produit à la routine.")
      }
    },
    [addToRoutine],
  )

  // Réorganisation par IA (1 crédit) : produits + profil -> matin/soir par
  // produit -> applyPlacements (animation). Fallback local si l'IA échoue.
  const handleReorganize = useCallback(async () => {
    if (reorganizing) return
    setReorganizing(true)
    try {
      const payload = routineItems
        .filter((it) => it.analysis)
        .map((it) => {
          const parsed = it.analysis?.result_json
            ? (parseAnalyseResponse(it.analysis.result_json) as AnalyseResponse | null)
            : null
          const inci = Array.isArray(parsed?.items) ? parsed!.items : []
          return {
            itemId: it.id,
            name: titleFor(it),
            category: it.analysis?.category_precise ?? it.analysis?.category ?? null,
            ingredients: inci
              .slice(0, 40)
              .map((x) => x.name || x.input || x.slug)
              .filter(Boolean),
          }
        })
      if (payload.length === 0) {
        showToast('Ajoute des produits pour organiser ta routine.', 'info')
        return
      }

      const { data, error } = await supabase.functions.invoke('routine-organize-ai', {
        body: { products: payload },
      })
      if (error) throw error
      const resp = (data ?? {}) as {
        ok?: boolean
        locked?: boolean
        placements?: { itemId: string; timeOfDay: 'morning' | 'evening' }[]
      }
      if (resp.locked) {
        showToast('Crédits épuisés pour aujourd’hui.', 'info')
        router.push(ROUTES.OFFRE.INDEX)
        return
      }
      void qc.invalidateQueries({ queryKey: ['credits'] })
      const placements = Array.isArray(resp.placements) ? resp.placements : []
      if (placements.length === 0) throw new Error('empty')

      const moved = sectionListRef.current?.applyPlacements(placements) ?? 0
      showToast(
        moved > 0
          ? moved === 1
            ? '1 produit replacé ✨'
            : `${moved} produits replacés ✨`
          : 'Ta routine est déjà bien organisée.',
        moved > 0 ? 'success' : 'info',
      )
    } catch {
      const moved = sectionListRef.current?.reorganize() ?? 0
      showToast(
        moved > 0 ? 'Routine réorganisée ✨' : 'Réorganisation indisponible. Réessaie.',
        moved > 0 ? 'success' : 'error',
      )
    } finally {
      setReorganizing(false)
    }
  }, [reorganizing, routineItems, qc])

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
          <Text style={styles.topTitle}>Ma routine soin</Text>
          <View style={styles.topSpacer} />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.rose} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['3xl'] }]}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!dragging}
          >
            <Pressable
              style={styles.addBtn}
              onPress={() => setAddOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Ajouter un produit"
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Ajouter un produit</Text>
            </Pressable>

            {usableCount === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="sparkles-outline" size={40} color={colors.inkLight} />
                <Text style={styles.emptyText}>
                  Ta routine est vide. Ajoute des soins pour les organiser matin et soir.
                </Text>
              </View>
            ) : (
              <>
                <RoutineSectionList
                  ref={sectionListRef}
                  items={routineItems}
                  onPressItem={(itemId) =>
                    router.push({ pathname: '/routine/item/[id]', params: { id: itemId } })
                  }
                  reorderItems={reorderItems}
                  onDragStateChange={setDragging}
                />

                <RoutineActionsRow
                  conflictsEnabled={false}
                  conflictCount={0}
                  onCheckConflicts={() => {}}
                  suggestionsEnabled={appConfig.flag_suggestions || appConfig.flag_routine_reorganize}
                  onOpenSuggestions={() => setChooserOpen(true)}
                />
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <AddProductModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onOpenScanner={() => router.push(ROUTES.TABS.SCAN)}
        onSelectFromHistory={handleAddFromHistory}
        isInRoutine={isInRoutine}
        presetKind="routine"
      />

      <SuggestionsChooserSheet
        visible={chooserOpen}
        onClose={() => setChooserOpen(false)}
        reorganizeEnabled={appConfig.flag_routine_reorganize}
        alternativesEnabled={appConfig.flag_suggestions}
        alternativesLoading={deck.deckLoading || reorganizing}
        onReorganize={handleReorganize}
        onAlternatives={deck.openSuggestions}
      />

      <SuggestionsLoadingOverlay visible={deck.deckLoading && !deck.deckOpen} />
      <SuggestionsLoadingOverlay visible={reorganizing} message="Réorganisation de ta routine…" />

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
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    gap: spacing.sm,
  },
  emptyText: { ...typography.small, color: colors.inkMuted, textAlign: 'center' },
})
