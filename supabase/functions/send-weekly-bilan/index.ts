/**
 * Edge Function `send-weekly-bilan` — rappel HEBDO du bilan peau en PUSH DISTANT
 * (Expo Push), déclenchée par un cron horaire (pg_cron + pg_net).
 *
 * Auth : cette fonction n'a PAS de gate utilisateur. Elle exige l'en-tête
 * `x-cron-secret` == secret CRON_SECRET (défini côté Edge secrets + fourni par
 * le cron et par l'action admin « envoyer un test »). Déployée verify_jwt=false.
 *
 * Modes :
 *   - cron (défaut) : lit app_config (notif_reminders_enabled + weekday/hour) ;
 *     n'envoie QUE si l'heure/jour de Paris correspond (le cron tourne chaque
 *     heure, l'Edge décide) ; cible les utilisateurs qui ont un token push, des
 *     notifs activées, et PAS de bilan pour la semaine ISO courante.
 *   - test : { mode:'test', tokens:[...] } envoie un push immédiat de test.
 *
 * Aucun tiret cadratin, aucun score produit (règles éditoriales).
 */
import { createClient } from "@supabase/supabase-js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Composants date (année/mois/jour/heure) dans un fuseau donné. */
function partsInTz(d: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour === "24" ? "0" : p.hour),
  };
}

/** ISO weekday 1..7 (lundi..dimanche) pour une date calendaire y/m/d. */
function isoWeekday(y: number, m: number, day: number): number {
  const dt = new Date(Date.UTC(y, m - 1, day));
  return ((dt.getUTCDay() + 6) % 7) + 1;
}

/** Clé de semaine ISO 'YYYY-Www' pour une date calendaire y/m/d (aligné lib/skin/week.ts). */
function isoWeekKey(y: number, m: number, day: number): string {
  const d = new Date(Date.UTC(y, m - 1, day));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Thu = new Date(Date.UTC(isoYear, 0, 4 - jan4DayNum + 3));
  const week = 1 + Math.round((d.getTime() - week1Thu.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

async function sendExpo(messages: Record<string, unknown>[]): Promise<number> {
  let sent = 0;
  for (let i = 0; i < messages.length; i += BATCH) {
    const chunk = messages.slice(i, i + BATCH);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
      if (res.ok) sent += chunk.length;
    } catch {
      // batch échoué : on continue les suivants
    }
  }
  return sent;
}

const BILAN_MESSAGE = {
  title: "Bilan peau de la semaine",
  body: "C'est l'heure de ton bilan peau de la semaine (45 secondes).",
  sound: "default",
  channelId: "bilan-hebdo",
  data: { url: "/peau" },
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { mode?: string; tokens?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // ── Mode test : push immédiat vers des tokens fournis. ─────────────────────
  if (body.mode === "test") {
    const tokens = Array.isArray(body.tokens) ? body.tokens.filter((t) => typeof t === "string") : [];
    if (tokens.length === 0) return json({ ok: false, error: "no_tokens" }, 400);
    const sent = await sendExpo(
      tokens.map((to) => ({
        to,
        title: "Test CosmeCheck",
        body: "Ceci est une notification de test.",
        sound: "default",
        channelId: "bilan-hebdo",
        data: { url: "/peau" },
      })),
    );
    return json({ ok: true, mode: "test", sent });
  }

  // ── Mode cron : rappel hebdo. ──────────────────────────────────────────────
  const sb = svc();
  const { data: cfg } = await sb
    .schema("cosme_check")
    .from("app_config")
    .select("notif_reminders_enabled, notif_bilan_weekday, notif_bilan_hour")
    .eq("id", 1)
    .maybeSingle();

  if (!cfg || cfg.notif_reminders_enabled === false) {
    return json({ ok: true, skipped: "reminders_disabled" });
  }

  const now = partsInTz(new Date(), "Europe/Paris");
  const nowWeekday = isoWeekday(now.year, now.month, now.day);
  if (nowWeekday !== cfg.notif_bilan_weekday || now.hour !== cfg.notif_bilan_hour) {
    return json({ ok: true, skipped: "not_scheduled_hour", nowWeekday, nowHour: now.hour });
  }

  const weekKey = isoWeekKey(now.year, now.month, now.day);

  // Utilisateurs déjà à jour cette semaine (à exclure).
  const { data: doneRows } = await sb
    .schema("cosme_check")
    .from("skin_checkins")
    .select("user_id")
    .eq("week_key", weekKey);
  const done = new Set((doneRows ?? []).map((r: { user_id: string }) => r.user_id));

  // Tokens push + préférences notif du propriétaire.
  const { data: tokenRows } = await sb
    .schema("cosme_check")
    .from("push_tokens")
    .select("token, user_id, user_profiles:user_profiles(preferences)");

  const messages: Record<string, unknown>[] = [];
  const seenUsers = new Set<string>();
  for (const row of (tokenRows ?? []) as {
    token: string;
    user_id: string;
    user_profiles?: { preferences?: Record<string, unknown> } | { preferences?: Record<string, unknown> }[];
  }[]) {
    if (done.has(row.user_id)) continue;
    const profile = Array.isArray(row.user_profiles) ? row.user_profiles[0] : row.user_profiles;
    const notif = (profile?.preferences as { notifications?: { enabled?: boolean } } | undefined)?.notifications;
    if (notif?.enabled !== true) continue; // opt-in requis
    seenUsers.add(row.user_id);
    messages.push({ to: row.token, ...BILAN_MESSAGE });
  }

  const sent = await sendExpo(messages);
  return json({ ok: true, weekKey, targeted_users: seenUsers.size, messages: messages.length, sent });
});
