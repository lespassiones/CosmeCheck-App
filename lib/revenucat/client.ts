import Purchases, {
  LOG_LEVEL,
  type PurchasesStoreProduct,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases'
import { NativeModules, Platform } from 'react-native'

import { isUserCancelled } from '@/lib/paywall/purchaseError'

// ─────────────────────────────────────────────────────────────────────────────
// Configuration du SDK (revu le 07/09/2026)
//
// ⚠️ À lire avant de « simplifier » ce fichier.
//
// `Purchases.configure()` est SYNCHRONE — sa signature le dit :
// `static configure(configuration: PurchasesConfiguration): void`. Il n'y a
// donc pas de course entre l'initialisation et le paywall : l'appel part dès
// l'exécution de l'effet de `RevenueCatInit`, monté avant `RootNavigator`. Une
// hypothèse de course a été formulée puis ÉCARTÉE ici même ; ne pas la
// réintroduire.
//
// Ce qui manquait vraiment, et que ce module apporte maintenant :
//   1. une porte unique — `ensureConfigured()` — devant chaque appel au SDK,
//      pour qu'aucun chemin ne puisse interroger un SDK non configuré ;
//   2. la RAISON de l'échec, conservée et remontée jusqu'à l'écran. Toutes les
//      pannes se ressemblaient : « le magasin n'a pas répondu ». Trois jours
//      d'enquête pour ça, faute d'une ligne qui dise laquelle ;
//   3. le dernier verrou d'identité avant la caisse (voir
//      `ensurePurchaseIdentity`), repris de Reveal Chat, qui l'a appris le
//      14/08/2026 en devant retrouver à la main un achat de 7,99 EUR encaissé
//      sous un identifiant anonyme.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clés publiques RevenueCat, une par magasin. **Jamais de clé de test.**
 *
 * ## Le repli qui a été retiré
 *
 * L'ancien code retombait sur `EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY`, qui vaut une
 * clé `test_…` dans le `.env`. Il suffisait que cette variable arrive un jour
 * dans l'environnement EAS pour que la garde anti-fraude éteigne TOUS les
 * achats en release, sans un mot. Une clé absente doit se voir, pas se faire
 * remplacer par une clé qui ne peut rien encaisser.
 *
 * ## Les deux orthographes, et pourquoi elles coexistent
 *
 * Ce dépôt écrit historiquement `REVENUCAT` (un seul « E »), alors que Memory
 * Pilot et Reveal Chat écrivent `REVENUECAT`. Ce n'est pas cosmétique : une
 * variable créée un jour dans EAS avec l'orthographe correcte ne serait
 * **jamais lue** par un code qui n'attend que l'autre, et les achats
 * s'éteindraient sans erreur. On accepte donc les deux, l'orthographe correcte
 * d'abord, le temps de migrer EAS.
 *
 * ⚠️ Ces accès doivent rester des littéraux `process.env.NOM_EXACT` : Metro les
 * remplace par leur valeur **au moment du bundle**. Une lecture dynamique
 * (`process.env[nom]`) rendrait `undefined` dans un build.
 */
const API_KEY = {
  ios:
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ||
    process.env.EXPO_PUBLIC_REVENUCAT_IOS_KEY ||
    '',
  android:
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ||
    process.env.EXPO_PUBLIC_REVENUCAT_ANDROID_KEY ||
    '',
}

/**
 * De quoi identifier la clé utilisée sans jamais l'écrire en entier.
 *
 * Sert dans le diagnostic affiché : « appl_Nsylpa…(31) » suffit à dire « c'est
 * bien la clé iOS de production, et elle fait la bonne longueur », ce qui
 * tranche en une seconde le doute qui a coûté le plus de temps. Une clé
 * publique RevenueCat n'est pas un secret — elle vit dans le bundle — mais on
 * n'en met pas plus que nécessaire sur un écran.
 */
function keyFingerprint(apiKey: string): string {
  if (!apiKey) return 'aucune'
  return `${apiKey.slice(0, 11)}…(${apiKey.length})`
}

/** Pourquoi le SDK n'est pas utilisable, quand il ne l'est pas. */
export type InitDiagnostic =
  | 'ok'
  | 'sans-natif'
  | 'sans-cle'
  | 'cle-de-test-en-release'
  | 'echec-configure'

let diagnostic: InitDiagnostic | null = null
let detail: string | null = null
let initPromise: Promise<boolean> | null = null

/** Le natif est-il là ? Faux dans Expo Go et dans tout ce qui n'est pas l'app. */
export function nativeAvailable(): boolean {
  return NativeModules.RNPurchases != null
}

/**
 * Ce qu'on sait du dernier essai d'initialisation, pour l'afficher.
 *
 * `detail` porte le message brut du SDK quand il y en a un : c'est lui qui
 * distingue une clé invalide d'une panne réseau, et c'est exactement ce qui
 * manquait pour diagnostiquer depuis un téléphone qu'on n'a pas sous la main.
 */
export function initDiagnostic(): {
  code: InitDiagnostic | null
  detail: string | null
  /** « appl_Nsylpa…(31) » ou « aucune ». Jamais la clé entière. */
  key: string
  platform: string
} {
  return {
    code: diagnostic,
    detail,
    key: keyFingerprint(Platform.OS === 'ios' ? API_KEY.ios : API_KEY.android),
    platform: Platform.OS,
  }
}

async function doInit(): Promise<boolean> {
  if (!nativeAvailable()) {
    diagnostic = 'sans-natif'
    console.warn('[RevenueCat] module natif absent : achats indisponibles (Expo Go ?)')
    return false
  }

  const apiKey = (Platform.OS === 'ios' ? API_KEY.ios : API_KEY.android).trim()

  if (!apiKey) {
    diagnostic = 'sans-cle'
    console.warn(
      `[RevenueCat] aucune clé publique pour ${Platform.OS} : achats désactivés. ` +
        'Attendu : EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY (ou l\'ancienne ' +
        'orthographe REVENUCAT), présentes dans l\'environnement EAS du build.',
    )
    return false
  }

  // GARDE ANTI-CRASH : RevenueCat ferme l'app si on configure une clé de test
  // dans un build RELEASE (protection anti-fraude).
  if (apiKey.startsWith('test_') && !__DEV__) {
    diagnostic = 'cle-de-test-en-release'
    console.warn('[RevenueCat] clé de test dans un build release : achats désactivés')
    return false
  }

  try {
    if (await Purchases.isConfigured()) {
      diagnostic = 'ok'
      return true
    }
    // Sans journal, une panne de magasin est indiscernable d'une panne réseau.
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO)
    await Purchases.configure({ apiKey })
    diagnostic = 'ok'
    return true
  } catch (err) {
    diagnostic = 'echec-configure'
    detail = err instanceof Error ? err.message : String(err)
    console.warn('[RevenueCat] configure a échoué :', err)
    // Réessayable : un échec passager ne doit pas condamner la session.
    initPromise = null
    return false
  }
}

