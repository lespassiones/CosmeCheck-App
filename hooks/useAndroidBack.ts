/**
 * useAndroidBack — exécute `handler` sur le bouton retour matériel Android.
 * Si `handler` renvoie `true`, l'événement est consommé (pas de navigation
 * arrière par défaut) ; `false` → comportement normal (pop de l'écran).
 *
 * `handler` DOIT être stable (useCallback) pour ne pas réabonner à chaque rendu.
 * No-op sur iOS.
 */

import { useEffect } from 'react'
import { BackHandler, Platform } from 'react-native'

export function useAndroidBack(handler: () => boolean): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', handler)
    return () => sub.remove()
  }, [handler])
}
