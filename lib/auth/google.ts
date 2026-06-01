/**
 * Google OAuth (PKCE) compatible Expo.
 *
 * Flux :
 *   1. `redirectTo = makeRedirectUri({ scheme: 'cosmecheck' })`
 *      - build natif → `cosmecheck://...`
 *      - Expo Go (dev) → proxy `https://auth.expo.io/@<user>/<slug>` ou `exp://...`
 *   2. `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo,
 *      skipBrowserRedirect: true, queryParams: { access_type: 'offline', prompt: 'consent' } } })`
 *      → renvoie `data.url` (URL d'autorisation Google).
 *   3. `WebBrowser.openAuthSessionAsync(data.url, redirectTo)` ouvre le navigateur.
 *   4. Au retour `type === 'success'`, on parse `result.url` :
 *        - `?code=...`  → `supabase.auth.exchangeCodeForSession(code)` (PKCE)
 *        - `#access_token=...&refresh_token=...` → `supabase.auth.setSession(...)`
 *   5. `onAuthStateChange` (via useAuth) détecte la nouvelle session et le guard redirige.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * URLs DE REDIRECTION À CONFIGURER
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase Dashboard > Authentication > URL Configuration > Redirect URLs :
 *   - cosmecheck://                       (build natif / standalone)
 *   - cosmecheck://auth/callback          (si tu utilises un path dédié)
 *   - https://auth.expo.io/@<expo-username>/cosme-check   (Expo Go en dev)
 *   - exp://127.0.0.1:8081/--/*           (dev local — utile selon le tunneling)
 *
 * Supabase Dashboard > Authentication > Providers > Google :
 *   - Activer le provider, renseigner Client ID + Client Secret (depuis Google Cloud).
 *
 * Google Cloud Console > APIs & Services > Credentials > OAuth Client (Web) :
 *   Authorized redirect URIs :
 *   - https://<project-ref>.supabase.co/auth/v1/callback
 *     (ici project-ref = rogesnduejmqpxolhbif)
 *   → c'est Supabase qui rappelle ensuite le deep link `redirectTo` de l'app.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'

import { supabase } from '@/lib/supabase/client'
import { APP_SCHEME } from '@/constants/routes'
import { mapAuthError } from '@/lib/auth/session'

// Termine proprement toute session d'auth en attente (requis par expo-web-browser).
WebBrowser.maybeCompleteAuthSession()

export interface GoogleSignInResult {
  ok: boolean
  error?: string
  /** true si l'utilisateur a simplement fermé le navigateur (pas une vraie erreur). */
  cancelled?: boolean
}

/** Extrait les paramètres présents dans la query (`?a=b`) ET le fragment (`#a=b`). */
function parseAuthParams(rawUrl: string): URLSearchParams {
  const params = new URLSearchParams()

  const queryIndex = rawUrl.indexOf('?')
  const fragmentIndex = rawUrl.indexOf('#')

  if (queryIndex !== -1) {
    const end = fragmentIndex !== -1 ? fragmentIndex : rawUrl.length
    const query = rawUrl.slice(queryIndex + 1, end)
    for (const [k, v] of new URLSearchParams(query)) params.set(k, v)
  }

  if (fragmentIndex !== -1) {
    const fragment = rawUrl.slice(fragmentIndex + 1)
    for (const [k, v] of new URLSearchParams(fragment)) params.set(k, v)
  }

  return params
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  try {
    const redirectTo = makeRedirectUri({ scheme: APP_SCHEME })

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) return { ok: false, error: mapAuthError(error) }
    if (!data?.url) {
      return { ok: false, error: 'Impossible de lancer la connexion Google. Réessaie.' }
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { ok: false, cancelled: true }
    }

    if (result.type !== 'success' || !result.url) {
      return { ok: false, error: 'La connexion Google a échoué. Réessaie.' }
    }

    const params = parseAuthParams(result.url)

    // Cas erreur renvoyée par Google/Supabase dans l'URL de retour.
    const oauthError = params.get('error_description') ?? params.get('error')
    if (oauthError) return { ok: false, error: mapAuthError(oauthError) }

    // 1) Flux PKCE : on échange le `code` contre une session.
    const code = params.get('code')
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      if (exchangeError) return { ok: false, error: mapAuthError(exchangeError) }
      return { ok: true }
    }

    // 2) Flux implicite : tokens dans le fragment.
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (accessToken && refreshToken) {
      const { error: setError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (setError) return { ok: false, error: mapAuthError(setError) }
      return { ok: true }
    }

    return {
      ok: false,
      error: 'Réponse Google incomplète. Réessaie.',
    }
  } catch (err) {
    return { ok: false, error: mapAuthError(err as Error) }
  }
}
