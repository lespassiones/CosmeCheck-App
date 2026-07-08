import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

interface RevenueCatEvent {
  event: {
    type: string
    app_user_id: string
    product_identifier?: string
    currency?: string
    price?: number
    revenue?: {
      total_purchased_usd: number
    }
  }
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
        '[RevenueCat Webhook] REVENUECAT_WEBHOOK_SECRET non configuré — rejet (fail-closed)',
      )
      return new Response(
        JSON.stringify({ error: 'server_misconfigured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }
    const gotAuth = req.headers.get('Authorization') || ''
    if (gotAuth !== expectedAuth) {
      console.warn('[RevenueCat Webhook] Authorization invalide — rejet 401')
      return new Response(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const payload: RevenueCatEvent = await req.json()
    const eventType = payload.event.type
    const userId = payload.event.app_user_id

    console.log(`[RevenueCat Webhook] Event: ${eventType}, User: ${userId}`)

    const db = createClient(supabaseUrl, supabaseServiceKey)

    // Handle purchase events (upgrade to premium)
    if (eventType === 'INITIAL_PURCHASE' || eventType === 'RENEWAL') {
      console.log(`[RevenueCat Webhook] Processing purchase for user ${userId}`)

      const { data, error } = await db.rpc('cosme_check_update_tier_with_credits', {
        p_user_id: userId,
        p_new_tier: 'premium',
      })

      if (error) {
        console.error('[RevenueCat Webhook] Error upgrading tier:', error)
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500 }
        )
      }

      console.log(`[RevenueCat Webhook] User ${userId} upgraded to premium with ${data?.daily_limit} credits/day`)
    }

    // Handle cancellation/expiration (downgrade to free)
    if (eventType === 'CANCELLATION' || eventType === 'EXPIRATION') {
      console.log(`[RevenueCat Webhook] Processing cancellation for user ${userId}`)

      const { data, error } = await db.rpc('cosme_check_update_tier_with_credits', {
        p_user_id: userId,
        p_new_tier: 'free',
      })

      if (error) {
        console.error('[RevenueCat Webhook] Error downgrading tier:', error)
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500 }
        )
      }

      console.log(`[RevenueCat Webhook] User ${userId} downgraded to free with ${data?.daily_limit} credits/day`)
    }

    return new Response(
      JSON.stringify({ ok: true, event: eventType }),
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
