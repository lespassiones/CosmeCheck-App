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
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { db } from '@/lib/supabase/client'
import { invalidateCachedAnalysisRow } from '@/lib/storage/session'
import { filterHistory } from '@/lib/history/filterHistory'
import { showToast } from '@/components/shared/Toast'
import {
  parseAnalyseResponse,
  toneToColorRating,
  getColorRatingFromScore,
  type ColorRating,
} from '@/lib/analysis/types'
import { categoryLabel, type ProductCategory } from '@/lib/categoryLabel'
import { decodeHtml } from '@/lib/decodeHtml'
import { useAuth } from '@/hooks/useAuth'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { ScreenHeader } from '@/components/shared/ScreenHeader'
import { SearchBar } from '@/components/shared/SearchBar'
import { HistoryRowCard, type HistoryItemView } from '@/components/history/HistoryRowCard'
import { HistoryItemActions } from '@/components/history/HistoryItemActions'
import { PromesseFlowModal } from '@/components/promesses/PromesseFlowModal'

interface AnalysisRow {
  id: string
  name: string | null
  product_label: string | null
  brand: string | null
  ean: string | null
  product_type: string | null
  input_text: string | null
  score: number | null
  result_json: unknown
  category: string | null
  favori: boolean | null
  created_at: string
}

interface CoherenceRow {
  id: string
  analysis_id: string
  created_at: string
}

/** Modèle de vue enrichi consommé par la liste + filtrage. */
interface HistoryItem extends HistoryItemView {
  searchTokens: string[]
  rawName: string
  // Données nécessaires à la PromesseFlowModal (flow auto depuis l'historique).
  brand: string | null
  productLabel: string | null
  productType: string | null
  inciText: string
}

type CountsTuple = { vert: number; jaune: number; orange: number; rouge: number }

function emptyCounts(): CountsTuple {
  return { vert: 0, jaune: 0, orange: 0, rouge: 0 }
}

function buildItem(row: AnalysisRow, latestCoherenceId: string | null): HistoryItem {
  const parsed = parseAnalyseResponse(row.result_json)

  // Couleur dérivée UNIQUEMENT du score (source unique) → même pastille partout.
  const rating: ColorRating = getColorRatingFromScore(parsed?.score ?? row.score ?? 0)

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

  const title = decodeHtml(row.name?.trim() || row.product_label?.trim()) || 'Analyse'

  const dateLabel = formatDistanceToNow(new Date(row.created_at), {
    addSuffix: true,
    locale: fr,
  })

  return {
    id: row.id,
    title,
    rawName: decodeHtml(row.name?.trim() || row.product_label?.trim()) || 'Analyse',
    category,
    score: row.score,
    rating,
    counts,
    dateLabel,
    latestCoherenceId,
    favori: row.favori ?? false,
    ean: row.ean?.trim() || null,
    imageUrl: null,
    searchTokens: Array.from(tokenSet),
    brand: decodeHtml(row.brand?.trim()) || null,
    productLabel: decodeHtml(row.product_label?.trim() || row.name?.trim()) || null,
    productType: row.product_type ?? parsed?.productType ?? null,
    inciText: row.input_text ?? '',
  }
}

