/**
 * clearUserScopedCaches — purge toutes les données en cache liées à
 * l'utilisateur au sign-out, pour éviter qu'un compte suivant (même appareil)
 * ne voie les données du précédent.
 *
 * Vide :
 *   - le cache mémoire React Query (`queryClient.clear()`),
 *   - toutes les clés AsyncStorage préfixées `cosmecheck:` (analyses, ai-cache,
 *     image produit, react-query persisté, INCI en attente, last analysis…).
 *
 * Plus aucune exception : `cosmecheck:preonboarding_done` était préservée pour
 * ne pas re-montrer le carrousel, mais ce flag n'est plus persisté du tout (il
 * vit en mémoire, le temps d'un lancement, cf. `lib/storage/preOnboarding.ts`).
 * Le purger ici nettoie au passage les appareils qui portent encore l'ancienne
 * clé.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

import { queryClient } from '@/lib/storage/queryClient'

export async function clearUserScopedCaches(): Promise<void> {
  try {
    queryClient.clear()
  } catch {
    // best-effort
  }
  try {
    const keys = await AsyncStorage.getAllKeys()
    const toRemove = keys.filter((k) => k.startsWith('cosmecheck:'))
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove)
  } catch {
    // best-effort : ne jamais bloquer la déconnexion.
  }
}
