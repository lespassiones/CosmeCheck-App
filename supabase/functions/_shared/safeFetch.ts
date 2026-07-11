/**
 * safeFetch — fetch d'URL utilisateur avec suivi MANUEL des redirections et
 * re-validation SSRF de CHAQUE saut.
 *
 * Pourquoi : `redirect: "follow"` (défaut) suit les 3xx sans repasser par le
 * garde SSRF. Une URL publique validée peut renvoyer un 302 vers
 * http://169.254.169.254/ (metadata cloud), http://localhost/ ou une IP privée,
 * suivi aveuglément. On coupe ce vecteur : chaque Location est re-passée dans
 * validateUserUrl avant d'être suivie, avec un plafond de sauts.
 *
 * Le même AbortSignal (timeout wall-clock) est propagé à tous les sauts.
 */
import { validateUserUrl } from "./ssrfGuard.ts";

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(`ssrf_blocked: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

/**
 * Comme fetch(), mais suit les redirections à la main en re-validant chaque
 * cible. Lève SsrfBlockedError si un saut (initial ou redirigé) est refusé,
 * ou "too_many_redirects" au-delà de maxRedirects. `init.redirect` est ignoré
 * (forcé en "manual").
 */
export async function safeFetch(
  initialUrl: string,
  init: RequestInit = {},
  opts: { maxRedirects?: number } = {},
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 5;
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = validateUserUrl(currentUrl);
    if (!check.ok) throw new SsrfBlockedError(check.reason);

    const res = await fetch(check.url.toString(), { ...init, redirect: "manual" });

    const isRedirect = res.status >= 300 && res.status < 400 && res.headers.has("location");
    if (!isRedirect) return res;

    // Résout la Location (peut être relative) contre l'URL courante, libère la
    // connexion, puis reboucle pour re-valider la nouvelle cible.
    const location = res.headers.get("location") ?? "";
    const next = new URL(location, check.url).toString();
    await res.body?.cancel().catch(() => {});
    currentUrl = next;
  }

  throw new SsrfBlockedError("too_many_redirects");
}
