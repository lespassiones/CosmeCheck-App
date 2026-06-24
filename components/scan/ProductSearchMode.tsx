/**
 * ProductSearchMode — navigation catalogue + recherche.
 *
 * Arbre de catégories HARDCODÉ dans constants/categories.ts → navigation
 * instantanée, AUCUN fetch Supabase pour parcourir les niveaux.
 * Supabase est appelé UNIQUEMENT quand l'utilisateur atteint une feuille
 * (nœud sans enfants) via la RPC `cosme_check_browse_category_slug`.
 *
 * Flux :
 *  1. Grille des 12 catégories racine (instantanée).
 *  2. Tap → affiche ses enfants (sous-catégories, instantané).
 *  3. Tap sur un enfant à son tour → s'il a des enfants, idem ; sinon c'est
 *     une feuille → appel Supabase pour charger les produits.
 *  4. Barre de recherche (≥2 chars) → RPC `cosme_check_search_catalog` + fallback internet.
 *
 * Emit onInciReady(inci, productName?, brand?, ean?, imageUrl?) au choix d'un produit.
 */

import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography, fontFamilies } from '@/constants/typography'
import { supabase } from '@/lib/supabase/client'
import { applyColorCap } from '@/lib/analysis/scoreCap'
import { catalogSearchKey, CATALOG_SEARCH_STALE_MS } from '@/lib/catalog/searchCache'
import { ROUTES } from '@/constants/routes'
import { useAndroidBack } from '@/hooks/useAndroidBack'
import { CatalogPastille } from '@/components/shared/CatalogPastille'
import {
  CATEGORIES,
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_ICON,
  getChildrenAtPath,
  isLeafPath,
  pathToSlug,
  type CategoryNode,
} from '@/constants/categories'

type IoniconName = keyof typeof Ionicons.glyphMap

// ─── Types des RPC catalogue ─────────────────────────────────────────────────

interface CatalogRow {
  ean: string | null
  brand: string | null
  name: string | null
  category: string | null
  image_url: string | null
  source_url: string | null
  score: number | null
  score_label: string | null
  score_tone: string | null
  count_total: number | null
  ingredients_text: string | null
  count_orange: number | null
  count_rouge: number | null
}

interface BrowseRow {
  ean: string
  brand: string | null
  name: string
  image_url: string | null
  score: number | null
  score_label: string | null
  score_tone: string | null
  ingredients_text: string | null
  count_orange: number | null
  count_rouge: number | null
}

interface WebCandidate {
  id: string
  brand: string | null
  productName: string | null
  ingredientsText?: string
  imageUrl?: string | null
  sourceUrl?: string | null
  source?: string
  title?: string
}

// État de la recherche approfondie internet (manuelle, 1 crédit) :
//  idle      → bouton proposé (catalog vide)
//  running   → crédit débité + product-suggest en cours
//  done      → résultats reçus (webResults peut être vide = rien trouvé)
//  no_credit → solde épuisé → upsell Premium
//  error     → échec, retry possible
type DeepState = 'idle' | 'running' | 'done' | 'no_credit' | 'error'

// ─── Pastille catégorie : couleur stable dérivée du libellé ─────────────────

const PILL_PALETTE: { bg: string; text: string }[] = [
  { bg: colors.rating.vert.bg,    text: colors.rating.vert.text },
  { bg: colors.rating.orange.bg,  text: colors.rating.orange.text },
  { bg: colors.accentSoft,        text: colors.accent },
  { bg: colors.roseSoft,          text: colors.roseDeep },
  { bg: colors.rating.jaune.bg,   text: colors.rating.jaune.text },
]

function pillColors(label: string): { bg: string; text: string } {
  let hash = 0
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  }
  return PILL_PALETTE[hash % PILL_PALETTE.length]
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onInciReady: (
    inci: string,
    productName?: string,
    brand?: string,
    ean?: string,
    imageUrl?: string,
  ) => void
  onFallbackToManual: () => void
  disabled?: boolean
}

const MIN_QUERY    = 2
const DEBOUNCE_MS  = 350
const BROWSE_PAGE  = 24
const SEARCH_PAGE  = 10   // résultats par page (chargés 10 par 10 au scroll)

// ─── Persistance de la position de navigation entre montages ─────────────────
// Sauvegarde le chemin + les produits fetchés en mémoire module (survive au
// démontage du composant lors d'un router.replace vers /analyse/[id]).
// Restauré au prochain montage pour que "retour" ramène exactement ici.
const _nav = {
  path:     [] as string[],
  products: [] as BrowseRow[],
  offset:   0,
  hasMore:  false,
}

