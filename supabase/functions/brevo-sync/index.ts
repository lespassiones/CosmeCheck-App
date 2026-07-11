// brevo-sync — synchronise TOUS les inscrits (hors comptes de test) vers la
// liste Brevo « Cosme Check - Tous les inscrits » (id 4).
//
// POURQUOI : liste de contact d'URGENCE/service (panne, retablissement,
// incident, info CGU) — PAS de marketing (la newsletter a sa propre liste
// opt-in). Les messages de service n'exigent pas le consentement newsletter
// (interet legitime lie au contrat d'utilisation).
//
// Declenchee par pg_cron (quotidien 04:10 UTC via cosme_check.call_edge) ou a
// la main. Auth par header x-dispatch-secret (meme secret que push-dispatch).
// Idempotente : Brevo /contacts/import avec updateExistingContacts.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const DISPATCH_SECRET = Deno.env.get('NOTIF_DISPATCH_SECRET') || ''
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || ''
const LIST_ID = Number(Deno.env.get('BREVO_LIST_ALL_ID') || '4')

/** Motifs d'emails de comptes de TEST (jamais synchronises). */
const TEST_PATTERNS = [
  /@cosme-check\.com$/i,
  /@cosmecheck\./i,
  /\.test$/i,
  /\.local$/i,
  /\.dev$/i,
  /^debug_test/i,
  /testcivique/i,
  /@example\./i,
  /@email\.com$/i,
]

function isTestEmail(email: string): boolean {
  return TEST_PATTERNS.some((re) => re.test(email))
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!DISPATCH_SECRET || (req.headers.get('x-dispatch-secret') || '') !== DISPATCH_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (!BREVO_API_KEY) return json({ ok: false, error: 'BREVO_API_KEY manquant' }, 500)

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  try {
    // 1. Tous les users auth (pages de 1000) + prenoms.
    const users: { id: string; email: string }[] = []
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw error
      for (const u of data.users) {
        if (u.email && !isTestEmail(u.email)) users.push({ id: u.id, email: u.email })
      }
      if (data.users.length < 1000) break
    }

    const ids = users.map((u) => u.id)
    const firstNames = new Map<string, string>()
    if (ids.length > 0) {
      // Pagination (piege PostgREST 1000 lignes).
      for (let i = 0; i < ids.length; i += 500) {
        const { data } = await db
          .schema('cosme_check')
          .from('user_profiles')
          .select('id, first_name')
          .in('id', ids.slice(i, i + 500))
        for (const p of (data as { id: string; first_name: string | null }[]) ?? []) {
          if (p.first_name) firstNames.set(p.id, p.first_name)
        }
      }
    }

    // 2. Import Brevo (idempotent).
    const jsonBody = users.map((u) => ({
      email: u.email,
      attributes: { PRENOM: firstNames.get(u.id) ?? '' },
    }))
    const resp = await fetch('https://api.brevo.com/v3/contacts/import', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listIds: [LIST_ID],
        updateExistingContacts: true,
        emptyContactsAttributes: false,
        jsonBody,
      }),
    })
    const body = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      console.error('[brevo-sync] import a echoue:', resp.status, body)
      return json({ ok: false, status: resp.status, body }, 500)
    }

    console.log(`[brevo-sync] ${jsonBody.length} contacts envoyes (processId ${body?.processId})`)
    return json({ ok: true, synced: jsonBody.length, processId: body?.processId ?? null })
  } catch (err) {
    console.error('[brevo-sync] erreur fatale:', err)
    return json({ ok: false, error: err instanceof Error ? err.message : 'unknown' }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
