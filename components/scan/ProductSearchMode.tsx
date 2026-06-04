/**
 * ProductSearchMode — recherche d'un produit dans le catalogue.
 *
 * Twin mobile de `cosmetwiki/components/browse/ProductBrowsePage.tsx`. Au repos
 * (barre de recherche vide) affiche la grille des CATÉGORIES (`cosme_check_get_category_counts`).
 * Tap sur une catégorie → liste des sous-catégories triées par compte. Tap sur
 * une sous-catégorie → grille des produits paginée
 * (`cosme_check_browse_subcategory`).
 *
 * Dès que l'utilisateur tape ≥ 2 caractères dans la barre, on bascule en mode
 * RECHERCHE (RPC `cosme_check_search_catalog`, ILIKE %query%) : les résultats
 * remplacent la navigation par catégories. Effacer la barre = retour à la grille.
 *
 * Tap sur un produit :
 *  - INCI déjà en catalogue → onInciReady direct (source 'search').
 *  - Pas d'INCI → repli Edge Function `product-search` (résolution lazy).
 *
 * Émet onInciReady(inci, productName?, brand?, ean?).
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
import { useQuery } from '@tanstack/react-query'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography, fontFamilies } from '@/constants/typography'
import { supabase } from '@/lib/supabase/client'

type IoniconName = keyof typeof Ionicons.glyphMap

// ─── Types des RPC ──────────────────────────────────────────────────────────

interface CategoryCount {
  category: string
  subcategory: string
  cnt: number
}

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

/** Candidat issu de la recherche internet (product-suggest fallback). */
interface WebCandidate {
  id: string
  brand: string | null
  productName: string | null
  ingredientsText?: string
  imageUrl?: string | null
  sourceUrl?: string | null
  source?: string
  /** Titre brut (pour les candidats web search). */
  title?: string
}

// ─── Mapping catégorie → icône monochrome (Ionicons) ────────────────────────

const CATEGORY_ICON: Record<string, IoniconName> = {
  'Soin du visage': 'happy-outline',
  'Soin du corps': 'body-outline',
  'Hygiène du corps': 'water-outline',
  'Coiffure': 'cut-outline',
  'Maquillage': 'color-palette-outline',
  'Protection solaire': 'sunny-outline',
  'Parfum': 'flower-outline',
  'Hygiène dentaire': 'medkit-outline',
  'Soin bébé': 'person-outline',
  'Rasage & épilation': 'leaf-outline',
  'Manucure & pédicure': 'hand-left-outline',
  'Bien-être': 'heart-outline',
}

const DEFAULT_ICON: IoniconName = 'pricetag-outline'

function iconFor(category: string): IoniconName {
  return CATEGORY_ICON[category] ?? DEFAULT_ICON
}

// ─── Pastille catégorie : couleur stable dérivée du libellé ─────────────────

const PILL_PALETTE: { bg: string; text: string }[] = [
  { bg: colors.rating.vert.bg, text: colors.rating.vert.text },
  { bg: colors.rating.orange.bg, text: colors.rating.orange.text },
  { bg: colors.accentSoft, text: colors.accent },
  { bg: colors.roseSoft, text: colors.roseDeep },
  { bg: colors.rating.jaune.bg, text: colors.rating.jaune.text },
]

/** Même libellé → même couleur (hash déterministe, pas de Math.random). */
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

const MIN_QUERY = 2
const DEBOUNCE_MS = 350
const BROWSE_PAGE = 24

