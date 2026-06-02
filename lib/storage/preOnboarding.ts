/**
 * Pré-onboarding — flag DEVICE-level (pas user-level).
 *
 * Le carrousel de pré-onboarding (4 écrans de présentation) ne doit s'afficher
 * qu'au TOUT premier lancement de l'app sur l'appareil, AVANT toute
 * authentification. On stocke donc un simple booléen dans AsyncStorage (non lié
 * à un user_id, contrairement à `onboardingShown` qui vit dans `preferences`).
 *
 * Un cache module-level permet une lecture synchrone immédiate après écriture
 * (utile pour l'AuthGuard, qui ne doit jamais reboucler après le marquage).
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'cosmecheck:preonboarding_done'

let cache: boolean | null = null

/** Lecture (async, met le cache à jour). `false` en cas d'erreur de lecture. */
export async function isPreOnboardingDone(): Promise<boolean> {
  if (cache !== null) return cache
  try {
    cache = (await AsyncStorage.getItem(KEY)) === 'true'
  } catch {
    cache = false
  }
  return cache
}

/** Marque le pré-onboarding comme vu (appelé par le CTA / « Passer »). */
export async function markPreOnboardingDone(): Promise<void> {
  cache = true
  try {
    await AsyncStorage.setItem(KEY, 'true')
  } catch {
    // best-effort : ne jamais bloquer la navigation.
  }
}

/** Réinitialise le flag — utilisé par le bouton dev « Revoir l'onboarding ». */
export async function resetPreOnboarding(): Promise<void> {
  cache = false
  try {
    await AsyncStorage.removeItem(KEY)
  } catch {
    // best-effort
  }
}

/** Valeur en cache (synchrone) : `null` tant qu'aucune lecture n'a eu lieu. */
export function getPreOnboardingCache(): boolean | null {
  return cache
}
