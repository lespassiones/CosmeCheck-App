// push-dispatch — emetteur unique des notifications push (Expo Push API).
//
// Declenchee par pg_net (cron toutes les 15 min via cosme_check.dispatch_due_
// notifications(), ou "envoyer maintenant" depuis l'admin). Deploiement
// --no-verify-jwt : l'authentification se fait par le header partage
// `x-dispatch-secret` (fail-closed), comme revenucat-webhook.
//
// Pipeline : claim atomique du lot du (cosme_check_claim_due_notifications) ->
// resolution des tokens push par user -> envoi par batches de 100 a Expo ->
// ecriture du statut final (sent/failed/skipped) + purge des tokens morts.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const DISPATCH_SECRET = Deno.env.get('NOTIF_DISPATCH_SECRET') || ''

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const BATCH = 100
const CLAIM_LIMIT = 500

interface OutboxRow {
  id: string
  user_id: string
  title: string
  body: string
  deeplink: string | null
  data: Record<string, unknown> | null
}

interface ExpoTicket {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Auth fail-closed par secret partage.
  if (!DISPATCH_SECRET) {
    console.error('[push-dispatch] NOTIF_DISPATCH_SECRET manquant — rejet 500')
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if ((req.headers.get('x-dispatch-secret') || '') !== DISPATCH_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Schema par defaut 'public' (ou vivent les RPC cosme_check_*) ; les tables du
  // schema cosme_check sont adressees explicitement via .schema('cosme_check').
  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })
  const cc = db.schema('cosme_check')

  try {
    // 1. Claim atomique du lot du (passe les lignes en 'sending').
    const { data: claimed, error: claimErr } = await db.rpc('cosme_check_claim_due_notifications', {
      p_limit: CLAIM_LIMIT,
    })
    if (claimErr) throw claimErr
    const rows: OutboxRow[] = (claimed as OutboxRow[]) ?? []
    if (rows.length === 0) {
      return json({ ok: true, processed: 0 })
    }

    // 2. Tokens par utilisateur.
    const userIds = [...new Set(rows.map((r) => r.user_id))]
    const { data: tokenRows, error: tokErr } = await cc
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', userIds)
    if (tokErr) throw tokErr
    const tokensByUser = new Map<string, string[]>()
    for (const t of (tokenRows as { user_id: string; token: string }[]) ?? []) {
      const list = tokensByUser.get(t.user_id) ?? []
      list.push(t.token)
      tokensByUser.set(t.user_id, list)
    }

    // 3. Construit les messages Expo + une meta parallele (ligne <-> token).
    const messages: Record<string, unknown>[] = []
    const meta: { outboxId: string; token: string }[] = []
    const noTokenRows: string[] = []
    for (const r of rows) {
      const tokens = tokensByUser.get(r.user_id) ?? []
      if (tokens.length === 0) {
        noTokenRows.push(r.id)
        continue
      }
      for (const token of tokens) {
        messages.push({
          to: token,
          title: r.title,
          body: r.body,
          sound: 'default',
          data: { ...(r.data ?? {}), url: r.deeplink ?? undefined },
        })
        meta.push({ outboxId: r.id, token })
      }
    }

    // 4. Envoi par batches ; agrege le resultat par ligne d'outbox.
    const perRow = new Map<string, { anyOk: boolean; error: string | null }>()
    const deadTokens = new Set<string>()
    let msgIndex = 0
    for (const batch of chunk(messages, BATCH)) {
      let tickets: ExpoTicket[] = []
      try {
        const resp = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch),
        })
        const parsed = await resp.json()
        tickets = (parsed?.data as ExpoTicket[]) ?? []
      } catch (e) {
        // Batch en echec reseau : marque toutes ses lignes en erreur.
        tickets = batch.map(() => ({ status: 'error', message: String(e) }) as ExpoTicket)
      }
      for (let i = 0; i < batch.length; i++) {
        const m = meta[msgIndex + i]
        const ticket = tickets[i]
        const agg = perRow.get(m.outboxId) ?? { anyOk: false, error: null }
        if (ticket && ticket.status === 'ok') {
          agg.anyOk = true
        } else {
          const err = ticket?.details?.error || ticket?.message || 'unknown_error'
          agg.error = agg.error ?? err
          if (ticket?.details?.error === 'DeviceNotRegistered') deadTokens.add(m.token)
        }
        perRow.set(m.outboxId, agg)
      }
      msgIndex += batch.length
    }

    // 5. Ecrit les statuts finaux.
    const nowIso = new Date().toISOString()
    let sent = 0
    let failed = 0
    for (const [outboxId, agg] of perRow) {
      if (agg.anyOk) {
        sent++
        await cc
          .from('notification_outbox')
          .update({ status: 'sent', sent_at: nowIso, error: null })
          .eq('id', outboxId)
      } else {
        failed++
        await cc
          .from('notification_outbox')
          .update({ status: 'failed', error: agg.error })
          .eq('id', outboxId)
      }
    }
    if (noTokenRows.length > 0) {
      await cc
        .from('notification_outbox')
        .update({ status: 'skipped', error: 'no_token' })
        .in('id', noTokenRows)
    }

    // 6. Purge des tokens morts (DeviceNotRegistered).
    if (deadTokens.size > 0) {
      await cc.from('push_tokens').delete().in('token', [...deadTokens])
    }

    return json({
      ok: true,
      processed: rows.length,
      sent,
      failed,
      skipped: noTokenRows.length,
      dead_tokens_purged: deadTokens.size,
    })
  } catch (err) {
    console.error('[push-dispatch] erreur fatale:', err)
    return json({ ok: false, error: err instanceof Error ? err.message : 'unknown' }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