export const ProductSearchMode: FC<Props> = ({
  onInciReady,
  onFallbackToManual,
  disabled = false,
}) => {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CatalogRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  // Navigation catégorie / sous-catégorie
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)

  // Pagination produits sous-catégorie
  const [browseProducts, setBrowseProducts] = useState<BrowseRow[]>([])
  const [browseOffset, setBrowseOffset] = useState(0)
  const [browseHasMore, setBrowseHasMore] = useState(false)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false)

  // Résolution INCI lazy pour un produit sans composition en catalogue.
  const [resolvingEan, setResolvingEan] = useState<string | null>(null)

  // ── Fallback internet (product-suggest) quand le catalogue est vide ──
  const [webResults, setWebResults] = useState<WebCandidate[]>([])
  const [webLoading, setWebLoading] = useState(false)
  const [resolvingWebId, setResolvingWebId] = useState<string | null>(null)

  const reqIdRef = useRef(0)
  const webReqIdRef = useRef(0)

  // ── 1. Catégories : 1 seul fetch (cache react-query 1h) ───────────────
  const { data: categoryCounts = [] } = useQuery<CategoryCount[]>({
    queryKey: ['categoryCounts'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'cosme_check_get_category_counts' as never,
      )
      if (error) return []
      const rows = (data as CategoryCount[] | null) ?? []
      // Cohérent avec le web : on ne montre que les sous-catégories avec ≥ 10 produits.
      return rows.filter((r) => r.cnt >= 10)
    },
  })

  const groupedCategories = useMemo(() => {
    const map: Record<string, { subcategory: string; cnt: number }[]> = {}
    for (const c of categoryCounts) {
      if (!map[c.category]) map[c.category] = []
      map[c.category].push({ subcategory: c.subcategory, cnt: c.cnt })
    }
    return map
  }, [categoryCounts])

  // ── 2. Debounce de la requête saisie ──────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  // ── 3. Mode recherche : appel RPC quand debouncedQuery ≥ 2 ────────────
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

  // ── 3b. Fallback internet : product-suggest si catalogue vide ────────
  // Déclenché après que la recherche catalogue ait abouti et renvoyé 0 résultat.
  // Pas de fallback si la requête est trop courte (< 3 chars, contrainte de
  // product-suggest) ou si le catalogue a déjà des résultats.
  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    if (
      !searched ||
      searchLoading ||
      searchError ||
      searchResults.length > 0 ||
      trimmed.length < 3
    ) {
      return
    }
    const reqId = ++webReqIdRef.current
    setWebLoading(true)
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('product-suggest', {
          body: { query: trimmed, page: 1 },
        })
        if (reqId !== webReqIdRef.current) return
        if (error) {
          setWebResults([])
          return
        }
        const res = data as {
          candidates?: WebCandidate[]
          webCandidates?: WebCandidate[]
        } | null
        // Concatène candidats (OBF/INCIDecoder/cache) + web (DDG/OpenAI)
        const merged: WebCandidate[] = [
          ...(res?.candidates ?? []),
          ...(res?.webCandidates ?? []),
        ]
        setWebResults(merged)
      } catch {
        if (reqId !== webReqIdRef.current) return
        setWebResults([])
      } finally {
        if (reqId === webReqIdRef.current) setWebLoading(false)
      }
    })()
  }, [debouncedQuery, searched, searchLoading, searchError, searchResults.length])

  // ── 4. Chargement de la 1ère page produits quand la sous-catégorie change
  useEffect(() => {
    if (!selectedSubcategory) {
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
          'cosme_check_browse_subcategory' as never,
          {
            p_subcategory: selectedSubcategory,
            p_limit: BROWSE_PAGE,
            p_offset: 0,
          } as never,
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
        if (!cancelled) {
          setBrowseProducts([])
          setBrowseHasMore(false)
        }
      } finally {
        if (!cancelled) setBrowseLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedSubcategory])

  const loadMoreBrowse = useCallback(async () => {
    if (!selectedSubcategory || browseLoadingMore || !browseHasMore) return
    setBrowseLoadingMore(true)
    try {
      const { data, error } = await supabase.rpc(
        'cosme_check_browse_subcategory' as never,
        {
          p_subcategory: selectedSubcategory,
          p_limit: BROWSE_PAGE,
          p_offset: browseOffset,
        } as never,
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
  }, [selectedSubcategory, browseOffset, browseLoadingMore, browseHasMore])

  // ── 5b. Choix d'un candidat internet (product-suggest) ────────────────
  const pickWebCandidate = useCallback(
    async (candidate: WebCandidate) => {
      if (disabled) return
      const label =
        candidate.productName ?? candidate.title ?? undefined
      const brand = candidate.brand ?? undefined
      const imageUrl = candidate.imageUrl ?? undefined

      // Si l'INCI est déjà disponible (rare pour les sources web, mais
      // possible pour le cache/OBF) — lancement direct.
      const direct = candidate.ingredientsText?.trim()
      if (direct && direct.length >= 10) {
        onInciReady(direct, label, brand, undefined, imageUrl)
        return
      }

      // Sinon → repli Edge Function `product-search` pour résoudre l'INCI.
      setResolvingWebId(candidate.id)
      try {
        const queryStr = [brand, label].filter(Boolean).join(' ').trim()
        const { data, error } = await supabase.functions.invoke('product-search', {
          body: { query: queryStr },
        })
        if (error) throw error
        const hit = data as
          | {
              found?: boolean
              ingredientsText?: string
              brand?: string | null
              productName?: string | null
              imageUrl?: string | null
            }
          | null
        const inci = hit?.found ? hit.ingredientsText?.trim() : undefined
        if (inci && inci.length >= 10) {
          onInciReady(
            inci,
            hit?.productName ?? label,
            hit?.brand ?? brand,
            undefined,
            hit?.imageUrl ?? imageUrl,
          )
        } else {
          setSearchError(
            "Composition introuvable pour ce produit. Tu peux coller la liste INCI manuellement.",
          )
        }
      } catch {
        setSearchError('Recherche produit indisponible. Colle la liste INCI manuellement.')
      } finally {
        setResolvingWebId(null)
      }
    },
    [disabled, onInciReady],
  )

  // ── 5. Choix d'un produit (catalogue / browse) ────────────────────────
  const pickCatalog = useCallback(
    async (row: CatalogRow | BrowseRow) => {
      if (disabled) return
      const label = row.name ?? undefined
      const brand = row.brand ?? undefined
      const ean = ('ean' in row ? row.ean : undefined) ?? undefined
      const imageUrl = row.image_url ?? undefined

      const direct = row.ingredients_text?.trim()
      if (direct && direct.length >= 10) {
        onInciReady(direct, label, brand, ean, imageUrl)
        return
      }
      // Pas d'INCI → repli Edge Function product-search.
      setResolvingEan(ean ?? label ?? '')
      try {
        const queryStr = [brand, label].filter(Boolean).join(' ').trim()
        const { data, error } = await supabase.functions.invoke('product-search', {
          body: { query: queryStr, ean },
        })
        if (error) throw error
        const hit = data as
          | {
              found?: boolean
              ingredientsText?: string
              brand?: string | null
              productName?: string | null
              imageUrl?: string | null
            }
          | null
        const inci = hit?.found ? hit.ingredientsText?.trim() : undefined
        if (inci && inci.length >= 10) {
          onInciReady(
            inci,
            hit?.productName ?? label,
            hit?.brand ?? brand,
            ean,
            hit?.imageUrl ?? imageUrl,
          )
        } else {
          setSearchError(
            'Composition introuvable. Tu peux coller la liste INCI manuellement.',
          )
        }
      } catch {
        setSearchError(
          'Recherche produit indisponible. Colle la liste INCI manuellement.',
        )
      } finally {
        setResolvingEan(null)
      }
    },
    [disabled, onInciReady],
  )

  // ── Navigation helpers ────────────────────────────────────────────────
  const goCategories = () => {
    setSelectedCategory(null)
    setSelectedSubcategory(null)
  }
  const goCategory = (cat: string) => {
    setSelectedCategory(cat)
    setSelectedSubcategory(null)
  }
  const goSubcategory = (sub: string) => {
    setSelectedSubcategory(sub)
  }

  // ── Vue : barre de recherche (toujours visible en haut) ───────────────

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

  // ─── MODE RECHERCHE ──────────────────────────────────────────────────
  if (showSearch) {
    const showWebSection =
      searched && !searchLoading && (webLoading || webResults.length > 0)
    const showNoResults =
      searched &&
      !searchLoading &&
      !searchError &&
      searchResults.length === 0 &&
      !webLoading &&
      webResults.length === 0

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
          {/* Résultats catalogue */}
          {searchResults.length > 0 && (
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionKicker}>DANS NOTRE BASE</Text>
              <Text style={styles.sectionSubtitle}>Les plus pertinents</Text>
              {searchResults.map((item, i) => {
                const busy =
                  resolvingEan != null &&
                  resolvingEan === (item.ean ?? item.name ?? '')
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

          {/* Section "Trouvé sur internet" */}
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
                  <Text style={styles.sectionSubtitle}>
                    Résultats les plus pertinents
                  </Text>
                  {webResults.map((c, i) => {
                    const busy = resolvingWebId === c.id
                    return (
                      <WebCandidateRow
                        key={c.id || `web-${i}`}
                        candidate={c}
                        rank={i + 1}
                        busy={busy}
                        disabled={disabled || resolvingWebId != null}
                        onPress={() => void pickWebCandidate(c)}
                      />
                    )
                  })}
                </>
              )}
            </View>
          )}

          {/* Aucun résultat (catalogue ET internet vides) */}
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

  // ─── MODE BROWSE : produits d'une sous-catégorie ─────────────────────
  if (selectedSubcategory) {
    return (
      <View style={styles.root}>
        {searchBar}
        <Breadcrumb
          category={selectedCategory}
          subcategory={selectedSubcategory}
          onCategories={goCategories}
          onCategory={() => selectedCategory && goCategory(selectedCategory)}
        />
        {browseLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.rose} />
          </View>
        ) : browseProducts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              Aucun produit trouvé dans cette sous-catégorie.
            </Text>
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

  // ─── MODE BROWSE : liste des sous-catégories d'une catégorie ─────────
  if (selectedCategory) {
    const subs = (groupedCategories[selectedCategory] ?? []).slice().sort(
      (a, b) => b.cnt - a.cnt,
    )
    return (
      <View style={styles.root}>
        {searchBar}
        <Breadcrumb
          category={selectedCategory}
          subcategory={null}
          onCategories={goCategories}
          onCategory={() => {}}
        />
        <View style={styles.catHeaderRow}>
          <Ionicons name={iconFor(selectedCategory)} size={22} color={colors.accent} />
          <Text style={styles.catHeaderTitle}>{selectedCategory}</Text>
        </View>
        <FlatList
          data={subs}
          keyExtractor={(item) => item.subcategory}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.subRow}
              onPress={() => goSubcategory(item.subcategory)}
              disabled={disabled}
            >
              <Text style={styles.subName} numberOfLines={1}>
                {item.subcategory}
              </Text>
              <View style={styles.subRight}>
                <Text style={styles.subCount}>{item.cnt.toLocaleString()}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
              </View>
            </Pressable>
          )}
        />
      </View>
    )
  }

  // ─── MODE BROWSE : grille des catégories top-level ───────────────────
  const categoryNames = Object.keys(groupedCategories)
  return (
    <View style={styles.root}>
      {searchBar}
      <Text style={styles.kicker}>CATÉGORIES</Text>
      {categoryNames.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Les catégories seront disponibles dès que la classification du
            catalogue est prête.
          </Text>
        </View>
      ) : (
        <FlatList
          data={categoryNames}
          keyExtractor={(c) => c}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item: cat }) => (
            <Pressable
              style={styles.catRow}
              onPress={() => goCategory(cat)}
              disabled={disabled}
              accessibilityRole="button"
            >
              <View style={styles.catIcon}>
                <Ionicons name={iconFor(cat)} size={20} color={colors.accent} />
              </View>
              <Text style={styles.catName}>{cat}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
            </Pressable>
          )}
        />
      )}
    </View>
  )
}

