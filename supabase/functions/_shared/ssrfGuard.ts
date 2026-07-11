/**
 * ssrfGuard — défense SSRF partagée pour TOUTE fonction qui fetch une URL
 * fournie par l'utilisateur (ecommerce-scrape, deep-fetch…).
 *
 * Refuse : schémas non-http(s), identifiants dans l'URL, hôtes internes
 * (localhost, metadata cloud, *.local/*.internal), hôtes mono-label (sans point
 * → IP entière type http://2130706433, hex http://0x7f000001, intranet),
 * IPv4 mal formées (octal 0177.x, formes courtes 127.1), IPv4 privées/loopback/
 * link-local (RFC1918 + 127/8 + 169.254/16 + 0/8 + 224/4 + 172.16-31/12 + CGNAT),
 * et IPv6 loopback/ULA/link-local.
 *
 * ⚠️ Ne résout PAS le DNS : une cible de type "domaine public → IP privée"
 * (DNS rebinding) n'est pas détectée ici. Atténué en aval par : timeout court,
 * filtre content-type, réponse jamais renvoyée en HTML brut (INCI extrait par
 * LLM). Le suivi des redirections re-valide CHAQUE saut (voir safeFetch.ts).
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

/**
 * Dotted-quad IPv4 STRICT : exactement 4 octets décimaux 0-255, sans zéro de
 * tête (un zéro de tête = interprétation octale possible côté résolveur, ex.
 * 0177.0.0.1 = 127.0.0.1). Sert à refuser les encodages exotiques d'IP.
 */
function isStrictDottedQuad(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every(
    (p) => /^\d{1,3}$/.test(p) && !(p.length > 1 && p[0] === "0") && Number(p) <= 255,
  );
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
  } else {
    // Pas d'IPv6. Un hôte public légitime a TOUJOURS un point (FQDN avec TLD,
    // ou IPv4 en dotted-quad). On refuse donc tout hôte mono-label : cela
    // bloque d'un coup les hôtes internes (intranet, server1), l'IP entière
    // (http://2130706433 = 127.0.0.1) et l'hex (http://0x7f000001).
    if (!host.includes(".")) {
      return { ok: false, reason: "Hôte sans domaine (IP numérique / mono-label) refusé." };
    }
    if (/^[\d.]+$/.test(host)) {
      // Ressemble à une IPv4 littérale : exiger un dotted-quad strict, sinon
      // refuser (bloque l'octal 0177.0.0.1, les formes courtes 127.1, etc.).
      if (!isStrictDottedQuad(host)) {
        return { ok: false, reason: "Adresse IP mal formée refusée." };
      }
      if (
        BLOCKED_IPV4_PREFIXES.some((p) => host.startsWith(p)) ||
        isBlocked172(host) ||
        isBlocked100(host)
      ) {
        return { ok: false, reason: "Adresse IP privée refusée." };
      }
    }
  }

  return { ok: true, url: parsed };
}

/** Variante booléenne (utilisée par deep-fetch). */
export function isSafePublicUrl(input: string): boolean {
  return validateUserUrl(input).ok;
}