// Hauteur approximative de la tab bar (hors safe area).
const TAB_BAR_HEIGHT = 68

export const ProductSearchMode: FC<Props> = ({
  onInciReady,
  onFallbackToManual,
  disabled = false,
}) => {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const router = useRouter()
  // Padding bas = tab bar + safe area bottom (home indicator Android/iOS).
  const listBottomPad = TAB_BAR_HEIGHT + insets.bottom

  // Recherche catalogue avec cache React Query : une recherche équivalente
  // (même mots, casse/accents/ordre indifférents) retapée dans les 60 s ne
  // rappelle PAS la RPC. fetchQuery dédoublonne aussi les requêtes en vol.
  const fetchCatalogPage = useCallback(
    (trimmed: string, offset: number) =>
      queryClient.fetchQuery({
        queryKey: catalogSearchKey(trimmed, offset),
        staleTime: CATALOG_SEARCH_STALE_MS,
        queryFn: async (): Promise<CatalogRow[]> => {
          // RPC à classement caché (table catalog_search_cache) : le tri
          // coûteux ne tourne qu'1x par terme (TTL 1h), ensuite chaque page est
          // un lookup PK (~20ms). React Query dédoublonne aussi côté appareil.
          const { data, error } = await supabase.rpc(
            'cosme_check_search_catalog' as never,
            { p_query: trimmed, p_limit: SEARCH_PAGE, p_offset: offset } as never,
          )
          if (error) throw error
          return (data as CatalogRow[] | null) ?? []
        },
      }),
    [queryClient],
  )
  // ── Recherche ─────────────────────────────────────────────────────────
  const [query, setQuery]                 = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchResults, setSearchResults]         = useState<CatalogRow[]>([])
  const [searchLoading, setSearchLoading]         = useState(false)
  const [searchError, setSearchError]             = useState<string | null>(null)
  const [searched, setSearched]                   = useState(false)
  const [searchOffset, setSearchOffset]           = useState(0)
  const [searchHasMore, setSearchHasMore]         = useState(false)
  const [searchLoadingMore, setSearchLoadingMore] = useState(false)

  // ── Navigation arbre catégories ───────────────────────────────────────
  // Toujours démarrer à la racine au montage (fresh open = 12 catégories).
  // La position est naturellement préservée pendant une session grâce à
  // router.push (l'écran scan reste dans la pile pendant l'analyse).
  const [path, setPath] = useState<string[]>([])

  // Feuille courante → slug DB pour le fetch produits.
  const leafSlug = useMemo(
    () => (isLeafPath(path) ? pathToSlug(path) : null),
    [path],
  )

  // Enfants à afficher au niveau courant (nœuds non-feuille, ou racine).
  const currentChildren = useMemo(
    () => (leafSlug !== null ? [] : getChildrenAtPath(path)),
    [path, leafSlug],
  )

  // ── Browse produits (feuille) ─────────────────────────────────────────
  const [browseProducts, setBrowseProducts]   = useState<BrowseRow[]>([])
  const [browseOffset, setBrowseOffset]       = useState(0)
  const [browseHasMore, setBrowseHasMore]     = useState(false)
  const [browseLoading, setBrowseLoading]     = useState(false)
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false)

  const skipInitialFetchRef = useRef(false)

  // Résolution INCI lazy
  const [resolvingEan, setResolvingEan]       = useState<string | null>(null)

  // ── Recherche approfondie internet (manuelle, 1 crédit) ───────────────
  const [webResults, setWebResults]           = useState<WebCandidate[]>([])
  const [deepState, setDeepState]             = useState<DeepState>('idle')
  const [resolvingWebId, setResolvingWebId]   = useState<string | null>(null)

  const reqIdRef    = useRef(0)
  const webReqIdRef = useRef(0)

  // ── Debounce recherche ────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  // ── Recherche catalogue ───────────────────────────────────────────────
  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    if (trimmed.length < MIN_QUERY) {
      setSearchResults([])
      setSearched(false)
      setSearchError(null)
      setWebResults([])
      setDeepState('idle')
      return
    }
    const reqId = ++reqIdRef.current
    setSearchLoading(true)
    setSearchError(null)
    setWebResults([])
    setDeepState('idle')
    setSearchOffset(0)
    setSearchHasMore(false)
    void (async () => {
      try {
        const rows = await fetchCatalogPage(trimmed, 0)
        if (reqId !== reqIdRef.current) return
        setSearchResults(rows)
        setSearchHasMore(rows.length === SEARCH_PAGE)
        setSearchOffset(SEARCH_PAGE)
      } catch {
        if (reqId !== reqIdRef.current) return
        setSearchError('Recherche indisponible pour le moment.')
        setSearchResults([])
      } finally {
        if (reqId === reqIdRef.current) {
          setSearchLoading(false)
          setSearched(true)
        }
      }
    })()
  }, [debouncedQuery, fetchCatalogPage])

  // ── Recherche approfondie internet (déclenchée MANUELLEMENT, 1 crédit) ──
  // On ne lance JAMAIS la cascade OBF/INCIDecoder/OpenAI/DDG automatiquement
  // (protège les quotas d'API externes à grande échelle). L'utilisateur doit
  // taper le bouton ; ça débite 1 crédit, et s'il n'en a plus → upsell Premium.
  const runDeepSearch = useCallback(async () => {
    const trimmed = debouncedQuery.trim()
    if (trimmed.length < 3 || deepState === 'running') return
    const reqId = ++webReqIdRef.current
    setDeepState('running')
    try {
      // 1) Débit du crédit "deep_search".
      const { data: credit, error: creditErr } = await supabase.rpc(
        'cosme_check_consume_credit',
        { p_feature: 'deep_search' } as never,
      )
      if (reqId !== webReqIdRef.current) return
      if (creditErr) { setDeepState('error'); return }
      const ok = (credit as { ok?: boolean } | null)?.ok === true
      if (!ok) { setDeepState('no_credit'); return }
      // Solde modifié → la pastille crédits doit se rafraîchir.
      void queryClient.invalidateQueries({ queryKey: ['credits'] })

      // 2) Cascade internet (uniquement maintenant).
      const { data, error } = await supabase.functions.invoke('product-suggest', {
        body: { query: trimmed, page: 1 },
      })
      if (reqId !== webReqIdRef.current) return
      if (error) { setDeepState('error'); return }
      const res = data as { candidates?: WebCandidate[]; webCandidates?: WebCandidate[] } | null
      setWebResults([...(res?.candidates ?? []), ...(res?.webCandidates ?? [])])
      setDeepState('done')
    } catch {
      if (reqId !== webReqIdRef.current) return
      setDeepState('error')
    }
  }, [debouncedQuery, deepState, queryClient])

  // ── Pagination recherche (page suivante) ─────────────────────────────
  const loadMoreSearch = useCallback(async () => {
    const trimmed = debouncedQuery.trim()
    if (!trimmed || searchLoadingMore || !searchHasMore) return
    setSearchLoadingMore(true)
    try {
      const rows = await fetchCatalogPage(trimmed, searchOffset)
      setSearchResults((prev) => {
        const seen = new Set(prev.map((p) => p.ean ?? p.name ?? ''))
        return [...prev, ...rows.filter((r) => !seen.has(r.ean ?? r.name ?? ''))]
      })
      setSearchHasMore(rows.length === SEARCH_PAGE)
      setSearchOffset((prev) => prev + SEARCH_PAGE)
    } catch {
      // page suivante indisponible : on garde ce qui est déjà affiché
    } finally {
      setSearchLoadingMore(false)
    }
  }, [debouncedQuery, searchOffset, searchLoadingMore, searchHasMore, fetchCatalogPage])

  // ── Chargement produits quand on arrive sur une feuille ───────────────
  useEffect(() => {
    if (!leafSlug) {
      setBrowseProducts([])
      setBrowseOffset(0)
      setBrowseHasMore(false)
      return
    }
    let cancelled = false
    setBrowseLoading(true)
    setBrowseProducts([])
    setBrowseOffset(0)
    void (async () => {
      try {
        const { data, error } = await supabase.rpc(
          'cosme_check_browse_category_slug' as never,
          { p_category_slug: leafSlug, p_limit: BROWSE_PAGE, p_offset: 0 } as never,
        )
        if (cancelled) return
        if (error) {
          setBrowseProducts([])
          setBrowseHasMore(false)
        } else {
          const rows = (data as BrowseRow[] | null) ?? []
          setBrowseProducts(rows)
          setBrowseHasMore(rows.length === BROWSE_PAGE)
          setBrowseOffset(BROWSE_PAGE)
        }
      } catch {
        if (!cancelled) { setBrowseProducts([]); setBrowseHasMore(false) }
      } finally {
        if (!cancelled) setBrowseLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [leafSlug])

  const loadMoreBrowse = useCallback(async () => {
    if (!leafSlug || browseLoadingMore || !browseHasMore) return
    setBrowseLoadingMore(true)
    try {
      const { data, error } = await supabase.rpc(
        'cosme_check_browse_category_slug' as never,
        { p_category_slug: leafSlug, p_limit: BROWSE_PAGE, p_offset: browseOffset } as never,
      )
      if (error) return
      const rows = (data as BrowseRow[] | null) ?? []
      setBrowseProducts((prev) => {
        const seen = new Set(prev.map((p) => p.ean))
        return [...prev, ...rows.filter((p) => !seen.has(p.ean))]
      })
      setBrowseHasMore(rows.length === BROWSE_PAGE)
      setBrowseOffset((prev) => prev + BROWSE_PAGE)
    } finally {
      setBrowseLoadingMore(false)
    }
  }, [leafSlug, browseOffset, browseLoadingMore, browseHasMore])

  // ── Sélection candidat internet ───────────────────────────────────────
  const pickWebCandidate = useCallback(
    async (candidate: WebCandidate) => {
      if (disabled) return
      const label    = candidate.productName ?? candidate.title ?? undefined
      const brand    = candidate.brand ?? undefined
      const imageUrl = candidate.imageUrl ?? undefined
      const direct   = candidate.ingredientsText?.trim()
      if (direct && direct.length >= 10) {
        onInciReady(direct, label, brand, undefined, imageUrl)
        return
      }
      setResolvingWebId(candidate.id)
      try {
        const queryStr = [brand, label].filter(Boolean).join(' ').trim()
        const { data, error } = await supabase.functions.invoke('product-search', {
          body: { query: queryStr },
        })
        if (error) throw error
        const hit = data as { found?: boolean; ingredientsText?: string; brand?: string | null; productName?: string | null; imageUrl?: string | null } | null
        const inci = hit?.found ? hit.ingredientsText?.trim() : undefined
        if (inci && inci.length >= 10) {
          onInciReady(inci, hit?.productName ?? label, hit?.brand ?? brand, undefined, hit?.imageUrl ?? imageUrl)
        } else {
          setSearchError('Composition introuvable pour ce produit. Tu peux coller la liste INCI manuellement.')
        }
      } catch {
        setSearchError('Recherche produit indisponible. Colle la liste INCI manuellement.')
      } finally {
        setResolvingWebId(null)
      }
    },
    [disabled, onInciReady],
  )

  // ── Sélection produit catalogue ───────────────────────────────────────
  const pickCatalog = useCallback(
    async (row: CatalogRow | BrowseRow) => {
      if (disabled) return
      const label    = row.name ?? undefined
      const brand    = row.brand ?? undefined
      const ean      = ('ean' in row ? row.ean : undefined) ?? undefined
      const imageUrl = row.image_url ?? undefined
      const direct   = row.ingredients_text?.trim()
      if (direct && direct.length >= 10) {
        onInciReady(direct, label, brand, ean, imageUrl)
        return
      }
      setResolvingEan(ean ?? label ?? '')
      try {
        const queryStr = [brand, label].filter(Boolean).join(' ').trim()
        const { data, error } = await supabase.functions.invoke('product-search', {
          body: { query: queryStr, ean },
        })
        if (error) throw error
        const hit = data as { found?: boolean; ingredientsText?: string; brand?: string | null; productName?: string | null; imageUrl?: string | null } | null
        const inci = hit?.found ? hit.ingredientsText?.trim() : undefined
        if (inci && inci.length >= 10) {
          onInciReady(inci, hit?.productName ?? label, hit?.brand ?? brand, ean, hit?.imageUrl ?? imageUrl)
        } else {
          setSearchError('Composition introuvable. Tu peux coller la liste INCI manuellement.')
        }
      } catch {
        setSearchError('Recherche produit indisponible. Colle la liste INCI manuellement.')
      } finally {
        setResolvingEan(null)
      }
    },
    [disabled, onInciReady],
  )

  // ── Navigation helpers ────────────────────────────────────────────────

  /** Tape un nœud : s'il a des enfants → drill-down ; sinon → feuille (fetch). */
  const tapNode = useCallback(
    (node: CategoryNode) => {
      setPath((prev) => [...prev, node.name])
    },
    [],
  )

  /** Remonte à un niveau précis (0 = racine, 1 = L1, etc.). */
  const goToLevel = useCallback((level: number) => {
    setPath((prev) => prev.slice(0, level))
  }, [])

  // Bouton retour Android
  useAndroidBack(
    useCallback(() => {
      if (query.length > 0) { setQuery(''); return true }
      if (path.length > 0)  { setPath((p) => p.slice(0, -1)); return true }
      return false
    }, [query, path]),
  )

  // ── Barre de recherche (toujours visible) ─────────────────────────────
  const searchBar = (
    <View style={[styles.searchBar, styles.searchBarFocused]}>
      <Ionicons name="search" size={18} color={colors.accent} />
      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="Rechercher un produit…"
        placeholderTextColor={colors.inkLight}
        selectionColor={colors.textSelection}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {searchLoading && <ActivityIndicator size="small" color={colors.rose} />}
      {!searchLoading && query.length > 0 && (
        <Pressable onPress={() => setQuery('')} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.inkLight} />
        </Pressable>
      )}
    </View>
  )

  const showSearch = debouncedQuery.trim().length >= MIN_QUERY

  // ─── MODE RECHERCHE ────────────────────────────────────────────────────
  if (showSearch) {
    // Catalog vide pour cette requête → on propose la recherche approfondie.
    const catalogEmpty =
      searched && !searchLoading && !searchError && searchResults.length === 0
    const showWebSection = deepState === 'done' && webResults.length > 0
    const canDeepSearch = debouncedQuery.trim().length >= 3

    // Footer FlatList : spinner pagination + section internet + bloc approfondi
    const searchFooter = (
      <>
        {searchLoadingMore && (
          <View style={styles.loadingFooter}>
            <ActivityIndicator size="small" color={colors.rose} />
          </View>
        )}
        {showWebSection && (
          <View style={[styles.sectionGroup, { marginTop: spacing.lg }]}>
            <View style={styles.sectionKickerRow}>
              <Ionicons name="globe-outline" size={12} color={colors.accent} />
              <Text style={[styles.sectionKicker, styles.sectionKickerAccent]}>
                TROUVÉ SUR INTERNET
              </Text>
            </View>
            <Text style={styles.sectionSubtitle}>Résultats les plus pertinents</Text>
            {webResults.map((c, i) => (
              <WebCandidateRow
                key={c.id || `web-${i}`}
                candidate={c}
                rank={i + 1}
                busy={resolvingWebId === c.id}
                disabled={disabled || resolvingWebId != null}
                onPress={() => void pickWebCandidate(c)}
              />
            ))}
          </View>
        )}
        {catalogEmpty && (
          <View style={styles.empty}>
            {/* idle : aucun produit dans notre base → proposer la recherche approfondie */}
            {deepState === 'idle' && (
              <>
                <Text style={styles.emptyText}>
                  Aucun produit trouvé pour « {debouncedQuery.trim()} » dans notre base.
                </Text>
                {canDeepSearch && (
                  <>
                    <Pressable
                      style={[styles.deepBtn, disabled && styles.deepBtnDisabled]}
                      onPress={() => void runDeepSearch()}
                      disabled={disabled}
                    >
                      <Ionicons name="globe-outline" size={16} color="#fff" />
                      <Text style={styles.deepBtnText}>Recherche approfondie sur internet</Text>
                    </Pressable>
                    <Text style={styles.deepHint}>Cherche la composition en ligne · 1 crédit</Text>
                  </>
                )}
                <Pressable onPress={onFallbackToManual} hitSlop={6}>
                  <Text style={styles.emptyCta}>Ou coller la liste INCI</Text>
                </Pressable>
              </>
            )}

            {/* running : crédit débité + cascade internet en cours */}
            {deepState === 'running' && <SearchingThinker />}

            {/* no_credit : solde épuisé → upsell Premium */}
            {deepState === 'no_credit' && (
              <View style={styles.upsellBox}>
                <Ionicons name="sparkles" size={20} color={colors.accent} />
                <Text style={styles.upsellTitle}>Plus de crédits aujourd'hui</Text>
                <Text style={styles.upsellText}>
                  Passe à Premium pour des recherches approfondies illimitées.
                </Text>
                <Pressable
                  style={styles.deepBtn}
                  onPress={() => router.push(ROUTES.OFFRE.INDEX)}
                >
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={styles.deepBtnText}>Découvrir Premium</Text>
                </Pressable>
                <Pressable onPress={onFallbackToManual} hitSlop={6}>
                  <Text style={styles.emptyCta}>Ou coller la liste INCI</Text>
                </Pressable>
              </View>
            )}

            {/* error : échec → retry */}
            {deepState === 'error' && (
              <>
                <Text style={styles.emptyText}>Recherche approfondie indisponible pour le moment.</Text>
                <Pressable style={styles.deepBtn} onPress={() => void runDeepSearch()}>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.deepBtnText}>Réessayer</Text>
                </Pressable>
                <Pressable onPress={onFallbackToManual} hitSlop={6}>
                  <Text style={styles.emptyCta}>Ou coller la liste INCI</Text>
                </Pressable>
              </>
            )}

            {/* done sans résultat : rien trouvé sur internet non plus */}
            {deepState === 'done' && webResults.length === 0 && (
              <>
                <Text style={styles.emptyText}>Rien trouvé sur internet non plus.</Text>
                <Pressable onPress={onFallbackToManual} hitSlop={6}>
                  <Text style={styles.emptyCta}>Coller la liste INCI</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </>
    )

    return (
      <View style={styles.root}>
        {searchBar}
        {searchError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{searchError}</Text>
            <Pressable onPress={onFallbackToManual}>
              <Text style={styles.errorCta}>Coller la liste INCI</Text>
            </Pressable>
          </View>
        )}
        <FlatList
          data={searchResults}
          keyExtractor={(item, i) => item.ean ?? `${item.name ?? 'row'}-${i}`}
          contentContainerStyle={[styles.list, { paddingBottom: listBottomPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            searchResults.length > 0 ? (
              <View style={styles.searchHeader}>
                <Text style={styles.sectionKicker}>DANS NOTRE BASE</Text>
                <Text style={styles.sectionSubtitle}>
                  Du meilleur au moins bon — {searchResults.length}{searchHasMore ? '+' : ''} résultats
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const busy = resolvingEan != null && resolvingEan === (item.ean ?? item.name ?? '')
            return (
              <ProductRow
                item={item}
                busy={busy}
                disabled={disabled || resolvingEan != null}
                onPress={() => void pickCatalog(item)}
              />
            )
          }}
          onEndReachedThreshold={0.6}
          onEndReached={() => void loadMoreSearch()}
          ListFooterComponent={searchFooter}
        />
      </View>
    )
  }

  // ─── MODE BROWSE : produits d'une feuille ─────────────────────────────
  if (leafSlug !== null) {
    const leafName = path[path.length - 1] ?? ''
    return (
      <View style={styles.root}>
        {searchBar}
        <Breadcrumb path={path} onGoToLevel={goToLevel} />
        <View style={styles.catHeaderRow}>
          <Text style={styles.catHeaderTitle}>{leafName}</Text>
        </View>
        {browseLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.rose} />
          </View>
        ) : browseProducts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucun produit trouvé dans cette catégorie.</Text>
          </View>
        ) : (
          <FlatList
            data={browseProducts}
            keyExtractor={(item) => item.ean}
            contentContainerStyle={[styles.list, { paddingBottom: listBottomPad }]}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const busy = resolvingEan === item.ean
              return (
                <ProductRow
                  item={item}
                  busy={busy}
                  disabled={disabled || resolvingEan != null}
                  onPress={() => void pickCatalog(item)}
                />
              )
            }}
            onEndReachedThreshold={0.6}
            onEndReached={() => void loadMoreBrowse()}
            ListFooterComponent={
              browseLoadingMore ? (
                <View style={styles.loadingFooter}>
                  <ActivityIndicator size="small" color={colors.rose} />
                </View>
              ) : null
            }
          />
        )}
      </View>
    )
  }

  // ─── MODE NAVIGATION : sous-nœuds du chemin courant ───────────────────
  if (path.length > 0) {
    const currentName = path[path.length - 1] ?? ''
    return (
      <View style={styles.root}>
        {searchBar}
        <Breadcrumb path={path} onGoToLevel={goToLevel} />
        <View style={styles.catHeaderRow}>
          <Ionicons
            name={(CATEGORY_ICONS[path[0] ?? ''] ?? DEFAULT_CATEGORY_ICON) as IoniconName}
            size={22}
            color={colors.accent}
          />
          <Text style={styles.catHeaderTitle}>{currentName}</Text>
        </View>
        <FlatList
          data={currentChildren as CategoryNode[]}
          keyExtractor={(item) => item.name}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.list, { paddingBottom: listBottomPad }]}
          renderItem={({ item }) => {
            const isLeaf = !item.children || item.children.length === 0
            return (
              <Pressable
                style={styles.subRow}
                onPress={() => tapNode(item)}
                disabled={disabled}
              >
                <Text style={styles.subName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.subRight}>
                  {isLeaf ? (
                    <Ionicons name="layers-outline" size={14} color={colors.inkLight} />
                  ) : (
                    <Ionicons name="folder-outline" size={14} color={colors.inkLight} />
                  )}
                  <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
                </View>
              </Pressable>
            )
          }}
        />
      </View>
    )
  }

  // ─── MODE RACINE : grille des 12 catégories ───────────────────────────
  return (
    <View style={styles.root}>
      {searchBar}
      <Text style={styles.kicker}>CATÉGORIES</Text>
      <FlatList
        data={CATEGORIES as unknown as CategoryNode[]}
        keyExtractor={(c) => c.name}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: listBottomPad }]}
        renderItem={({ item: cat }) => (
          <Pressable
            style={styles.catRow}
            onPress={() => tapNode(cat)}
            disabled={disabled}
            accessibilityRole="button"
          >
            <View style={styles.catIcon}>
              <Ionicons
                name={(CATEGORY_ICONS[cat.name] ?? DEFAULT_CATEGORY_ICON) as IoniconName}
                size={20}
                color={colors.accent}
              />
            </View>
            <Text style={styles.catName}>{cat.name}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
          </Pressable>
        )}
      />
    </View>
  )
}

