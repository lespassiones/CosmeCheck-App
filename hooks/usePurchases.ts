/**
 * État d'achat du paywall : prix à afficher, éligibilité, achat.
 *
 * Réécrit le 04/09/2026 après un iPhone bloqué sur deux « … » et un bouton en
 * spinner permanent. Trois défauts de structure expliquaient l'écran mort :
 *
 *   1. les prix et les informations client étaient attendus ENSEMBLE dans un
 *      `Promise.all`. Un seul des deux appels natifs qui ne revient pas, et
 *      l'écran entier reste en chargement, alors que les prix seuls suffisent
 *      à afficher l'offre ;
 *   2. aucun délai maximum, donc « ne revient pas » voulait dire « pour
 *      toujours », sans message ni bouton pour réessayer ;
 *   3. un unique chemin de récupération. Des offerings muets condamnaient la
 *      vente, alors que les produits sont accessibles par identifiant et que
 *      les tarifs de tous les territoires sont connus.
 *
 * D'où la cascade à trois niveaux, du plus fiable au moins bon :
 *
 *   `offerings` : la voie normale. Prix du magasin, achat possible.
 *   `products`  : produits récupérés par identifiant quand la configuration
 *                 RevenueCat ne répond pas. Prix du magasin donc exacts, achat
 *                 possible. Sauve la vente au lieu de la refuser.
 *   `fallback`  : tarifs relevés dans App Store Connect, choisis d'après la
 *                 région et la devise de l'appareil. Prix INDICATIF, achat
 *                 IMPOSSIBLE : un paiement exige un produit du magasin, et il
 *                 n'y en a pas. L'écran doit le dire et proposer de réessayer.
 *
 * `priceSource` porte cette distinction jusqu'à l'écran. Ne jamais la masquer :
 * afficher un prix indicatif est honnête, laisser croire qu'on peut l'acheter
 * ne l'est pas.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import type { CustomerInfo, PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases'

import {
  PRODUCT_IDS,
  clearStoreDiagnostic,
  ensureConfigured,
  ensurePurchaseIdentity,
  getCustomerInfo,
  getOfferings,
  getProductsDirect,
  getStorefrontCountry,
  getTrialEligibility,
  initDiagnostic,
  isPremium,
  purchasePackage,
  purchaseProductDirect,
  storeDiagnostic,
  withTimeout,
} from '@/lib/revenucat/client'
import { buildFallbackPlans } from '@/lib/paywall/fallbackPrices'
import { deviceStoreContext } from '@/lib/paywall/deviceStore'
import {
  applyTrialEligibility,
  findPlanPackage,
  type PackageLike,
  type PlanId,
} from '@/lib/paywall/prices'
import { useAuth } from '@/hooks/useAuth'
import { reportMessage } from '@/lib/reporting/report'

/** D'où viennent les prix affichés. Conditionne la possibilité d'acheter. */
export type PriceSource = 'offerings' | 'products' | 'fallback'

/**
 * Délais. Généreux mais finis : mieux vaut un prix indicatif au bout de huit
 * secondes qu'un spinner éternel. StoreKit répond en moins d'une seconde quand
 * tout va bien, ces bornes ne se déclenchent donc qu'en cas de panne.
 */
const OFFERINGS_TIMEOUT_MS = 8000
const PRODUCTS_TIMEOUT_MS = 6000
// 6 s et non 2 : le PREMIER appel StoreKit après un démarrage à froid dépasse
// couramment deux secondes. À 2 s on rendait `null`, et comme
// `expo-localization` peut ne pas donner de devise, un iPhone français tombait
// sur le palier dollar — d'où les « 49,99 $US » vus le 07/09/2026 à Toulouse.
const STOREFRONT_TIMEOUT_MS = 6000
// Sans réponse dans ce délai, l'essai n'est pas promis (voir `withTrialEligibility`).
const ELIGIBILITY_TIMEOUT_MS = 4000

/** Un plan prêt à afficher, et son objet natif quand l'achat est possible. */
export interface PaywallPlan extends PackageLike {
  /** Package d'offering, à privilégier pour l'achat. */
  nativePackage?: PurchasesPackage
  /** Produit du magasin, quand il n'y a pas d'offering. */
  nativeProduct?: PurchasesStoreProduct
}

