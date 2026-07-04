// DuckDuckGo HTML search fallback: hit html.duckduckgo.com, parse result
// links, run LLM extraction on candidate pages. Port of CosmetWiki
// lib/productSearch/duckduckgo.ts. No domain whitelist — guards are technical
// (strict timeout + content-type check in fetchPageHtml); we never store raw
// HTML, only the extracted INCI string.
import { fetchPageHtml } from "./httpFetch.ts";
import { extractInciFromHtml } from "./extract.ts";
import { matchesQuery } from "./relevance.ts";
import type { WebCandidate } from "./types.ts";

const SEARCH_URL = "https://html.duckduckgo.com/html/?q=";
const CASCADE_AUTO_FETCH_LIMIT = 5;

const RESULT_LINK_RE =
  /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;

function decodeUddg(href: string): string {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const real = url.searchParams.get("uddg");
    return real ? decodeURIComponent(real) : href;
  } catch {
    return href;
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

export async function searchDuckDuckGo(query: string): Promise<{
  brand: string | null;
  productName: string | null;
  ingredientsText: string;
  sourceUrl: string;
} | null> {
  const candidates = await collectDuckDuckGoCandidates(query, CASCADE_AUTO_FETCH_LIMIT);
  for (const c of candidates) {
    const pageHtml = await fetchPageHtml(c.url);
    if (!pageHtml) continue;
    const inci = await extractInciFromHtml({ label: query, html: pageHtml });
    if (inci) {
      return {
        brand: c.brand,
        productName: c.productName,
        ingredientsText: inci,
        sourceUrl: c.url,
      };
    }
  }
  return null;
}

export async function collectDuckDuckGoCandidates(
  query: string,
  limit: number,
): Promise<WebCandidate[]> {
  const searchQuery = `${query} INCI ingrédients composition ingredients`;
  const html = await fetchPageHtml(SEARCH_URL + encodeURIComponent(searchQuery));
  if (!html) return [];

  const seen = new Set<string>();
  const out: WebCandidate[] = [];
  let match: RegExpExecArray | null;
  RESULT_LINK_RE.lastIndex = 0;

  while ((match = RESULT_LINK_RE.exec(html)) !== null) {
    const real = decodeUddg(match[1]!);
    const titleHtml = match[2] ?? "";
    if (!isWebUrl(real)) continue;
    const title = stripHtml(titleHtml).slice(0, 160);
    if (!matchesQuery(query, `${title} ${urlSearchableText(real)}`)) continue;
    if (seen.has(real)) continue;
    seen.add(real);

    const domain = safeDomain(real);
    const { brand, productName } = guessBrandAndName(title, domain, query);
    out.push({ url: real, title, domain, brand, productName });
    if (out.length >= limit) break;
  }
  return out;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const NOISE_PREFIX_RE =
  /^(?:composition\s+(?:de\s+(?:la\s+|du\s+|l['']\s*)?|du\s+|des\s+)?|avis\s+(?:sur\s+(?:le\s+|la\s+|les\s+)?)?|test\s+(?:de\s+(?:la\s+|du\s+)?|du\s+)?|comparatif\s+(?:de\s+|des\s+)?|fiche\s+(?:produit\s+|technique\s+)?(?:de\s+|du\s+)?|notice\s+(?:de\s+|du\s+)?|liste\s+(?:complète\s+)?(?:des\s+)?(?:ingr[ée]dients|inci)\s+(?:de\s+|du\s+)?|inci\s+(?:de\s+|du\s+)?|ingr[ée]dients?\s+(?:de\s+|du\s+)?|review\s+(?:of\s+)?)/iu;

const EDITORIAL_DOMAINS = new Set([
  "quechoisir.org", "comprendrechoisir.com", "60millions-mag.com",
  "incidecoder.com", "cosmopolitan.fr",
  "elle.fr", "vogue.fr", "marieclaire.fr", "biba-magazine.fr", "lemonde.fr",
  "lefigaro.fr", "femmeactuelle.fr", "version-femina.fr", "topsante.com",
  "santemagazine.fr", "doctissimo.fr", "passeportsante.net", "amazon.fr",
  "amazon.com", "fnac.com", "darty.com", "ebay.fr", "ebay.com",
]);

function isEditorialDomain(domain: string): boolean {
  if (EDITORIAL_DOMAINS.has(domain)) return true;
  return /(?:^|\.)(?:blog|news|press|magazine|info|forum|wiki|reviews?)\b/.test(domain);
}

const TAIL_SITE_NAMES_RE =
  /\s*[|·\-]\s*(?:que\s+choisir|quechoisir|doctissimo|marie[\s-]?claire|cosmopolitan|vogue|amazon(?:\.[a-z]{2,3})?|fnac|darty|cdiscount|60\s+millions(?:\s+de\s+consommateurs)?|topsant[ée]|sant[ée]\s+magazine|femme\s+actuelle|inci(?:[-\s]?decoder|[-\s]?beauty)|wikip[ée]dia|ebay(?:\.[a-z]{2,3})?)\s*$/iu;

const TAIL_DOMAIN_RE =
  /\s*[|·\-]\s*(?:[A-Za-z0-9][A-Za-z0-9_-]{0,40}\.)+(?:fr|com|org|net|io|co|de|uk|ca|be|ch|eu|es|it|pt|nl|se|no|dk|fi|jp|us|biz|info|shop|store)\s*$/iu;

function detectAllCapsBrand(title: string, query: string): string | null {
  const skip = new Set(["INCI", "EAN", "FR", "EN", "DE", "UK", "USA", "EU", "PARIS"]);
  const normalised = title.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const matches = normalised.match(/\b[A-Z][A-Z']{2,}\b/g);
  if (!matches) return null;
  const qFlat = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  const qTokens = qFlat.split(/\s+/u).filter((t) => t.length >= 3);
  for (const m of matches) {
    if (skip.has(m)) continue;
    if (m.length < 4) continue;
    const flat = m.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (qTokens.some((t) => flat.includes(t) || t.includes(flat))) {
      return m;
    }
  }
  return null;
}

function stripNoise(s: string): string {
  let prev: string;
  let cur = s;
  do {
    prev = cur;
    cur = cur.replace(NOISE_PREFIX_RE, "").trim();
    cur = cur.replace(/^[:\-|·]\s*/u, "").trim();
  } while (cur !== prev && cur.length > 2);
  return cur;
}

function dropLeadingBrand(name: string, brand: string): string {
  const flat = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const fn = flat(name);
  const fb = flat(brand);
  if (fb.length >= 3 && fn.startsWith(fb)) {
    return name.slice(brand.length).replace(/^[:\-|·\s]+/u, "");
  }
  return name;
}

function guessBrandAndName(
  title: string,
  domain: string,
  query: string,
): { brand: string | null; productName: string | null } {
  if (!title) {
    return {
      brand: isEditorialDomain(domain) ? null : brandFromDomain(domain),
      productName: null,
    };
  }
  let cleaned = title;
  let prev: string;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(TAIL_SITE_NAMES_RE, "").trim();
    cleaned = cleaned.replace(TAIL_DOMAIN_RE, "").trim();
  } while (cleaned !== prev && cleaned.length > 2);
  cleaned = stripNoise(cleaned);
  if (cleaned.length < 3) cleaned = title;

  const capsBrand = detectAllCapsBrand(cleaned, query);

  if (!capsBrand) {
    const sepMatch = cleaned.split(/\s+(?:[|·-])\s+/u);
    if (sepMatch.length >= 2) {
      let sepBrand = sepMatch[0]!.slice(0, 80);
      let sepProduct: string | null = sepMatch.slice(1).join(" - ").slice(0, 160) || null;
      if (sepProduct) {
        const tailFlat = sepProduct
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "");
        const domHead = domain
          .replace(/\..*$/, "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "");
        if (domHead.length >= 4 && (tailFlat.includes(domHead) || domHead.includes(tailFlat))) {
          [sepBrand, sepProduct] = [sepProduct, sepBrand];
        }
      }
      const looksLikeNoise = NOISE_PREFIX_RE.test(`${sepBrand} `);
      if (!looksLikeNoise) {
        return {
          brand: sepBrand || (isEditorialDomain(domain) ? null : brandFromDomain(domain)),
          productName: sepProduct,
        };
      }
    }
  }

  let brand: string | null = null;
  if (capsBrand) {
    brand = capsBrand;
  } else {
    const queryFirstWord = query.trim().split(/\s+/u)[0] ?? "";
    const titleLower = cleaned.toLowerCase();
    if (queryFirstWord.length > 2 && titleLower.startsWith(queryFirstWord.toLowerCase())) {
      brand = queryFirstWord;
    } else if (!isEditorialDomain(domain)) {
      brand = brandFromDomain(domain);
    } else if (queryFirstWord.length > 2) {
      brand = queryFirstWord;
    }
  }

  let productName: string | null = cleaned;
  if (brand) productName = dropLeadingBrand(productName, brand);
  productName = productName.slice(0, 160) || null;

  return { brand, productName };
}

function brandFromDomain(domain: string): string | null {
  if (!domain) return null;
  const head = domain.split(".")[0] ?? "";
  if (!head) return null;
  return head.charAt(0).toUpperCase() + head.slice(1);
}

function urlSearchableText(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname} ${u.pathname.replace(/[\/_-]+/g, " ")}`;
  } catch {
    return url;
  }
}
