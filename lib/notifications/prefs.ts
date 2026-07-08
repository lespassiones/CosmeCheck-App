/**
 * Préférences de notifications (module PUR, zéro dépendance native).
 *
 * QUOI : la forme canonique de `preferences.notifications` (jsonb sous
 * `user_profiles.preferences`), ses valeurs par défaut, la lecture défensive
 * depuis un jsonb arbitraire, et le prédicat d'affichage de la carte
 * "Rappels utiles" post-premier-bilan.
 *
 * POURQUOI : le jsonb vient de la DB (potentiellement écrit par le web ou par
 * une ancienne version de l'app) ; on ne fait JAMAIS confiance à sa forme.
 * Toute valeur absente, mal typée ou hors bornes retombe sur un défaut sûr
 * (notifications désactivées par défaut : opt-in explicite, jamais de prompt
 * permission au lancement). Ce module est importable par ts-jest (node) et ne
 * touche pas expo-notifications : la partie native vit dans scheduler/native.
 */

export interface NotificationPrefs {
  /** Toggle maître ; défaut false (opt-in explicite). */
  enabled: boolean
  /** Jour ISO 1..7 du rappel bilan (1 = lundi, 7 = dimanche) ; défaut 7. */
  bilanWeekday: number
  /** Heure locale 0..23 du rappel bilan ; défaut 18. */
  bilanHour: number
  /** Alertes conflits routine ; défaut true (effectif seulement si enabled). */
  conflictAlerts: boolean
  /** Suivi produit J+14 (phase 2) ; défaut false. */
  suiviProduit: boolean
  /** Carte "Rappels utiles" déjà montrée (post-premier-bilan). */
  promptSeen: boolean
}

/** Statut de permission simplifié (indépendant d'expo-notifications). */
export type PermissionStatusLite = 'granted' | 'denied' | 'undetermined' | 'unavailable'

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  bilanWeekday: 7,
  bilanHour: 18,
  conflictAlerts: true,
  suiviProduit: false,
  promptSeen: false,
}

/** Booléen strict : seul un vrai boolean est accepté, sinon défaut. */
function coerceBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Entier borné : nombre fini arrondi puis clampé dans [min, max], sinon défaut. */
function coerceInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.round(value)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

/**
 * Coercition défensive depuis `preferences.notifications` (jsonb).
 * Accepte null/undefined (profil jamais configuré) et tout objet partiel ou
 * corrompu : chaque champ est validé indépendamment.
 */
export function readNotificationPrefs(
  prefs: Record<string, unknown> | null | undefined,
): NotificationPrefs {
  const raw: Record<string, unknown> = prefs && typeof prefs === 'object' ? prefs : {}
  const d = DEFAULT_NOTIFICATION_PREFS
  return {
    enabled: coerceBool(raw.enabled, d.enabled),
    bilanWeekday: coerceInt(raw.bilanWeekday, 1, 7, d.bilanWeekday),
    bilanHour: coerceInt(raw.bilanHour, 0, 23, d.bilanHour),
    conflictAlerts: coerceBool(raw.conflictAlerts, d.conflictAlerts),
    suiviProduit: coerceBool(raw.suiviProduit, d.suiviProduit),
    promptSeen: coerceBool(raw.promptSeen, d.promptSeen),
  }
}

/**
 * La carte "Rappels utiles" (post-premier-bilan) doit-elle s'afficher ?
 * Jamais si déjà vue, jamais si la permission est déjà accordée, jamais si le
 * module natif est absent du binaire (OTA pré-rebuild : rien à proposer).
 * Un statut 'denied' affiche quand même la carte : l'utilisateur peut avoir
 * refusé par le passé et changer d'avis.
 */
export function shouldShowEnableCard(
  prefs: NotificationPrefs,
  status: PermissionStatusLite,
): boolean {
  return !prefs.promptSeen && status !== 'granted' && status !== 'unavailable'
}