export interface UsePurchasesState {
  monthly: PaywallPlan | null
  yearly: PaywallPlan | null
  priceSource: PriceSource
  /** `true` seulement pendant la récupération initiale des prix. */
  isLoadingPrices: boolean
  /** `true` seulement pendant un achat. Ne bloque jamais l'affichage. */
  isPurchasing: boolean
  customerInfo: CustomerInfo | null
  isPremium: boolean
  error: Error | null
  /**
   * Ce qui a empêché le magasin de répondre, en clair.
   *
   * `null` quand tout va bien. Sinon une phrase courte que l'écran AFFICHE :
   * sans elle, toutes les pannes se ressemblent et se diagnostiquent à
   * l'aveugle, ce qui a coûté trois jours en septembre 2026.
   */
  diagnostic: string | null
}

const INITIAL: UsePurchasesState = {
  monthly: null,
  yearly: null,
  priceSource: 'fallback',
  isLoadingPrices: true,
  isPurchasing: false,
  customerInfo: null,
  isPremium: false,
  error: null,
  diagnostic: null,
}

/**
 * Associe un produit du magasin à son plan, par identifiant.
 *
 * Le préfixe suivi de deux-points couvre Google Play, qui suffixe l'identifiant
 * du produit par celui du plan de base (`premium_yearly:annual`).
 */
/**
 * iOS : retire l'essai des plans auxquels la personne n'a plus droit (ancien
 * abonné), avant tout affichage. Sans cette vérification, le paywall promettait
 * « 3 jours offerts » à quelqu'un qu'Apple débite immédiatement. Android : les
 * offres renvoyées par Google Play tiennent déjà compte de l'éligibilité.
 */
async function withTrialEligibility(
  monthly: PaywallPlan,
  yearly: PaywallPlan,
): Promise<[PaywallPlan, PaywallPlan]> {
  if (Platform.OS !== 'ios') return [monthly, yearly]
  const idOf = (plan: PaywallPlan) =>
    plan.nativePackage?.product.identifier ?? plan.nativeProduct?.identifier ?? plan.identifier
  const monthlyId = idOf(monthly)
  const yearlyId = idOf(yearly)
  const eligibility = await withTimeout(
    getTrialEligibility([monthlyId, yearlyId]),
    ELIGIBILITY_TIMEOUT_MS,
    null,
  )
  return [
    applyTrialEligibility(monthly, eligibility?.[monthlyId]?.status),
    applyTrialEligibility(yearly, eligibility?.[yearlyId]?.status),
  ]
}

function planOfProduct(product: PurchasesStoreProduct): PlanId | null {
  const id = product.identifier
  if (id === PRODUCT_IDS.yearly || id.startsWith(PRODUCT_IDS.yearly + ':')) return 'yearly'
  if (id === PRODUCT_IDS.monthly || id.startsWith(PRODUCT_IDS.monthly + ':')) return 'monthly'
  return null
}