/**
 * Configure le SDK, une fois. Rend `true` quand on peut l'appeler.
 *
 * Idempotent et sûr en concurrence : tous les appelants attendent la même
 * promesse, donc `configure()` ne part qu'une fois même si le paywall, le
 * `_layout` et un rafraîchissement démarrent en même temps.
 */
export function initRevenueCat(): Promise<boolean> {
  if (!initPromise) initPromise = doInit()
  return initPromise
}

/** Le nom qu'on emploie côté appelants : « assure-toi que c'est prêt ». */
export const ensureConfigured = initRevenueCat

/**
 * Dernière erreur venue du magasin, avec l'appel qui l'a produite.
 *
 * Chaque `catch` de ce module la range ici au lieu de la laisser mourir dans un
 * `console.warn`. C'est ce qui permet à l'écran de dire « getProducts :
 * PRODUCT_NOT_AVAILABLE_FOR_PURCHASE » plutôt que « le magasin n'a pas
 * répondu », et de trancher en dix secondes ce qui a coûté des heures.
 */
let storeError: string | null = null

function noteStoreError(where: string, err: unknown): void {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : null
  const message = err instanceof Error ? err.message : String(err)
  storeError = code ? `${where} : ${code}, ${message}` : `${where} : ${message}`
  console.warn(`[RevenueCat] ${storeError}`)
}

/** `null` quand aucun appel n'a échoué depuis le lancement. */
export function storeDiagnostic(): string | null {
  return storeError
}

/** Remis à zéro avant chaque nouvelle tentative, sinon on lit une vieille panne. */
export function clearStoreDiagnostic(): void {
  storeError = null
}