// ─── Fil d'Ariane ────────────────────────────────────────────────────────────

const Breadcrumb: FC<{
  path: string[]
  onGoToLevel: (level: number) => void
}> = ({ path, onGoToLevel }) => (
  <View style={styles.breadcrumb}>
    <Pressable onPress={() => onGoToLevel(0)} hitSlop={6}>
      <Text style={styles.crumbLink}>Catégories</Text>
    </Pressable>
    {path.map((segment, idx) => {
      const isLast = idx === path.length - 1
      return (
        <View key={segment} style={styles.crumbSegment}>
          <Ionicons name="chevron-forward" size={12} color={colors.inkLight} />
          <Pressable
            onPress={() => !isLast && onGoToLevel(idx + 1)}
            hitSlop={6}
            disabled={isLast}
          >
            <Text
              style={isLast ? styles.crumbActive : styles.crumbLink}
              numberOfLines={1}
            >
              {segment}
            </Text>
          </Pressable>
        </View>
      )
    })}
  </View>
)

// ─── SearchingThinker ────────────────────────────────────────────────────────

const THINKING_PHRASES = [
  'On épluche les compositions…',
  'On déchiffre les étiquettes…',
  'On traque les ingrédients…',
  'On interroge le web…',
  'On compare les formules…',
  'On lit les listes INCI…',
  'On décode les promesses…',
  'On fouille les rayons…',
]

