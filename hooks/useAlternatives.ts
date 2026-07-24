/**
 * useAlternatives — recommandations « produits similaires » pour l'écran d'analyse.
 *
 * Pipeline (aucun GPT) :
 *   1. Résout une REQUÊTE CATÉGORIE robuste (cf. lib/catalog/productTypeCategory.ts) :
 *      catégorie catalogue SI slug spécifique → match exact ; sinon product_type
 *      → préfixe taxonomie ; sinon nom → préfixe ; sinon ABSTENTION (rien affiché).
 *      Cela évite de pivoter sur un bucket poubelle (« gel ») → alternatives
 *      hors-sujet (bug bêta juil 2026 : nettoyant visage → savon mains, gel bébé…).
 *   2. Construit l'ensemble d'exclusion (restrictions ingrédients + familles
 *      étendues en noms INCI + allergies freeform du profil).
 *   3. Récupère par pages les produits de la catégorie résolue triés par score
 *      (`cosme_check_alternatives_by_category_{exact,prefix}`), les FILTRE côté
 *      client, et accumule jusqu'à la cible (ou épuisement / plafond de scan).
 *
 * La pagination « Voir plus » augmente la cible de `step` ; l'effet refait
 * tourner la boucle de remplissage. Le filtrage pouvant écarter beaucoup de
 * candidats, on borne le scan à SCAN_CAP lignes brutes pour rester prévisible.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { useProfile } from '@/hooks/useProfile'
import { resolveCatalogIdentity } from '@/lib/catalog/resolveCatalogIdentity'
import { fetchProductByEan } from '@/lib/catalog/productByEan'
import { resolveAlternativesQuery } from '@/lib/catalog/productTypeCategory'
import { fetchFamilyIngredientNames } from '@/lib/catalog/familyIngredientNames'
import { applyColorCap } from '@/lib/analysis/scoreCap'
import { orderByTierShuffled } from '@/lib/analysis/tierShuffle'
import {
  buildExclusionSet,
  filterAlternatives,
  normalizeToken,
  type AlternativeProduct,
  type ExclusionSet,
} from '@/lib/analysis/alternativesFilter'
import { supabase } from '@/lib/supabase/client'

const RAW_PAGE = 40
/** Plafond de lignes brutes scannées pour trouver des produits « propres ». */
const SCAN_CAP = 240
/** Taille du VIVIER accumulé quand on mélange (graine) : donne de la variété
 *  dans chaque tier au lieu de toujours afficher les mêmes premiers. */
const POOL_MIN = 32
const HOUR = 60 * 60 * 1000

interface AltRpcRow {
  ean: string
  brand: string | null
  name: string | null
  image_url: string | null
  score: number | null
  score_label: string | null
  score_tone: string | null
  count_total: number | null
  ingredients_text: string | null
  count_orange: number | null
  count_rouge: number | null
}

function mapRow(r: AltRpcRow): AlternativeProduct {
  return {
    ean: r.ean,
    brand: r.brand,
    name: r.name,
    imageUrl: r.image_url,
    score: r.score,
    scoreLabel: r.score_label,
    scoreTone: r.score_tone,
    countTotal: r.count_total,
    ingredientsText: r.ingredients_text,
    countOrange: r.count_orange ?? 0,
    countRouge: r.count_rouge ?? 0,
  }
}

/**
 * Une page de candidats bruts, cachée 5 min (transient, comme la recherche).
 * `key` encode la requête catégorie résolue par `resolveAlternativesQuery` :
 *   - `exact:<slug>`  → match EXACT sur une catégorie feuille SPÉCIFIQUE
 *                       (cosme_check_alternatives_by_category_exact) ;
 *   - `prefix:<l1/l2/%>` → match LIKE sur un préfixe de taxonomie dérivé du
 *                       product_type / nom (cosme_check_alternatives_by_category_prefix).
 * L'ancien chemin par EAN (`cosme_check_get_alternatives`) est ABANDONNÉ : il
 * pivotait sur la catégorie propre du produit, y compris quand celle-ci était un
 * bucket poubelle (« gel »), d'où des alternatives hors-sujet (bug bêta juil 2026).
 */
async function fetchAlternativesPage(
  qc: QueryClient,
  key: string,
  offset: number,
): Promise<AlternativeProduct[]> {
  return qc.fetchQuery({
    queryKey: ['alternatives', key, offset],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const isPrefix = key.startsWith('prefix:')
      const { data, error } = isPrefix
        ? await supabase.rpc(
            'cosme_check_alternatives_by_category_prefix' as never,
            { p_prefix: key.slice(7), p_limit: RAW_PAGE, p_offset: offset } as never,
          )
        : await supabase.rpc(
            'cosme_check_alternatives_by_category_exact' as never,
            { p_category: key.slice(6), p_limit: RAW_PAGE, p_offset: offset } as never,
          )
      if (error) throw error
      return ((data as AltRpcRow[] | null) ?? []).map(mapRow)
    },
  })
}


