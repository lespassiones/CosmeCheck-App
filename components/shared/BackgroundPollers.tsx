/**
 * BackgroundPollers — composant EFFET (ne rend rien), monté UNE fois à la racine.
 *
 * Seul observateur à porter un `refetchInterval` pour les données relevées
 * périodiquement (solde de crédits, config app). React Query gère l'intervalle
 * PAR OBSERVATEUR : quand chaque lecteur (pastille crédits, profil, fenêtre
 * crédits, 7 lecteurs de la config…) avait le sien, les relevés se
 * multipliaient. Ici : une requête par intervalle pour toute l'app, en pause
 * app en arrière-plan (focusManager branché sur AppState dans app/_layout.tsx).
 */
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/hooks/useAuth'
import { CREDITS_POLL_MS, creditsQueryOptions } from '@/hooks/useCredits'
import { APP_CONFIG_POLL_MS, appConfigQueryOptions } from '@/hooks/useAppConfig'

export function BackgroundPollers(): null {
  const { user, isAuthenticated } = useAuth()

  useQuery({
    ...creditsQueryOptions(user?.id ?? null),
    enabled: isAuthenticated,
    refetchInterval: CREDITS_POLL_MS,
  })
  useQuery({ ...appConfigQueryOptions, refetchInterval: APP_CONFIG_POLL_MS })

  return null
}
