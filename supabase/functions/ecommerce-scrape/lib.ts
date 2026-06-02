/**
 * ecommerce-scrape helpers — port Deno de
 * `CosmetWiki/lib/productSearch/scrapeEcommerceUrl.ts` (+ extractJsonLd /
 * extractMetaFallback / validateUrl / extractWithMistral).
 *
 * Pipeline complet :
 *   1. validateUserUrl()              — SSRF defenses (scheme/length/IP privées)
 *   2. fetchHtmlWithDiagnostics()     — fetch HTML avec headers browser + détection
 *                                       bot management (Cloudflare/Akamai)
 *   3. extractProductFromJsonLd()     — JSON-LD Product (gratuit, déterministe)
 *   4. extractMetaFallback()          — Open Graph / <title> / <h1> (fallback gratuit)
 *   5. extractInciFromHtml()          — Mistral primary / GPT fallback (~$0.0003)
 *   6. Cache via `cosme_check.ai_cache` (clé préfixée `ecommerce-scrape:v1:`)
 *
 * Le cache hit court-circuite tout — pas de re-fetch ni de LLM.
 */
import { hasMistral, hasOpenAI, mistralChat, openai } from "../_shared/aiClient.ts";
import { serviceClient } from "../_shared/auth.ts";

// ─── SSRF guard (port de validateUserUrl.ts) ────────────────────────────────

const HTTP_SCHEMES = new Set(["http:", "https:"]);

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "kubernetes.default.svc",
  "host.docker.internal",
]);

const BLOCKED_IPV4_PREFIXES = [
  "0.",
  "10.",
  "127.",
  "169.254.",
  "192.168.",
  "224.",
];

const BLOCKED_IPV6 = new Set(["::", "::1"]);

function isBlocked172(host: string): boolean {
  if (!host.startsWith("172.")) return false;
  const parts = host.split(".");
  if (parts.length < 2) return false;
  const second = Number(parts[1]);
  return Number.isInteger(second) && second >= 16 && second <= 31;
}

function isLikelyPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_IPV6.has(h)) return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true;
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
  if (BLOCKED_HOSTS.has(host)) {
    return { ok: false, reason: "Domaine interne refusé." };
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "Domaine interne refusé." };
  }

  if (host.includes(":")) {
    if (isLikelyPrivateIPv6(host)) {
      return { ok: false, reason: "Adresse IP privée refusée." };
    }
  } else if (/^[\d.]+$/.test(host)) {
    if (BLOCKED_IPV4_PREFIXES.some((p) => host.startsWith(p))) {
      return { ok: false, reason: "Adresse IP privée refusée." };
    }
    if (isBlocked172(host)) {
      return { ok: false, reason: "Adresse IP privée refusée." };
    }
  }

  return { ok: true, url: parsed };
}

// ─── HTTP fetch avec diagnostic bot-management ──────────────────────────────

const BROWSER_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  DNT: "1",
};

type FetchOutcome =
  | { kind: "ok"; html: string }
  | { kind: "blocked"; vendor: "cloudflare" | "akamai" | "generic"; status: number }
  | { kind: "not_found"; status: number }
  | { kind: "fetch_failed"; reason: string };

function isCloudflareChallenge(server: string, body: string): boolean {
  if (server.includes("cloudflare")) {
    if (
      body.includes("Just a moment...") ||
      body.includes("cf_chl_") ||
      body.includes("cf-mitigated")
    ) {
      return true;
    }
  }
  return false;
}

function isAkamaiBlock(server: string, body: string): boolean {
  if (server.toLowerCase().includes("akamai")) {
    if (body.includes("Access Denied") || body.includes("Reference #")) return true;
  }
  return false;
}

