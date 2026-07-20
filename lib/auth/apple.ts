/**
 * Sign in with Apple (iOS natif) via Supabase.
 *
 * Flux (bien plus simple que l'OAuth web de Google, car 100% natif) :
 *   1. `AppleAuthentication.signInAsync(...)` ouvre la feuille système Apple et
 *      renvoie un `identityToken` (JWT signé par Apple) + éventuellement le nom
 *      (UNIQUEMENT au tout premier consentement — Apple ne le renvoie jamais après).
 *   2. `supabase.auth.signInWithIdToken({ provider: 'apple', token })` échange ce
 *      token contre une session Supabase (pas de navigateur, pas de deep link).
 *   3. `onAuthStateChange` (useAuth) détecte la session → le guard redirige.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFIG REQUISE (hors code) :
 *   Apple Developer > Certificates, IDs & Profiles :
 *     - App ID `com.cosmecheck.app` avec capability « Sign In with Apple ».
 *     - Un Services ID + une clé (Key) « Sign in with Apple » pour Supabase.
 *   Supabase Dashboard > Authentication > Providers > Apple :
 *     - Activer, renseigner le Services ID (client_id), Team ID, Key ID, clé .p8.
 *     - Ajouter le bundle natif `com.cosmecheck.app` aux « Authorized Client IDs »
 *       (c'est l'audience du token natif) — sinon `signInWithIdToken` est rejeté.
 * NB : ne fonctionne QUE sur un build natif iOS (dev build / TestFlight), pas en
 *      Expo Go, et pas sur Android (bouton masqué hors iOS).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as AppleAuthentication from 'expo-apple-authentication'

import { supabase } from '@/lib/supabase/client'
import { mapAuthError } from '@/lib/auth/session'

export interface AppleSignInResult {
  ok: boolean
  error?: string
  /** true si l'utilisateur a fermé la feuille Apple (pas une vraie erreur). */
  cancelled?: boolean
}

export async function signInWithApple(): Promise<AppleSignInResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })

    const idToken = credential.identityToken
    if (!idToken) {
      return { ok: false, error: 'Réponse Apple incomplète. Réessaie.' }
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: idToken,
    })
    if (error) return { ok: false, error: mapAuthError(error) }

    // Apple ne fournit le nom qu'au PREMIER consentement. Si présent, on le
    // pousse dans les métadonnées user (first_name) — useProfile l'utilise en
    // fallback pour l'affichage du prénom. Best-effort, jamais bloquant.
    const firstName = credential.fullName?.givenName?.trim()
    if (firstName) {
      await supabase.auth
        .updateUser({ data: { first_name: firstName } })
        .catch(() => {})
    }

    return { ok: true }
  } catch (err) {
    // L'utilisateur a annulé la feuille système Apple.
    if ((err as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      return { ok: false, cancelled: true }
    }
    return { ok: false, error: mapAuthError(err as Error) }
  }
}
