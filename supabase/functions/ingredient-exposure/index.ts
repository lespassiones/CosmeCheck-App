/**
 * Edge Function `ingredient-exposure` — port de
 * `CosmetWiki/app/api/ingredient/[slug]/exposure/route.ts`.
 *
 * Renvoie la "personal line" (callout rose) pour l'utilisateur courant sur un
 * ingrédient : combien de produits de sa routine / de son historique le
 * contiennent.
 *
 * Gardé SÉPARÉ de `ingredient-explain` pour que ce dernier reste cachable.
 * Per-user, jamais caché. Visiteur anonyme → { personalLine: null } (l'UI
 * masque simplement le callout, pas de 401). Crédit 0.
 *
 * Bon marché : deux count RPCs (head-only), tirées en parallèle.
 *   - cosme_check_count_ingredient_in_routine(p_user uuid, p_slug)
 *   - cosme_check_count_ingredient_in_history(p_user uuid, p_slug)
 *
 * Entrée : { slug } (POST body) ou ?slug= (GET).
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getOptionalUser, serviceClient } from "../_shared/auth.ts";

function buildPersonalLine(routineCount: number, historyCount: number): string | null {
  if (routineCount >= 1) {
    const plural = routineCount > 1 ? "s" : "";
    return `Tu as cet ingrédient dans ${routineCount} produit${plural} de ta routine.`;
  }
  if (historyCount >= 3) {
    return `Tu as déjà rencontré cet ingrédient dans ${historyCount} de tes analyses passées.`;
  }
  return null;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const { user } = await getOptionalUser(req);

  // Slug : POST body { slug } ou ?slug= en query.
  let slug = "";
  if (req.method === "POST") {
    try {
      const body = (await req.json()) as { slug?: string };
      slug = (body.slug ?? "").trim();
    } catch {
      slug = "";
    }
  } else {
    slug = (new URL(req.url).searchParams.get("slug") ?? "").trim();
  }
  if (!slug) {
    return jsonResponse({ error: "Slug requis." }, { status: 400 });
  }

  // Visiteur anonyme → pas de personal line.
  if (!user) {
    return jsonResponse({ personalLine: null });
  }

  try {
    const svc = serviceClient();
    const [routineRes, historyRes] = await Promise.all([
      svc.rpc("cosme_check_count_ingredient_in_routine", { p_user: user.id, p_slug: slug }),
      svc.rpc("cosme_check_count_ingredient_in_history", { p_user: user.id, p_slug: slug }),
    ]);
    const routineCount = Number(routineRes.data ?? 0);
    const historyCount = Number(historyRes.data ?? 0);
    return jsonResponse({ personalLine: buildPersonalLine(routineCount, historyCount) });
  } catch {
    // Soft failure : l'UI masque simplement le callout, aucune erreur remontée.
    return jsonResponse({ personalLine: null });
  }
});