export async function loginUser(userId: string): Promise<void> {
  try {
    if (!(await ensureConfigured())) return
    await Purchases.logIn(userId)
  } catch (err) {
    console.warn('[RevenueCat] login failed:', err)
  }
}

/**
 * Intégration « Meta Ads » de RevenueCat : l'essai et les achats partent chez
 * Meta côté serveur, reliés à la pub par ces identifiants. Appelé UNIQUEMENT
 * après consentement (lib/ads/metaAds.ts). Rattachés à l'identifiant courant :
 * à rejouer après `logIn`.
 */
export async function shareAdIdentifiers(fbAnonymousId: string | null): Promise<void> {
  try {
    if (!(await ensureConfigured())) return
    await Purchases.collectDeviceIdentifiers()
    if (fbAnonymousId) await Purchases.setFBAnonymousID(fbAnonymousId)
  } catch (err) {
    console.warn('[RevenueCat] identifiants publicitaires non transmis :', err)
  }
}

export async function logoutUser(): Promise<void> {
  try {
    if (!(await ensureConfigured())) return
    await Purchases.logOut()
  } catch (err) {
    console.warn('[RevenueCat] logout failed:', err)
  }
}

export async function getOfferings(): Promise<any> {
  try {
    if (!(await ensureConfigured())) return null
    return await Purchases.getOfferings()
  } catch (err) {
    noteStoreError('getOfferings', err)
    return null
  }
}

/**
 * Le dernier verrou avant la caisse : RevenueCat est-il bien sur CETTE personne ?
 *
 * Repris de Reveal Chat, qui l'a payé pour l'apprendre. `configure()` sans
 * identifiant fait générer à RevenueCat un `$RCAnonymousID:…` ; un achat conclu
 * dans cette fenêtre est enregistré sous cet identifiant-là, tandis que le
 * webhook Supabase interroge RevenueCat avec l'identifiant Supabase. Il ne
 * trouve rien, répond 200, et n'écrit rien : quelqu'un a payé et n'a rien.
 * Irréparable côté serveur — il faut aller chercher la transaction à la main
 * dans le tableau de bord.
 *
 * Ce n'est pas théorique ici : le projet Cosme Check comptait 161 clients au
 * 07/09/2026, dont une large part en `$RCAnonymousID`.
 *
 * Le coût de ce verrou est un appel local, sans réseau. Refuser un achat qui
 * n'a pas eu lieu est un désagrément ; encaisser un achat qu'on ne saura pas
 * rattacher est une perte sèche pour l'acheteur.
 *
 * Rend `false` quand on ne peut ni vérifier ni corriger : l'appelant ne doit
 * alors PAS ouvrir la feuille de paiement.
 */
export async function ensurePurchaseIdentity(userId: string | null): Promise<boolean> {
  if (!userId) return false
  if (!(await ensureConfigured())) return false
  try {
    const current = await Purchases.getAppUserID()
    if (current !== userId) await Purchases.logIn(userId)
    return true
  } catch (err) {
    noteStoreError('getAppUserID', err)
    return false
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
    if (!(await ensureConfigured())) return null
    return await Purchases.getCustomerInfo()
  } catch (err) {
    noteStoreError('getCustomerInfo', err)
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
    if (!(await ensureConfigured())) return []
    return await Purchases.getProducts(
      [PRODUCT_IDS.yearly, PRODUCT_IDS.monthly],
      Purchases.PRODUCT_CATEGORY.SUBSCRIPTION,
    )
  } catch (err) {
    noteStoreError('getProducts', err)
    return []
  }
}

/**
 * iOS : éligibilité à l'essai, par identifiant de produit (`null` en cas
 * d'échec). Voir `applyTrialEligibility` : sur iOS, `introPrice` seul ne dit
 * pas si la personne a encore droit à l'essai.
 */
export async function getTrialEligibility(
  productIds: string[],
): Promise<Record<string, { status: number }> | null> {
  try {
    if (!(await ensureConfigured())) return null
    return await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds)
  } catch (err) {
    noteStoreError('checkTrialOrIntroductoryPriceEligibility', err)
    return null
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
    if (!(await ensureConfigured())) return null
    const storefront = await Purchases.getStorefront()
    return storefront?.countryCode ?? null
  } catch (err) {
    noteStoreError('getStorefront', err)
    return null
  }
}
