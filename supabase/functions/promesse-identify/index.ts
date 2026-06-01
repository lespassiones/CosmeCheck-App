/**
 * Edge Function `promesse-identify` — port de
 * CosmetWiki/app/api/promesse/identify/route.ts.
 *
 * Donné une liste INCI (obligatoire) + indices d'identité optionnels
 * (productLabel, brand, productType), fait une recherche web (web-search model)
 * pour proposer jusqu'à 3 produits candidats avec URL source.
 *
 * Input  : { inci, productLabel?, brand?, productType? }
 * Output : { candidates: [{name, brand, productType, sourceUrl, confidence}], notFound: false }
 *          | { candidates: [], notFound: true, reason }
 *
 * Ordre (IDENTIQUE au web) :
 *   1. Auth Bearer + rate-limit IP (gate, costCredits:0).
 *   2. Cache lookup (ai_cache, clé sha256 sur INCI+indices normalisés) AVANT débit.
 *   3. Débit 1 crédit ("promesse.identify") sur cache MISS uniquement.
 *   4. webSearchComplete → parse JSON défensif → sanitize/dedupe candidats.
 *   5. Cache des succès (les "notFound" ne sont PAS cachés). Pas d'idempotence.
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { gate } from "../_shared/gate.ts";
import { getCached, setCached, sha256Hex } from "../_shared/aiClient.ts";
import { extractJsonBlock, webSearchComplete } from "./lib.ts";

type IdentifyPayload = {
  inci?: string;
  productLabel?: string;
  brand?: string;
  productType?: string;
};

export type IdentifyCandidate = {
  name: string;
  brand: string | null;
  productType: string | null;
  sourceUrl: string;
  confidence: number;
};

export type IdentifyResponse =
  | { candidates: IdentifyCandidate[]; notFound: false }
  | { candidates: []; notFound: true; reason: string };

const MAX_INCI_LEN = 4000;

function normForCache(s: string | undefined | null): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function identifyCacheKey(input: {
  inci: string;
  productLabel: string;
  brand: string;
  productType: string;
}): Promise<string> {
  const payload = JSON.stringify({
    inci: normForCache(input.inci),
    productLabel: normForCache(input.productLabel),
    brand: normForCache(input.brand),
    productType: normForCache(input.productType),
  });
  const hash = (await sha256Hex(payload)).slice(0, 24);
  return `promesse:identify:${hash}`;
}

/** Defensive shape validation (mirrors the web's IdentifyLlmSchema Zod). */
type ParsedIdentify = {
  notFound?: boolean;
  reason?: string;
  candidates?: Array<{
    name?: string;
    brand?: string | null;
    productType?: string | null;
    sourceUrl?: string;
    confidence?: number;
  }>;
};
function parseIdentify(text: string): ParsedIdentify | null {
  const raw = extractJsonBlock(text);
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: ParsedIdentify = {};
  if (typeof o.notFound === "boolean") out.notFound = o.notFound;
  if (typeof o.reason === "string") out.reason = o.reason;
  if (Array.isArray(o.candidates)) {
    out.candidates = o.candidates
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
      .map((c) => ({
        name: typeof c.name === "string" ? c.name : undefined,
        brand: typeof c.brand === "string" ? c.brand : c.brand === null ? null : undefined,
        productType:
          typeof c.productType === "string" ? c.productType : c.productType === null ? null : undefined,
        sourceUrl: typeof c.sourceUrl === "string" ? c.sourceUrl : undefined,
        confidence: typeof c.confidence === "number" ? c.confidence : undefined,
      }));
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  // ── 1. Auth + rate-limit, SANS débit. ───────────────────────────────────
  const g = await gate(req, { feature: "promesse.identify", costCredits: 0 });
  if (!g.ok) return g.response;

  let body: IdentifyPayload;
  try {
    body = (await req.json()) as IdentifyPayload;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }

  const inci = (body.inci ?? "").trim().slice(0, MAX_INCI_LEN);
  if (!inci) {
    return jsonResponse({ error: "Liste INCI manquante." }, { status: 400 });
  }
  const productLabel = (body.productLabel ?? "").trim().slice(0, 200);
  const brand = (body.brand ?? "").trim().slice(0, 120);
  const productType = (body.productType ?? "").trim().slice(0, 120);

  // ── 2. Cache lookup AVANT débit. ─────────────────────────────────────────
  const cacheKey = await identifyCacheKey({ inci, productLabel, brand, productType });
  const cached = await getCached<IdentifyResponse>(cacheKey);
  if (cached) {
    return jsonResponse(cached);
  }

  // ── 3. Cache miss → débit du crédit. ─────────────────────────────────────
  const charge = await g.consumeCredit("promesse.identify");
  if (!charge.ok) return charge.response;

  const system = [
    "Tu es un expert en identification de produits cosmétiques. Tu reçois une liste INCI et des indices d'identité (nom partiel, marque, type) - éventuellement vides.",
    "",
    "Ta mission : faire une recherche web pour identifier les produits cosmétiques commercialisés dont la formule correspond à cette liste INCI. Renvoie jusqu'à 3 candidats plausibles classés par confiance décroissante.",
    "",
    "RÈGLES CRITIQUES :",
    "1. Chaque candidat DOIT avoir une URL source vérifiable (fiche produit officielle de la marque, page Sephora/Marionnaud/Nocibé/INCIDecoder/Beauty Lookup, page d'une enseigne reconnue). Refuse tout candidat sans URL crédible.",
    "2. N'INVENTE PAS de produit. Si tu ne trouves aucune correspondance crédible, renvoie `{\"notFound\": true, \"reason\": \"…\"}`.",
    "3. Une liste INCI peut correspondre à plusieurs produits (mêmes formules dans plusieurs gammes/marques). C'est normal - propose les 2-3 plus probables si tu en trouves.",
    "4. Confiance : 1.0 = formule identique + nom/marque qui matchent l'indice ; 0.7 = formule très proche ; 0.5 = formule plausible mais incertain ; <0.4 = ne le propose pas.",
    "5. Réponse en JSON STRICT, pas de markdown, pas de commentaire.",
    "",
    "Format de réponse :",
    "Si tu as trouvé : {\"notFound\": false, \"candidates\": [{\"name\": \"…\", \"brand\": \"…\", \"productType\": \"…\", \"sourceUrl\": \"https://…\", \"confidence\": 0.9}, …]}",
    "Si rien trouvé : {\"notFound\": true, \"reason\": \"<brève raison>\"}",
  ].join("\n");

  const hintsBlock = [
    productLabel ? `- Nom (indice) : ${productLabel}` : null,
    brand ? `- Marque (indice) : ${brand}` : null,
    productType ? `- Type (indice) : ${productType}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userMsg = `Liste INCI :
${inci}

${hintsBlock ? `Indices d'identité :\n${hintsBlock}\n` : "Aucun indice supplémentaire - base-toi uniquement sur la liste INCI."}

Cherche sur le web et propose jusqu'à 3 candidats. Réponds en JSON strict, sans markdown.`;

  try {
    const { text, citations } = await webSearchComplete(system, userMsg, {
      timeoutMs: 35_000,
    });
    const parsed = parseIdentify(text);

    if (!parsed) {
      return jsonResponse({
        candidates: [],
        notFound: true,
        reason: "format_inattendu",
      } satisfies IdentifyResponse);
    }

    if (
      parsed.notFound === true ||
      !Array.isArray(parsed.candidates) ||
      parsed.candidates.length === 0
    ) {
      return jsonResponse({
        candidates: [],
        notFound: true,
        reason: parsed.reason ?? "aucun_match",
      } satisfies IdentifyResponse);
    }

    const seen = new Set<string>();
    const candidates: IdentifyCandidate[] = [];
    for (const c of parsed.candidates) {
      const name = (c.name ?? "").trim().slice(0, 200);
      const url = (c.sourceUrl ?? "").trim();
      const conf = typeof c.confidence === "number" ? c.confidence : 0;
      if (!name || !url || !/^https?:\/\//i.test(url) || conf < 0.4) continue;
      const key = `${name.toLowerCase()}|${(c.brand ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        name,
        brand: c.brand ? c.brand.trim().slice(0, 120) : null,
        productType: c.productType ? c.productType.trim().slice(0, 120) : null,
        sourceUrl: url,
        confidence: Math.min(1, Math.max(0, conf)),
      });
      if (candidates.length >= 3) break;
    }

    if (candidates.length === 0) {
      return jsonResponse({
        candidates: [],
        notFound: true,
        reason: "aucun_match_credible",
      } satisfies IdentifyResponse);
    }

    void citations;

    const response: IdentifyResponse = { candidates, notFound: false };
    // Cache only successful identifications (misses are not cached so a retry
    // can pick up newly-indexed data).
    void setCached(cacheKey, response);
    return jsonResponse(response);
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
    return jsonResponse({ error: "Erreur lors de la recherche." }, { status: 500 });
  }
});
