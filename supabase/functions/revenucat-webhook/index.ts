import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { decideRevenueCatAction, type RcEventInput } from './decide.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// PostHog (projet « Cosme Check », EU). Token PUBLIC d'ingestion (write-only),
// pas un secret. Événement produit : premium_started, platform mobile.
const POSTHOG_KEY = 'phc_nVe87LGmXqMGcsovsqoL9mWocA9sDP9U4KVsUhGk9fqz'
const POSTHOG_HOST = 'https://eu.i.posthog.com'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function phCapture(event: string, distinctId: string, properties: Record<string, unknown> = {}): void {
  void fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event,
      distinct_id: distinctId,
      properties: { platform: 'mobile', ...properties },
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {/* best-effort */})
}

interface RevenueCatEvent {
  event: {
    id?: string
    type: string
    app_user_id?: string | null
    original_app_user_id?: string | null
    aliases?: string[] | null
    environment?: string | null
    period_type?: string | null
    expiration_at_ms?: number | null
    cancel_reason?: string | null
    product_id?: string | null
    product_identifier?: string | null
    store?: string | null
  }
}

/**
 * RevenueCat identifie l'utilisateur par `app_user_id`, mais peut envoyer un ID
 * anonyme (`$RCAnonymousID:…`) si l'achat a eu lieu avant `Purchases.logIn()`.
 * Le vrai ID Supabase se trouve alors dans `original_app_user_id` ou `aliases`.
 */
function resolveUserId(event: RevenueCatEvent['event']): string | null {
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && UUID_RE.test(candidate)) return candidate
  }
  return null
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    // Authentification : RevenueCat envoie la valeur du champ "Authorization
    // header value" (configuré dans le dashboard RC) dans l'en-tête Authorization.
    // On la compare au secret partagé REVENUECAT_WEBHOOK_SECRET. Sans ça, n'importe
    // qui connaissant l'URL pourrait forger un INITIAL_PURCHASE et offrir un premium.
    const expectedAuth = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') || ''
    if (!expectedAuth) {
      console.error(
        '[RevenueCat Webhook] REVENUECAT_WEBHOOK_SECRET non configuré, rejet (fail-closed)',
      )
      return new Response(
        JSON.stringify({ error: 'server_misconfigured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }
    const gotAuth = req.headers.get('Authorization') || ''
    if (gotAuth !== expectedAuth) {
      console.warn('[RevenueCat Webhook] Authorization invalide, rejet 401')
      return new Response(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const payload: RevenueCatEvent = await req.json()
    const rc = payload?.event
    if (!rc || typeof rc.type !== 'string') {
      console.warn('[RevenueCat Webhook] Payload sans event.type, ignoré')
      return new Response(JSON.stringify({ ok: true, ignored: 'payload_invalide' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const eventType = rc.type
    const userId = resolveUserId(rc)

    console.log(
      `[RevenueCat Webhook] Event: ${eventType}, env: ${rc.environment ?? 'n/a'}, user: ${userId ?? rc.app_user_id ?? 'n/a'}`,
    )

    // Aucun ID Supabase exploitable : on répond 200 pour que RevenueCat ne
    // rejoue pas indéfiniment un événement que l'on ne saura jamais rattacher.
    if (!userId) {
      console.warn(`[RevenueCat Webhook] Aucun user id exploitable pour ${eventType}, ignoré`)
      return new Response(JSON.stringify({ ok: true, ignored: 'user_id_introuvable' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const db = createClient(supabaseUrl, supabaseServiceKey)
    // NB: on refabrique le query builder à chaque requête. supabase-js mute
    // l'URL du builder en place, donc réutiliser le même objet ferait fuiter le
    // `select` et le filtre de la lecture dans l'écriture qui suit.
    const profiles = () => db.schema('cosme_check').from('user_profiles')

    // Période déjà connue en base : sert de garde-fou contre les événements
    // arrivés dans le désordre (un EXPIRATION en retard après un nouvel achat).
    const { data: profile, error: profileError } = await profiles()
      .select('tier, current_period_end')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      console.error('[RevenueCat Webhook] Lecture du profil impossible:', profileError)
      return new Response(JSON.stringify({ error: profileError.message }), { status: 500 })
    }
    if (!profile) {
      console.warn(`[RevenueCat Webhook] Profil ${userId} inexistant, ignoré`)
      return new Response(JSON.stringify({ ok: true, ignored: 'profil_inexistant' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const input: RcEventInput = {
      type: eventType,
      environment: rc.environment ?? null,
      periodType: rc.period_type ?? null,
      expirationAtMs: rc.expiration_at_ms ?? null,
      cancelReason: rc.cancel_reason ?? null,
    }
    const decision = decideRevenueCatAction(input, {
      now: Date.now(),
      storedPeriodEndIso: (profile as { current_period_end?: string | null }).current_period_end ?? null,
    })

    console.log(
      `[RevenueCat Webhook] Décision pour ${userId}: tier=${decision.tier ?? 'inchangé'} (${decision.reason})`,
    )

    // 1) Tier + crédits quotidiens, via la RPC qui aligne les deux.
    if (decision.tier) {
      const { data, error } = await db.rpc('cosme_check_update_tier_with_credits', {
        p_user_id: userId,
        p_new_tier: decision.tier,
      })
      if (error) {
        console.error('[RevenueCat Webhook] Mise à jour du tier impossible:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }
      console.log(
        `[RevenueCat Webhook] ${userId} → ${decision.tier} avec ${data?.daily_limit} crédits/jour`,
      )
    }

    // 2) État d'abonnement lisible (partagé avec l'écran Profil du web).
    if (Object.keys(decision.patch).length > 0) {
      const { error } = await profiles().update(decision.patch).eq('id', userId)
      if (error) {
        console.error('[RevenueCat Webhook] Écriture de l\'état d\'abonnement impossible:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }
    }

    // 3) Analytics : uniquement le DÉBUT d'abonnement réellement accordé.
    if (eventType === 'INITIAL_PURCHASE' && decision.tier === 'premium') {
      phCapture('premium_started', userId, {
        provider: 'revenuecat',
        product: rc.product_id ?? rc.product_identifier ?? null,
        store: rc.store ?? null,
      })
    }

    return new Response(
      JSON.stringify({ ok: true, event: eventType, tier: decision.tier, reason: decision.reason }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error('[RevenueCat Webhook] Fatal error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500 }
    )
  }
})
