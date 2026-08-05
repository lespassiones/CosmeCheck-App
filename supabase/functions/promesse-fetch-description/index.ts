/**
 * Edge Function `promesse-fetch-description` — port de
 * CosmetWiki/app/api/promesse/fetch-description/route.ts.
 *
 * Une fois un candidat choisi (cf. promesse-identify), recherche web ciblée
 * sur son URL pour récupérer la PROMESSE MARKETING officielle de la marque,
 * puis PATCH la ligne cosme_check.analyses (renommage produit + description).
 *
 * Input  : { sourceUrl, candidateName, brand?, productType?, analysisId? }
 * Output : { notFound:false, description, sourceUrl, persisted } | { notFound:true, reason }
 *
 * Ordre (IDENTIQUE au web) :
 *   1. Auth Bearer + rate-limit IP (gate, costCredits:0).
 *   2. Cache lookup (ai_cache, clé sha256 sur URL+identité normalisées) AVANT débit.
 *      Le cache ne contient QUE {description, sourceUrl} (le flag persisted est
 *      par-utilisateur → on re-PATCH à chaque hit, gratuitement).
 *   3. Débit 1 crédit ("promesse.fetch_description") sur cache MISS uniquement.
 *   4. webSearchComplete → parse défensif → strip citations → validations longueur.
 *   5. PATCH best-effort de analyses (label/brand/type immédiats + description si OK).
 *   6. Cache des succès uniquement.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { getCached, setCached, sha256Hex } from "../_shared/aiClient.ts";
import { sanitizePromptValue } from "../_shared/sanitizePrompt.ts";
import { extractJsonBlock, webSearchComplete } from "./lib.ts";

type FetchPayload = {
  sourceUrl?: string;
  candidateName?: string;
  brand?: string;
  productType?: string;
  analysisId?: string;
};

export type FetchDescriptionResponse =
  | {
      notFound: false;
      description: string;
      sourceUrl: string;
      persisted: boolean;
    }
  | { notFound: true; reason: string };

type CachedDescription = {
  description: string;
  sourceUrl: string;
};

const MIN_DESC_LEN = 60;
const MAX_DESC_LEN = 5000;

function normForCache(s: string | undefined | null): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Strip trailing markdown citations (possibly stacked) before persisting. */
function stripTrailingCitations(text: string): string {
  let cleaned = text.trimEnd();
  for (let i = 0; i < 4; i++) {
    const next = cleaned
      .replace(/\s*\(?\s*\[[^\]]+\]\(https?:\/\/[^)\s]+\)\s*\)?\s*\.?\s*$/u, "")
      .trimEnd();
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned;
}

async function descriptionCacheKey(input: {
  sourceUrl: string;
  candidateName: string;
  brand: string;
  productType: string;
}): Promise<string> {
  const payload = JSON.stringify({
    sourceUrl: normForCache(input.sourceUrl),
    candidateName: normForCache(input.candidateName),
    brand: normForCache(input.brand),
    productType: normForCache(input.productType),
  });
  const hash = (await sha256Hex(payload)).slice(0, 24);
  return `promesse:description:${hash}`;
}