const SearchingThinker: FC = () => {
  const [idx, setIdx] = useState(0)
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % THINKING_PHRASES.length), 2200)
    return () => clearInterval(t)
  }, [])

  return (
    <View style={styles.thinkerRow}>
      <Ionicons name="globe-outline" size={14} color={colors.accent} />
      <Animated.Text style={[styles.thinkerText, { opacity: pulse }]} numberOfLines={1}>
        {THINKING_PHRASES[idx]}
      </Animated.Text>
    </View>
  )
}

// ─── RankBadge ───────────────────────────────────────────────────────────────

const RankBadge: FC<{ rank: number }> = ({ rank }) => (
  <View style={[styles.rankBadge, rank === 1 && styles.rankBadgeTop]}>
    {rank === 1 && (
      <Ionicons name="sparkles" size={9} color="#fff" style={styles.rankIcon} />
    )}
    <Text style={styles.rankText}>{rank}</Text>
  </View>
)

// ─── WebCandidateRow ─────────────────────────────────────────────────────────

const WebCandidateRow: FC<{
  candidate: WebCandidate
  rank?: number
  busy: boolean
  disabled: boolean
  onPress: () => void
}> = ({ candidate, rank, busy, disabled, onPress }) => {
  const label = candidate.productName ?? candidate.title ?? 'Produit trouvé sur internet'
  return (
    <Pressable style={styles.webRow} onPress={onPress} disabled={disabled || busy}>
      {rank != null && <RankBadge rank={rank} />}
      {candidate.imageUrl ? (
        <Image
          source={{ uri: candidate.imageUrl }}
          style={styles.thumb}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={150}
        />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons name="globe-outline" size={18} color={colors.accent} />
        </View>
      )}
      <View style={styles.resultMain}>
        {candidate.brand ? <Text style={styles.resultBrand}>{candidate.brand}</Text> : null}
        <Text style={styles.resultName} numberOfLines={2}>{label}</Text>
        <Text style={styles.webSourceHint}>Source : {candidate.source ?? 'web'}</Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
      )}
    </Pressable>
  )
}

