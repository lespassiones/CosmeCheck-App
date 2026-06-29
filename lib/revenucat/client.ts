import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases'
import { Platform } from 'react-native'

const API_KEY = {
  ios: process.env.EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY || '',
  android: process.env.EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY || '',
}

export async function initRevenueCat(): Promise<void> {
  try {
    const apiKey = Platform.select({
      ios: API_KEY.ios,
      android: API_KEY.android,
    }) || API_KEY.ios

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
