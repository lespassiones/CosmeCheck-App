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
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography, fontFamilies } from '@/constants/typography'
import { supabase } from '@/lib/supabase/client'
import { useAndroidBack } from '@/hooks/useAndroidBack'
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

const MIN_QUERY   = 2
const DEBOUNCE_MS = 350
const BROWSE_PAGE = 24

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

export const ProductSearchMode: FC<Props> = ({
  onInciReady,
  onFallbackToManual,
  disabled = false,
}) => {
  // ── Recherche ─────────────────────────────────────────────────────────
  const [query, setQuery]                 = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CatalogRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError]     = useState<string | null>(null)
  const [searched, setSearched]           = useState(false)

  // ── Navigation arbre catégories ───────────────────────────────────────
  // path = liste de noms de nœuds depuis la racine jusqu'au nœud courant.
  // Ex : [] = racine, ['Coiffure'] = dans Coiffure, ['Coiffure','Shampooing'] = dans Shampooing.
  // Restauré depuis _nav au montage pour préserver la position après retour.
  const [path, setPath] = useState<string[]>(() => _nav.path)

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
  // Restaurés depuis _nav si on revient d'une analyse → pas de re-fetch.
  const [browseProducts, setBrowseProducts]   = useState<BrowseRow[]>(() => _nav.products)
  const [browseOffset, setBrowseOffset]       = useState(() => _nav.offset)
  const [browseHasMore, setBrowseHasMore]     = useState(() => _nav.hasMore)
  const [browseLoading, setBrowseLoading]     = useState(false)
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false)

  // Indique si on vient de restaurer _nav → on saute le fetch initial de la feuille.
  const skipInitialFetchRef = useRef(_nav.products.length > 0 && _nav.path.length > 0)

  // Sync _nav à chaque changement d'état de navigation.
  useEffect(() => { _nav.path = path },           [path])
  useEffect(() => { _nav.products = browseProducts }, [browseProducts])
  useEffect(() => { _nav.offset  = browseOffset },    [browseOffset])
  useEffect(() => { _nav.hasMore = browseHasMore },   [browseHasMore])

  // Résolution INCI lazy
  const [resolvingEan, setResolvingEan]       = useState<string | null>(null)

  // ── Fallback internet ─────────────────────────────────────────────────
  const [webResults, setWebResults]           = useState<WebCandidate[]>([])
  const [webLoading, setWebLoading]           = useState(false)
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
      return
    }
    const reqId = ++reqIdRef.current
    setSearchLoading(true)
    setSearchError(null)
    setWebResults([])
    void (async () => {
      try {
        const { data, error } = await supabase.rpc(
          'cosme_check_search_catalog' as never,
          { p_query: trimmed, p_limit: 20 } as never,
        )
        if (reqId !== reqIdRef.current) return
        if (error) {
          setSearchError('Recherche indisponible pour le moment.')
          setSearchResults([])
        } else {
          setSearchResults((data as CatalogRow[] | null) ?? [])
        }
      } catch {
        if (reqId !== reqIdRef.current) return
        setSearchError('Connexion impossible. Réessaie.')
        setSearchResults([])
      } finally {
        if (reqId === reqIdRef.current) {
          setSearchLoading(false)
          setSearched(true)
        }
      }
    })()
  }, [debouncedQuery])

  // ── Fallback internet ─────────────────────────────────────────────────
  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    if (
      !searched ||
      searchLoading ||
      searchError ||
      searchResults.length > 0 ||
      trimmed.length < 3
    ) return
    const reqId = ++webReqIdRef.current
    setWebLoading(true)
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('product-suggest', {
          body: { query: trimmed, page: 1 },
        })
        if (reqId !== webReqIdRef.current) return
        if (error) { setWebResults([]); return }
        const res = data as { candidates?: WebCandidate[]; webCandidates?: WebCandidate[] } | null
        setWebResults([...(res?.candidates ?? []), ...(res?.webCandidates ?? [])])
      } catch {
        if (reqId !== webReqIdRef.current) return
        setWebResults([])
      } finally {
        if (reqId === webReqIdRef.current) setWebLoading(false)
      }
    })()
  }, [debouncedQuery, searched, searchLoading, searchError, searchResults.length])

  // ── Chargement produits quand on arrive sur une feuille ───────────────
  useEffect(() => {
    if (!leafSlug) {
      setBrowseProducts([])
      setBrowseOffset(0)
      setBrowseHasMore(false)
      return
    }
    // Restauration depuis _nav : produits déjà en mémoire, pas de re-fetch.
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false
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
    if (level === 0) {
      // Retour à la racine → on efface _nav pour repartir propre
      _nav.path = []
      _nav.products = []
      _nav.offset = 0
      _nav.hasMore = false
    }
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
    const showWebSection =
      searched && !searchLoading && (webLoading || webResults.length > 0)
    const showNoResults =
      searched && !searchLoading && !searchError &&
      searchResults.length === 0 && !webLoading && webResults.length === 0

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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {searchResults.length > 0 && (
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionKicker}>DANS NOTRE BASE</Text>
              <Text style={styles.sectionSubtitle}>Les plus pertinents</Text>
              {searchResults.map((item, i) => {
                const busy = resolvingEan != null && resolvingEan === (item.ean ?? item.name ?? '')
                return (
                  <ProductRow
                    key={item.ean ?? `${item.name ?? 'row'}-${i}`}
                    item={item}
                    rank={i + 1}
                    busy={busy}
                    disabled={disabled || resolvingEan != null}
                    onPress={() => void pickCatalog(item)}
                  />
                )
              })}
            </View>
          )}

          {showWebSection && (
            <View style={styles.sectionGroup}>
              {webResults.length === 0 && webLoading ? (
                <SearchingThinker />
              ) : (
                <>
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
                </>
              )}
            </View>
          )}

          {showNoResults && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Aucun produit trouvé pour « {debouncedQuery.trim()} ».
              </Text>
              <Pressable onPress={onFallbackToManual}>
                <Text style={styles.emptyCta}>Coller la liste INCI</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
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
            contentContainerStyle={styles.list}
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
          contentContainerStyle={styles.list}
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
        contentContainerStyle={styles.list}
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
        {item.brand ? <Text style={styles.resultBrand}>{item.brand}</Text> : null}
        <Text style={styles.resultName} numberOfLines={2}>{item.name ?? 'Produit'}</Text>
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
      {busy ? (
        <ActivityIndicator size="small" color={colors.rose} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
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
  list: { paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
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
})