async function fetchHtmlWithDiagnostics(
  url: string,
  timeoutMs = 10_000,
): Promise<FetchOutcome> {
  let r: Response;
  try {
    r = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
  } catch (e) {
    return { kind: "fetch_failed", reason: e instanceof Error ? e.message : String(e) };
  }
  const server = (r.headers.get("server") ?? "").toLowerCase();
  const ct = r.headers.get("content-type") ?? "";

  if (r.status === 404) {
    void r.text().catch(() => undefined);
    return { kind: "not_found", status: 404 };
  }

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    if (isCloudflareChallenge(server, body)) {
      return { kind: "blocked", vendor: "cloudflare", status: r.status };
    }
    if (isAkamaiBlock(server, body)) {
      return { kind: "blocked", vendor: "akamai", status: r.status };
    }
    if (r.status === 403) return { kind: "blocked", vendor: "generic", status: r.status };
    return { kind: "fetch_failed", reason: `http_${r.status}` };
  }

  if (!ct.includes("html") && !ct.includes("text") && !ct.includes("xml")) {
    return { kind: "fetch_failed", reason: `unexpected_content_type:${ct}` };
  }

  const html = await r.text();
  if (isCloudflareChallenge(server, html)) {
    return { kind: "blocked", vendor: "cloudflare", status: r.status };
  }
  return { kind: "ok", html };
}

// ─── JSON-LD Product extraction (port de extractJsonLd.ts) ──────────────────

export interface JsonLdProduct {
  productName: string | null;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
}

const SCRIPT_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function parseAllJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  for (const match of html.matchAll(SCRIPT_RE)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      try {
        const rescued = raw
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/,(\s*[}\]])/g, "$1");
        out.push(JSON.parse(rescued));
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

function* iterateNodes(node: unknown): Generator<Record<string, unknown>> {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) yield* iterateNodes(item);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  yield obj;
  const graph = obj["@graph"];
  if (graph) yield* iterateNodes(graph);
}

function hasProductType(node: Record<string, unknown>): boolean {
  const t = node["@type"];
  if (typeof t === "string") return t === "Product" || t === "schema:Product";
  if (Array.isArray(t)) return t.some((x) => x === "Product" || x === "schema:Product");
  return false;
}

