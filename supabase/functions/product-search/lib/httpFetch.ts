// HTTP fetch with browser-like headers for scraping product pages from
// sources that gate raw bot User-Agents. Port of CosmetWiki
// lib/productSearch/httpFetch.ts.
//
// SSRF / abuse guards: strict timeout (AbortSignal), redirect:"follow" with
// the platform's own cap, and a content-type allowlist (html/text/xml only)
// so we never download binaries. We never store or expose raw HTML — only the
// INCI string the LLM extracts.

const BROWSER_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

export async function fetchPageHtml(
  url: string,
  timeoutMs = 8_000,
): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.includes("html") && !ct.includes("text") && !ct.includes("xml")) {
      return null;
    }
    return await r.text();
  } catch {
    return null;
  }
}