const HistoryScreen: FC = () => {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  // Écran d'origine à retrouver si l'onglet a été ouvert depuis une autre page
  // (ex. /promesses/choisir). Affiche alors un chevron retour dans l'en-tête.
  const { returnTo: returnToParam } = useLocalSearchParams<{ returnTo?: string }>()
  const returnTo = typeof returnToParam === 'string' && returnToParam ? returnToParam : null

  const [search, setSearch] = useState('')
  const [favorisOnly, setFavorisOnly] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [promesseModalFor, setPromesseModalFor] = useState<HistoryItem | null>(null)
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
          .select('id,name,product_label,brand,ean,product_type,input_text,score,result_json,category,favori,created_at')
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

      const built = rows.map((r) => buildItem(r, latestByAnalysis.get(r.id) ?? null))

      // Résolution image EN LOT (EAN = source de vérité) : une seule requête
      // catalog (public read) pour tous les EAN de la page, au lieu d'un appel
      // RPC par carte → fiable et les images sont prêtes au rendu.
      const eans = Array.from(
        new Set(built.map((it) => it.ean).filter((e): e is string => Boolean(e))),
      )
      if (eans.length > 0) {
        const { data: catRows } = await db()
          .from('catalog')
          .select('ean, image_url')
          .in('ean', eans)
        const imageByEan = new Map<string, string>()
        for (const c of (catRows as { ean: string; image_url: string | null }[] | null) ?? []) {
          if (c.image_url) imageByEan.set(c.ean, c.image_url)
        }
        for (const it of built) {
          if (it.ean && imageByEan.has(it.ean)) it.imageUrl = imageByEan.get(it.ean) ?? null
        }
      }

      return built
    },
  })

  const filtered = useMemo(
    () => filterHistory(items, search, favorisOnly),
    [items, search, favorisOnly],
  )

  // ── Mutations renommer / supprimer ─────────────────────────────────────────
  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await db().from('analyses').update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      // Invalide aussi le cache local row (le titre a changé).
      void invalidateCachedAnalysisRow(vars.id).catch(() => {})
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: () => showToast('Renommage impossible. Réessaie.', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('analyses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      // Retire aussi la ligne de la sélection si besoin.
      setSelected((prev) => prev.filter((x) => x !== id))
      void invalidateCachedAnalysisRow(id).catch(() => {})
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: () => showToast('Suppression impossible. Réessaie.', 'error'),
  })

  const favoriMutation = useMutation({
    mutationFn: async ({ id, favori }: { id: string; favori: boolean }) => {
      const { error } = await db().from('analyses').update({ favori }).eq('id', id)
      if (error) throw error
    },
    // Optimiste : on bascule la valeur dans le cache liste avant le retour serveur.
    onMutate: async ({ id, favori }) => {
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<HistoryItem[]>(queryKey)
      queryClient.setQueryData<HistoryItem[]>(queryKey, (old) =>
        (old ?? []).map((it) => (it.id === id ? { ...it, favori } : it)),
      )
      return { prev }
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev)
      showToast('Action impossible. Réessaie.', 'error')
    },
    onSuccess: (_data, vars) => {
      void invalidateCachedAnalysisRow(vars.id).catch(() => {})
    },
  })

  const toggleFavori = useCallback(
    (item: HistoryItem) => {
      const next = !item.favori
      void favoriMutation.mutateAsync({ id: item.id, favori: next })
      showToast(next ? 'Ajouté aux favoris' : 'Retiré des favoris', 'success')
    },
    [favoriMutation],
  )

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
      // Ouvre le flow auto (PromesseFlowModal) comme sur l'écran d'analyse.
      setPromesseModalFor(item)
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
        onToggleFavori={() => toggleFavori(item)}
      />
    ),
    [selectMode, selected, toggleSelect, goToPromesse, toggleFavori],
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
    if (favorisOnly && search.trim().length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="bookmark-outline" size={42} color={colors.inkLight} />
          <Text style={styles.emptyTitle}>Aucun favori</Text>
          <Text style={styles.emptyText}>
            Mets des produits en favori (icône signet) pour les retrouver ici.
          </Text>
          <Pressable onPress={() => setFavorisOnly(false)} hitSlop={8}>
            <Text style={styles.emptyLink}>Voir tout l'historique</Text>
          </Pressable>
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
          Vérifie si un produit te correspond vraiment. Tes analyses apparaîtront ici.
        </Text>
      </View>
    )
  }

  const canCompare = selected.length === 2

  // En-tête de la LISTE (scrolle avec le contenu : seul le ScreenHeader/crédits
  // reste fixe). Recherche en haut, puis ligne « Tout | Favoris … Comparer ».
  const listHeaderElement =
    items.length === 0 ? null : (
      <View style={styles.headerWrap}>
        {selectMode ? (
          <View style={styles.toolbar}>
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
          </View>
        ) : (
          <>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un produit ou un ingrédient…"
            />
            <View style={styles.controlsRow}>
              <View style={styles.segmentRow}>
                <Pressable
                  onPress={() => setFavorisOnly(false)}
                  style={[styles.segment, !favorisOnly && styles.segmentOn]}
                >
                  <Text style={[styles.segmentText, !favorisOnly && styles.segmentTextOn]}>Tout</Text>
                </Pressable>
                <Pressable
                  onPress={() => setFavorisOnly(true)}
                  style={[styles.segment, favorisOnly && styles.segmentOn]}
                >
                  <Ionicons
                    name={favorisOnly ? 'bookmark' : 'bookmark-outline'}
                    size={13}
                    color={favorisOnly ? colors.rose : colors.inkMuted}
                  />
                  <Text style={[styles.segmentText, favorisOnly && styles.segmentTextOn]}>Favoris</Text>
                </Pressable>
              </View>
              {items.length >= 2 ? (
                <Pressable onPress={startSelect} style={styles.compareEntry}>
                  <Text style={styles.compareEntryText}>Comparer 2 analyses</Text>
                  <Ionicons name="swap-horizontal" size={15} color={colors.surface} />
                </Pressable>
              ) : null}
            </View>
            {search.trim().length > 0 ? (
              <Text style={styles.searchCount}>
                {filtered.length === 0
                  ? 'Aucune analyse ne correspond.'
                  : `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}.`}
              </Text>
            ) : null}
          </>
        )}
      </View>
    )

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <ScreenHeader
        title="Historique"
        onBack={
          returnTo
            ? () => router.navigate(returnTo as Parameters<typeof router.navigate>[0])
            : undefined
        }
      />
      <SafeAreaView style={styles.safe} edges={[]}>
        <FlatList
          data={selectMode ? items : filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={listHeaderElement}
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
        favori={actionsFor?.favori ?? false}
        onClose={() => setActionsFor(null)}
        onRename={async (newName) => {
          if (actionsFor) await renameMutation.mutateAsync({ id: actionsFor.id, name: newName })
        }}
        onDelete={async () => {
          if (actionsFor) await deleteMutation.mutateAsync(actionsFor.id)
        }}
        onToggleFavori={() => {
          if (actionsFor) toggleFavori(actionsFor)
        }}
      />

      <PromesseFlowModal
        visible={promesseModalFor !== null}
        onClose={() => setPromesseModalFor(null)}
        analysisId={promesseModalFor?.id ?? null}
        inci={promesseModalFor?.inciText ?? ''}
        productLabel={promesseModalFor?.productLabel ?? null}
        brand={promesseModalFor?.brand ?? null}
        productType={promesseModalFor?.productType ?? null}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  headerWrap: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  segmentRow: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.base,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
  },
  segmentOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rose },
  segmentText: { ...typography.xsSemiBold, color: colors.inkMuted },
  segmentTextOn: { color: colors.rose },
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
    backgroundColor: colors.success,
    paddingHorizontal: spacing.base,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  compareEntryText: { ...typography.xsSemiBold, color: colors.surface },
  searchCount: { ...typography.xs, color: colors.inkMuted, marginTop: spacing.sm },
  listContent: {
    paddingHorizontal: spacing.sm,
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
