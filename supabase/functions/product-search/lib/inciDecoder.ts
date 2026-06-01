// INCIDecoder fallback: search → fetch first product page → extract via LLM.
// Port of CosmetWiki lib/productSearch/inciDecoder.ts.
import { fetchPageHtml } from "./httpFetch.ts";
import { extractInciFromHtml } from "./extract.ts";
import { matchesQuery } from "./relevance.ts";

const SEARCH_URL = "https://incidecoder.com/search?query=";
const PRODUCT_LINK_RE = /href=["']\/products\/([a-z0-9\-]+)["']/i;
const PRODUCT_LINK_GLOBAL_RE = /href=["']\/products\/([a-z0-9\-]+)["'][^>]*>([^<]+)</gi;
const TITLE_RE = /<h1[^>]*>([^<]+)<\/h1>/i;
const BRAND_LINK_RE = /<a[^>]+href=["']\/brands\/([^"']+)["'][^>]*>([^<]+)<\/a>/i;

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export async function searchInciDecoder(query: string): Promise<{
  brand: string | null;
  productName: string | null;
  ingredientsText: string;
  sourceUrl: string;
} | null> {
  const searchHtml = await fetchPageHtml(SEARCH_URL + encodeURIComponent(query));
  if (!searchHtml) return null;

  const slugMatch = PRODUCT_LINK_RE.exec(searchHtml);
  if (!slugMatch) return null;
  const slug = slugMatch[1]!;
  const productUrl = `https://incidecoder.com/products/${slug}`;

  const productHtml = await fetchPageHtml(productUrl);
  if (!productHtml) return null;

  const titleMatch = TITLE_RE.exec(productHtml);
  const productName = titleMatch ? decodeHtmlEntities(titleMatch[1]!.trim()) : null;
  const brandMatch = BRAND_LINK_RE.exec(productHtml);
  const brand = brandMatch ? decodeHtmlEntities(brandMatch[2]!.trim()) : null;

  const label = `${brand ?? ""} ${productName ?? ""} ${slug.replace(/-/g, " ")}`;
  if (!matchesQuery(query, label)) return null;

  const inci = await extractInciFromHtml({ label: productName ?? slug, html: productHtml });
  if (!inci) return null;

  return { brand, productName, ingredientsText: inci, sourceUrl: productUrl };
}

export type InciDecoderListCandidate = {
  slug: string;
  productName: string | null;
  brand: string | null;
  sourceUrl: string;
};

/** Up to `limit` product candidates from a single INCIDecoder search page. */
export async function searchInciDecoderList(
  query: string,
  limit = 8,
): Promise<InciDecoderListCandidate[]> {
  const html = await fetchPageHtml(SEARCH_URL + encodeURIComponent(query));
  if (!html) return [];

  const seen = new Set<string>();
  const out: InciDecoderListCandidate[] = [];
  const re = new RegExp(PRODUCT_LINK_GLOBAL_RE.source, PRODUCT_LINK_GLOBAL_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (out.length >= limit) break;
    const slug = m[1];
    const rawLabel = decodeHtmlEntities(m[2].trim());
    if (!slug || seen.has(slug)) continue;
    let brand: string | null = null;
    let productName: string | null = rawLabel;
    const sepIdx = rawLabel.indexOf(" · ");
    if (sepIdx > 0) {
      brand = rawLabel.slice(0, sepIdx).trim() || null;
      productName = rawLabel.slice(sepIdx + 3).trim() || null;
    }
    const label = `${brand ?? ""} ${productName ?? ""} ${slug.replace(/-/g, " ")}`;
    if (!matchesQuery(query, label)) continue;
    seen.add(slug);
    out.push({
      slug,
      brand,
      productName,
      sourceUrl: `https://incidecoder.com/products/${slug}`,
    });
  }
  return out;
}
