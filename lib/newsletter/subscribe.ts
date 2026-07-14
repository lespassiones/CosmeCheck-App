/**
 * Newsletter opt-in — inscrit / desinscrit l'utilisateur courant a la liste
 * newsletter Brevo (#5) via l'Edge Function `newsletter-subscribe`.
 *
 * L'email n'est JAMAIS envoye par le client : l'edge le lit dans le JWT (on ne
 * peut inscrire que soi-meme). L'appel est BEST-EFFORT : il ne doit jamais
 * bloquer ni faire echouer l'inscription, l'onboarding ou un toggle de reglage.
 * On ne remonte donc pas d'erreur a l'UI (echec silencieux + log dev).
 */
import { supabase } from '@/lib/supabase/client'

/** D'ou vient le consentement (trace cote serveur pour l'audit RGPD). */
export type NewsletterSource =
  | 'signup_email'
  | 'onboarding_notifications'
  | 'settings_notifications'

export async function setNewsletterConsent(
  subscribe: boolean,
  source: NewsletterSource,
): Promise<void> {
  try {
    await supabase.functions.invoke('newsletter-subscribe', {
      body: { action: subscribe ? 'subscribe' : 'unsubscribe', source },
    })
  } catch (err) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[newsletter] opt-in best-effort a echoue:', err)
    }
  }
}
