/**
 * AddProductModal — feuille modale « Ajouter un produit à ma routine ».
 *
 * Port mobile de AddProductButton + AddProductChoiceModal (web). Deux modes :
 *   - 'choice' : deux options (analyser un nouveau produit / choisir dans
 *     l'historique).
 *   - 'history' : liste recherchable des analyses NON déjà présentes dans la
 *     routine ; tap → onSelectFromHistory(analysisId) (la mère ajoute via
 *     useRoutine().addToRoutine).
 *
 * Le mode « nouveau produit » ferme la modale et appelle onOpenScanner() (la
 * mère navigue vers l'onglet Scan). Le flux d'ajout-après-scan côté web
 * (sessionStorage) n'a pas d'équivalent tant que le scan n'est pas câblé :
 * dégradation propre, l'utilisateur ajoute depuis l'historique après analyse.
 */

import { memo, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { db } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { parseAnalyseResponse } from '@/lib/analysis/types'
import { RoutineMiniDonut } from '@/components/routine/RoutineMiniDonut'
import type { BlobCounts } from '@/components/design/IngredientBlob'
import { SearchBar } from '@/components/shared/SearchBar'

interface AnalysisRow {
  id: string
  name: string | null
  product_label: string | null
  category: string | null
  score: number | null
  result_json: unknown
  created_at: string
}

function countsFor(row: AnalysisRow): BlobCounts | null {
  // Proportions d'ingrédients par couleur (donut) — jamais de note chiffrée.
  const c = parseAnalyseResponse(row.result_json)?.counts
  return c ? { vert: c.vert, jaune: c.jaune, orange: c.orange, rouge: c.rouge } : null
}

function titleFor(row: AnalysisRow): string {
  return row.product_label?.trim() || row.name?.trim() || 'Analyse'
}

interface Props {
  visible: boolean
  onClose: () => void
  onOpenScanner: () => void
  /** Appelée avec l'id d'analyse choisi. */
  onSelectFromHistory: (analysisId: string) => void
  /** True si l'analyse est déjà dans la routine (pour exclure les doublons). */
  isInRoutine: (analysisId: string) => boolean
}

export const AddProductModal = memo(function AddProductModal({
  visible,
  onClose,
  onOpenScanner,
  onSelectFromHistory,
  isInRoutine,
}: Props) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [mode, setMode] = useState<'choice' | 'history'>('choice')
  const [search, setSearch] = useState('')
  const [addingId, setAddingId] = useState<string | null>(null)

  const { data: rows = [], isLoading } = useQuery<AnalysisRow[]>({
    queryKey: ['routine-eligible-analyses', userId],
    enabled: Boolean(userId) && visible && mode === 'history',
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await db()
        .from('analyses')
        .select('id,name,product_label,category,score,result_json,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data as AnalysisRow[] | null) ?? []
    },
  })

  const eligible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter((r) => !isInRoutine(r.id))
      .filter((r) => (q ? titleFor(r).toLowerCase().includes(q) : true))
  }, [rows, search, isInRoutine])

  const close = () => {
    setMode('choice')
    setSearch('')
    setAddingId(null)
    onClose()
  }

  const handleSelect = (id: string) => {
    setAddingId(id)
    onSelectFromHistory(id)
    // La mère ferme la modale après la mutation ; on remet l'état au cas où.
    setTimeout(() => setAddingId(null), 1200)
  }

  const renderItem = ({ item }: { item: AnalysisRow }) => (
    <Pressable
      style={styles.histItem}
      onPress={() => handleSelect(item.id)}
      disabled={addingId !== null}
    >
      <View style={styles.histMain}>
        <Text style={styles.histTitle} numberOfLines={1}>
          {titleFor(item)}
        </Text>
      </View>
      <RoutineMiniDonut counts={countsFor(item)} size={30} />
      {addingId === item.id ? (
        <ActivityIndicator size="small" color={colors.rose} />
      ) : (
        <Ionicons name="add-circle" size={22} color={colors.rose} />
      )}
    </Pressable>
  )

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            {mode === 'history' ? (
              <Pressable
                onPress={() => setMode('choice')}
                hitSlop={8}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Retour"
              >
                <Ionicons name="chevron-back" size={20} color={colors.inkMuted} />
              </Pressable>
            ) : (
              <View style={styles.backBtn} />
            )}
            <Text style={styles.title}>Ajouter à ma routine</Text>
            <Pressable onPress={close} hitSlop={8} style={styles.backBtn}>
              <Ionicons name="close" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>

          {mode === 'choice' ? (
            <View style={styles.choices}>
              <Pressable
                style={styles.choiceCard}
                onPress={() => {
                  close()
                  onOpenScanner()
                }}
              >
                <View style={[styles.choiceIcon, { backgroundColor: colors.roseSoft }]}>
                  <Ionicons name="camera-outline" size={24} color={colors.rose} />
                </View>
                <View style={styles.choiceText}>
                  <Text style={styles.choiceTitle}>Analyser un nouveau produit</Text>
                  <Text style={styles.choiceDesc}>
                    Scanne ou colle une composition à analyser.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
              </Pressable>

              <Pressable style={styles.choiceCard} onPress={() => setMode('history')}>
                <View style={[styles.choiceIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="time-outline" size={24} color={colors.accent} />
                </View>
                <View style={styles.choiceText}>
                  <Text style={styles.choiceTitle}>Choisir dans mon historique</Text>
                  <Text style={styles.choiceDesc}>
                    Ajoute une analyse déjà réalisée, sans la refaire.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.historyWrap}>
              <View style={styles.searchWrap}>
                <SearchBar
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Rechercher une analyse…"
                />
              </View>
              {isLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator color={colors.rose} />
                </View>
              ) : eligible.length === 0 ? (
                <View style={styles.center}>
                  <Ionicons name="albums-outline" size={36} color={colors.inkLight} />
                  <Text style={styles.emptyText}>
                    {search.trim()
                      ? 'Aucune analyse ne correspond.'
                      : 'Aucune analyse disponible à ajouter.'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={eligible}
                  keyExtractor={(item) => item.id}
                  renderItem={renderItem}
                  ItemSeparatorComponent={() => <View style={styles.sep} />}
                  contentContainerStyle={styles.histList}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>
          )}
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
    maxHeight: '82%',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fontFamilies.bold, fontSize: 16, color: colors.ink },
  choices: { padding: spacing.lg, gap: spacing.md },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
  },
  choiceIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: { flex: 1 },
  choiceTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  choiceDesc: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkMuted,
    marginTop: 2,
  },
  historyWrap: { paddingTop: spacing.md, minHeight: 280 },
  searchWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  histList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  histItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  histMain: { flex: 1 },
  histTitle: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: colors.ink },
  sep: { height: 1, backgroundColor: colors.border },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing['3xl'], gap: spacing.sm },
  emptyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkMuted,
    textAlign: 'center',
  },
})