function asString(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function extractBrandName(brand: unknown): string | null {
  if (!brand) return null;
  if (typeof brand === "string") return asString(brand, 120);
  if (Array.isArray(brand)) {
    for (const b of brand) {
      const found = extractBrandName(b);
      if (found) return found;
    }
    return null;
  }
  if (typeof brand === "object") {
    const obj = brand as Record<string, unknown>;
    return asString(obj.name, 120);
  }
  return null;
}

function extractImageUrl(image: unknown): string | null {
  if (!image) return null;
  if (typeof image === "string") return asString(image, 2048);
  if (Array.isArray(image)) {
    for (const item of image) {
      const found = extractImageUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof image === "object") {
    const obj = image as Record<string, unknown>;
    return asString(obj.url, 2048) ?? asString(obj.contentUrl, 2048);
  }
  return null;
}

function cleanDescription(s: string | null): string | null {
  if (!s) return null;
  const cleaned = s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 2000 ? cleaned.slice(0, 2000) : cleaned || null;
}

export function extractProductFromJsonLd(html: string): JsonLdProduct | null {
  const nodes = parseAllJsonLd(html);
  for (const node of nodes) {
    for (const obj of iterateNodes(node)) {
      if (!hasProductType(obj)) continue;
      const productName = asString(obj.name, 200);
      const brand = extractBrandName(obj.brand);
      const description = cleanDescription(asString(obj.description, 4000));
      const imageUrl = extractImageUrl(obj.image);
      if (!productName && !brand && !description) continue;
      return { productName, brand, description, imageUrl };
    }
  }
  return null;
}

// ─── Meta-tag fallback (port de extractMetaFallback.ts) ─────────────────────

export interface MetaFallback {
  productName: string | null;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string | null {
  const escaped = escapeRe(key);
  const r1 = new RegExp(
    `<meta\\b[^>]*?\\b(?:property|name|itemprop)=["']${escaped}["'][^>]*?\\bcontent=["']([^"']*)["']`,
    "i",
  ).exec(html);
  if (r1?.[1]) return decodeEntities(r1[1].trim());
  const r2 = new RegExp(
    `<meta\\b[^>]*?\\bcontent=["']([^"']*)["'][^>]*?\\b(?:property|name|itemprop)=["']${escaped}["']`,
    "i",
  ).exec(html);
  if (r2?.[1]) return decodeEntities(r2[1].trim());
  return null;
}

function cleanText(s: string | null, maxLen: number): string | null {
  if (!s) return null;
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

function firstTitle(html: string): string | null {
  const m = /<title\b[^>]*>([\s\S]{0,400}?)<\/title>/i.exec(html);
  if (!m?.[1]) return null;
  return decodeEntities(m[1].replace(/\s+/g, " ").trim());
}

function firstH1(html: string): string | null {
  const m = /<h1\b[^>]*>([\s\S]{0,400}?)<\/h1>/i.exec(html);
  if (!m?.[1]) return null;
  const inner = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return inner ? decodeEntities(inner) : null;
}

function stripBrandFromTitle(title: string, brand: string | null): string {
  if (!brand) return title;
  const re = new RegExp(`\\s*[|\\-—–·•]\\s*${escapeRe(brand)}\\s*$`, "i");
  return title.replace(re, "").trim() || title;
}

export function extractMetaFallback(html: string): MetaFallback {
  const ogTitle = metaContent(html, "og:title");
  const ogSiteName = metaContent(html, "og:site_name");
  const ogDescription = metaContent(html, "og:description");
  const ogImage = metaContent(html, "og:image");
  const productBrand = metaContent(html, "product:brand") ?? metaContent(html, "og:brand");
  const metaDescription = metaContent(html, "description");
  const title = firstTitle(html);
  const h1 = firstH1(html);

  const brand = productBrand ?? ogSiteName;
  let productName = ogTitle ?? h1 ?? null;
  if (!productName && title) productName = stripBrandFromTitle(title, brand);

  return {
    productName: cleanText(productName, 200),
    brand: cleanText(brand, 120),
    description: cleanText(ogDescription ?? metaDescription, 2000),
    imageUrl: cleanText(ogImage, 2048),
  };
}

// ─── INCI extraction (Mistral primary, GPT fallback) ────────────────────────
// Identique à deep-fetch/lib.ts (déjà ported) — on duplique localement pour
// garder l'Edge Function autonome (Supabase n'autorise pas l'import depuis
// une autre Edge Function).

function reduceHtmlForExtraction(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  const inciShape =
    /\b(?:AQUA|WATER)\b[^A-Za-z]{0,5}[,.;•·][^A-Za-z]{0,5}[A-Z][A-Z0-9/ \-]{2,40}[,.;•·][^A-Za-z]{0,5}[A-Z]/;
  const inciMatch = inciShape.exec(stripped);
  if (inciMatch) {
    const start = Math.max(0, inciMatch.index - 200);
    const end = Math.min(stripped.length, inciMatch.index + 4_800);
    return stripped.slice(start, end);
  }

  const re = /(ingredients|composition|inci|ingr[eé]dients|liste\s+complète|liste\s+des\s+ingr)/gi;
  const matches = [...stripped.matchAll(re)].slice(0, 3);
  if (matches.length === 0) return stripped.slice(0, 5_000);

  const slices: string[] = [];
  let usedChars = 0;
  for (const m of matches) {
    const start = Math.max(0, (m.index ?? 0) - 200);
    const remaining = 6_000 - usedChars;
    if (remaining <= 0) break;
    const end = Math.min(stripped.length, (m.index ?? 0) + Math.min(3_000, remaining));
    const slice = stripped.slice(start, end);
    slices.push(slice);
    usedChars += slice.length;
  }
  return slices.join("\n\n---\n\n");
}

function looksLikeInciList(text: string): boolean {
  if (!text) return false;
  if (text.length < 20) return false;
  const upper = text.toUpperCase();
  if (upper === "NONE" || upper === "INCONNU") return false;
  const tokens = text
    .split(/[,;•·]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && t.length < 80);
  return tokens.length >= 3;
}

async function extractInciFromHtml(input: {
  label: string;
  html: string;
}): Promise<string | null> {
  const ctx = reduceHtmlForExtraction(input.html);
  if (ctx.length < 80) return null;

  const prompt = `Tu es un extracteur d'INCI. Voici le texte brut d'une page produit cosmétique. Trouve UNIQUEMENT la liste INCI (la liste des ingrédients) telle qu'elle apparaît, et renvoie-la en une seule ligne, ingrédients séparés par des virgules.

Règles strictes :
- N'invente AUCUN ingrédient. Ne reformule pas. Ne traduis pas.
- Si la page ne contient pas de liste INCI claire, réponds NONE.
- Pas de commentaire, pas de "Voici" ou "INCI :", uniquement la liste séparée par virgules.
- Les noms INCI sont en latin/anglais et habituellement en MAJUSCULES (ex: AQUA, GLYCERIN, BUTYROSPERMUM PARKII BUTTER).
- **Séparateurs possibles dans la source** : les marques pharmaceutiques françaises (Avène, La Roche-Posay, Bioderma, Eucerin…) utilisent souvent des POINTS au lieu de virgules entre ingrédients. Si tu repères ce pattern, normalise la sortie en utilisant des VIRGULES.
  Exemple input : "AVENE AQUA. CAPRYLIC/CAPRIC TRIGLYCERIDE. MINERAL OIL. GLYCERIN."
  Exemple output : "AVENE AQUA, CAPRYLIC/CAPRIC TRIGLYCERIDE, MINERAL OIL, GLYCERIN"
- Autres séparateurs possibles à normaliser en virgules : • (bullet), · (middot), ; (point-virgule).
- Garde les parenthèses et la casse d'origine (les ingrédients sont souvent en MAJUSCULES).

Produit : ${input.label}

Texte brut :
"""
${ctx}
"""`;

  // Primary : GPT-4o-mini, timeout 12s
  if (hasOpenAI()) {
    try {
      const r = await Promise.race([
        openai().chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0,
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("openai_extract_timeout")), 12_000),
        ),
      ]);
      const txt = (r.choices?.[0]?.message?.content ?? "").trim();
      if (looksLikeInciList(txt)) return txt;
    } catch {
      // fallback Mistral
    }
  }

  // Fallback : Mistral
  if (!hasMistral()) return null;
  try {
    const txt = (
      await mistralChat({
        temperature: 0,
        maxTokens: 1500,
        messages: [{ role: "user", content: prompt }],
      })
    ).trim();
    if (!looksLikeInciList(txt)) return null;
    return txt;
  } catch {
    return null;
  }
}

// ─── Cache (réutilise cosme_check.ai_cache avec préfixe v1) ─────────────────

const CACHE_PREFIX = "ecommerce-scrape:v1:";
const MAX_HTML_BYTES = 1_500_000;

async function cacheKeyFor(url: string): Promise<string> {
  let normalised = url;
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    normalised = u.toString();
  } catch {
    /* keep raw */
  }
  const data = new TextEncoder().encode(normalised);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  return CACHE_PREFIX + hash;
}

