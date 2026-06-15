/**
 * eanWebSearch — retrouve le code-barres (EAN/GTIN) d'un produit via le modèle
 * web-search d'OpenAI, en fallback de la recherche Open Beauty Facts.
 *
 * Garde anti-hallucination : on n'accepte un EAN que s'il passe la clé de
 * contrôle GTIN (EAN-13 / EAN-8 / UPC-A 12). Un code inventé par le LLM est
 * rejeté ~90% du temps par le checksum, et on exige une URL source.
 *
 * Dépend uniquement de _shared/aiClient.ts (réutilisable par toutes les Edge).
 */
import { AI_MODEL_SEARCH, hasOpenAI, logAI, openai } from "./aiClient.ts";

/**
 * Valide un code-barres GTIN par sa clé de contrôle (somme pondérée 3/1 depuis
 * la droite). Accepte EAN-13, UPC-A (12) et EAN-8. Fonction pure (testable).
 */
export function isValidGtin(code: string): boolean {
  const d = (code ?? "").replace(/\D/g, "");
  if (![8, 12, 13].includes(d.length)) return false;
  const digits = d.split("").map((c) => Number(c));
  const check = digits.pop() as number;
  let sum = 0;
  let weight = 3;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += digits[i] * weight;
    weight = weight === 3 ? 1 : 3;
  }
  const cd = (10 - (sum % 10)) % 10;
  return cd === check;
}

export type EanWebResult = { ean: string; sourceUrl: string | null };

/** Les 12 familles canoniques (constants/categories.ts) — ancre le 1er segment. */
const CANONICAL_FAMILIES = [
  "Bien-être",
  "Coiffure",
  "Hygiène dentaire",
  "Hygiène du corps",
  "Manucure et pédicure",
  "Maquillage",
  "Parfum",
  "Produit solaire",
  "Rasage et épilation",
  "Santé",
  "Soin du corps et visage",
  "Soin et hygiène bébé",
];

/** Slugifie un chemin « Famille / Sous / Feuille » → « famille/sous/feuille ». */
export function slugifyCategoryPath(path: string | null): string | null {
  if (!path) return null;
  const segs = path
    .split(/[/>]/)
    .map((s) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/['']/g, " ")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
    )
    .filter(Boolean);
  return segs.length ? segs.join("/") : null;
}

export type IdentifyResult = {
  ean: string | null;
  sourceUrl: string | null;
  /** Slug « famille/sous/feuille » (déjà slugifié), ou null. */
  category: string | null;
};

/**
 * UN SEUL appel GPT web-search : retrouve EN MÊME TEMPS le code-barre EAN (validé
 * checksum) ET la catégorie précise (chemin famille/sous/feuille) d'un produit.
 * Utilisé par `analyser` pour cataloguer automatiquement un produit internet.
 */
