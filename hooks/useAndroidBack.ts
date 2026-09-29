/**
 * useAndroidBack — exécute `handler` sur le bouton retour matériel Android.
 * Si `handler` renvoie `true`, l'événement est consommé (pas de navigation
 * arrière par défaut) ; `false` → comportement normal (pop de l'écran).
 *
 * Actif SEULEMENT quand l'écran est affiché (useFocusEffect) : l'onglet Scan
 * reste monté sous la fiche qu'il a ouverte, et son écouteur (réabonné à chaque
 * frappe, donc toujours appelé en premier) avalait le retour de la fiche.
 *
 * `handler` DOIT être stable (useCallback) pour ne pas réabonner à chaque rendu.
 * No-op sur iOS.
 */

import { useCallback } from 'react'
import { BackHandler, Platform } from 'react-native'
import { useFocusEffect } from 'expo-router'

export function useAndroidBack(handler: () => boolean): void {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return
      const sub = BackHandler.addEventListener('hardwareBackPress', handler)
      return () => sub.remove()
    }, [handler]),
  )
}
