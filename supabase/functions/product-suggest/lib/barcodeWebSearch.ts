// Last-resort web search for a barcode unknown to OBF/OPF. Port of CosmetWiki
// lib/productSearch/barcodeWebSearch.ts. Uses OpenAI web search to identify
// the product and its INCI. Cost ~$0.025/call; only triggered when both OBF
// and OPF miss. Degrades to found:false when OpenAI is unavailable.
import { hasOpenAI } from "../../_shared/aiClient.ts";
import { webSearchComplete } from "./webSearch.ts";

export type BarcodeWebResult =
  | {
      found: true;
      brand: string | null;
      productName: string | null;
      ingredientsText: string;
      sourceUrl: string | null;
      confidence: number;
    }
  | { found: false };

const SYSTEM_PROMPT = `Tu es un assistant expert en produits cosmétiques.
On te donne un code-barres EAN. Ta mission :
1. Identifier le produit cosmétique correspondant (marque, nom exact).
2. Trouver sa liste INCI complète des ingrédients.
3. Retourner un objet JSON strict sans texte additionnel.

Format de réponse OBLIGATOIRE (JSON pur, pas de markdown) :
{
  "brand": "Nom de la marque ou null",
  "productName": "Nom complet du produit ou null",
  "ingredientsText": "AQUA, GLYCERIN, ... (liste INCI complète) ou null si non trouvée",
  "sourceUrl": "URL de la fiche produit trouvée ou null"
}

Règles strictes :
- N'invente JAMAIS d'ingrédients. Si tu ne trouves pas la liste INCI, ingredientsText = null.
- La liste INCI doit contenir au minimum 5 ingrédients séparés par des virgules.
- Si le produit n'est pas cosmétique (alimentaire, ménager, etc.), retourne null pour tous les champs.`;

function parseWebSearchResult(text: string): {
  brand: string | null;
  productName: string | null;
  ingredientsText: string | null;
  sourceUrl: string | null;
} | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  try {
    const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1)) as {
      brand?: unknown;
      productName?: unknown;
      ingredientsText?: unknown;
      sourceUrl?: unknown;
    };
    return {
      brand: typeof parsed.brand === "string" && parsed.brand ? parsed.brand : null,
      productName: typeof parsed.productName === "string" && parsed.productName ? parsed.productName : null,
      ingredientsText:
        typeof parsed.ingredientsText === "string" && parsed.ingredientsText ? parsed.ingredientsText : null,
      sourceUrl: typeof parsed.sourceUrl === "string" && parsed.sourceUrl ? parsed.sourceUrl : null,
    };
  } catch {
    return null;
  }
}

function looksLikeInci(text: string | null): boolean {
  if (!text || text.length < 20) return false;
  const tokens = text.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  return tokens.length >= 3;
}

export async function searchProductByBarcode(barcode: string): Promise<BarcodeWebResult> {
  if (!hasOpenAI()) return { found: false };
  try {
    const result = await webSearchComplete(
      SYSTEM_PROMPT,
      `Code-barres EAN : ${barcode}\n\nIdentifie ce produit cosmétique et trouve sa liste INCI.`,
      { timeoutMs: 20_000 },
    );
    const parsed = parseWebSearchResult(result.text);
    if (!parsed) return { found: false };
    if (!looksLikeInci(parsed.ingredientsText)) return { found: false };
    return {
      found: true,
      brand: parsed.brand,
      productName: parsed.productName,
      ingredientsText: parsed.ingredientsText!,
      sourceUrl: parsed.sourceUrl ?? (result.citations[0]?.url ?? null),
      confidence: 0.75,
    };
  } catch {
    return { found: false };
  }
}
