/**
 * Edge Function `newsletter-subscribe` — opt-in / opt-out newsletter (liste Brevo #5).
 *
 * POURQUOI : la liste #4 « Tous les inscrits » (brevo-sync) est une liste de
 * SERVICE (interet legitime, pas de consentement requis). La newsletter est du
 * MARKETING : elle exige un consentement explicite (RGPD art. 6.1.a) et sa
 * propre liste opt-in (#5). Cette fonction est appelee quand l'utilisateur coche
 * la case newsletter (inscription email) ou active les notifications (users
 * Google, couplage assume cote produit).
 *
 * Auth : Bearer JWT user (verify_jwt=true cote plateforme + re-check getUser).
 *   -> l'email vient du TOKEN, jamais du corps (anti-abus : on ne peut inscrire
 *      que soi-meme).
 * Entree : { action?: 'subscribe' | 'unsubscribe', source?: string }
 * Effets :
 *   - Brevo : POST /v3/contacts (updateEnabled, listIds:[#5]) pour subscribe ;
 *             /v3/contacts/lists/{#5}/contacts/remove pour unsubscribe.
 *   - DB : trace le consentement dans user_profiles.newsletter_consent{,_at,_source}
 *          (colonnes dediees, service-role → jamais ecrasees par les merges
 *          client de preferences).
 * Idempotente, best-effort : ne bloque jamais le client (l'UI ne l'attend pas).
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getBearerToken, serviceClient, unauthorizedResponse, userClient } from "../_shared/auth.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const NEWSLETTER_LIST_ID = Number(Deno.env.get("BREVO_LIST_NEWSLETTER_ID") || "5");

type Body = { action?: "subscribe" | "unsubscribe"; source?: string };

const BREVO_HEADERS = {
  "api-key": BREVO_API_KEY,
  "Content-Type": "application/json",
  "Accept": "application/json",
};

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // ── Auth Bearer : l'email est celui du token (on ne peut inscrire que soi) ──
  const token = getBearerToken(req);
  const supabase = userClient(token);
  if (!token) return unauthorizedResponse("Non authentifié.");
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return unauthorizedResponse("Non authentifié.");

  const email = (user.email ?? "").trim().toLowerCase();
  if (!email) return jsonResponse({ error: "Email introuvable." }, { status: 400 });

  if (!BREVO_API_KEY) {
    return jsonResponse({ ok: false, error: "BREVO_API_KEY manquant." }, { status: 500 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // corps optionnel
  }
  const action: "subscribe" | "unsubscribe" = body.action === "unsubscribe" ? "unsubscribe" : "subscribe";
  const source = typeof body.source === "string" ? body.source.slice(0, 60) : "unknown";

  // ── Prénom (best-effort) pour l'attribut Brevo PRENOM ───────────────────────
  const svc = serviceClient();
  let firstName =
    typeof user.user_metadata?.first_name === "string" ? user.user_metadata.first_name : "";
  try {
    const { data: prof } = await svc
      .schema("cosme_check")
      .from("user_profiles")
      .select("first_name")
      .eq("id", user.id)
      .single();
    if (prof?.first_name) firstName = prof.first_name;
  } catch {
    // pas bloquant
  }

  // ── Brevo ───────────────────────────────────────────────────────────────────
  let brevoOk = false;
  try {
    if (action === "subscribe") {
      // updateEnabled:true => cree si absent, sinon met a jour + ajoute a la liste.
      const resp = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: BREVO_HEADERS,
        body: JSON.stringify({
          email,
          attributes: firstName ? { PRENOM: firstName } : undefined,
          listIds: [NEWSLETTER_LIST_ID],
          updateEnabled: true,
        }),
      });
      brevoOk = resp.ok || resp.status === 204;
      if (!brevoOk) {
        const errBody = await resp.json().catch(() => ({}));
        console.error("[newsletter-subscribe] create/update KO", resp.status, errBody);
        // Filet : contact deja existant → forcer l'appartenance a la liste.
        const add = await fetch(
          `https://api.brevo.com/v3/contacts/lists/${NEWSLETTER_LIST_ID}/contacts/add`,
          { method: "POST", headers: BREVO_HEADERS, body: JSON.stringify({ emails: [email] }) },
        );
        brevoOk = add.ok || add.status === 204;
        if (!brevoOk) {
          console.error("[newsletter-subscribe] add-to-list KO", add.status, await add.text().catch(() => ""));
        }
      }
    } else {
      const resp = await fetch(
        `https://api.brevo.com/v3/contacts/lists/${NEWSLETTER_LIST_ID}/contacts/remove`,
        { method: "POST", headers: BREVO_HEADERS, body: JSON.stringify({ emails: [email] }) },
      );
      brevoOk = resp.ok || resp.status === 204;
      if (!brevoOk) {
        console.error("[newsletter-subscribe] remove KO", resp.status, await resp.text().catch(() => ""));
      }
    }
  } catch (err) {
    console.error("[newsletter-subscribe] Brevo exception", err);
  }

  // ── Trace du consentement (colonnes dediees, service-role) ──────────────────
  try {
    await svc
      .schema("cosme_check")
      .from("user_profiles")
      .update({
        newsletter_consent: action === "subscribe",
        newsletter_consent_at: new Date().toISOString(),
        newsletter_consent_source: source,
      })
      .eq("id", user.id);
  } catch (err) {
    console.error("[newsletter-subscribe] write consent KO", err);
  }

  return jsonResponse({ ok: brevoOk, action, list: NEWSLETTER_LIST_ID });
});