async function getCachedScrape(key: string): Promise<EcommerceScrapeOk | null> {
  try {
    const sb = serviceClient();
    const { data } = await sb
      .schema("cosme_check")
      .from("ai_cache")
      .select("result")
      .eq("cache_key", key)
      .maybeSingle();
    if (!data) return null;
    return data.result as EcommerceScrapeOk;
  } catch {
    return null;
  }
}

async function setCachedScrape(key: string, payload: EcommerceScrapeOk): Promise<void> {
  try {
    const sb = serviceClient();
    await sb
      .schema("cosme_check")
      .from("ai_cache")
      .upsert({ cache_key: key, result: payload }, { onConflict: "cache_key" });
  } catch {
    /* cache miss acceptable */
  }
}

// ─── Public orchestrator ────────────────────────────────────────────────────

export interface EcommerceScrapeOk {
  ok: true;
  productName: string | null;
  brand: string | null;
  description: string | null;
  ingredientsText: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  source: {
    metadata: "json-ld" | "meta-tags" | "mixed" | "none";
    inci: "llm" | "none";
    cached: boolean;
  };
}

export interface EcommerceScrapeErr {
  ok: false;
  reason:
    | "invalid_url"
    | "fetch_failed"
    | "site_blocked"
    | "not_found"
    | "html_too_large"
    | "no_content"
    | "extraction_failed";
  message: string;
}

