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

  /**
   * Lance l'achat. `false` = annulation par la personne, ce qui n'est pas une
   * erreur : l'appelant ne doit rien afficher. Toute autre erreur est relancée.
   *
   * Deux défauts corrigés le 28/08/2026 :
   *   - le chemin « annulation » sortait sans remettre `isLoading` à faux, donc
   *     fermer la feuille de paiement laissait le bouton en spinner désactivé,
   *     définitivement. Impossible de réessayer sans quitter l'écran ;
   *   - la mise à jour d'état repartait de `state.offerings`, capturé dans la
   *     fermeture, et pouvait donc réécrire des offres périmées. On passe par
   *     la forme fonctionnelle.
   */
  async function purchase(pkg: PurchasesPackage): Promise<boolean> {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const customerInfo = await purchasePackage(pkg)

      if (!customerInfo) {
        // Annulation : on rend la main au bouton, sans erreur.
        setState((prev) => ({ ...prev, isLoading: false }))
        return false
      }

      setState((prev) => ({
        ...prev,
        customerInfo,
        isPremium: isPremium(customerInfo),
        isLoading: false,
        error: null,
      }))
      return true
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Purchase failed')
      setState((prev) => ({ ...prev, isLoading: false, error }))
      // On RELANCE : l'appelant (écran offre) doit pouvoir classer l'erreur.
      // L'annulation utilisateur ne passe PAS ici (client renvoie null → false).
      throw error
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
