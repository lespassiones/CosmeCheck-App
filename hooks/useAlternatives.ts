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
 *   4. Filtre AVEC REPLI sur la FORME GALÉNIQUE (retour bêta sept 2026 : « pour
 *      une crème dont le premier ingrédient est l'eau, l'alternative doit être
 *      une crème dont le premier ingrédient est l'eau ») : la formule de la source
 *      (INCI de l'analyse, sinon ingredients_text catalogue) et celle de chaque
 *      candidat sont classées (lib/inci/formulation.ts). Même forme d'abord, puis
 *      forme voisine ou inconnue ; forme OPPOSÉE jamais proposée
 *      (lib/analysis/alternativesFormulation.ts).
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
import {
  buildExclusionSet,
  filterAlternatives,
  normalizeToken,
  type AlternativeProduct,
  type ExclusionSet,
} from '@/lib/analysis/alternativesFilter'
import {
  groupByFormulation,
  needsMoreCandidates,
  orderFormulationGroups,
  type FormulationGroups,
} from '@/lib/analysis/alternativesFormulation'
import { classifyFormulation, type Galenic } from '@/lib/inci/formulation'
import { supabase } from '@/lib/supabase/client'

const RAW_PAGE = 40
/**
 * Plafond de lignes brutes scannées (10 pages de 40). Relevé de 240 à 400 en
 * sept 2026 : le filtre de forme galénique écarte les formules opposées et on
 * cherche en priorité des candidats de MÊME forme, qui peuvent se trouver plus
 * loin dans le classement par score. 400 lignes reste une charge modérée (pages
 * cachées 5 min) et borne le pire cas (catégorie où la forme source est rare).
 */
const SCAN_CAP = 400
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
  /**
   * Ingrédients du produit consulté, pour le filtre de FORME GALÉNIQUE : noms
   * INCI triés par position (écran d'analyse : `result.items`) ou liste brute.
   * Absent : le hook retombe sur `ingredients_text` de la ligne catalogue qu'il
   * charge déjà pour la page « Voir tout » (EAN direct). Forme inconnue : aucun
   * filtre (fail-open).
   */
  sourceIngredients?: readonly string[] | string | null
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
/** Séparateur de la clé de mémoïsation des ingrédients source (absent des noms INCI). */
const SOURCE_SEP = '\n'

/** Note plafonnée (pastille) : sert au tri et au mélange par tier. */
function cappedScore(p: AlternativeProduct): number {
  return applyColorCap(p.score ?? 0, p.countOrange, p.countRouge)
}

export function useAlternatives({
  ean: directEan,
  brand,
  productName,
  productType,
  category,
  seed,
  sourceIngredients,
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
  const fillingRef = useRef(false)
  rawRef.current = raw
  targetRef.current = target

  // Vivier à accumuler : plus large que l'affichage quand on mélange (graine),
  // pour que le tirage dans chaque tier ait de la variété.
  const poolTarget = seed ? Math.max(target, POOL_MIN) : target
  const poolTargetRef = useRef(poolTarget)
  poolTargetRef.current = poolTarget

  // Forme galénique de la SOURCE (mémoïsée) : ingrédients de l'analyse en
  // priorité, sinon ingredients_text de la ligne catalogue (page « Voir tout »).
  // La clé de mémoïsation est une chaîne : un nouveau tableau à chaque rendu ne
  // relance pas le classement.
  const sourceIsList = Array.isArray(sourceIngredients)
  const sourceKey = sourceIsList
    ? (sourceIngredients as readonly string[]).join(SOURCE_SEP)
    : typeof sourceIngredients === 'string'
      ? sourceIngredients.trim()
      : ''
  const catalogInci = directEan ? directRowQuery.data?.ingredients_text ?? null : null
  const sourceGalenic = useMemo<Galenic>(() => {
    if (sourceKey) {
      return classifyFormulation(sourceIsList ? sourceKey.split(SOURCE_SEP) : sourceKey).galenic
    }
    return classifyFormulation(catalogInci).galenic
  }, [sourceKey, sourceIsList, catalogInci])
  const sourceKnown = sourceGalenic !== 'unknown'

  // Forme de chaque candidat, mise en cache par EAN (même INCI pour un EAN dans
  // la session) : le classement n'est calculé qu'une fois par produit scanné.
  const candidateCacheRef = useRef(new Map<string, Galenic>())
  const candidateGalenic = useCallback((p: AlternativeProduct): Galenic => {
    const cache = candidateCacheRef.current
    const hit = cache.get(p.ean)
    if (hit) return hit
    const galenic = classifyFormulation(p.ingredientsText).galenic
    cache.set(p.ean, galenic)
    return galenic
  }, [])

  // Filtré (restrictions/profil), sans le produit consulté, PUIS réparti selon
  // l'affinité de formule avec la source (même forme / voisine ou inconnue /
  // opposée écartée). Chaque groupe est ensuite trié par score PLAFONNÉ
  // (plancher couleur) : la note affichée = celle qu'on verra au clic.
  //
  // On écarte AUSSI le produit consulté : il est dans sa propre catégorie, donc
  // la RPC le remonte comme candidat et il s'affichait en « alternative » à
  // lui-même (constaté en e2e le 14 sept 2026 sur 3 produits sur 5). On écarte
  // sur l'EAN ET sur le couple marque+nom normalisé, parce que le catalogue
  // porte le même produit sous plusieurs EAN (formats, traductions).
  const selfEan = ean
  const selfKey = useMemo(() => {
    const n = normalizeToken([brand, productName].filter(Boolean).join(' '))
    return n.length >= 3 ? n : null
  }, [brand, productName])

  const computeGroups = useCallback(
    (list: AlternativeProduct[]): FormulationGroups<AlternativeProduct> => {
      const isSelf = (p: AlternativeProduct) => {
        if (selfEan && p.ean === selfEan) return true
        if (!selfKey) return false
        return normalizeToken([p.brand, p.name].filter(Boolean).join(' ')) === selfKey
      }
      const clean = filterAlternatives(list, exclusion).filter((p) => !isSelf(p))
      return groupByFormulation(clean, sourceGalenic, candidateGalenic)
    },
    [exclusion, selfEan, selfKey, sourceGalenic, candidateGalenic],
  )
  // La boucle async lit la version fraîche via une ref (évite les closures périmées).
  const computeGroupsRef = useRef(computeGroups)
  computeGroupsRef.current = computeGroups
  const sourceKnownRef = useRef(sourceKnown)
  sourceKnownRef.current = sourceKnown

  const groups = useMemo(() => computeGroups(raw), [computeGroups, raw])
  // Liste utilisable (opposés écartés) : même forme d'abord, puis voisine ou
  // inconnue, chacune triée par note plafonnée.
  const filtered = useMemo(() => orderFormulationGroups(groups, cappedScore), [groups])
  const sameCount = groups.same.length

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

  // Faut-il scanner une page de plus ? Compté APRÈS le filtre de formule, sinon la
  // boucle s'arrêtait sur des candidats ensuite écartés (carrousel vide).
  const wantMore = needsMoreCandidates({
    sameCount,
    usableCount: filtered.length,
    poolTarget,
    displayTarget: target,
    sourceKnown,
  })

  const fill = useCallback(async () => {
    if (!altKey || !exclusionReady || fillingRef.current) return
    fillingRef.current = true
    setFilling(true)
    const needMore = () => {
      const g = computeGroupsRef.current(rawRef.current)
      return needsMoreCandidates({
        sameCount: g.same.length,
        usableCount: g.same.length + g.fallback.length,
        poolTarget: poolTargetRef.current,
        displayTarget: targetRef.current,
        sourceKnown: sourceKnownRef.current,
      })
    }
    try {
      while (needMore() && !exhaustedRef.current && offsetRef.current < SCAN_CAP) {
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
    if (wantMore && !exhausted && offsetRef.current < SCAN_CAP) {
      void fill()
    }
  }, [enabled, altKey, exclusionReady, wantMore, filtered.length, exhausted, fill])

  const loadMore = useCallback(() => {
    setTarget((t) => t + step)
  }, [step])

  // Mélange « aléatoire contrôlé » DANS chaque tier de pastille quand une graine
  // (ID d'analyse) est fournie, À L'INTÉRIEUR de chaque groupe d'affinité (la
  // même forme reste devant) ; sinon tri par score classique.
  const displayPool = useMemo(
    () => (seed ? orderFormulationGroups(groups, cappedScore, seed) : filtered),
    [seed, groups, filtered],
  )
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