export type EcommerceScrapeResult = EcommerceScrapeOk | EcommerceScrapeErr;

export async function scrapeEcommerceUrl(rawUrl: string): Promise<EcommerceScrapeResult> {
  const validation = validateUserUrl(rawUrl);
  if (!validation.ok) {
    return { ok: false, reason: "invalid_url", message: validation.reason };
  }
  const url = validation.url.toString();
  const cacheKey = await cacheKeyFor(url);

  const cached = await getCachedScrape(cacheKey);
  if (cached) {
    return { ...cached, source: { ...cached.source, cached: true } };
  }

  const fetched = await fetchHtmlWithDiagnostics(url, 10_000);
  if (fetched.kind === "fetch_failed") {
    return {
      ok: false,
      reason: "fetch_failed",
      message:
        "Impossible de récupérer la page. Vérifie le lien (page indisponible ou site très lent).",
    };
  }
  if (fetched.kind === "not_found") {
    return {
      ok: false,
      reason: "not_found",
      message: "La page n'existe pas (404). Vérifie le lien et réessaie.",
    };
  }
  if (fetched.kind === "blocked") {
    const who =
      fetched.vendor === "cloudflare"
        ? "Cloudflare"
        : fetched.vendor === "akamai"
          ? "Akamai"
          : "le pare-feu du site";
    return {
      ok: false,
      reason: "site_blocked",
      message: `Ce site bloque les analyses automatiques (${who}). Tu peux coller la composition à la main ou prendre une photo de l'étiquette.`,
    };
  }

  const html = fetched.html;
  if (html.length > MAX_HTML_BYTES) {
    return {
      ok: false,
      reason: "html_too_large",
      message: "Cette page est trop lourde pour être analysée (>1,5 Mo de HTML).",
    };
  }
  if (html.length < 200) {
    return { ok: false, reason: "no_content", message: "La page semble vide." };
  }

  // 1. JSON-LD (gratuit, déterministe)
  const jsonLd = extractProductFromJsonLd(html);

  // 2. Meta-tags fallback (toujours calculé pour back-fill)
  const fallback = extractMetaFallback(html);

  const productName = jsonLd?.productName ?? fallback.productName;
  const brand = jsonLd?.brand ?? fallback.brand;
  const description = jsonLd?.description ?? fallback.description;
  const imageUrl = jsonLd?.imageUrl ?? fallback.imageUrl;

  // 3. LLM pour l'INCI spécifiquement
  const label = productName ?? brand ?? validation.url.hostname.replace(/^www\./, "");
  const ingredientsText = await extractInciFromHtml({ label, html });

  if (!ingredientsText && !productName) {
    return {
      ok: false,
      reason: "extraction_failed",
      message:
        "On n'a pas réussi à extraire les ingrédients ni le nom du produit depuis cette page.",
    };
  }

  const metadataSource: EcommerceScrapeOk["source"]["metadata"] =
    jsonLd && (fallback.productName || fallback.description || fallback.imageUrl)
      ? "mixed"
      : jsonLd
        ? "json-ld"
        : productName || brand || description || imageUrl
          ? "meta-tags"
          : "none";

  const result: EcommerceScrapeOk = {
    ok: true,
    productName,
    brand,
    description,
    ingredientsText: ingredientsText ?? null,
    imageUrl,
    sourceUrl: url,
    source: {
      metadata: metadataSource,
      inci: ingredientsText ? "llm" : "none",
      cached: false,
    },
  };

  void setCachedScrape(cacheKey, result);

  return result;
}