// ─── Sous-composants ────────────────────────────────────────────────────────

/** Fil d'Ariane « Catégories › Coiffure › Shampooings ». */
const Breadcrumb: FC<{
  category: string | null
  subcategory: string | null
  onCategories: () => void
  onCategory: () => void
}> = ({ category, subcategory, onCategories, onCategory }) => (
  <View style={styles.breadcrumb}>
    <Pressable onPress={onCategories} hitSlop={6}>
      <Text style={styles.crumbLink}>Catégories</Text>
    </Pressable>
    {category ? (
      <>
        <Ionicons name="chevron-forward" size={12} color={colors.inkLight} />
        <Pressable onPress={onCategory} hitSlop={6} disabled={!subcategory}>
          <Text
            style={subcategory ? styles.crumbLink : styles.crumbActive}
            numberOfLines={1}
          >
            {category}
          </Text>
        </Pressable>
      </>
    ) : null}
    {subcategory ? (
      <>
        <Ionicons name="chevron-forward" size={12} color={colors.inkLight} />
        <Text style={styles.crumbActive} numberOfLines={1}>
          {subcategory}
        </Text>
      </>
    ) : null}
  </View>
)

/**
 * Indicateur « thinking » pendant la recherche internet. Fait défiler des
 * phrases liées à notre domaine (compositions, INCI, formules…) avec une
 * pulsation douce, dans l'esprit des statuts animés des assistants IA.
 */
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

