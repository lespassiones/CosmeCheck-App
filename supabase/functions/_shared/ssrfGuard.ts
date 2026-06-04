/**
 * ssrfGuard — défense SSRF partagée pour TOUTE fonction qui fetch une URL
 * fournie par l'utilisateur (ecommerce-scrape, deep-fetch…).
 *
 * Refuse : schémas non-http(s), identifiants dans l'URL, hôtes internes
 * (localhost, metadata cloud, *.local/*.internal), IPv4 privées/loopback/
 * link-local (RFC1918 + 127/8 + 169.254/16 + 0/8 + 224/4 + 172.16-31/12),
 * et IPv6 loopback/ULA/link-local.
 *
 * Module PUR (URL + regex, aucune API Deno) → testable en Jest.
 */

const HTTP_SCHEMES = new Set(["http:", "https:"]);

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "kubernetes.default.svc",
  "host.docker.internal",
]);

const BLOCKED_IPV4_PREFIXES = ["0.", "10.", "127.", "169.254.", "192.168.", "224."];

const BLOCKED_IPV6 = new Set(["::", "::1"]);

function isBlocked172(host: string): boolean {
  if (!host.startsWith("172.")) return false;
  const parts = host.split(".");
  if (parts.length < 2) return false;
  const second = Number(parts[1]);
  return Number.isInteger(second) && second >= 16 && second <= 31;
}

/** CGNAT 100.64.0.0/10 (100.64.x.x .. 100.127.x.x). */
function isBlocked100(host: string): boolean {
  if (!host.startsWith("100.")) return false;
  const parts = host.split(".");
  if (parts.length < 2) return false;
  const second = Number(parts[1]);
  return Number.isInteger(second) && second >= 64 && second <= 127;
}

function isLikelyPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_IPV6.has(h)) return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) {
    return true;
  }
  return false;
}

export type UrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

export function validateUserUrl(input: string): UrlValidationResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "URL vide." };
  if (trimmed.length > 2048) return { ok: false, reason: "URL trop longue." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "URL invalide." };
  }

  if (!HTTP_SCHEMES.has(parsed.protocol)) {
    return { ok: false, reason: "Seuls les liens http(s) sont acceptés." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Les identifiants dans l'URL ne sont pas autorisés." };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "Domaine manquant." };
  if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: "Domaine interne refusé." };
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    return { ok: false, reason: "Domaine interne refusé." };
  }

  if (host.includes(":")) {
    if (isLikelyPrivateIPv6(host)) {
      return { ok: false, reason: "Adresse IP privée refusée." };
    }
  } else if (/^[\d.]+$/.test(host)) {
    if (
      BLOCKED_IPV4_PREFIXES.some((p) => host.startsWith(p)) ||
      isBlocked172(host) ||
      isBlocked100(host)
    ) {
      return { ok: false, reason: "Adresse IP privée refusée." };
    }
  }

  return { ok: true, url: parsed };
}

/** Variante booléenne (utilisée par deep-fetch). */
export function isSafePublicUrl(input: string): boolean {
  return validateUserUrl(input).ok;
}
