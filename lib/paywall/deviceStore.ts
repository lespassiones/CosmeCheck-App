/**
 * Ce que l'appareil dit de lui-même, pour choisir un prix de repli.
 *
 * Aucune permission, aucune géolocalisation : `expo-localization` lit les
 * réglages système déjà choisis par la personne (pays et devise), exactement
 * comme le fait le clavier ou le format de date. La question « où est ce
 * téléphone » n'est jamais posée à iOS.
 *
 * Séparé de `fallbackPrices.ts` pour que la logique de choix du prix reste
 * testable en environnement node, sans module natif.
 */

import { getLocales } from 'expo-localization'

import type { DeviceStoreContext } from './fallbackPrices'

/**
 * Région et devise de l'appareil.
 *
 * On prend la première locale, celle que l'utilisateur a mise en haut de sa
 * liste. `regionCode` plutôt que la région de la langue : quelqu'un peut lire
 * l'app en français depuis le Canada, et c'est le Canada qui facture.
 */
export function deviceStoreContext(): DeviceStoreContext {
  try {
    const locale = getLocales()[0]
    return {
      regionCode: locale?.regionCode ?? null,
      currencyCode: locale?.currencyCode ?? null,
      locale: locale?.languageTag ?? 'fr-FR',
    }
  } catch {
    // Un module natif absent ne doit pas priver le paywall de son repli : sans
    // région ni devise, `resolveFallbackTier` sert le palier dollar.
    return { regionCode: null, currencyCode: null, locale: 'fr-FR' }
  }
}