const THINKING_INTERVAL_MS = 2200

const SearchingThinker: FC = () => {
  const [idx, setIdx] = useState(0)
  const pulse = useRef(new Animated.Value(1)).current

  // Pulsation continue (effet "vivant").
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  // Rotation des phrases tant que la recherche tourne.
  useEffect(() => {
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % THINKING_PHRASES.length)
    }, THINKING_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  return (
    <View style={styles.thinkerRow}>
      <Ionicons name="globe-outline" size={14} color={colors.accent} />
      <Animated.Text
        style={[styles.thinkerText, { opacity: pulse }]}
        numberOfLines={1}
      >
        {THINKING_PHRASES[idx]}
      </Animated.Text>
    </View>
  )
}

/** Pastille de rang (1, 2, 3…) avec une icône sur le premier résultat. */
const RankBadge: FC<{ rank: number }> = ({ rank }) => (
  <View style={[styles.rankBadge, rank === 1 && styles.rankBadgeTop]}>
    {rank === 1 && (
      <Ionicons name="sparkles" size={9} color="#fff" style={styles.rankIcon} />
    )}
    <Text style={styles.rankText}>{rank}</Text>
  </View>
)

/** Ligne candidat internet — visuel distinct (badge + lien externe). */
const WebCandidateRow: FC<{
  candidate: WebCandidate
  rank?: number
  busy: boolean
  disabled: boolean
  onPress: () => void
}> = ({ candidate, rank, busy, disabled, onPress }) => {
  const label =
    candidate.productName ?? candidate.title ?? 'Produit trouvé sur internet'
  return (
    <Pressable
      style={styles.webRow}
      onPress={onPress}
      disabled={disabled || busy}
    >
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
        {candidate.brand ? (
          <Text style={styles.resultBrand}>{candidate.brand}</Text>
        ) : null}
        <Text style={styles.resultName} numberOfLines={2}>
          {label}
        </Text>
        <Text style={styles.webSourceHint}>
          Source : {candidate.source ?? 'web'}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
      )}
    </Pressable>
  )
}

