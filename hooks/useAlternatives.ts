/**
 * useAlternatives — recommandations « produits similaires » pour l'écran d'analyse.
 *
 * Pipeline (aucun GPT) :
 *   1. Résout l'EAN du produit courant (marque+nom → `cosme_check_search_catalog`),
 *      sauf si l'EAN est fourni directement (page « Voir tout »).
 *   2. Construit l'ensemble d'exclusion (restrictions ingrédients + familles
 *      étendues en noms INCI + allergies freeform du profil).
 *   3. Récupère par pages les produits de la MÊME catégorie feuille triés par
 *      score (`cosme_check_get_alternatives`), les FILTRE côté client, et
 *      accumule jusqu'à atteindre le nombre voulu (ou épuisement / plafond de scan).
 *
 * La pagination « Voir plus » augmente la cible de `step` ; l'effet refait
 * tourner la boucle de remplissage. Le filtrage pouvant écarter beaucoup de
 * candidats, on borne le scan à SCAN_CAP lignes brutes pour rester prévisible.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { useProfile } from '@/hooks/useProfile'
import { resolveCatalogIdentity } from '@/lib/catalog/resolveCatalogIdentity'
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
 * `key` = l'EAN du produit (alternatives même-catégorie exacte), OU `cat:<catégorie>`
 * quand le produit n'est PAS au catalogue (ex. trouvé sur internet) → on cherche
 * alors par catégorie via l'index inversé (cosme_check_get_alternatives_by_category).
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
      const isCat = key.startsWith('cat:')
      const { data, error } = isCat
        ? await supabase.rpc(
            'cosme_check_alternatives_by_category_exact' as never,
            { p_category: key.slice(4), p_limit: RAW_PAGE, p_offset: offset } as never,
          )
        : await supabase.rpc(
            'cosme_check_get_alternatives' as never,
            { p_ean: key, p_limit: RAW_PAGE, p_offset: offset } as never,
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
  category,
  seed,
  initialCount,
  step,
  enabled = true,
}: UseAlternativesParams): UseAlternativesResult {
  const queryClient = useQueryClient()
  const { restrictions, skin } = useProfile()

  // 1. Identité catalogue (EAN). Court-circuitée si fournie.
  const identityKey = normalizeToken([brand, productName].filter(Boolean).join(' '))
  const identityQuery = useQuery({
    queryKey: ['alt-identity', identityKey],
    enabled: enabled && !directEan && identityKey.length >= 3,
    staleTime: HOUR,
    gcTime: HOUR,
    queryFn: () => resolveCatalogIdentity(brand, productName),
  })
  const ean = directEan ?? identityQuery.data?.ean ?? null
  // Catégorie exacte résolue via le catalogue (slug complet, ex. "soins-corps/savon/savon-surgras").
  // Prioritaire sur l'EAN : garantit un match exact et élimine tout débordement entre
  // sous-catégories, même si la RPC par EAN ferait la même chose en interne.
  const catalogCategory = identityQuery.data?.category ?? null
  const identityResolving = !directEan && identityQuery.isLoading && identityKey.length >= 3

  // Repli par catégorie : quand aucun EAN ni catégorie catalogue n'est disponible
  // (produit internet absent du catalogue).
  const catParam =
    !ean && !catalogCategory && !identityResolving && (category?.trim().length ?? 0) >= 3
      ? (category as string).trim()
      : null

  // Clé d'alternatives — ordre de priorité :
  //   1. Catégorie exacte catalogue  → cosme_check_alternatives_by_category_exact (match exact)
  //   2. EAN direct (barcode/catalog) → cosme_check_get_alternatives (même catégorie via DB)
  //   3. Catégorie de l'analyse       → cosme_check_alternatives_by_category_exact (match exact)
  const altKey = catalogCategory
    ? `cat:${catalogCategory}`
    : ean ?? (catParam ? `cat:${catParam}` : null)

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
