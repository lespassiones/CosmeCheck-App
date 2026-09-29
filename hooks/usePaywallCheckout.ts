/**
 * usePaywallCheckout : la logique d'achat commune aux deux paywalls.
 *
 * Extraite de `app/offre/index.tsx` le 28/09/2026, quand le paywall de fin
 * d'onboarding (« Le diagnostic de Perle », A21) a reçu son propre design :
 * les deux écrans partagent désormais exactement les mêmes règles.
 *
 *   - Les prix viennent du MAGASIN, jamais du code (`lib/paywall/prices.ts`).
 *     Un prix de repli (`priceSource === 'fallback'`) est affiché comme
 *     indicatif et l'achat est refusé : on propose de recharger.
 *   - On achète le plan dont on a affiché le prix, sans repli silencieux.
 *   - L'essai n'est promis que si le magasin l'accorde à CETTE personne.
 *   - Après un achat, `paywall_shown` est posé avant de quitter, et le profil
 *     et les crédits sont rechargés (le tier bascule par le webhook).
 */

import { useState } from 'react'
import { Alert, Platform } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'

import { ROUTES } from '@/constants/routes'
import { usePurchases } from '@/hooks/usePurchases'
import { useRestorePurchases } from '@/hooks/useRestorePurchases'
import { useProfile } from '@/hooks/useProfile'
import {
  annualPerMonthLabel,
  legalDisclosure,
  planPriceLabel,
  renewLine,
  savingsPercent,
  trialLabel,
  type PlanId,
} from '@/lib/paywall/prices'
import { classifyPurchaseError, purchaseErrorMessage } from '@/lib/paywall/purchaseError'

/** Le magasin qui encaisse. Une app iOS qui parle de Google Play se fait remarquer. */
export const STORE_NAME = Platform.OS === 'ios' ? 'App Store' : 'Google Play'

export function usePaywallCheckout(options?: {
  onPurchased?: () => void
  /**
   * Paywall d'onboarding vu avant le compte : autorise l'achat sans session
   * (voir `usePurchases.purchase`) et laisse l'appelant décider de la suite.
   */
  guest?: boolean
}) {
  const [selected, setSelected] = useState<PlanId>('yearly')
  const [retrying, setRetrying] = useState(false)
  const purchases = usePurchases()
  const { monthly, yearly, priceSource, isLoadingPrices, isPurchasing, canPurchase, purchase, retry } = purchases
  const { updateProfile } = useProfile()
  const queryClient = useQueryClient()

  const selectedPkg = selected === 'yearly' ? yearly : monthly
  const isFallbackPrice = priceSource === 'fallback' && !isLoadingPrices

  const labels = {
    monthlyPrice: planPriceLabel(monthly),
    yearlyPrice: planPriceLabel(yearly),
    yearlyPerMonth: annualPerMonthLabel(yearly),
    savePercent: savingsPercent(monthly, yearly),
    priceLine: renewLine(selected, selectedPkg),
    /** « 3 jours », ou `null` si la personne n'a pas droit à l'essai. */
    trial: trialLabel(selectedPkg),
    /** Essai du plan annuel, affiché sur sa carte même s'il n'est pas choisi. */
    yearlyTrial: trialLabel(yearly),
    legal: legalDisclosure(selected, isFallbackPrice ? null : selectedPkg, STORE_NAME),
  }

  const handleRetryPrices = async () => {
    setRetrying(true)
    try {
      await retry()
    } finally {
      setRetrying(false)
    }
  }

  /** `true` seulement si l'achat a abouti. */
  const handlePurchase = async (): Promise<boolean> => {
    if (!canPurchase) {
      void handleRetryPrices()
      return false
    }
    if (!selectedPkg) {
      Alert.alert('Plan introuvable', "Ce plan n'est pas configuré dans la boutique pour le moment.")
      return false
    }
    try {
      const ok = await purchase(selected, { allowAnonymous: options?.guest === true })
      // `false` = la personne a fermé la feuille de paiement : on ne dit rien.
      if (!ok) return false
      if (options?.guest) {
        // Pas encore de compte : la suite (création du compte) appartient au parcours.
        options.onPurchased?.()
        return true
      }
      // Sans attendre le réseau (écriture optimiste, cache à jour tout de suite) :
      // sur un réseau lent, la personne qui venait de PAYER restait sur le
      // paywall, bouton réactivé, et pouvait racheter. Le profil est relu une
      // fois l'écriture faite (le relire avant la ramènerait à « non vu »).
      void updateProfile({ paywall_shown: true }, { keepOnError: true })
        .catch(() => {})
        .finally(() => void queryClient.invalidateQueries({ queryKey: ['profile'] }))
      void queryClient.invalidateQueries({ queryKey: ['credits'] })
      options?.onPurchased?.()
      router.replace(ROUTES.PREMIUM.WELCOME as never)
      return true
    } catch (err) {
      const msg = purchaseErrorMessage(classifyPurchaseError(err), STORE_NAME)
      if (msg) Alert.alert(msg.title, msg.body)
      return false
    }
  }

  const { restore } = useRestorePurchases(STORE_NAME)
  const handleRestore = async () => {
    await restore()
  }

  return {
    ...purchases,
    selected,
    setSelected,
    selectedPkg,
    isFallbackPrice,
    isPurchasing,
    retrying,
    labels,
    handlePurchase,
    handleRestore,
    handleRetryPrices,
  }
}
