// ai-credits-watch : surveille les credits OpenAI et previent par email.
//
// Declenchee toutes les heures par pg_cron (cosme_check.call_edge). Fait un
// appel minuscule a OpenAI (1 token) et classe la reponse :
//   - 200                          -> credits OK
//   - insufficient_quota & co      -> credits epuises
//   - tout le reste (panne, reseau) -> ignore, l'etat ne bouge pas
//
// L'etat vit dans cosme_check.ai_credit_watch (une ligne par fournisseur).
// Un email ne part QUE sur un changement d'etat :
//   - 2 echecs « credits epuises » d'affilee alors que l'etat est ok -> 1 email
//   - premier ping OK alors que l'etat est en panne                    -> 1 email
// Entre les deux : silence, meme si la panne dure des jours. Si l'envoi
// echoue, l'etat n'est pas bascule : on retentera au passage suivant.
//
// `POST { "test": true }` envoie un email de test immediat (etat inchange).

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const DISPATCH_SECRET = Deno.env.get('NOTIF_DISPATCH_SECRET') || ''
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || ''
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''

const RECIPIENTS = ['clarkybrian@outlook.fr', 'contact@cosme-check.com']
const PROVIDER = 'openai'
const FAILS_BEFORE_ALERT = 2
// Codes OpenAI qui veulent dire « plus d'argent sur le compte ».
const NO_CREDIT_CODES = new Set([
  'insufficient_quota',
  'billing_hard_limit_reached',
  'billing_not_active',
  'account_deactivated',
])

type Ping = { result: 'ok' | 'no_credit' | 'unknown'; detail: string }

async function pingOpenAI(): Promise<Ping> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 20_000)
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: ctl.signal,
    })
    if (res.ok) return { result: 'ok', detail: 'HTTP 200' }
    const text = await res.text().catch(() => '')
    let code = ''
    try {
      code = String((JSON.parse(text) as { error?: { code?: string; type?: string } }).error?.code ?? '')
    } catch { /* corps non JSON */ }
    const detail = `HTTP ${res.status} ${code}`.trim()
    return { result: NO_CREDIT_CODES.has(code) ? 'no_credit' : 'unknown', detail }
  } catch (err) {
    return { result: 'unknown', detail: ctl.signal.aborted ? 'timeout' : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

async function sendEmail(subject: string, html: string): Promise<boolean> {
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Cosme Check Ops', email: 'contact@cosme-check.com' },
      to: RECIPIENTS.map((email) => ({ email })),
      subject,
      htmlContent: html,
    }),
  })
  if (!resp.ok) console.error('[ai-credits-watch] envoi email a echoue:', resp.status, await resp.text())
  return resp.ok
}

const parisTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!DISPATCH_SECRET || (req.headers.get('x-dispatch-secret') || '') !== DISPATCH_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (!BREVO_API_KEY || !OPENAI_API_KEY) {
    return json({ ok: false, error: 'BREVO_API_KEY / OPENAI_API_KEY manquant' }, 500)
  }

  let isTest = false
  try {
    const body = (await req.json()) as { test?: boolean }
    isTest = Boolean(body?.test)
  } catch { /* corps vide = run normal */ }

  if (isTest) {
    const ok = await sendEmail(
      '✅ Test : surveillance des crédits IA',
      '<p>Ceci est un <b>email de test</b> de la surveillance des crédits OpenAI.</p><p>Tu recevras un seul email si les crédits sont épuisés (après 2 vérifications d\'affilée, une par heure), puis un seul email quand ils seront rétablis. Rien entre les deux.</p>',
    )
    return json({ ok, test: true })
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }).schema('cosme_check')

  try {
    const { data: row, error } = await db
      .from('ai_credit_watch')
      .select('status, fail_streak, changed_at')
      .eq('provider', PROVIDER)
      .maybeSingle()
    if (error) throw error
    const state = row ?? { status: 'ok', fail_streak: 0, changed_at: new Date().toISOString() }

    const ping = await pingOpenAI()
    const now = new Date().toISOString()
    let { status, fail_streak: failStreak, changed_at: changedAt } = state
    let emailed: string | null = null

    if (ping.result === 'no_credit') {
      failStreak += 1
      if (status === 'ok' && failStreak >= FAILS_BEFORE_ALERT) {
        const sent = await sendEmail(
          '🔴 Cosme Check : plus de crédits OpenAI',
          `<p>Les crédits <b>OpenAI</b> sont épuisés : ${FAILS_BEFORE_ALERT} vérifications d'affilée ont échoué (réponse : <code>${ping.detail}</code>).</p><p>L'app bascule sur Mistral quand elle le peut, mais les analyses et l'Advisor sont dégradés.</p><p>👉 Recharger : <a href="https://platform.openai.com/settings/organization/billing/overview">platform.openai.com, Billing</a></p><p>Tu ne recevras pas d'autre email tant que ce n'est pas rétabli.</p>`,
        )
        if (sent) {
          status = 'down'
          changedAt = now
          emailed = 'down'
        }
      }
    } else if (ping.result === 'ok') {
      failStreak = 0
      if (status === 'down') {
        const sent = await sendEmail(
          '🟢 Cosme Check : crédits OpenAI rétablis',
          `<p>Les crédits <b>OpenAI</b> répondent de nouveau. Panne signalée le ${parisTime(changedAt)}.</p><p>Tout est revenu à la normale.</p>`,
        )
        if (sent) {
          status = 'ok'
          changedAt = now
          emailed = 'up'
        }
      }
    }
    // 'unknown' : on ne touche ni a l'etat ni au compteur.

    const { error: upErr } = await db.from('ai_credit_watch').upsert({
      provider: PROVIDER,
      status,
      fail_streak: failStreak,
      changed_at: changedAt,
      last_check_at: now,
      last_result: ping.result,
      last_detail: ping.detail.slice(0, 300),
    })
    if (upErr) throw upErr

    return json({ ok: true, ping: ping.result, detail: ping.detail, status, fail_streak: failStreak, emailed })
  } catch (err) {
    console.error('[ai-credits-watch] erreur fatale:', err)
    return json({ ok: false, error: err instanceof Error ? err.message : 'unknown' }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
