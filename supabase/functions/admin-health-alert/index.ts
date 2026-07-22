// admin-health-alert — surveillance automatique de la sante de la plateforme.
//
// Declenchee toutes les heures par pg_cron (cosme_check.call_edge). Lit le
// bilan de sante (RPC cosme_check_admin_health), n'alerte QUE sur de VRAIS
// problemes (seuils ci-dessous), et envoie un EMAIL via Brevo a l'admin
// (ALERT_EMAIL). Chaque type d'alerte est dedoublonne sur 24 h via la RPC
// rate-limit existante (pas de spam : 1 email max par probleme par jour).
//
// `POST { "test": true }` envoie un email de test immediat (sans dedup).

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const DISPATCH_SECRET = Deno.env.get('NOTIF_DISPATCH_SECRET') || ''
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || ''
const ALERT_EMAIL = Deno.env.get('ALERT_EMAIL') || ''

// Seuils « vrai probleme » (pas d'alerte en dessous).
const ERRORS_1H_THRESHOLD = 5 // erreurs applicatives / heure
const AI_ERRORS_1H_THRESHOLD = 5 // appels IA en echec / heure
// Crons critiques : alerte si pas de succes depuis N heures.
const CRON_MAX_AGE_H: Record<string, number> = {
  cosme_check_dispatch_notifications: 2, // passe toutes les 15 min
  cosme_check_nightly_score_maintenance: 30, // quotidien
  cosme_check_run_notif_planner: 30, // quotidien
  cosme_check_brevo_sync: 100, // lun + ven (2x/sem) : écart max lun->ven = 96 h, +marge
}

type Health = {
  errors_last_hour: number
  ai_errors_last_hour: number
  ai_cost_today_estimated_usd: number
  ai_cost_daily_threshold_usd: number | null
  crons: { jobname: string; active: boolean; last_success: string | null; last_status: string | null }[]
}

async function sendEmail(subject: string, html: string): Promise<boolean> {
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Cosme Check Ops', email: 'contact@cosme-check.com' },
      to: [{ email: ALERT_EMAIL }],
      subject,
      htmlContent: html,
    }),
  })
  if (!resp.ok) console.error('[health-alert] envoi email a echoue:', resp.status, await resp.text())
  return resp.ok
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!DISPATCH_SECRET || (req.headers.get('x-dispatch-secret') || '') !== DISPATCH_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (!BREVO_API_KEY || !ALERT_EMAIL) return json({ ok: false, error: 'BREVO_API_KEY / ALERT_EMAIL manquant' }, 500)

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  let isTest = false
  try {
    const body = (await req.json()) as { test?: boolean }
    isTest = Boolean(body?.test)
  } catch { /* corps vide = run normal */ }

  if (isTest) {
    const ok = await sendEmail(
      '✅ Test des alertes Cosme Check',
      '<p>Ceci est un <b>email de test</b> du systeme d\'alertes.</p><p>Si tu le recois, la chaine Surveillance → Brevo → ta boite mail fonctionne. Les vraies alertes ne partiront que pour de vrais problemes (erreurs en serie, IA en panne, cron a l\'arret, cout IA au-dessus de ton seuil), au maximum une fois par jour par type de probleme.</p>',
    )
    return json({ ok, test: true })
  }

  try {
    const { data, error } = await db.rpc('cosme_check_admin_health')
    if (error) throw error
    const h = data as Health

    const problems: { key: string; line: string }[] = []

    if (h.errors_last_hour >= ERRORS_1H_THRESHOLD) {
      problems.push({
        key: 'errors_spike',
        line: `⚠️ <b>${h.errors_last_hour} erreurs applicatives</b> dans la derniere heure (seuil : ${ERRORS_1H_THRESHOLD}).`,
      })
    }
    if (h.ai_errors_last_hour >= AI_ERRORS_1H_THRESHOLD) {
      problems.push({
        key: 'ai_errors',
        line: `🤖 <b>${h.ai_errors_last_hour} appels IA en echec</b> dans la derniere heure : OpenAI/Mistral ont peut-etre un probleme (analyses et suggestions impactees).`,
      })
    }
    if (
      h.ai_cost_daily_threshold_usd != null &&
      h.ai_cost_today_estimated_usd > Number(h.ai_cost_daily_threshold_usd)
    ) {
      problems.push({
        key: 'ai_cost',
        line: `💸 Cout IA estime aujourd'hui : <b>$${h.ai_cost_today_estimated_usd}</b>, au-dessus de ton seuil ($${h.ai_cost_daily_threshold_usd}). Verifier un usage anormal.`,
      })
    }
    const now = Date.now()
    for (const c of h.crons ?? []) {
      const maxAgeH = CRON_MAX_AGE_H[c.jobname]
      if (!maxAgeH || !c.active) continue
      // Jamais execute (cron tout juste cree) : pas une panne, on attend son
      // premier passage. On n'alerte que si un passage a EU LIEU et a echoue,
      // ou si le dernier succes est trop vieux.
      if (!c.last_success && !c.last_status) continue
      if (c.last_status === 'failed') {
        problems.push({
          key: `cron_${c.jobname}`,
          line: `⏰ La tache automatique <b>${c.jobname}</b> a ECHOUE a son dernier passage.`,
        })
        continue
      }
      const last = c.last_success ? new Date(c.last_success).getTime() : 0
      if (now - last > maxAgeH * 3600_000) {
        problems.push({
          key: `cron_${c.jobname}`,
          line: `⏰ La tache automatique <b>${c.jobname}</b> n'a pas reussi depuis plus de ${maxAgeH} h (dernier succes : ${c.last_success ?? 'jamais'}).`,
        })
      }
    }

    if (problems.length === 0) return json({ ok: true, problems: 0 })

    // Dedup 24 h PAR type de probleme (rate-limit existante : 1 passage / 24 h).
    const fresh: typeof problems = []
    for (const p of problems) {
      const { data: rl } = await db.rpc('cosme_check_check_rate_limit', {
        p_key: `opsalert:${p.key}`,
        p_max: 1,
        p_window_sec: 86_400,
      })
      if ((rl as { ok?: boolean } | null)?.ok) fresh.push(p)
    }
    if (fresh.length === 0) return json({ ok: true, problems: problems.length, deduped: true })

    const ok = await sendEmail(
      `🚨 Cosme Check : ${fresh.length} probleme(s) detecte(s)`,
      `<p>La surveillance automatique a detecte :</p><ul>${fresh
        .map((p) => `<li>${p.line}</li>`)
        .join('')}</ul><p>Details dans l'admin → Systeme.</p>`,
    )
    return json({ ok, problems: fresh.length })
  } catch (err) {
    console.error('[health-alert] erreur fatale:', err)
    return json({ ok: false, error: err instanceof Error ? err.message : 'unknown' }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
