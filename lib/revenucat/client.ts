import Purchases, {
  type PurchasesStoreProduct,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases'
import { Platform } from 'react-native'

import { isUserCancelled } from '@/lib/paywall/purchaseError'

// Clés publiques RevenueCat PAR PLATEFORME. Google Play exige la clé Android
// (`goog_…`), distincte de la clé iOS (`appl_…`). On lit d'abord la clé
// spécifique à la plateforme, avec repli sur l'ancienne clé générique
// `EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY` (rétro-compat : rien ne casse si elle
// n'est pas encore renseignée).
const API_KEY = {
  ios:
    process.env.EXPO_PUBLIC_REVENUCAT_IOS_KEY ||
    process.env.EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY ||
    '',
  android:
    process.env.EXPO_PUBLIC_REVENUCAT_ANDROID_KEY ||
    process.env.EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY ||
    '',
}

export async function initRevenueCat(): Promise<void> {
  try {
    const apiKey = Platform.select({
      ios: API_KEY.ios,
      android: API_KEY.android,
    }) || API_KEY.ios

    // GARDE ANTI-CRASH : RevenueCat ferme l'app si on configure une clé de test
    // (`test_…`) dans un build RELEASE (protection anti-fraude). Tant qu'aucune
    // clé publique de prod (`goog_…` / `appl_…`) n'est fournie, on n'initialise
    // PAS le SDK en release : les achats restent inertes mais l'app ne crashe
    // pas. En dev (Expo Go), la clé de test fonctionne normalement.
    const isTestKey = apiKey.startsWith('test_')
    if (!apiKey || (isTestKey && !__DEV__)) {
      console.warn(
        '[RevenueCat] non initialisé (clé de test en build release ou clé absente) — achats désactivés',
      )
      return
    }

    await Purchases.configure({
      apiKey,
      appUserID: undefined, // Sera set par logIn() après auth
    })
  } catch (err) {
    console.warn('[RevenueCat] init failed:', err)
  }
}

export async function loginUser(userId: string): Promise<void> {
  try {
    await Purchases.logIn(userId)
  } catch (err) {
    console.warn('[RevenueCat] login failed:', err)
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await Purchases.logOut()
  } catch (err) {
    console.warn('[RevenueCat] logout failed:', err)
  }
}

export async function getOfferings(): Promise<any> {
  try {
    return await Purchases.getOfferings()
  } catch (err) {
    console.warn('[RevenueCat] getOfferings failed:', err)
    return null
  }
}

/**
 * Lance l'achat. Renvoie `null` quand la personne a annulé (fermeture de la
 * feuille de paiement, retour arrière) : ce n'est pas une erreur et l'appelant
 * ne doit rien afficher. Toute autre erreur est relancée telle quelle, pour que
 * l'écran la classe via `lib/paywall/purchaseError`.
 *
 * L'ancienne détection cherchait « PurchaseCancelled » dans le message ; le SDK
 * n'y met pas ce texte, donc chaque annulation remontait comme un échec et
 * l'app affichait « Achat impossible » à quelqu'un qui avait simplement changé
 * d'avis.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  try {
    const result = await Purchases.purchasePackage(pkg)
    return result.customerInfo
  } catch (err) {
    if (isUserCancelled(err)) return null
    console.error('[RevenueCat] purchase failed:', err)
    throw err
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.getCustomerInfo()
  } catch (err) {
    console.warn('[RevenueCat] getCustomerInfo failed:', err)
    return null
  }
}

export function isPremium(customerInfo: CustomerInfo | null): boolean {
  if (!customerInfo) return false
  return customerInfo.entitlements.active['premium'] !== undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Chemins de secours du paywall (04/09/2026)
//
// Un iPhone est resté sur « … » et un bouton figé : `getOfferings()` ne
// répondait pas. Deux manques dans cet ancien code, corrigés ici :
//   1. aucun délai maximum, donc un appel natif qui ne revient jamais laissait
//      l'écran en chargement pour toujours, sans erreur ni moyen de réessayer ;
//   2. un seul chemin de récupération. Si la configuration d'offering de
//      RevenueCat est injoignable alors que StoreKit répond, l'app refusait la
//      vente pour rien : les produits sont récupérables directement par leur
//      identifiant.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Identifiants des abonnements, tels qu'ils existent dans les magasins.
 *
 * Vérifiés le 04/09/2026 via l'API App Store Connect : groupe « Cosme Check
 * Premium », les deux à l'état APPROVED avec essai gratuit de 3 jours sur les
 * 175 territoires. Google Play utilise les mêmes identifiants (RevenueCat
 * impose la correspondance), la clé de service du dépôt n'ayant pas les droits
 * pour le confirmer par API.
 */
export const PRODUCT_IDS = {
  yearly: 'premium_yearly',
  monthly: 'premium_monthly',
} as const

/**
 * Borne le temps d'attente d'un appel natif.
 *
 * Rend `fallback` au lieu de rejeter : tous les appelants ici veulent
 * « continue sans » plutôt que « propage une erreur ». Le minuteur est nettoyé
 * dans les deux cas, sinon un timer en vol maintient le module en vie.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Récupère les produits directement par identifiant, sans passer par les
 * offerings. Sert quand la configuration RevenueCat est muette mais que le
 * magasin, lui, répond : les prix sont alors les VRAIS prix locaux et l'achat
 * reste possible.
 */
export async function getProductsDirect(): Promise<PurchasesStoreProduct[]> {
  try {
    return await Purchases.getProducts(
      [PRODUCT_IDS.yearly, PRODUCT_IDS.monthly],
      Purchases.PRODUCT_CATEGORY.SUBSCRIPTION,
    )
  } catch (err) {
    console.warn('[RevenueCat] getProducts failed:', err)
    return []
  }
}

/**
 * Achat d'un produit obtenu hors offering. Même contrat que
 * `purchasePackage` : `null` quand la personne annule.
 */
export async function purchaseProductDirect(
  product: PurchasesStoreProduct,
): Promise<CustomerInfo | null> {
  try {
    const result = await Purchases.purchaseStoreProduct(product)
    return result.customerInfo
  } catch (err) {
    if (isUserCancelled(err)) return null
    console.error('[RevenueCat] purchaseStoreProduct failed:', err)
    throw err
  }
}

/**
 * Pays du compte magasin (« FR », « CA »).
 *
 * Meilleur que les réglages de l'appareil pour choisir un prix de repli : c'est
 * la boutique qui facture, pas la langue de l'interface. Peut être `null` quand
 * le magasin ne répond pas, cas où l'appelant retombe sur `deviceStoreContext`.
 */
export async function getStorefrontCountry(): Promise<string | null> {
  try {
    const storefront = await Purchases.getStorefront()
    return storefront?.countryCode ?? null
  } catch (err) {
    console.warn('[RevenueCat] getStorefront failed:', err)
    return null
  }
}