/** Ligne produit unifiée (résultats recherche OU browse sous-catégorie). */
const ProductRow: FC<{
  item: CatalogRow | BrowseRow
  rank?: number
  busy: boolean
  disabled: boolean
  onPress: () => void
}> = ({ item, rank, busy, disabled, onPress }) => {
  const hasInci = Boolean(item.ingredients_text)
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
        <Text style={styles.resultName} numberOfLines={2}>
          {item.name ?? 'Produit'}
        </Text>
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

// ─── Styles ─────────────────────────────────────────────────────────────────

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
  errorCta: { ...typography.xsSemiBold, color: colors.roseDeep },
  list: { paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  loadingWrap: { paddingVertical: spacing.xl, alignItems: 'center' },
  loadingFooter: { paddingVertical: spacing.base, alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: {
    ...typography.small,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.base,
  },
  emptyCta: { ...typography.smallSemiBold, color: colors.rose },
  // Kicker "CATÉGORIES"
  kicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    letterSpacing: 1.1,
    color: colors.inkLight,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  // Ligne catégorie top-level
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
  // Header sous-catégorie (icône + nom catégorie)
  catHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  catHeaderTitle: { ...typography.h4, color: colors.ink },
  // Sous-catégorie
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
  subName: { ...typography.smallSemiBold, color: colors.ink, flex: 1 },
  subRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  subCount: { ...typography.xs, color: colors.inkMuted },
  // Breadcrumb
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  crumbLink: { ...typography.xs, color: colors.inkMuted },
  crumbActive: { ...typography.xsSemiBold, color: colors.ink },
  // Produit (résultat recherche / browse)
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
  // Sections
  sectionGroup: { gap: spacing.sm, marginBottom: spacing.lg },
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
  // Badge de rang (1, 2, 3…)
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
  rankText: {
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    color: '#fff',
  },
  rankIcon: { marginTop: -1 },
  // Pastille catégorie
  categoryPill: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 4,
    maxWidth: '100%',
  },
  categoryPillText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
  },
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
  thinkerText: {
    ...typography.smallSemiBold,
    color: colors.accent,
    flex: 1,
  },
  // Ligne candidat web
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
  resultMain: { flex: 1, minWidth: 0 },
  resultBrand: { ...typography.caption, color: colors.inkMuted, marginBottom: 2 },
  resultName: { ...typography.smallSemiBold, color: colors.ink },
  resultNoInci: { ...typography.caption, color: colors.inkLight, marginTop: 2 },
})
