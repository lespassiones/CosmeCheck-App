/**
 * Acces au module natif `expo-store-review` (chargement PARESSEUX, OTA-safe).
 *
 * QUOI : declenche le flux de notation In-App (dialogue natif Google Play
 * In-App Review sur Android, SKStoreReviewController sur iOS). Repli sur
 * l'ouverture de la fiche store si l'API n'est pas disponible (module absent
 * du binaire avant le rebuild, ou quota Google atteint).
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

// Volontairement `any` : le package peut ne pas etre installe au typecheck.
type StoreReviewModule = any // eslint-disable-line @typescript-eslint/no-explicit-any

const ANDROID_PACKAGE = 'com.cosmecheck.app'
const IOS_APP_STORE_URL = 'https://apps.apple.com/app/id0000000000' // TODO: remplacer par l'Apple ID reel apres publication.
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

/** Ouvre la fiche store en repli (jamais bloquant). */
async function openStoreListing(): Promise<void> {
  const url = Platform.OS === 'ios' ? IOS_APP_STORE_URL : PLAY_STORE_URL
  try {
    await Linking.openURL(url)
  } catch {
    // best-effort
  }
}

/**
 * Lance le flux de notation. Utilise le dialogue In-App natif s'il est
 * disponible, sinon ouvre la fiche store. Ne throw jamais.
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
