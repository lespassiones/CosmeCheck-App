/**
 * clearUserScopedCaches — purge toutes les données en cache liées à
 * l'utilisateur au sign-out, pour éviter qu'un compte suivant (même appareil)
 * ne voie les données du précédent.
 *
 * Vide :
 *   - le cache mémoire React Query (`queryClient.clear()`),
 *   - toutes les clés AsyncStorage préfixées `cosmecheck:` (analyses, ai-cache,
 *     image produit, react-query persisté, INCI en attente, last analysis…),
 * SAUF le flag device-level du pré-onboarding (ne dépend pas du compte).
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

import { queryClient } from '@/lib/storage/queryClient'

/** Clés à CONSERVER (device-level, non liées au compte). */
const PRESERVE = new Set<string>(['cosmecheck:preonboarding_done'])

export async function clearUserScopedCaches(): Promise<void> {
  try {
    queryClient.clear()
  } catch {
    // best-effort
  }
  try {
    const keys = await AsyncStorage.getAllKeys()
    const toRemove = keys.filter(
      (k) => k.startsWith('cosmecheck:') && !PRESERVE.has(k),
    )
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove)
  } catch {
    // best-effort : ne jamais bloquer la déconnexion.
  }
}
