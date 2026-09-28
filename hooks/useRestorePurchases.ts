/**
 * useRestorePurchases : « Restaurer mes achats », partagé par le paywall
 * (`usePaywallCheckout`) et la page « Mon abonnement ».
 *
 * Retrouve les abonnements du compte magasin, recharge profil et crédits si
 * Premium est de nouveau actif, et prévient la personne dans les deux cas.
 */

import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import Purchases, { type CustomerInfo } from 'react-native-purchases'
import { useQueryClient } from '@tanstack/react-query'

import { classifyPurchaseError, purchaseErrorMessage } from '@/lib/paywall/purchaseError'

export function useRestorePurchases(storeName: string) {
  const queryClient = useQueryClient()
  const [restoring, setRestoring] = useState(false)

  /** Rend les nouvelles infos client, ou null si rien n'a pu être restauré. */
  const restore = useCallback(async (): Promise<CustomerInfo | null> => {
    setRestoring(true)
    try {
      const info = await Purchases.restorePurchases()
      const restored = info.entitlements.active.premium !== undefined
      if (!restored) {
        Alert.alert(
          'Aucun achat à restaurer',
          `Aucun abonnement actif n'est rattaché à ce compte ${storeName}.`,
        )
        return info
      }
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
      void queryClient.invalidateQueries({ queryKey: ['credits'] })
      Alert.alert('Achats restaurés', 'Ton abonnement Premium est de nouveau actif.')
      return info
    } catch (err) {
      const msg = purchaseErrorMessage(classifyPurchaseError(err), storeName)
      if (msg) Alert.alert('Restauration impossible', msg.body)
      return null
    } finally {
      setRestoring(false)
    }
  }, [queryClient, storeName])

  return { restore, restoring }
}
