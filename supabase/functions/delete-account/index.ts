/**
 * Edge Function `delete-account` — suppression DÉFINITIVE et IMMÉDIATE du
 * compte de l'utilisateur authentifié (RGPD art. 17 + Apple §5.1.1 + Play).
 *
 * Sécurité : `gate()` exige un Bearer valide → on ne supprime QUE
 * `g.user.id` (l'appelant ne peut pas supprimer le compte d'autrui).
 *
 * Mécanique : on supprime l'utilisateur dans `auth.users` via le client
 * service-role (`auth.admin.deleteUser`). Toutes les tables métier
 * (analyses, coherence_analyses, routine_items, user_credits, user_feedback,
 * user_profiles, profiles) sont en ON DELETE CASCADE depuis auth.users → elles
 * sont purgées automatiquement. `ai_logs` est en SET NULL (logs anonymisés).
 *
 * Crédit : 0.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { serviceClient } from "../_shared/auth.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // Auth obligatoire (Bearer). Pas de crédit débité.
  const g = await gate(req, { feature: "delete_account", costCredits: 0 });
  if (!g.ok) return g.response;
  const userId = g.user.id;

  try {
    const svc = serviceClient();
    // Cascade DB → purge toutes les données liées au compte.
    const { error } = await svc.auth.admin.deleteUser(userId);
    if (error) {
      console.warn("[delete-account] deleteUser error:", error.message);
      return jsonResponse(
        { error: "Suppression impossible pour le moment. Réessaie." },
        { status: 500 },
      );
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    console.warn("[delete-account] exception:", err);
    return jsonResponse(
      { error: "Suppression impossible pour le moment. Réessaie." },
      { status: 500 },
    );
  }
});
