/**
 * eanLookup — recherche un EAN sur Open Beauty Facts par nom de produit.
 *
 * Utilisé en fire-and-forget par `analyser` après une analyse OCR sans EAN
 * pour alimenter le catalog Supabase (cache inter-users permanent).
 *
 * - `lookupEanByName(brand, name)` : appel réseau OBF + timeout 6s.
 * - `parseOBFSearchResult(data)` : extraction pure (testable en Jest).
 */

const OBF_SEARCH_URL = "https://world.openbeautyfacts.org/cgi/search.pl";
const UA = "Cosme-Check/1.0 (https://cosme-check.vercel.app)";
const TIMEOUT_MS = 6_000;
const MIN_INCI_LENGTH = 30;

type OBFProduct = {
  code?: string;
  ingredients_text?: string;
  ingredients_text_fr?: string;
  ingredients_text_en?: string;
};

type OBFSearchResponse = {
  products?: OBFProduct[];
};

/** Résultat renvoyé si un produit valide est trouvé sur OBF. */
export type EanLookupResult = {
  ean: string;
  ingredientsText: string;
};

/**
 * Extrait le premier résultat OBF valide : code non vide + ingredients_text ≥ 30 chars.
 * Fonction pure exportée pour la testabilité Jest.
 */
export function parseOBFSearchResult(data: unknown): EanLookupResult | null {
  if (!data || typeof data !== "object") return null;
  const response = data as OBFSearchResponse;
  const products = response.products;
  if (!Array.isArray(products) || products.length === 0) return null;

  for (const product of products) {
    if (!product || typeof product !== "object") continue;
    const code = (product as OBFProduct).code;
    if (!code || code.trim() === "") continue;

    const p = product as OBFProduct;
    const rawText =
      p.ingredients_text_fr || p.ingredients_text || p.ingredients_text_en || "";
    if (rawText.length < MIN_INCI_LENGTH) continue;

    return { ean: code.trim(), ingredientsText: rawText };
  }

  return null;
}

/**
 * Cherche un EAN sur Open Beauty Facts par marque + nom produit.
 * Timeout 6s. Retourne null en cas d'erreur ou si aucun résultat valide.
 */
export async function lookupEanByName(
  brand: string,
  name: string,
): Promise<EanLookupResult | null> {
  try {
    const query = encodeURIComponent(`${brand} ${name}`.trim());
    const url =
      `${OBF_SEARCH_URL}?search_terms=${query}&action=process&json=1&page_size=3&search_simple=1`;

    const fetchPromise = fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    }).then(async (r) => {
      if (!r.ok) return null;
      return (await r.json()) as unknown;
    });

    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error("EAN lookup timeout")), TIMEOUT_MS)
    );

    const data = await Promise.race([fetchPromise, timeoutPromise]);
    if (!data) return null;

    return parseOBFSearchResult(data);
  } catch {
    return null;
  }
}