export function usePurchases() {
  const [state, setState] = useState<UsePurchasesState>(INITIAL)
  const mounted = useRef(true)
  // Sert UNIQUEMENT au verrou d'identité avant l'achat : on veut savoir à qui
  // rattacher la transaction, pas afficher quoi que ce soit.
  const { user } = useAuth()

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /**
   * Descend la cascade jusqu'à trouver de quoi afficher deux prix.
   *
   * Ne lève jamais : le paywall doit toujours pouvoir se peindre. La seule
   * chose qui varie est `priceSource`, donc la confiance à accorder aux prix.
   */
  const loadPrices = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoadingPrices: true, error: null, diagnostic: null }))
    clearStoreDiagnostic()

    // Niveau 0 : le SDK est-il prêt ?
    //
    // C'EST LE POINT QUI MANQUAIT. `initRevenueCat()` était lancé sans être
    // attendu depuis `app/_layout.tsx` ; quand le paywall se peignait avant la
    // fin de `configure()`, chaque appel levait « There is no singleton
    // instance », les trois niveaux échouaient et l'écran s'interdisait la
    // vente. On attend, une bonne fois, la même promesse que tout le monde.
    const ready = await ensureConfigured()
    if (!ready) {
      if (!mounted.current) return
      const plans = buildFallbackPlans(deviceStoreContext())
      const { code, detail, key, platform } = initDiagnostic()
      const raison = `SDK ${code ?? 'indisponible'} · ${platform} · clé ${key}` + (detail ? ` : ${detail}` : '')
      // Le diagnostic part AUSSI dans Sentry : un écran que personne ne regarde
      // ne diagnostique rien, et la panne touche des gens dont on n'a pas le
      // téléphone sous la main.
      reportMessage('PAYWALL_SDK_UNAVAILABLE', { raison, code, detail, key, platform })
      setState((prev) => ({
        ...prev,
        monthly: plans.monthly,
        yearly: plans.yearly,
        priceSource: 'fallback',
        isLoadingPrices: false,
        error: new Error('PAYWALL_SDK_UNAVAILABLE'),
        diagnostic: raison,
      }))
      return
    }

    // Niveau 1 : les offerings.
    const offerings = await withTimeout(getOfferings(), OFFERINGS_TIMEOUT_MS, null)
    const packages: PurchasesPackage[] = offerings?.current?.availablePackages ?? []
    if (packages.length > 0) {
      const monthlyPkg = findPlanPackage(packages, 'monthly')
      const yearlyPkg = findPlanPackage(packages, 'yearly')
      // Les deux plans sont exigés : le paywall les compare (badge d'économie,
      // prix mensualisé). Un seul plan trouvé signale un offering mal
      // configuré, et on préfère alors les produits bruts, qui portent les deux.
      if (monthlyPkg && yearlyPkg) {
        const [monthlyPlan, yearlyPlan] = await withTrialEligibility(
          { ...monthlyPkg, nativePackage: monthlyPkg },
          { ...yearlyPkg, nativePackage: yearlyPkg },
        )
        if (!mounted.current) return
        setState((prev) => ({
          ...prev,
          monthly: monthlyPlan,
          yearly: yearlyPlan,
          priceSource: 'offerings',
          isLoadingPrices: false,
          error: null,
          diagnostic: null,
        }))
        return
      }
    }

    // Niveau 2 : les produits par identifiant. Prix réels, achat possible.
    const products = await withTimeout(getProductsDirect(), PRODUCTS_TIMEOUT_MS, [])
    if (products.length > 0) {
      const found: Partial<Record<PlanId, PurchasesStoreProduct>> = {}
      for (const product of products) {
        const plan = planOfProduct(product)
        if (plan && !found[plan]) found[plan] = product
      }
      const monthlyProduct = found.monthly
      const yearlyProduct = found.yearly
      if (monthlyProduct && yearlyProduct) {
        const [monthlyPlan, yearlyPlan] = await withTrialEligibility(
          {
            identifier: monthlyProduct.identifier,
            packageType: 'MONTHLY',
            product: monthlyProduct,
            nativeProduct: monthlyProduct,
          },
          {
            identifier: yearlyProduct.identifier,
            packageType: 'ANNUAL',
            product: yearlyProduct,
            nativeProduct: yearlyProduct,
          },
        )
        if (!mounted.current) return
        setState((prev) => ({
          ...prev,
          monthly: monthlyPlan,
          yearly: yearlyPlan,
          priceSource: 'products',
          isLoadingPrices: false,
          error: null,
          diagnostic: null,
        }))
        return
      }
    }

    // Niveau 3 : la table de repli. Le magasin est muet, on affiche quand même
    // un prix juste pour la région, en le marquant comme indicatif.
    const storefront = await withTimeout(getStorefrontCountry(), STOREFRONT_TIMEOUT_MS, null)
    const device = deviceStoreContext()
    const plans = buildFallbackPlans({
      // La boutique fait foi sur le pays ; les réglages de l'appareil ne
      // servent que si elle n'a pas répondu, ce qui est le cas courant ici.
      regionCode: storefront ?? device.regionCode,
      currencyCode: device.currencyCode,
      locale: device.locale,
    })
    if (!mounted.current) return
    const packagesSeen = packages.length
    const productsSeen = products.length
    const raison =
      (storeDiagnostic() ??
        `magasin muet : offering: ${packagesSeen} package(s), produits: ${productsSeen}, storefront: ${storefront ?? 'inconnu'}`) +
      ` · clé ${initDiagnostic().key}`
    reportMessage('PAYWALL_STORE_UNAVAILABLE', {
      raison,
      packages: packagesSeen,
      produits: productsSeen,
      storefront,
      erreurMagasin: storeDiagnostic(),
    })
    setState((prev) => ({
      ...prev,
      monthly: plans.monthly,
      yearly: plans.yearly,
      priceSource: 'fallback',
      isLoadingPrices: false,
      error: new Error('PAYWALL_STORE_UNAVAILABLE'),
      // Trois nombres et une erreur suffisent à séparer « le magasin refuse le
      // produit » de « l'offering est mal monté » de « rien n'est arrivé ».
      diagnostic: raison,
    }))
  }, [])

  /**
   * Les informations client, chargées À PART.
   *
   * C'est le point qui a coûté un écran mort : mises dans le même `Promise.all`
   * que les prix, elles pouvaient à elles seules empêcher l'offre de s'afficher
   * alors qu'elles ne servent qu'à savoir si la personne est déjà abonnée.
   */
  const loadCustomer = useCallback(async () => {
    if (!(await ensureConfigured())) return
    const customerInfo = await withTimeout(getCustomerInfo(), OFFERINGS_TIMEOUT_MS, null)
    if (!mounted.current || !customerInfo) return
    setState((prev) => ({
      ...prev,
      customerInfo,
      isPremium: isPremium(customerInfo),
    }))
  }, [])

  useEffect(() => {
    void loadPrices()
    void loadCustomer()
  }, [loadPrices, loadCustomer])

  /**
   * Lance l'achat d'un plan. `false` = annulation, ce qui n'est pas une erreur :
   * l'appelant ne doit rien afficher. Toute autre erreur est relancée pour que
   * l'écran la classe via `lib/paywall/purchaseError`.
   *
   * Refuse net quand la source est `fallback` : il n'existe aucun produit du
   * magasin à acheter, et prétendre le contraire finirait sur une erreur native
   * opaque au lieu d'un message clair.
   */
  const purchase = useCallback(
    async (plan: PlanId, opts?: { allowAnonymous?: boolean }): Promise<boolean> => {
      const target = plan === 'yearly' ? state.yearly : state.monthly
      const nativePackage = target?.nativePackage
      const nativeProduct = target?.nativeProduct
      if (!nativePackage && !nativeProduct) {
        throw new Error('PAYWALL_NO_STORE_PRODUCT')
      }

      // Dernier verrou : RevenueCat doit être sur l'identifiant Supabase de
      // cette personne AVANT que la feuille de paiement s'ouvre. Sinon l'achat
      // part sous un `$RCAnonymousID`, le webhook ne le retrouve pas, et la
      // personne a payé pour rien. Voir `ensurePurchaseIdentity`.
      //
      // SEULE exception (28/09/2026) : le paywall du parcours d'onboarding, vu
      // AVANT la création du compte, comme dans MemoryPilot. L'achat part alors
      // sous l'identifiant anonyme du SDK, et `loginUser` (app/_layout.tsx) le
      // rattache au compte à l'inscription, qui suit immédiatement. Dès qu'une
      // session existe, le verrou s'applique comme partout ailleurs.
      if (user?.id || !opts?.allowAnonymous) {
        if (!(await ensurePurchaseIdentity(user?.id ?? null))) {
          throw new Error('PAYWALL_IDENTITY_UNCONFIRMED')
        }
      } else if (!(await ensureConfigured())) {
        throw new Error('PAYWALL_IDENTITY_UNCONFIRMED')
      }

      setState((prev) => ({ ...prev, isPurchasing: true, error: null }))
      try {
        const customerInfo = nativePackage
          ? await purchasePackage(nativePackage)
          : await purchaseProductDirect(nativeProduct as PurchasesStoreProduct)

        if (!customerInfo) {
          // Annulation : on rend la main au bouton, sans erreur.
          setState((prev) => ({ ...prev, isPurchasing: false }))
          return false
        }

        setState((prev) => ({
          ...prev,
          customerInfo,
          isPremium: isPremium(customerInfo),
          isPurchasing: false,
          error: null,
        }))
        return true
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Purchase failed')
        setState((prev) => ({ ...prev, isPurchasing: false, error }))
        throw error
      }
    },
    [state.monthly, state.yearly, user?.id],
  )

  const refresh = useCallback(async (): Promise<void> => {
    await loadCustomer()
  }, [loadCustomer])

  /** Rejoue la cascade. Branché sur le bouton « Réessayer » du paywall. */
  const retry = useCallback(async (): Promise<void> => {
    await Promise.all([loadPrices(), loadCustomer()])
  }, [loadPrices, loadCustomer])

  return {
    ...state,
    /** `true` quand les prix affichés permettent réellement d'acheter. */
    canPurchase: state.priceSource !== 'fallback',
    purchase,
    refresh,
    retry,
  }
}
