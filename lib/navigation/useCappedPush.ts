/**
 * useCappedPush — `router.push` plafonné (règle : lib/navigation/stackCap.ts).
 *
 * Lit l'état de navigation AU MOMENT DU TAP (via la ref du conteneur), sans
 * s'abonner aux changements : aucun rendu supplémentaire pour l'écran appelant.
 */
import { useCallback } from 'react'
import { router, useNavigationContainerRef, type Href } from 'expo-router'

import { shouldReplaceOnPush } from '@/lib/navigation/stackCap'

export function useCappedPush(): (href: Href) => void {
  const navRef = useNavigationContainerRef()
  return useCallback(
    (href: Href) => {
      let state: unknown
      try {
        state = navRef.isReady() ? navRef.getRootState() : undefined
      } catch {
        state = undefined
      }
      if (shouldReplaceOnPush(state)) router.replace(href)
      else router.push(href)
    },
    [navRef],
  )
}
