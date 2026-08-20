/**
 * Connexion Apple, en NATIF.
 *
 * Contrairement à Google (`lib/auth/google.ts`), rien ne passe par le
 * navigateur : `expo-apple-authentication` ouvre la feuille du système, Face ID
 * ou Touch ID authentifie, et l'app reçoit un jeton d'identité qu'on échange
 * contre une session Supabase via `signInWithIdToken`. Aucune URL de
 * redirection, aucun PKCE, aucune fenêtre web à refermer.
 *
 * Pourquoi ce bouton existe : la règle 4.8 de l'App Store impose Apple dès
 * qu'une connexion tierce est proposée, et Google l'est. Sans lui, le rejet est
 * automatique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFIGURATION, ET CE QUI EST DÉJÀ FAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase (fait le 20/08/2026, via l'API de gestion) :
 *   external_apple_enabled   = true
 *   external_apple_client_id = com.cosmecheck.app     (le bundle, pas un Services ID)
 *   external_apple_secret    = VIDE, et c'est correct : il ne sert qu'au parcours
 *                              web (Sign in with Apple JS), qui expire tous les six
 *                              mois. Un flux natif ne s'en sert jamais.
 *
 * app.json : `ios.usesAppleSignIn: true` pose l'habilitation
 *   `com.apple.developer.applesignin` au build. Sans elle, la feuille système ne
 *   s'ouvre pas.
 *
 * Portail Apple : la capacité « Sign in with Apple » doit être cochée sur l'App ID
 *   com.cosmecheck.app, sinon la signature du build échoue.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Platform } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { supabase, db } from '@/lib/supabase/client'
import { mapAuthError } from '@/lib/auth/session'

export interface AppleSignInResult {
  ok: boolean
  error?: string
  /** true si la personne a simplement fermé la feuille système (pas une erreur). */
  cancelled?: boolean
}

/**
 * Prénom en attente d'écriture.
 *
 * ⚠️ Apple ne renvoie `fullName` qu'à la TOUTE PREMIÈRE autorisation, jamais
 * ensuite, sur aucun appareil. Une fois perdu, il est perdu définitivement pour
 * ce compte. On le sort donc de la mémoire volatile vers le disque AVANT le
 * moindre appel réseau, et on ne l'effface qu'une fois écrit en base.
 */
const PENDING_NAME_KEY = 'cosmecheck:pending_apple_first_name'

/** Codes d'annulation renvoyés par le module natif selon les versions. */
const CANCEL_CODES = new Set(['ERR_REQUEST_CANCELED', 'ERR_CANCELED'])

function isCancellation(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code
  if (typeof code === 'string' && CANCEL_CODES.has(code)) return true
  const message = (err as { message?: unknown })?.message
  return typeof message === 'string' && /cancel/i.test(message)
}

/** Met le prénom de côté sur le disque. Un échec ici ne doit pas casser la connexion. */
async function stashPendingName(firstName: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_NAME_KEY, firstName)
  } catch {
    // Rien à faire : la connexion compte plus que le prénom.
  }
}

/**
 * Écrit le prénom en attente, s'il y en a un.
 *
 * Appelée après chaque connexion Apple réussie, donc elle rattrape aussi le
 * prénom d'une tentative précédente dont l'écriture avait échoué : la clé
 * survit, et c'est la seule occasion de la reprendre puisque Apple ne redonnera
 * jamais le nom.
 *
 * Deux écritures, volontairement :
 *   - `user_metadata.first_name`, que `useProfile` lit en repli ;
 *   - `user_profiles.first_name`, la source de vérité, que le trigger
 *     `handle_new_user` a laissée vide (le jeton Apple ne porte pas de nom).
 */
async function flushPendingName(): Promise<void> {
  try {
    const pending = (await AsyncStorage.getItem(PENDING_NAME_KEY))?.trim()
    if (!pending) return

    await supabase.auth.updateUser({ data: { first_name: pending } })

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    // On n'écrase jamais un prénom déjà renseigné : la personne a pu le corriger
    // depuis son profil, et Apple n'a pas autorité sur cette valeur.
    const { data: profile } = await db()
      .from('user_profiles')
      .select('first_name')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.first_name?.trim()) {
      await db().from('user_profiles').update({ first_name: pending }).eq('id', user.id)
    }

    await AsyncStorage.removeItem(PENDING_NAME_KEY)
  } catch {
    // La clé reste en place et sera reprise à la prochaine connexion Apple.
  }
}

/**
 * Ouvre la feuille Apple et établit la session Supabase.
 *
 * iOS uniquement : sur Android il n'existe pas de feuille native, et une porte
 * web de plus à maintenir pour un usage que personne ne demande. Le bouton n'y
 * est donc pas affiché.
 */
export async function signInWithApple(): Promise<AppleSignInResult> {
  if (Platform.OS !== 'ios') {
    return { ok: false, error: "La connexion Apple n'est disponible que sur iPhone." }
  }

  try {
    if (!(await AppleAuthentication.isAvailableAsync())) {
      return { ok: false, error: "La connexion Apple n'est pas disponible sur cet appareil." }
    }

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })

    // ⚠️ PREMIER GESTE, avant tout appel réseau : sauver le prénom.
    // Ne jamais déplacer cette ligne après un `await` qui peut échouer.
    const givenName = credential.fullName?.givenName?.trim()
    if (givenName) await stashPendingName(givenName)

    const identityToken = credential.identityToken
    if (!identityToken) {
      return { ok: false, error: 'Réponse Apple incomplète. Réessaie.' }
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
    })
    if (error) return { ok: false, error: mapAuthError(error) }

    // Best effort : la session existe déjà, une écriture ratée ne l'annule pas.
    await flushPendingName()

    return { ok: true }
  } catch (err) {
    if (isCancellation(err)) return { ok: false, cancelled: true }
    return { ok: false, error: mapAuthError(err as Error) }
  }
}