export async function identifyEanAndCategory(
  brand: string | null,
  name: string | null,
  opts: { timeoutMs?: number } = {},
): Promise<IdentifyResult> {
  const empty: IdentifyResult = { ean: null, sourceUrl: null, category: null };
  if (!hasOpenAI()) return empty;
  const label = `${brand ?? ""} ${name ?? ""}`.trim();
  if (label.length < 3) return empty;
  const timeoutMs = opts.timeoutMs ?? 25_000;

  const system = [
    "Tu es un assistant qui identifie un produit cosmétique précis via la recherche web et renvoie son CODE-BARRES (EAN/GTIN) et sa CATÉGORIE.",
    "",
    "RÈGLES CRITIQUES :",
    "1. CODE-BARRES : renvoie-le SEULEMENT si tu le trouves sur une vraie fiche produit (site officiel, marchand, base produits) et qu'il correspond EXACTEMENT au produit (même marque, nom, contenance). N'INVENTE JAMAIS un code-barres : en cas de doute, ean null. 13 chiffres (parfois 8 ou 12), chiffres uniquement.",
    "2. URL : donne la source où tu as lu le code-barres.",
    `3. CATÉGORIE : classe le produit dans une catégorie PRÉCISE au format "Famille / Sous-catégorie / Type". La Famille DOIT être l'une de : ${CANONICAL_FAMILIES.join(", ")}. Sois aussi précis que possible sur le type (ex. "Coiffure / Shampooing / Shampooing antipelliculaire", "Soin du corps et visage / Crème hydratante / Hydratant corps").`,
    "4. Réponds en JSON STRICT sans markdown.",
    "",
    'Format : {"ean": "3401560000000" | null, "url": "https://…" | null, "category": "Famille / Sous-catégorie / Type"}',
  ].join("\n");

  const userMsg = `Produit : """${label.slice(0, 200)}"""\n\nTrouve son code-barres EAN et sa catégorie précise. Réponds en JSON strict.`;

  try {
    const completion = await Promise.race([
      openai().chat.completions.create({
        model: AI_MODEL_SEARCH,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        // deno-lint-ignore no-explicit-any
        web_search_options: { search_context_size: "medium" },
      } as never),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("identify timeout")), timeoutMs)
      ),
    ]);

    // deno-lint-ignore no-explicit-any
    const usage = (completion as any).usage ?? {};
    logAI({
      feature: "product_search",
      provider: "openai",
      status: "success",
      model: AI_MODEL_SEARCH,
      tokens_in: usage.prompt_tokens ?? null,
      tokens_out: usage.completion_tokens ?? null,
    });

    // deno-lint-ignore no-explicit-any
    const choice = (completion as any).choices?.[0];
    const text: string = choice?.message?.content ?? "";
    const parsed = extractJson(text);
    if (!parsed) return empty;

    const rawEan = typeof parsed.ean === "string" ? parsed.ean.replace(/\D/g, "") : "";
    const ean = rawEan && isValidGtin(rawEan) ? rawEan : null;
    const url = typeof parsed.url === "string" && parsed.url.startsWith("http")
      ? parsed.url.slice(0, 500)
      : null;
    const category = slugifyCategoryPath(
      typeof parsed.category === "string" ? parsed.category : null,
    );
    return { ean, sourceUrl: ean ? url : null, category };
  } catch {
    return empty;
  }
}

/** Extrait le premier objet JSON d'un blob texte (éventuellement fencé). */
function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    return JSON.parse(text.slice(first, last + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Cherche le code-barres EAN d'un produit cosmétique sur le web.
 * Retourne null si OpenAI indisponible, rien trouvé, ou EAN invalide (checksum).
 */
export async function findEanByWebSearch(
  brand: string | null,
  name: string | null,
  opts: { timeoutMs?: number } = {},
): Promise<EanWebResult | null> {
  if (!hasOpenAI()) return null;
  const label = `${brand ?? ""} ${name ?? ""}`.trim();
  if (label.length < 3) return null;
  const timeoutMs = opts.timeoutMs ?? 20_000;

  const system = [
    "Tu es un assistant qui retrouve le CODE-BARRES (EAN-13 / GTIN) officiel d'un produit cosmétique précis via la recherche web.",
    "",
    "RÈGLES CRITIQUES :",
    "1. Renvoie le code-barres SEULEMENT si tu le trouves sur une vraie fiche produit (site officiel, marchand, base produits). Le code doit correspondre EXACTEMENT au produit demandé (même marque, même nom, même contenance si précisée).",
    "2. N'INVENTE JAMAIS un code-barres. En cas de doute, renvoie ean null. Un faux code est bien pire que pas de code.",
    "3. Le code est une suite de 13 chiffres (parfois 8 ou 12). Donne uniquement les chiffres, sans espaces.",
    "4. Donne aussi l'URL de la source où tu as lu ce code.",
    "5. Réponds en JSON STRICT sans markdown.",
    "",
    'Format : {"ean": "3401560000000", "url": "https://…"} ou {"ean": null}',
  ].join("\n");

  const userMsg = `Produit : """${label.slice(0, 200)}"""

Trouve son code-barres EAN officiel sur le web. Réponds en JSON strict.`;

  try {
    const completion = await Promise.race([
      openai().chat.completions.create({
        model: AI_MODEL_SEARCH,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        // deno-lint-ignore no-explicit-any
        web_search_options: { search_context_size: "medium" },
      } as never),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ean web-search timeout")), timeoutMs)
      ),
    ]);

    // deno-lint-ignore no-explicit-any
    const choice = (completion as any).choices?.[0];
    const text: string = choice?.message?.content ?? "";
    const parsed = extractJson(text);
    if (!parsed) return null;

    const rawEan = typeof parsed.ean === "string" ? parsed.ean.replace(/\D/g, "") : "";
    if (!rawEan || !isValidGtin(rawEan)) return null;

    const url = typeof parsed.url === "string" && parsed.url.startsWith("http")
      ? parsed.url.slice(0, 500)
      : null;
    return { ean: rawEan, sourceUrl: url };
  } catch {
    return null;
  }
}
