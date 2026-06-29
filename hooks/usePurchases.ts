import { useEffect, useState } from 'react'
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases'
import { getOfferings, getCustomerInfo, purchasePackage, isPremium } from '@/lib/revenucat/client'

export interface UsePurchasesState {
  offerings: any
  customerInfo: CustomerInfo | null
  isPremium: boolean
  isLoading: boolean
  error: Error | null
}

export function usePurchases() {
  const [state, setState] = useState<UsePurchasesState>({
    offerings: null,
    customerInfo: null,
    isPremium: false,
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const [offerings, customerInfo] = await Promise.all([
          getOfferings(),
          getCustomerInfo(),
        ])

        if (mounted) {
          setState({
            offerings,
            customerInfo,
            isPremium: isPremium(customerInfo),
            isLoading: false,
            error: null,
          })
        }
      } catch (err) {
        if (mounted) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err : new Error('Unknown error'),
          }))
        }
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [])

  async function purchase(pkg: PurchasesPackage): Promise<boolean> {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }))
      const customerInfo = await purchasePackage(pkg)

      if (customerInfo) {
        setState({
          offerings: state.offerings,
          customerInfo,
          isPremium: isPremium(customerInfo),
          isLoading: false,
          error: null,
        })
        return true
      }

      return false
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Purchase failed'),
      }))
      return false
    }
  }

  async function refresh(): Promise<void> {
    try {
      const customerInfo = await getCustomerInfo()
      setState((prev) => ({
        ...prev,
        customerInfo,
        isPremium: isPremium(customerInfo),
      }))
    } catch (err) {
      console.warn('[usePurchases] refresh failed:', err)
    }
  }

  return {
    ...state,
    purchase,
    refresh,
  }
}