// ─── ProductRow ──────────────────────────────────────────────────────────────

// Pastille catalogue → composant partagé `components/shared/CatalogPastille`
// (source de vérité unique, réutilisée par les alternatives).

const ProductRow: FC<{
  item: CatalogRow | BrowseRow
  rank?: number
  busy: boolean
  disabled: boolean
  onPress: () => void
}> = ({ item, rank, busy, disabled, onPress }) => {
  const hasInci  = Boolean(item.ingredients_text)
  const category = 'category' in item ? item.category : null
  return (
    <Pressable
      style={[styles.resultRow, !hasInci && styles.resultRowDim]}
      onPress={onPress}
      disabled={disabled || (!hasInci && busy)}
    >
      {rank != null && <RankBadge rank={rank} />}
      {item.image_url ? (
        <Image
          source={{ uri: item.image_url }}
          style={styles.thumb}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={150}
        />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons name="image-outline" size={18} color={colors.inkLight} />
        </View>
      )}
      <View style={styles.resultMain}>
        {item.brand ? <Text style={styles.resultBrand} numberOfLines={1}>{item.brand}</Text> : null}
        <Text style={styles.resultName} numberOfLines={3}>{item.name ?? 'Produit'}</Text>
        {category ? (
          <View style={[styles.categoryPill, { backgroundColor: pillColors(category).bg }]}>
            <Text
              style={[styles.categoryPillText, { color: pillColors(category).text }]}
              numberOfLines={1}
            >
              {category}
            </Text>
          </View>
        ) : null}
        {!hasInci ? (
          <Text style={styles.resultNoInci}>Composition indisponible</Text>
        ) : null}
      </View>
      {/* Pastille VerdictGauge — 5 niveaux basés sur le score PLAFONNÉ (mêmes
          plafonds orange/rouge que l'écran d'analyse → badge ↔ détail cohérents). */}
      <CatalogPastille
        score={
          item.score != null
            ? applyColorCap(item.score, item.count_orange ?? 0, item.count_rouge ?? 0)
            : null
        }
        tone={item.score_tone ?? null}
      />
      {busy ? (
        <ActivityIndicator size="small" color={colors.rose} />
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.inkLight} />
      )}
    </Pressable>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.base,
    paddingVertical: 10,
  },
  searchBarFocused: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  searchInput: {
    ...typography.body,
    color: colors.ink,
    flex: 1,
    padding: 0,
  },
  errorBox: {
    marginTop: spacing.md,
    backgroundColor: colors.roseSoft,
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.sm,
  },
  errorText: { ...typography.xs, color: colors.roseDeep },
  errorCta:  { ...typography.xsSemiBold, color: colors.roseDeep },
  list: { paddingTop: spacing.md, gap: spacing.sm },
  loadingWrap:   { paddingVertical: spacing.xl, alignItems: 'center' },
  loadingFooter: { paddingVertical: spacing.base, alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: {
    ...typography.small,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.base,
  },
  emptyCta: { ...typography.smallSemiBold, color: colors.rose },
  deepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
  deepBtnDisabled: { opacity: 0.5 },
  deepBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: '#fff' },
  deepHint: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
  upsellBox: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.lg,
    alignSelf: 'stretch',
  },
  upsellTitle: { ...typography.smallSemiBold, color: colors.ink },
  upsellText: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
  kicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    letterSpacing: 1.1,
    color: colors.inkLight,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: 12,
  },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catName: { ...typography.bodyMedium, color: colors.ink, flex: 1 },
  catHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  catHeaderTitle: { ...typography.h4, color: colors.ink },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: 12,
  },
  subName:  { ...typography.smallSemiBold, color: colors.ink, flex: 1 },
  subRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  crumbSegment: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  crumbLink:   { ...typography.xs, color: colors.inkMuted },
  crumbActive: { ...typography.xsSemiBold, color: colors.ink, maxWidth: 160 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  resultRowDim: { opacity: 0.65 },
  sectionGroup:       { gap: spacing.sm, marginBottom: spacing.lg },
  sectionKicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    letterSpacing: 1.1,
    color: colors.inkLight,
    marginBottom: spacing.xs,
  },
  sectionKickerAccent: { color: colors.accent },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.inkMuted,
    marginBottom: spacing.sm,
  },
  rankBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    flexDirection: 'row',
    gap: 2,
  },
  rankBadgeTop: { backgroundColor: colors.roseDeep },
  rankText: { fontFamily: fontFamilies.bold, fontSize: 12, color: '#fff' },
  rankIcon: { marginTop: -1 },
  categoryPill: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 4,
    maxWidth: '100%',
  },
  categoryPillText: { fontFamily: fontFamilies.semiBold, fontSize: 11 },
  sectionKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  thinkerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  thinkerText: { ...typography.smallSemiBold, color: colors.accent, flex: 1 },
  webRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    borderRadius: radius.md,
    padding: spacing.base,
  },
  webSourceHint: {
    ...typography.caption,
    color: colors.accent,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.gray100,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  resultMain:  { flex: 1, minWidth: 0 },
  resultBrand: { ...typography.caption, color: colors.inkMuted, marginBottom: 2 },
  resultName:  { ...typography.smallSemiBold, color: colors.ink },
  resultNoInci: { ...typography.caption, color: colors.inkLight, marginTop: 2 },
  // Header section recherche
  searchHeader: {
    marginBottom: spacing.sm,
  },
})
