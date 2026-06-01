/**
 * HistoryScreen — onglet Historique.
 *
 * Twin RN de app/history/page.tsx + components/history/* (CosmetWiki).
 *
 * - Liste les 50 dernières analyses de l'utilisateur (demi-donut + score + date).
 * - Recherche par nom de produit OU par ingrédient (tokens issus de result_json).
 * - Mode "Comparer 2 analyses" : sélection de max 2 (remplace la plus ancienne),
 *   CTA → /compare?ids=a,b.
 * - Feuille d'actions par ligne : renommer (update analyses.name) / supprimer
 *   (delete analyses), via une Modal bottom-sheet.
 * - CTA par ligne "Analyser la promesse" → /promesses/{coherenceId} si une
 *   analyse de cohérence existe déjà, sinon /promesses/nouvelle.
 */

import { type FC, useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { db } from '@/lib/supabase/client'
import {
  parseAnalyseResponse,
  toneToColorRating,
  getColorRatingFromScore,
  type ColorRating,
} from '@/lib/analysis/types'
import { categoryLabel, type ProductCategory } from '@/lib/categoryLabel'
import { useAuth } from '@/hooks/useAuth'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { SearchBar } from '@/components/shared/SearchBar'
import { HistoryRowCard, type HistoryItemView } from '@/components/history/HistoryRowCard'
import { HistoryItemActions } from '@/components/history/HistoryItemActions'

interface AnalysisRow {
  id: string
  name: string | null
  product_label: string | null
  score: number | null
  result_json: unknown
  category: string | null
  created_at: string
}

interface CoherenceRow {
  id: string
  analysis_id: string
  created_at: string
}

/** Modèle de vue enrichi consommé par la liste + filtrage. */
interface HistoryItem extends HistoryItemView {
  /** Tokens (nom produit + ingrédients) pour la recherche, déjà en minuscules. */
  searchTokens: string[]
  /** Nom brut (pour pré-remplir le champ "Renommer"). */
  rawName: string
}

type CountsTuple = { vert: number; jaune: number; orange: number; rouge: number }

function emptyCounts(): CountsTuple {
  return { vert: 0, jaune: 0, orange: 0, rouge: 0 }
}

function buildItem(row: AnalysisRow, latestCoherenceId: string | null): HistoryItem {
  const parsed = parseAnalyseResponse(row.result_json)

  const rating: ColorRating = parsed
    ? toneToColorRating(parsed.scoreTone)
    : getColorRatingFromScore(row.score ?? 0)

  const counts: CountsTuple = parsed
    ? {
        vert: parsed.counts.vert ?? 0,
        jaune: parsed.counts.jaune ?? 0,
        orange: parsed.counts.orange ?? 0,
        rouge: parsed.counts.rouge ?? 0,
      }
    : emptyCounts()

  // Tokens de recherche : nom + label + chaque ingrédient (name + input brut).
  const tokenSet = new Set<string>()
  const pushToken = (raw: string | null | undefined) => {
    const t = (raw ?? '').trim().toLowerCase()
    if (t) tokenSet.add(t)
  }
  pushToken(row.name)
  pushToken(row.product_label)
  if (parsed) {
    for (const it of parsed.items) {
      pushToken(it.name)
      pushToken(it.input)
    }
  }

  const productType = parsed?.productType ?? null
  const rawCategory = (parsed?.category ?? row.category) as ProductCategory | null
  const category = categoryLabel(rawCategory) ?? productType

  const title = row.name?.trim() || row.product_label?.trim() || 'Analyse'

  const dateLabel = formatDistanceToNow(new Date(row.created_at), {
    addSuffix: true,
    locale: fr,
  })

  return {
    id: row.id,
    title,
    rawName: row.name?.trim() || row.product_label?.trim() || 'Analyse',
    category,
    score: row.score,
    rating,
    counts,
    dateLabel,
    latestCoherenceId,
    searchTokens: Array.from(tokenSet),
  }
}

const HistoryScreen: FC = () => {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [actionsFor, setActionsFor] = useState<HistoryItem | null>(null)

  const queryKey = ['history', userId] as const

  const {
    data: items = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<HistoryItem[]>({
    queryKey,
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!userId) return []
      // Deux requêtes parallèles : analyses (50 dernières) + cohérences (200).
      // La RLS restreint déjà les deux à l'utilisateur connecté.
      const [analysesRes, coherencesRes] = await Promise.all([
        db()
          .from('analyses')
          .select('id,name,product_label,score,result_json,category,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        db()
          .from('coherence_analyses')
          .select('id,analysis_id,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(200),
      ])

      if (analysesRes.error) throw analysesRes.error

      const rows = (analysesRes.data as AnalysisRow[] | null) ?? []
      // coherence_analyses peut échouer (table/RLS) → on dégrade sans planter.
      const coherenceRows =
        (!coherencesRes.error ? (coherencesRes.data as CoherenceRow[] | null) : null) ?? []

      // Première occurrence gagne (tri DESC) → cohérence la plus récente.
      const latestByAnalysis = new Map<string, string>()
      for (const c of coherenceRows) {
        if (!latestByAnalysis.has(c.analysis_id)) {
          latestByAnalysis.set(c.analysis_id, c.id)
        }
      }

      return rows.map((r) => buildItem(r, latestByAnalysis.get(r.id) ?? null))
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.searchTokens.some((t) => t.includes(q)))
  }, [items, search])

  // ── Mutations renommer / supprimer ─────────────────────────────────────────
  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await db().from('analyses').update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('analyses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      // Retire aussi la ligne de la sélection si besoin.
      setSelected((prev) => prev.filter((x) => x !== id))
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  // ── Sélection / comparaison ─────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length < 2) return [...prev, id]
      // Déjà 2 sélectionnés → remplace le plus ancien (premier).
      return [prev[1], id]
    })
  }, [])

  const startSelect = () => {
    setSelectMode(true)
    setSelected([])
  }

  const cancelSelect = () => {
    setSelectMode(false)
    setSelected([])
  }

  const compare = () => {
    if (selected.length !== 2) return
    router.push(`${ROUTES.COMPARE.INDEX}?ids=${selected.join(',')}` as never)
    cancelSelect()
  }

  const goToPromesse = useCallback((item: HistoryItem) => {
    if (item.latestCoherenceId) {
      router.push(ROUTES.PROMESSES.DETAIL(item.latestCoherenceId))
    } else {
      router.push(`${ROUTES.PROMESSES.NOUVELLE}?analysisId=${item.id}` as never)
    }
  }, [])

  // ── Rendu ──────────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: HistoryItem }) => (
      <HistoryRowCard
        item={item}
        selectMode={selectMode}
        selected={selected.includes(item.id)}
        onPress={() => router.push(ROUTES.ANALYSE.DETAIL(item.id))}
        onToggleSelect={() => toggleSelect(item.id)}
        onOpenActions={() => setActionsFor(item)}
        onAnalysePromesse={() => goToPromesse(item)}
      />
    ),
    [selectMode, selected, toggleSelect, goToPromesse],
  )

  const hint = useMemo(() => {
    if (selected.length === 0) return 'Sélectionne 2 analyses'
    if (selected.length === 1) return 'Sélectionne la 2ᵉ'
    return 'Prêt à comparer'
  }, [selected.length])

  const listEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.rose} />
        </View>
      )
    }
    if (search.trim().length > 0) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={40} color={colors.inkLight} />
          <Text style={styles.emptyTitle}>Aucun résultat</Text>
          <Text style={styles.emptyText}>
            Aucune analyse ne correspond à « {search.trim()} ».
          </Text>
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Text style={styles.emptyLink}>Effacer la recherche</Text>
          </Pressable>
        </View>
      )
    }
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="time-outline" size={44} color={colors.inkLight} />
        <Text style={styles.emptyTitle}>Aucune analyse pour l’instant</Text>
        <Text style={styles.emptyText}>
          Tes produits analysés apparaîtront ici. Commence par décoder une composition.
        </Text>
      </View>
    )
  }

  const canCompare = selected.length === 2

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Historique</Text>
          {items.length > 0 ? (
            <Text style={styles.count}>
              {items.length} analyse{items.length > 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>

        {/* Barre d'outils : entrée "Comparer" au repos, contrôles en mode select */}
        {items.length >= 2 ? (
          <View style={styles.toolbar}>
            {selectMode ? (
              <>
                <Text style={styles.hint}>{hint}</Text>
                <View style={styles.toolbarRight}>
                  <Pressable onPress={cancelSelect} hitSlop={8} style={styles.cancelBtn}>
                    <Text style={styles.cancelText}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    onPress={compare}
                    disabled={!canCompare}
                    style={[styles.compareBtn, !canCompare && styles.compareBtnDisabled]}
                  >
                    <Text style={styles.compareText}>Comparer ({selected.length}/2)</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View />
                <Pressable onPress={startSelect} style={styles.compareEntry}>
                  <Text style={styles.compareEntryText}>Comparer 2 analyses</Text>
                  <Ionicons name="swap-horizontal" size={15} color={colors.surface} />
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        {!selectMode && items.length > 0 ? (
          <View style={styles.searchWrap}>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un produit ou un ingrédient…"
            />
            {search.trim().length > 0 ? (
              <Text style={styles.searchCount}>
                {filtered.length === 0
                  ? 'Aucune analyse ne correspond.'
                  : `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}.`}
              </Text>
            ) : null}
          </View>
        ) : null}

        <FlatList
          data={selectMode ? items : filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 64 + spacing.xl },
            (selectMode ? items : filtered).length === 0 && styles.listContentEmpty,
          ]}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          showsVerticalScrollIndicator={false}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
        />
      </SafeAreaView>

      <HistoryItemActions
        visible={actionsFor !== null}
        currentName={actionsFor?.rawName ?? ''}
        onClose={() => setActionsFor(null)}
        onRename={async (newName) => {
          if (actionsFor) await renameMutation.mutateAsync({ id: actionsFor.id, name: newName })
        }}
        onDelete={async () => {
          if (actionsFor) await deleteMutation.mutateAsync(actionsFor.id)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.h1, color: colors.ink },
  count: { ...typography.small, color: colors.inkMuted, marginTop: spacing.xs },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    minHeight: 36,
  },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hint: { ...typography.xs, color: colors.inkMuted },
  cancelBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
  cancelText: { ...typography.xsSemiBold, color: colors.inkMuted },
  compareBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.base,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  compareBtnDisabled: { opacity: 0.4 },
  compareText: { ...typography.xsSemiBold, color: colors.surface },
  compareEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.rose,
    paddingHorizontal: spacing.base,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  compareEntryText: { ...typography.xsSemiBold, color: colors.surface },
  searchWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  searchCount: { ...typography.xs, color: colors.inkMuted, marginTop: spacing.sm },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
  },
  listContentEmpty: { flexGrow: 1 },
  center: { paddingTop: spacing['3xl'], alignItems: 'center' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.h4, color: colors.ink, marginTop: spacing.sm, textAlign: 'center' },
  emptyText: { ...typography.small, color: colors.inkMuted, textAlign: 'center' },
  emptyLink: { ...typography.smallSemiBold, color: colors.rose, marginTop: spacing.sm },
})

export default HistoryScreen
