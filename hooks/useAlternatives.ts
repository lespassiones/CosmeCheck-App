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
import { applyColorCap } from '@/lib/analysis/scoreCap'
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

/** Une page de candidats bruts, cachée 5 min (transient, comme la recherche). */
async function fetchAlternativesPage(
  qc: QueryClient,
  ean: string,
  offset: number,
): Promise<AlternativeProduct[]> {
  return qc.fetchQuery({
    queryKey: ['alternatives', ean, offset],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'cosme_check_get_alternatives' as never,
        { p_ean: ean, p_limit: RAW_PAGE, p_offset: offset } as never,
      )
      if (error) throw error
      return ((data as AltRpcRow[] | null) ?? []).map(mapRow)
    },
  })
}

async function fetchFamilyIngredientNames(slugs: string[]): Promise<string[]> {
  const { data, error } = await supabase.rpc(
    'cosme_check_get_family_ingredient_names' as never,
    { p_family_slugs: slugs } as never,
  )
  if (error) throw error
  return ((data as { name: string | null }[] | null) ?? [])
    .map((r) => r.name)
    .filter((n): n is string => !!n)
}

export interface UseAlternativesParams {
  /** EAN direct (page « Voir tout ») — court-circuite la résolution marque+nom. */
  ean?: string | null
  brand?: string | null
  productName?: string | null
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
  const identityResolving = !directEan && identityQuery.isLoading && identityKey.length >= 3

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
  }, [ean, initialCount])

  const fill = useCallback(async () => {
    if (!ean || !exclusionReady || fillingRef.current) return
    fillingRef.current = true
    setFilling(true)
    try {
      while (
        filterAlternatives(rawRef.current, exclusionRef.current).length <
          targetRef.current &&
        !exhaustedRef.current &&
        offsetRef.current < SCAN_CAP
      ) {
        const page = await fetchAlternativesPage(queryClient, ean, offsetRef.current)
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
  }, [ean, exclusionReady, queryClient])

  useEffect(() => {
    if (!enabled || !ean || !exclusionReady) return
    if (filtered.length < target && !exhausted && offsetRef.current < SCAN_CAP) {
      void fill()
    }
  }, [enabled, ean, exclusionReady, filtered.length, target, exhausted, fill])

  const loadMore = useCallback(() => {
    setTarget((t) => t + step)
  }, [step])

  const products = filtered.slice(0, target)
  const canScanMore = !exhausted && scanned < SCAN_CAP
  const hasMore = filtered.length > target || canScanMore

  const isInitialLoading =
    enabled &&
    products.length === 0 &&
    (identityResolving ||
      (!!ean && !exclusionReady) ||
      (!!ean && filling && !exhausted))

  const isLoadingMore = filling && products.length > 0
  const isEmpty = !!ean && exclusionReady && !filling && filtered.length === 0

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