/** Defensive shape validation (mirrors the web's FetchDescriptionLlmSchema). */
type ParsedFetch = {
  notFound?: boolean;
  reason?: string;
  description?: string;
  sourceUrl?: string;
};
function parseFetch(text: string): ParsedFetch | null {
  const raw = extractJsonBlock(text);
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: ParsedFetch = {};
  if (typeof o.notFound === "boolean") out.notFound = o.notFound;
  if (typeof o.reason === "string") out.reason = o.reason;
  if (typeof o.description === "string") out.description = o.description;
  if (typeof o.sourceUrl === "string") out.sourceUrl = o.sourceUrl;
  return out;
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // ── 1. Auth + rate-limit, SANS débit. ───────────────────────────────────
  const g = await gate(req, { feature: "promesse.fetch_description", costCredits: 0 });
  if (!g.ok) return g.response;

  let body: FetchPayload;
  try {
    body = (await req.json()) as FetchPayload;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  const sourceUrl = (body.sourceUrl ?? "").trim();
  // Sanitize les champs texte libres injectés dans le prompt (anti-injection).
  const candidateName = sanitizePromptValue(body.candidateName ?? "", 200);
  const brand = sanitizePromptValue(body.brand ?? "", 120);
  const productType = sanitizePromptValue(body.productType ?? "", 120);

  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return jsonResponse({ error: "URL source manquante ou invalide." }, { status: 400 });
  }
  if (!candidateName) {
    return jsonResponse({ error: "Nom du produit manquant." }, { status: 400 });
  }

  // ── 2. Cache lookup AVANT débit. ─────────────────────────────────────────
  const cacheKey = await descriptionCacheKey({ sourceUrl, candidateName, brand, productType });
  const cachedDesc = await getCached<CachedDescription>(cacheKey);

  // ── 3. Sur MISS → débit AVANT l'appel IA. Sur HIT → on tombe dans le
  //      bloc de persistance (gratuit, re-PATCH la ligne de l'utilisateur). ─
  if (!cachedDesc) {
    const charge = await g.consumeCredit("promesse.fetch_description");
    if (!charge.ok) return charge.response;
  }

  const system = [
    "Tu reçois l'identité d'un produit cosmétique et l'URL de sa fiche officielle. Tu fais une recherche web ciblée sur cette URL (et sur la marque si l'URL ne suffit pas) pour récupérer la PROMESSE MARKETING du produit telle qu'elle est formulée par la marque.",
    "",
    "La promesse marketing = ce que le produit prétend faire pour la peau / les cheveux : bénéfices revendiqués, claims (anti-âge, hydratation 24h, etc.), actifs mis en avant, résultats annoncés, public cible, état souhaité de la peau / des cheveux après usage (douceur, souplesse, confort, beauté…).",
    "",
    "RÈGLES :",
    "1. Cite la marque, pas tes propres mots. Tu peux nettoyer le HTML, retirer les répétitions évidentes et structurer en paragraphe, mais tu ne raccourcis PAS au point de perdre des bénéfices.",
    "2. PRÉSERVATION DES PHRASES-PROMESSES : toute phrase ou tronçon de phrase qui décrit un effet sur la zone d'application doit être conservé verbatim (ou quasi-verbatim). Cela inclut explicitement les formulations courtes type slogan : \"rend les mains douces et belles\", \"laisse la peau souple\", \"donne du confort\", \"embellit le teint\", \"sublime les cheveux\". Ces phrases comptent comme des promesses analysables même si elles sonnent marketing. NE LES JETTE JAMAIS sous prétexte qu'elles paraissent secondaires.",
    "3. CE QUE TU PEUX CONDENSER : les redondances pures (le même claim répété 3 fois sur la page), les éléments hors-promesse (prix, code produit, FAQ logistique). PAS les claims distincts.",
    "4. N'INVENTE PAS de bénéfices. Si la marque ne dit pas \"rend les mains douces\", tu ne l'ajoutes pas. Si tu ne trouves pas de description marketing crédible, renvoie `{\"notFound\": true, \"reason\": \"…\"}`.",
    "4bis. IGNORE les AVIS CLIENTS / commentaires / notes (étoiles) et tout contenu rédigé par des utilisateurs. Tu ne récupères QUE la promesse formulée par la MARQUE (fiche produit officielle). Un avis client (\"le parfum est trop fort\", \"très hydratant selon moi\") n'est PAS une promesse de la marque : ne l'intègre JAMAIS à la description.",
    "5. Pas de listing d'ingrédients INCI complet - ça vient de l'autre côté. Mais si la marque cite explicitement des actifs (\"à l'huile d'argan\", \"enrichi en B5\"), tu les gardes : ils font partie de la promesse.",
    "6. Longueur cible : 400-1800 caractères, format paragraphe (pas de liste à puces, pas de markdown). Tu dépasses cette plage si la marque a beaucoup de claims distincts à conserver.",
    "7. Renvoie en JSON STRICT, pas de markdown.",
    "",
    "Format de réponse :",
    "Si trouvé : {\"notFound\": false, \"description\": \"<promesse marketing fidèle>\", \"sourceUrl\": \"<URL effectivement utilisée>\"}",
    "Si rien trouvé : {\"notFound\": true, \"reason\": \"<brève raison>\"}",
  ].join("\n");

  const hintsBlock = [
    brand ? `- Marque : ${brand}` : null,
    productType ? `- Type : ${productType}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userMsg = `Produit : ${candidateName}
URL source : ${sourceUrl}
${hintsBlock ? `${hintsBlock}\n` : ""}
Cherche la promesse marketing officielle (claims, bénéfices, actifs mis en avant, slogans bénéfice-cible) telle que présentée par la marque. Préserve toutes les phrases qui décrivent un effet sur la peau ou les cheveux, même les phrases courtes type slogan. Réponds en JSON strict.`;

  // PATCH payload — identity bits up-front so the row is renamed the moment
  // the user confirms a candidate, even if the description fetch later fails.
  const updates: Record<string, string> = {};
  const newLabel = [brand, candidateName].filter(Boolean).join(" ").slice(0, 200);
  if (newLabel) updates.product_label = newLabel;
  if (brand) updates.brand = brand;
  if (productType) updates.product_type = productType;

  let description = "";
  let finalUrl = sourceUrl;
  let notFoundReason: string | null = null;

  if (cachedDesc) {
    description = stripTrailingCitations(cachedDesc.description);
    finalUrl = cachedDesc.sourceUrl;
  } else {
    try {
      const { text } = await webSearchComplete(system, userMsg, { timeoutMs: 35_000 });
      const parsed = parseFetch(text);

      if (!parsed) {
        notFoundReason = "format_inattendu";
      } else if (parsed.notFound === true || !parsed.description) {
        notFoundReason = parsed.reason ?? "pas_de_description";
      } else {
        description = stripTrailingCitations(parsed.description.trim()).slice(0, MAX_DESC_LEN);
        if (description.length < MIN_DESC_LEN) {
          notFoundReason = "description_trop_courte";
          description = "";
        } else if (parsed.sourceUrl && /^https?:\/\//i.test(parsed.sourceUrl)) {
          finalUrl = parsed.sourceUrl;
        }
      }
    } catch (err) {
      const msg = (err as Error).message ?? "unknown";
      if (msg.includes("openai_unavailable")) {
        return jsonResponse({ error: "Recherche IA indisponible." }, { status: 503 });
      }
      if (msg.includes("timeout")) {
        return jsonResponse(
          { error: "La recherche a pris trop de temps. Réessaie." },
          { status: 504 },
        );
      }
      return jsonResponse({ error: "Erreur lors de la récupération." }, { status: 500 });
    }

    // Cache the successful result (misses are not cached).
    if (description && !notFoundReason) {
      void setCached(cacheKey, { description, sourceUrl: finalUrl } satisfies CachedDescription);
    }
  }

  if (description) {
    updates.product_description = description;
    updates.promise_source_url = finalUrl;
  }

  // ── 5. Best-effort persist on the analyses row (RLS gates to the owner). ─
  let persisted = false;
  if (
    body.analysisId &&
    typeof body.analysisId === "string" &&
    body.analysisId.length > 8 &&
    Object.keys(updates).length > 0
  ) {
    try {
      const { error: updateErr } = await g.supabase
        .schema("cosme_check")
        .from("analyses")
        .update(updates)
        .eq("id", body.analysisId);
      if (!updateErr) persisted = true;
    } catch {
      // best-effort — never block the response on a persist failure.
    }
  }

  if (!description) {
    return jsonResponse({
      notFound: true,
      reason: notFoundReason ?? "pas_de_description",
    } satisfies FetchDescriptionResponse);
  }

  return jsonResponse({
    notFound: false,
    description,
    sourceUrl: finalUrl,
    persisted,
  } satisfies FetchDescriptionResponse);
});
