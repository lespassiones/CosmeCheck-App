/**
 * adminAuth — porte d'entrée des Edge Functions d'administration
 * (admin-resolve-barcode, admin-score-upsert).
 *
 * ┌─ MODÈLE DE SÉCURITÉ (durcissement juil 2026) ────────────────────────────┐
 * │ Ces deux fonctions sont déployées **verify_jwt=true** (voir              │
 * │ supabase/config.toml). La PLATEFORME Supabase vérifie donc la SIGNATURE   │
 * │ du Bearer contre le secret JWT du projet AVANT d'exécuter ce code : tout  │
 * │ token non signé / signé par un tiers est rejeté (401 "Invalid JWT") en    │
 * │ amont. Prouvé par scripts/test_admin_auth_hardening.mjs (cas B).          │
 * │                                                                           │
 * │ Conséquence : quand ce code s'exécute, le JWT est GARANTI authentique.    │
 * │ Il reste à vérifier qu'il porte bien le rôle service_role (et pas         │
 * │ anon/authenticated d'un simple utilisateur). Ce claim, sur un token dont  │
 * │ la signature est déjà validée, n'est PLUS falsifiable.                    │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ La sûreté dépend de verify_jwt=true. NE JAMAIS repasser ces fonctions à
 * verify_jwt=false (config.toml est la source de vérité et le documente). Si un
 * jour on doit le faire, il faudra vérifier la signature JWT en dur ici.
 *
 * On accepte deux voies, dans l'ordre :
 *   1. Égalité EXACTE (temps constant) avec le service_role injecté dans l'edge
 *      → chemin rapide quand l'appelant envoie littéralement la clé injectée.
 *   2. Sinon, claim role === "service_role" + ref === projet, sur le JWT
 *      déjà signature-vérifié par la plateforme. Couvre les appelants légitimes
 *      (app admin, scripts) dont la clé service_role est un JWT valide du projet
 *      mais dont la CHAÎNE diffère de la valeur injectée dans l'edge.
 *
 * L'ANCIENNE faille : la voie 2 existait DÉJÀ mais sous verify_jwt=false, donc
 * sur un token NON vérifié → un attaquant forgeait un JWT non signé avec
 * role=service_role (public) et passait. verify_jwt=true ferme exactement ça.
 */

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PROJECT_REF = "rogesnduejmqpxolhbif";

/** Comparaison de chaînes en temps constant (indépendante du point de divergence). */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ba.length ^ bb.length;
  const len = Math.max(ba.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Décode le payload d'un JWT (SANS vérifier la signature — c'est le rôle de la plateforme). */
function decodeJwtRoleRef(token: string): { role?: string; ref?: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as { role?: string; ref?: string };
  } catch {
    return null;
  }
}

/**
 * Retourne true uniquement pour un appelant admin légitime.
 * PRÉREQUIS DE SÉCURITÉ : la fonction est déployée verify_jwt=true (la
 * plateforme a déjà validé la signature du Bearer).
 */
export function isAdminCaller(authHeader: string | null | undefined): boolean {
  if (!SERVICE_KEY) return false; // fail-closed si la clé n'est pas injectée
  const m = (authHeader ?? "").match(/^Bearer\s+(.+)$/);
  if (!m) return false;
  const token = m[1];

  // Voie 1 : la clé injectée elle-même.
  if (timingSafeEqual(token, SERVICE_KEY)) return true;

  // Voie 2 : JWT service_role du bon projet (signature garantie par verify_jwt=true).
  const claims = decodeJwtRoleRef(token);
  return claims?.role === "service_role" && claims?.ref === PROJECT_REF;
}
