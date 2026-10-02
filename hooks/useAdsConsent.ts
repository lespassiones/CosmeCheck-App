/**
 * useAdsConsent : interrupteur « Mesure des publicités » du Profil (RGPD : le
 * retrait doit être aussi simple que l'accord).
 *
 * Android : le choix est rangé dans l'app, l'interrupteur l'écrit directement.
 * iPhone : c'est l'autorisation système ATT qui décide. Jamais demandée : on
 * affiche la fenêtre ATT ; déjà répondue : iOS ne la remontre plus, on ouvre
 * les Réglages de l'app. Relu à chaque retour au premier plan.
 */

import { useCallback, useEffect, useState } from 'react'
import { AppState, Linking, Platform } from 'react-native'

import {
  askAdsConsentOnce,
  getAdsConsent,
  metaAdsAvailable,
  setAdsConsent,
} from '@/lib/ads/metaAds'
import type { AdsConsent } from '@/lib/ads/consentCore'

export function useAdsConsent() {
  const available = metaAdsAvailable()
  const [consent, setConsent] = useState<AdsConsent>('ask')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!available) return
    setConsent(await getAdsConsent())
  }, [available])

  useEffect(() => {
    void refresh()
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh()
    })
    return () => sub.remove()
  }, [refresh])

  const toggle = useCallback(
    async (next: boolean) => {
      if (busy) return
      setBusy(true)
      try {
        if (Platform.OS === 'ios') {
          if (consent === 'ask' && next) await askAdsConsentOnce()
          else void Linking.openSettings()
        } else {
          await setAdsConsent(next)
        }
        await refresh()
      } finally {
        setBusy(false)
      }
    },
    [busy, consent, refresh],
  )

  return { available, enabled: consent === 'granted', busy, toggle }
}
