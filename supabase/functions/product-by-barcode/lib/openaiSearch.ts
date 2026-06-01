// OpenAI web-search candidate collector (gpt-4o-mini-search-preview). Returns
// the same WebCandidate shape as DuckDuckGo so it's swappable. Port of
// CosmetWiki lib/productSearch/openaiSearch.ts. DDG's HTML endpoint bot-walls
// datacenter IPs in prod; OpenAI's native web search runs server-side from a
// trusted origin, so it's the reliable primary, DDG the free fallback.
import { hasOpenAI } from "../../_shared/aiClient.ts";
import { webSearchComplete } from "./webSearch.ts";
import type { WebCandidate } from "./types.ts";

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isWebUrl(url: string): boolean {
  try {
    const proto = new URL(url).protocol;
    return proto === "https:" || proto === "http:";
  } catch {
    return false;
  }
}

/** Extract the first JSON object from a (possibly fenced) text blob. */
function extractJson(text: string): { candidates?: unknown } | null {
  if (!text) return null;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    return JSON.parse(text.slice(first, last + 1)) as { candidates?: unknown };
  } catch {
    return null;
  }
}

function normalizeProductKey(brand: string | null, productName: string | null): string {
  const raw = [brand ?? "", productName ?? ""].join(" ").toLowerCase();
  if (!raw.trim()) return "";
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b\d+\s*(?:ml|g|gr|kg|l)\b/g, "")
    .replace(/\b\d+\s*[x×]\s*\d+\s*(?:ml|g|gr|kg|l)?\b/g, "")
    .replace(/[^\w%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function collectOpenAIWebCandidates(
  query: string,
  limit: number,
  excludeProducts: string[] = [],
): Promise<WebCandidate[]> {
  if (!hasOpenAI()) return [];
  const q = query.trim();
  if (q.length < 3) return [];

  const excludeBlock = excludeProducts.length > 0
    ? `\n\nÀ EXCLURE absolument (déjà proposés à l'utilisateur) : ${excludeProducts
        .slice(0, 30)
        .map((p) => `"${p}"`)
        .join(", ")}.`
    : "";

  const system = [
    "Tu es un assistant de recherche de produits cosmétiques.",
    "Tu reçois une saisie utilisateur (potentiellement mal orthographiée, abrégée ou avec marque manquante) et tu utilises la recherche web pour identifier les FICHES PRODUITS correspondantes.",
    "",
    "RÈGLES CRITIQUES :",
    `1. Renvoie au maximum ${limit} candidats. UN SEUL candidat par produit unique — pas 5 URLs différentes du même produit chez 5 pharmacies. Si tu trouves un produit identique chez plusieurs marchands, ne le liste qu'UNE fois (préfère la source qui expose la composition INCI).`,
    "2. PRIORITÉ ABSOLUE aux URLs qui exposent une liste INCI complète : INCIDecoder, INCIBeauty, Cosmétothèque, site officiel de la marque, fiche produit Sephora/Marionnaud/Nocibé. Ces sources sont MEILLEURES qu'une page marchande generique.",
    "3. URLs autorisées ensuite : marchands reconnus avec fiche produit détaillée (Amazon, Auchan, Carrefour, pharmacies en ligne). INTERDIT : YouTube, TikTok, Instagram, Pinterest, réseaux sociaux.",
    "4. N'invente AUCUNE URL. Si tu n'es pas certain qu'une URL existe vraiment, omets ce candidat.",
    "5. Pour chaque candidat : brand (marque exacte), productName (nom sans répéter la marque), url (lien direct).",
    "6. Réponse en JSON STRICT, sans markdown, sans commentaire.",
    "",
    'Format : {"candidates": [{"brand": "…", "productName": "…", "url": "https://…"}, …]}',
    'Si aucun résultat crédible : {"candidates": []}',
  ].join("\n");

  const userMsg = `Saisie utilisateur : """${q.slice(0, 200)}"""${excludeBlock}

Cherche sur le web et propose les fiches produits cosmétiques qui correspondent. Réponds en JSON strict.`;

  try {
    const { text } = await webSearchComplete(system, userMsg, { timeoutMs: 20_000 });
    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.candidates)) return [];

    const out: WebCandidate[] = [];
    const seenUrls = new Set<string>();
    const seenProducts = new Set<string>();
    for (const raw of parsed.candidates as Array<Record<string, unknown>>) {
      const url = (typeof raw.url === "string" ? raw.url : "").trim();
      if (!url || !isWebUrl(url)) continue;
      if (seenUrls.has(url)) continue;
      const brand = typeof raw.brand === "string" && raw.brand.trim() ? raw.brand.trim().slice(0, 80) : null;
      const productName = typeof raw.productName === "string" && raw.productName.trim()
        ? raw.productName.trim().slice(0, 160)
        : null;
      const productKey = normalizeProductKey(brand, productName);
      if (productKey && seenProducts.has(productKey)) continue;
      seenUrls.add(url);
      if (productKey) seenProducts.add(productKey);
      const title = [brand, productName].filter(Boolean).join(" ").slice(0, 200);
      out.push({ url, title: title || url, domain: safeDomain(url), brand, productName });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
