/**
 * Acces au module natif `expo-store-review` (chargement PARESSEUX, OTA-safe).
 *
 * QUOI : declenche le flux de notation In-App (dialogue natif Google Play
 * In-App Review sur Android, SKStoreReviewController sur iOS). Sur Android
 * SEULEMENT, repli sur l'ouverture de la fiche Play si l'API n'est pas
 * disponible (module absent du binaire avant le rebuild, ou quota Google
 * atteint). Sur iOS, jamais de repli vers l'App Store (regle 5.6.1, voir
 * `allowsListingFallback` dans prompt.ts) : si la fenetre du systeme n'est pas
 * disponible, il ne se passe rien.
 *
 * POURQUOI un require differe (comme lib/notifications/native.ts) : un import
 * top-level jetterait au boot si le module natif n'est pas dans le binaire
 * (release OTA poussee AVANT le rebuild, Expo Go, tests node). Ici tout est en
 * require() try/catch pour que l'app ne crashe jamais.
 *
 * NOTE : Google ne communique PAS si l'utilisateur a reellement note ni meme si
 * le dialogue s'est affiche (quota cote OS). On considere donc que lancer le
 * flux = mission accomplie (cf. `markDone` dans prompt.ts).
 */

import { Linking, Platform } from 'react-native'

import { allowsListingFallback } from '@/lib/review/prompt'

// Volontairement `any` : le package peut ne pas etre installe au typecheck.
type StoreReviewModule = any // eslint-disable-line @typescript-eslint/no-explicit-any

const ANDROID_PACKAGE = 'com.cosmecheck.app'
// Plus d'adresse App Store ici, volontairement : sur iOS, aucun repli vers la
// fiche (regle 5.6.1). Seule la fiche Play sert de repli.
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`

let cached: StoreReviewModule | null | undefined

function getStoreReviewModule(): StoreReviewModule | null {
  if (cached !== undefined) return cached
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    cached = require('expo-store-review') ?? null
  } catch {
    cached = null
  }
  return cached
}

/** Vrai si le module natif est present (donc le binaire a ete rebuild). */
export function isStoreReviewAvailable(): boolean {
  return getStoreReviewModule() !== null
}

/** Ouvre la fiche Play en repli (jamais bloquant, et jamais sur iOS). */
async function openStoreListing(): Promise<void> {
  if (!allowsListingFallback(Platform.OS)) return
  try {
    await Linking.openURL(PLAY_STORE_URL)
  } catch {
    // best-effort
  }
}

/**
 * Lance le flux de notation. Utilise le dialogue In-App natif s'il est
 * disponible, sinon ouvre la fiche Play (Android seulement). Ne throw jamais.
 */
export async function requestStoreReview(): Promise<void> {
  const StoreReview = getStoreReviewModule()
  if (!StoreReview) {
    await openStoreListing()
    return
  }
  try {
    const available =
      typeof StoreReview.isAvailableAsync === 'function'
        ? await StoreReview.isAvailableAsync()
        : false
    const hasAction =
      typeof StoreReview.hasAction === 'function' ? await StoreReview.hasAction() : true
    if (available && hasAction && typeof StoreReview.requestReview === 'function') {
      await StoreReview.requestReview()
      return
    }
    await openStoreListing()
  } catch {
    await openStoreListing()
  }
}

/**
 * iOS : la fenetre du systeme, et rien d'autre (regle 5.6.1).
 *
 * Appelee directement au moment opportun, sans carte maison avant et sans
 * repli vers l'App Store apres. Si le module natif manque (mise a jour OTA sur
 * un vieux binaire) ou si la fenetre n'est pas disponible, il ne se passe rien.
 * Apple decide seul de l'afficher ou non (trois fois par an au plus). Ne throw
 * jamais.
 */
export async function requestSystemReview(): Promise<void> {
  const StoreReview = getStoreReviewModule()
  if (!StoreReview || typeof StoreReview.requestReview !== 'function') return
  try {
    const available =
      typeof StoreReview.isAvailableAsync === 'function'
        ? await StoreReview.isAvailableAsync()
        : false
    if (available) await StoreReview.requestReview()
  } catch {
    // best-effort : rien a montrer, rien a ouvrir.
  }
}
