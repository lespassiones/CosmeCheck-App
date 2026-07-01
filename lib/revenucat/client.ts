import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases'
import { Platform } from 'react-native'

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

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  try {
    const result = await Purchases.purchasePackage(pkg)
    return result.customerInfo
  } catch (err) {
    if (err instanceof Error && err.message.includes('PurchaseCancelled')) {
      return null
    }
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
