/**
 * Session Management — wrappeurs autour de Supabase Auth avec gestion d'erreurs FR.
 *
 * Toutes les actions retournent un objet `{ ok, error? }` (jamais d'exception qui
 * remonte jusqu'à l'UI) afin que les écrans n'aient qu'à lire `result.error`.
 *
 * Règles mot de passe : min 8 caractères, au moins une minuscule, une majuscule
 * et un chiffre. Exposées via `computePasswordChecks` / `isPasswordValid` pour
 * que les formulaires affichent une checklist en temps réel.
 */

import { makeRedirectUri } from 'expo-auth-session'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { phCapture } from '@/lib/analytics/posthog'

import { supabase } from '@/lib/supabase/client'
import { APP_SCHEME, DEEP_LINKS } from '@/constants/routes'

// ── Types ───────────────────────────────────────────────────────────

export interface AuthActionResult {
  ok: boolean
  error?: string
}

export interface PasswordChecks {
  /** Au moins 8 caractères. */
  minLength: boolean
  /** Au moins une lettre minuscule. */
  lowercase: boolean
  /** Au moins une lettre majuscule. */
  uppercase: boolean
  /** Au moins un chiffre. */
  digit: boolean
}

/** Libellés FR des règles, dans l'ordre d'affichage. */
export const PASSWORD_RULES: { key: keyof PasswordChecks; label: string }[] = [
  { key: 'minLength', label: 'Au moins 8 caractères' },
  { key: 'lowercase', label: 'Une lettre minuscule' },
  { key: 'uppercase', label: 'Une lettre majuscule' },
  { key: 'digit', label: 'Un chiffre' },
]

// ── Validation mot de passe ─────────────────────────────────────────

export function computePasswordChecks(password: string): PasswordChecks {
  return {
    minLength: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
  }
}

export function isPasswordValid(password: string): boolean {
  const checks = computePasswordChecks(password)
  return checks.minLength && checks.lowercase && checks.uppercase && checks.digit
}

// ── Traduction des erreurs Supabase ─────────────────────────────────

const ERROR_TRANSLATIONS: Record<string, string> = {
  'Invalid login credentials': 'Email ou mot de passe incorrect',
  'Email not confirmed':
    'Confirme ton email avant de te connecter (vérifie ta boîte de réception).',
  'User already registered': 'Un compte existe déjà avec cet email',
  'Password should be at least 6 characters':
    'Le mot de passe est trop court (8 caractères minimum).',
  'Signup requires a valid password': 'Choisis un mot de passe valide.',
  'Email rate limit exceeded': 'Trop de tentatives. Réessaie dans quelques minutes.',
  'Unable to validate email address: invalid format': 'Adresse email invalide.',
  'New password should be different from the old password':
    'Choisis un mot de passe différent de l’ancien.',
  'Auth session missing!':
    'Lien de réinitialisation invalide ou expiré. Demande-en un nouveau.',
}

/**
 * Traduit un message d'erreur Supabase en français.
 * Gère aussi les erreurs réseau / timeout de façon générique.
 */
export function mapAuthError(error: AuthError | Error | string | null | undefined): string {
  if (!error) return 'Une erreur est survenue. Réessaie.'

  const message = typeof error === 'string' ? error : error.message

  // Erreurs réseau / indisponibilité du service.
  if (
    /network|fetch|timeout|timed out|failed to fetch|connection/i.test(message)
  ) {
    return 'Service temporairement indisponible. Vérifie ta connexion et réessaie.'
  }

  // Correspondance directe.
  if (ERROR_TRANSLATIONS[message]) return ERROR_TRANSLATIONS[message]

  // Correspondance partielle (Supabase ajoute parfois des préfixes).
  for (const key of Object.keys(ERROR_TRANSLATIONS)) {
    if (message.includes(key)) return ERROR_TRANSLATIONS[key]
  }

  return 'Une erreur est survenue. Réessaie.'
}

// ── Lien de redirection pour la réinitialisation ────────────────────

/**
 * Construit le deep link de retour pour le flux "mot de passe oublié".
 * Utilise le deep link statique défini dans les constantes ; en dev (Expo Go)
 * `makeRedirectUri` génère un proxy exp:// utilisable.
 */
function buildResetRedirect(): string {
  try {
    const uri = makeRedirectUri({ scheme: APP_SCHEME, path: 'reset-password' })
    return uri || DEEP_LINKS.RESET_PASSWORD
  } catch {
    return DEEP_LINKS.RESET_PASSWORD
  }
}

// ── Actions ─────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<AuthActionResult> {
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) return { ok: false, error: mapAuthError(error) }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: mapAuthError(err as Error) }
  }
}

export async function signUp(
  firstName: string,
  email: string,
  password: string,
): Promise<AuthActionResult> {
  if (!isPasswordValid(password)) {
    return {
      ok: false,
      error: 'Le mot de passe ne respecte pas les règles de sécurité.',
    }
  }

  try {
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        // `signup_platform` est copié dans user_profiles.signup_platform par le
        // trigger handle_new_user → permet de distinguer mobile vs web en base.
        data: { first_name: firstName.trim(), signup_platform: 'mobile' },
        emailRedirectTo: buildResetRedirect(),
      },
    })
    if (error) return { ok: false, error: mapAuthError(error) }
    phCapture('signup')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: mapAuthError(err as Error) }
  }
}

export async function signOut(): Promise<AuthActionResult> {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) return { ok: false, error: mapAuthError(error) }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: mapAuthError(err as Error) }
  }
}

/**
 * Demande l'envoi d'un email de réinitialisation.
 * Renvoie TOUJOURS `{ ok: true }` (anti-énumération de comptes) : on ne révèle
 * jamais si l'email existe en base. Les vraies erreurs sont logguées en dev.
 */
export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: buildResetRedirect() },
    )
    if (error && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[auth] requestPasswordReset:', error.message)
    }
  } catch (err) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[auth] requestPasswordReset (exception):', err)
    }
  }
  // Réponse neutre quoi qu'il arrive.
  return { ok: true }
}

/**
 * Met à jour le mot de passe de l'utilisateur courant.
 * Nécessite une session active (notamment la session de récupération issue du
 * deep link `PASSWORD_RECOVERY`).
 */
export async function updatePassword(newPassword: string): Promise<AuthActionResult> {
  if (!isPasswordValid(newPassword)) {
    return {
      ok: false,
      error: 'Le mot de passe ne respecte pas les règles de sécurité.',
    }
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      return {
        ok: false,
        error: 'Lien de réinitialisation invalide ou expiré. Demande-en un nouveau.',
      }
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { ok: false, error: mapAuthError(error) }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: mapAuthError(err as Error) }
  }
}

// ── Helpers de lecture (utilitaires) ────────────────────────────────

export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}

export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
