/**
 * deep-fetch helpers — port de `CosmetWiki/lib/productSearch/httpFetch.ts` +
 * `CosmetWiki/lib/productSearch/extractWithMistral.ts` vers Deno, plus un
 * garde-fou SSRF (le web n'avait pas de whitelist domaine, mais on bloque ici
 * les cibles internes : loopback, RFC1918, link-local, .local, etc.).
 */
import { hasMistral, hasOpenAI, mistralChat, openai } from "../_shared/aiClient.ts";

// ── SSRF guard ──────────────────────────────────────────────────────────────

/** N'accepte que des URLs http(s) publiques. Rejette les cibles internes. */
export function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;

  const host = u.hostname.toLowerCase();

  // Pas d'auth embarquée (user:pass@host), pas de host vide.
  if (!host) return false;

  // Noms manifestement internes.
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost")
  ) {
    return false;
  }

  // Adresses IPv4 littérales → bloque loopback / privées / link-local / CGNAT.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map((n) => Number(n));
    if (o.some((n) => n > 255)) return false;
    const [a, b] = o;
    if (a === 10) return false; // 10.0.0.0/8
    if (a === 127) return false; // loopback
    if (a === 0) return false; // 0.0.0.0/8
    if (a === 169 && b === 254) return false; // link-local 169.254.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
    if (a === 192 && b === 168) return false; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64.0.0/10
    return true;
  }

  // IPv6 littérales → bloque loopback (::1) et locales (fc.., fd.., fe80..).
  if (host.includes(":") || host.startsWith("[")) {
    const h = host.replace(/^\[|\]$/g, "");
    if (h === "::1" || h === "::") return false;
    if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return false;
    return true;
  }

  return true;
}

// ── HTTP fetch (browser-like headers) ───────────────────────────────────────

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

export async function fetchPageHtml(url: string, timeoutMs = 8_000): Promise<string | null> {
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

// ── Extraction INCI (GPT-4o-mini primaire, Mistral fallback) ────────────────

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

export async function extractInciFromHtml(input: {
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

  // Primary : GPT-4o-mini. Timeout dur 12 s.
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
          setTimeout(() => reject(new Error("openai_extract_timeout")), 12_000)
        ),
      ]);
      const txt = (r.choices?.[0]?.message?.content ?? "").trim();
      if (looksLikeInciList(txt)) return txt;
    } catch {
      // Tombe sur Mistral en fallback.
    }
  }

  // Fallback : Mistral.
  if (!hasMistral()) return null;
  try {
    const txt = (await mistralChat({
      temperature: 0,
      maxTokens: 1500,
      messages: [{ role: "user", content: prompt }],
    })).trim();
    if (!looksLikeInciList(txt)) return null;
    return txt;
  } catch {
    return null;
  }
}