export interface UseAlternativesParams {
  /** EAN direct (page « Voir tout ») — court-circuite la résolution marque+nom. */
  ean?: string | null
  brand?: string | null
  productName?: string | null
  /**
   * `product_type` de l'analyseur (ex. « Nettoyant visage »). Signal FONCTIONNEL
   * le plus robuste aux noms marketing : mappé vers un préfixe de taxonomie et
   * utilisé dès que la catégorie catalogue n'est pas un slug spécifique fiable.
   */
  productType?: string | null
  /**
   * Catégorie du produit (label/slug). Utilisée en REPLI quand aucun EAN n'est
   * résoluble — typiquement un produit trouvé sur internet, absent du catalogue :
   * on cherche alors des alternatives de la même catégorie via l'index inversé.
   */
  category?: string | null
  /**
   * Graine du mélange « aléatoire contrôlé » (typiquement l'ID de l'analyse).
   * Fournie → les alternatives sont mélangées DANS chaque tier de pastille
   * (variété par analyse, stable pour une analyse donnée). Absente → tri par
   * score classique (ex. page « Voir tout »).
   */
  seed?: string | null
  initialCount: number
  step: number
  enabled?: boolean
}

export interface UseAlternativesResult {
  products: AlternativeProduct[]
  currentEan: string | null
  isInitialLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  /** True quand l'EAN est résolu mais aucune alternative (filtrée) n'existe. */
  isEmpty: boolean
  loadMore: () => void
}

const EMPTY_NAMES: string[] = []

export function useAlternatives({
  ean: directEan,
  brand,
  productName,
  productType,
  category,
  seed,
  initialCount,
  step,
  enabled = true,
}: UseAlternativesParams): UseAlternativesResult {
  const queryClient = useQueryClient()
  const { restrictions, skin } = useProfile()

  // 1a. Résolution marque+nom → identité catalogue (EAN + catégorie + score).
  //     Utilisée sur l'écran d'analyse (pas d'EAN direct).
  const identityKey = normalizeToken([brand, productName].filter(Boolean).join(' '))
  const identityQuery = useQuery({
    queryKey: ['alt-identity', identityKey],
    enabled: enabled && !directEan && identityKey.length >= 3,
    staleTime: HOUR,
    gcTime: HOUR,
    queryFn: () => resolveCatalogIdentity(brand, productName),
  })

  // 1b. Page « Voir tout » : on n'a QUE l'EAN → on récupère la ligne catalogue
  //     (catégorie + nom) pour reconstruire les mêmes signaux que le carrousel.
  const directRowQuery = useQuery({
    queryKey: ['alt-direct-row', directEan],
    enabled: enabled && !!directEan,
    staleTime: HOUR,
    gcTime: HOUR,
    queryFn: () => fetchProductByEan(directEan as string),
  })

  const ean = directEan ?? identityQuery.data?.ean ?? null
  // Signaux de catégorie, unifiés pour les deux points d'entrée.
  const catalogCategory = directEan
    ? directRowQuery.data?.category ?? null
    : identityQuery.data?.category ?? null
  const nameSignal = directEan ? directRowQuery.data?.name ?? null : productName ?? null
  const identityResolving = !directEan
    ? identityQuery.isLoading && identityKey.length >= 3
    : directRowQuery.isLoading

  // Résolution ROBUSTE (cf. lib/catalog/productTypeCategory.ts) :
  //   1. catégorie catalogue SI slug spécifique (≥ 2 niveaux) → match EXACT ;
  //   2. product_type → préfixe de taxonomie (LIKE) ;
  //   3. nom du produit → préfixe (mot-clé fort) ;
  //   4. sinon → null (abstention : aucune alternative plutôt qu'une reco hors-sujet).
  // `category` (prop, ex. produit internet) sert de repli catalogue supplémentaire.
  const altQuery = useMemo(() => {
    if (identityResolving) return null
    return resolveAlternativesQuery({
      catalogCategory: catalogCategory ?? category ?? null,
      productType,
      productName: nameSignal,
    })
  }, [identityResolving, catalogCategory, category, productType, nameSignal])

  const altKey = altQuery
    ? altQuery.kind === 'prefix'
      ? `prefix:${altQuery.value}`
      : `exact:${altQuery.value}`
    : null

  // 2. Familles → noms INCI membres (caché 1h).
  const familySlugs = useMemo(
    () => [...restrictions.families].sort(),
    [restrictions.families],
  )
  const familyQuery = useQuery({
    queryKey: ['family-inci-names', familySlugs],
    enabled: enabled && familySlugs.length > 0,
    staleTime: HOUR,
    gcTime: HOUR,
    queryFn: () => fetchFamilyIngredientNames(familySlugs),
  })
  const familyNames =
    familySlugs.length === 0 ? EMPTY_NAMES : familyQuery.data ?? EMPTY_NAMES
  // « prêt » dès qu'on n'attend plus l'expansion des familles.
  const exclusionReady =
    familySlugs.length === 0 || familyQuery.isSuccess || familyQuery.isError

  const exclusion = useMemo<ExclusionSet>(
    () =>
      buildExclusionSet({
        restrictions,
        familyIngredientNames: familyNames,
        allergiesFreeform: skin.allergiesFreeform,
      }),
    [restrictions, familyNames, skin.allergiesFreeform],
  )

  // 3. Accumulation + filtrage paginé.
  const [raw, setRaw] = useState<AlternativeProduct[]>([])
  const [target, setTarget] = useState(initialCount)
  const [exhausted, setExhausted] = useState(false)
  const [scanned, setScanned] = useState(0)
  const [filling, setFilling] = useState(false)

  // Refs pour lire l'état frais dans la boucle async (évite les closures périmées).
  const rawRef = useRef(raw)
  const offsetRef = useRef(0)
  const exhaustedRef = useRef(false)
  const targetRef = useRef(target)
  const exclusionRef = useRef(exclusion)
  const fillingRef = useRef(false)
  rawRef.current = raw
  targetRef.current = target
  exclusionRef.current = exclusion

  // Vivier à accumuler : plus large que l'affichage quand on mélange (graine),
  // pour que le tirage dans chaque tier ait de la variété.
  const poolTarget = seed ? Math.max(target, POOL_MIN) : target
  const poolTargetRef = useRef(poolTarget)
  poolTargetRef.current = poolTarget

  // Filtré (restrictions/profil) PUIS re-trié par score PLAFONNÉ (plancher
  // couleur) : les recommandations réellement bonnes remontent en premier, et
  // la note affichée = celle qu'on verra au clic.
  const filtered = useMemo(() => {
    const capped = (p: AlternativeProduct) =>
      applyColorCap(p.score ?? 0, p.countOrange, p.countRouge)
    return filterAlternatives(raw, exclusion)
      .slice()
      .sort((a, b) => capped(b) - capped(a))
  }, [raw, exclusion])

  // Réinitialise quand le produit cible change (nouvel EAN).
  useEffect(() => {
    rawRef.current = []
    offsetRef.current = 0
    exhaustedRef.current = false
    fillingRef.current = false
    setRaw([])
    setExhausted(false)
    setScanned(0)
    setTarget(initialCount)
  }, [altKey, initialCount])

  const fill = useCallback(async () => {
    if (!altKey || !exclusionReady || fillingRef.current) return
    fillingRef.current = true
    setFilling(true)
    try {
      while (
        filterAlternatives(rawRef.current, exclusionRef.current).length <
          poolTargetRef.current &&
        !exhaustedRef.current &&
        offsetRef.current < SCAN_CAP
      ) {
        const page = await fetchAlternativesPage(queryClient, altKey, offsetRef.current)
        offsetRef.current += RAW_PAGE
        setScanned(offsetRef.current)
        if (page.length < RAW_PAGE) {
          exhaustedRef.current = true
          setExhausted(true)
        }
        if (page.length === 0) break
        rawRef.current = [...rawRef.current, ...page]
        setRaw(rawRef.current)
      }
    } catch {
      // Échec réseau : on s'arrête, l'état courant (souvent vide) gère l'affichage.
      exhaustedRef.current = true
      setExhausted(true)
    } finally {
      fillingRef.current = false
      setFilling(false)
    }
  }, [altKey, exclusionReady, queryClient])

  useEffect(() => {
    if (!enabled || !altKey || !exclusionReady) return
    if (filtered.length < poolTarget && !exhausted && offsetRef.current < SCAN_CAP) {
      void fill()
    }
  }, [enabled, altKey, exclusionReady, filtered.length, poolTarget, exhausted, fill])

  const loadMore = useCallback(() => {
    setTarget((t) => t + step)
  }, [step])

  // Mélange « aléatoire contrôlé » DANS chaque tier de pastille quand une graine
  // (ID d'analyse) est fournie ; sinon tri par score classique.
  const displayPool = seed
    ? orderByTierShuffled(filtered, seed, (p) =>
        applyColorCap(p.score ?? 0, p.countOrange, p.countRouge),
      )
    : filtered
  const products = displayPool.slice(0, target)
  const canScanMore = !exhausted && scanned < SCAN_CAP
  const hasMore = filtered.length > target || canScanMore

  const isInitialLoading =
    enabled &&
    products.length === 0 &&
    (identityResolving ||
      (!!altKey && !exclusionReady) ||
      (!!altKey && filling && !exhausted))

  const isLoadingMore = filling && products.length > 0
  const isEmpty = !!altKey && exclusionReady && !filling && filtered.length === 0

  return {
    products,
    currentEan: ean,
    isInitialLoading,
    isLoadingMore,
    hasMore,
    isEmpty,
    loadMore,
  }
}
