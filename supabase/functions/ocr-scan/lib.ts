/**
 * Logique OCR (Edge / Deno). Port de `CosmetWiki/lib/ai/ocr.ts`.
 *
 * Primaire : GPT-4o-mini Vision (high detail). Renvoie la liste INCI telle
 * qu'imprimée, en marquant les mots incertains avec [?MOT]. Cache par
 * SHA-256 de l'image, donc ré-uploader la même photo est gratuit.
 *
 * SIMPLIFICATION vs web (voir followups) : le web fait un locate-bbox (call
 * Vision low-detail) → crop Sharp → OCR → 2e passe conditionnelle. Ici PAS de
 * locate/crop (Sharp = dépendance Node indisponible en Deno, et le CLIENT
 * mobile redimensionne déjà à 1600px). On garde une PASSE OCR robuste unique +
 * une 2e passe conditionnelle (même heuristique que le web) qui ne dépend pas
 * de Sharp. La validation par cosme_check_match_inci_batch est conservée.
 *
 * DÉGRADE : sans clé OpenAI, ocrFromImageBase64 renvoie { found:false,
 * reason:"openai_unavailable" } (l'OCR a réellement besoin de la vision).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AI_MODEL,
  callWithFallback,
  getCached,
  hasOpenAI,
  openai,
  setCached,
  sha256Hex,
} from "../_shared/aiClient.ts";
import { parseInciList } from "../analyser/parse.ts";

export type OcrValidation = {
  total: number;
  matched: number;
  rate: number;
  level: "ok" | "low_match" | "very_low_match";
  message?: string;
};

export type OcrResult =
  | { found: true; text: string; uncertain: string[]; validation?: OcrValidation }
  | { found: false; reason: string };

export type OcrFrontResult =
  | { found: true; productName: string | null; brand: string | null; productType: string | null }
  | { found: false; reason: string };

/**
 * Valide un texte OCR contre la base INCI live via
 * `cosme_check_match_inci_batch`. Renvoie combien de tokens matchent
 * exactement / via alias et un niveau de confiance. < 70 % → l'OCR a
 * probablement halluciné (cas fréquent sur étiquettes petites/courbes) ;
 * surfacer ce flag laisse l'UI inviter à reprendre la photo.
 *
 * `sb` = client service-role (bypass RLS, comme supabaseAnon côté web pour la
 * lecture du catalogue public).
 */
export async function validateOcrText(sb: SupabaseClient, text: string): Promise<OcrValidation> {
  const tokens = parseInciList(text);
  const total = tokens.length;
  if (total === 0) {
    return {
      total: 0,
      matched: 0,
      rate: 0,
      level: "very_low_match",
      message: "Aucun ingrédient lisible dans la photo. Reprends-en une plus nette, cadrée sur le bloc INGREDIENTS.",
    };
  }

  type MatchRow = { match_kind: "exact" | "alias" | "fuzzy_high" | "suggestion" | null };
  let matched = 0;
  try {
    const { data } = await sb.rpc("cosme_check_match_inci_batch", {
      p_tokens: tokens.map((t) => t.normalized),
    });
    for (const r of (data ?? []) as MatchRow[]) {
      // Seuls les matches confiants comptent : une "suggestion" (fuzzy
      // 0.55..0.90) est exactement le symptôme d'une hallucination.
      if (r.match_kind === "exact" || r.match_kind === "alias") matched += 1;
    }
  } catch {
    // DB indisponible → ne bloque pas l'utilisateur, traite comme "ok".
    return { total, matched: total, rate: 1, level: "ok" };
  }

  const rate = matched / total;
  if (rate >= 0.7) return { total, matched, rate, level: "ok" };
  if (rate >= 0.3) {
    return {
      total,
      matched,
      rate,
      level: "low_match",
      message: `Seulement ${matched}/${total} ingrédients reconnus. La photo est peut-être floue ou l'OCR a inventé des noms - vérifie le résultat ou reprends une photo plus nette.`,
    };
  }
  return {
    total,
    matched,
    rate,
    level: "very_low_match",
    message: `Très peu d'ingrédients reconnus (${matched}/${total}). La photo est trop floue ou ne montre pas le bloc INGREDIENTS - reprends-la, cadrée et avec un bon éclairage.`,
  };
}

/**
 * Heuristique : déclenche une 2e passe OCR quand la 1re paraît trop courte.
 * Les cosmétiques > 20 ingrédients (Dove, L'Oréal, Yves Rocher, Garnier) sont
 * très courants ; à 6-17 tokens on rate presque toujours la fin de la liste.
 */
function shouldTriggerSecondPass(text: string): boolean {
  const tokens = parseInciList(text);
  return tokens.length >= 6 && tokens.length < 18;
}

const SYSTEM_BACK = [
  "Tu es un OCR spécialisé compositions INCI cosmétiques. Tu reçois une photo du dos d'un emballage.",
  "",
  "RÈGLES CRITIQUES - la fidélité prime sur la complétude :",
  "1. N'INVENTE JAMAIS d'ingrédient. Si tu ne peux pas lire un mot avec certitude, omets-le ou écris `[?]` à sa place. Une liste incomplète mais fidèle vaut MILLE fois mieux qu'une liste complète mais hallucinée.",
  "2. Cherche le bloc qui commence explicitement par `INGREDIENTS:`, `INGRÉDIENTS:`, `INCI:`, `COMPOSITION:` ou équivalent. C'est UNIQUEMENT ce bloc qui contient la liste INCI.",
  "3. IGNORE tous les paragraphes descriptifs multilingues (suédois, danois, néerlandais, allemand, italien, etc.). Des mots comme `KASTANJEMELK`, `BALSAM`, `HOITOAINE`, `BESCHERMENDE` NE SONT PAS des ingrédients INCI - ce sont des descriptions de produit traduites.",
  "4. Les ingrédients INCI réels sont en MAJUSCULES (ou Title Case), en latin ou en anglais botanique (ex. `BUTYROSPERMUM PARKII`, `AQUA`, `GLYCERIN`, `TOCOPHEROL`), séparés par des virgules ou points-virgules.",
  "5. Ne corrige RIEN, ne traduis RIEN, ne remplace RIEN par un nom \"plausible\".",
  "6. Réponds en JSON strict.",
].join("\n");

const USER_BACK = `Extrais la liste INCI de cette photo de packaging.

Procédure :
- Localise le bloc "INGREDIENTS:" / "INGRÉDIENTS:" / "INCI:" / "COMPOSITION:".
- N'extrais QUE les ingrédients de ce bloc, dans l'ordre où ils apparaissent.
- Pour chaque mot illisible : OMETS-LE ou écris \`[?]\`. NE DEVINE PAS.
- Si tu vois un texte mais qu'il ressemble à de la description produit (phrases, langues nordiques/germaniques, slogans marketing), c'est PAS la liste INCI.

Format de réponse JSON :
- Si tu trouves la liste : { "found": true, "text": "AQUA, GLYCERIN, ...", "uncertain": ["[?MOT1]"] }
- Si pas de bloc INCI clairement identifiable : { "found": false, "reason": "<brève raison>" }`;

/**
 * 2e passe Vision : demande au modèle de lister UNIQUEMENT les ingrédients
 * qu'il n'a pas capturés au 1er passage. Fix le plus efficace pour les
 * longues listes. Renvoie la liste fusionnée, ou le 1er passage sur erreur.
 */
async function ocrSecondPass(
  imageBase64: string,
  mimeType: string,
  firstPass: string,
): Promise<string> {
  const system = [
    "Tu es un OCR spécialisé compositions INCI cosmétiques. Tu reçois une photo et une liste INCI partielle déjà extraite d'un autre passage.",
    "",
    "Ta mission : examine attentivement la photo et liste UNIQUEMENT les ingrédients du bloc INGREDIENTS / INCI qui ne sont PAS dans la liste partielle.",
    "",
    "RÈGLES :",
    "1. N'INVENTE RIEN. Si tu ne vois pas d'ingrédient supplémentaire lisible, renvoie une chaîne vide.",
    "2. Ne répète AUCUN ingrédient déjà dans la liste partielle.",
    "3. Ignore les paragraphes descriptifs multilingues.",
    "4. Renvoie une simple chaîne séparée par des virgules, JAMAIS du JSON.",
  ].join("\n");
  const userMsg = `Liste partielle déjà extraite :\n${firstPass}\n\nListe les ingrédients INCI restants visibles sur la photo (sans répéter ceux ci-dessus). Si rien d'autre n'est lisible, renvoie une chaîne vide.`;

  try {
    const r = await Promise.race([
      openai().chat.completions.create({
        model: AI_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: userMsg },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" } },
            ],
          },
        ],
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("second-pass timeout")), 15_000)),
    ]);
    const extra = (r.choices?.[0]?.message?.content ?? "").replace(/^["'`]+|["'`]+$/g, "").trim();
    if (!extra) return firstPass;
    return firstPass.endsWith(",") ? `${firstPass} ${extra}` : `${firstPass}, ${extra}`;
  } catch {
    return firstPass;
  }
}

/**
 * OCR de l'étiquette DOS (liste INCI). `sb` = client service-role pour le
 * lookup catalogue (validation). Cache par hash des octets ORIGINAUX.
 */
export async function ocrFromImageBase64(
  sb: SupabaseClient,
  imageBase64: string,
  mimeType: string,
  userId?: string | null,
): Promise<OcrResult> {
  const hash = (await sha256Hex(imageBase64)).slice(0, 32);
  const cacheKey = `ocr:${hash}`;
  const cached = await getCached<OcrResult>(cacheKey);
  if (cached) return cached;

  if (!hasOpenAI()) return { found: false, reason: "openai_unavailable" };

  // Pas de downscale/locate/crop (Sharp Node indisponible ; le client a déjà
  // redimensionné à 1600px). Passe OCR directe sur l'image fournie.
  // Ordre provider + sémantique logAI IDENTIQUES au web : OpenAI primaire
  // (timeout 20 s), fallback "tesseract" (le client basculera Tesseract.js).
  let value: OcrResult;
  try {
    value = await callWithFallback<OcrResult>({
      feature: "ocr",
      userId: userId ?? null,
      timeoutMs: 20_000,
      primary: async () => {
        const r = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_BACK },
            {
              role: "user",
              content: [
                { type: "text", text: USER_BACK },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" } },
              ],
            },
          ],
        });
        const raw = r.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw) as { found?: boolean; text?: string; uncertain?: string[]; reason?: string };
        let result: OcrResult;
        if (parsed.found && typeof parsed.text === "string") {
          result = {
            found: true,
            text: parsed.text.trim(),
            uncertain: Array.isArray(parsed.uncertain) ? parsed.uncertain : [],
          };
        } else {
          result = { found: false, reason: parsed.reason ?? "no_list_detected" };
        }
        return { value: result, tokensIn: r.usage?.prompt_tokens, tokensOut: r.usage?.completion_tokens };
      },
      // Pas de fallback serveur : le navigateur/mobile lancera Tesseract.js.
      fallback: async () => ({
        value: { found: false, reason: "openai_failed" } as OcrResult,
        provider: "tesseract",
      }),
    });
  } catch {
    return { found: false, reason: "openai_failed" };
  }

  // Multi-passe : valide d'abord, ne re-run que si la 1re passe est clairement
  // mince (rate < 0.70 ET dans la fenêtre 6-17 tokens). Même logique que le web.
  if (value.found) {
    try {
      value.validation = await validateOcrText(sb, value.text);
    } catch {
      // garde value sans validation
    }
    const ratePass1 = value.validation?.rate ?? 0;
    const needsSecondPass = shouldTriggerSecondPass(value.text) && ratePass1 < 0.7;
    if (needsSecondPass) {
      try {
        value.text = await ocrSecondPass(imageBase64, mimeType, value.text);
        try {
          value.validation = await validateOcrText(sb, value.text);
        } catch {
          // ignore
        }
      } catch {
        // ignore : on garde la 1re passe
      }
    }
  }

  void setCached(cacheKey, value);
  return value;
}

const SYSTEM_FRONT = [
  "Tu analyses la face avant d'un produit cosmétique. Tu extrais l'identité du produit telle qu'elle est imprimée sur le packaging.",
  "",
  "RÈGLES :",
  "1. N'INVENTE RIEN. Si un champ n'est pas lisible avec certitude, mets-le à null.",
  "2. `brand` : la marque (souvent en haut, en gros - ex. `L'Oréal`, `CeraVe`, `The Ordinary`, `Yves Rocher`). Garde la casse d'origine.",
  "3. `productName` : le nom de la gamme/produit (ex. `Effaclar Duo+`, `Foaming Cleanser`, `Niacinamide 10 % + Zinc 1 %`). Exclus la marque, les claims marketing (`hydrate 24h`), les volumes (`200 mL`) et les certifications (`bio`).",
  "4. `productType` : le type de produit en français court (ex. `nettoyant visage`, `crème hydratante`, `sérum`, `shampoing`, `gel douche`, `démaquillant`, `huile capillaire`). Choisis le terme le plus précis visible sur le packaging ; si non précisé, déduis-le des claims (mais reste prudent).",
  "5. Si la photo est floue, trop sombre, ou ne montre pas la face avant : renvoie `{ \"found\": false, \"reason\": \"<brève raison>\" }`.",
  "6. Réponds en JSON strict.",
].join("\n");

const USER_FRONT = `Extrais l'identité du produit visible sur cette photo de packaging (face avant).

Format de réponse JSON :
- Si lisible : { "found": true, "brand": "...", "productName": "...", "productType": "..." } (mets null pour les champs non lisibles)
- Si illisible : { "found": false, "reason": "<brève raison>" }`;

/** OCR de la face AVANT : identité produit (nom + marque + type). */
export async function ocrFrontFromImageBase64(
  imageBase64: string,
  mimeType: string,
  userId?: string | null,
): Promise<OcrFrontResult> {
  const hash = (await sha256Hex(imageBase64)).slice(0, 32);
  const cacheKey = `ocr-front:${hash}`;
  const cached = await getCached<OcrFrontResult>(cacheKey);
  if (cached) return cached;

  if (!hasOpenAI()) return { found: false, reason: "openai_unavailable" };

  // Ordre provider + sémantique logAI IDENTIQUES au web : OpenAI primaire
  // (timeout 15 s), fallback "tesseract".
  let value: OcrFrontResult;
  try {
    value = await callWithFallback<OcrFrontResult>({
      feature: "ocr",
      userId: userId ?? null,
      timeoutMs: 15_000,
      primary: async () => {
        const r = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_FRONT },
            {
              role: "user",
              content: [
                { type: "text", text: USER_FRONT },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" } },
              ],
            },
          ],
        });
        const raw = r.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw) as Partial<{
          found: boolean;
          brand: string | null;
          productName: string | null;
          productType: string | null;
          reason: string;
        }>;
        const cleanField = (v: unknown): string | null => {
          if (typeof v !== "string") return null;
          const t = v.trim();
          if (t.length === 0 || t.toLowerCase() === "null" || t === "-") return null;
          return t.slice(0, 200);
        };
        let result: OcrFrontResult;
        if (parsed.found === true) {
          result = {
            found: true,
            brand: cleanField(parsed.brand),
            productName: cleanField(parsed.productName),
            productType: cleanField(parsed.productType),
          };
          // Tout-null = échec, le caller doit ignorer.
          if (!result.brand && !result.productName && !result.productType) {
            result = { found: false, reason: "no_text_extracted" };
          }
        } else {
          result = { found: false, reason: parsed.reason ?? "front_not_detected" };
        }
        return { value: result, tokensIn: r.usage?.prompt_tokens, tokensOut: r.usage?.completion_tokens };
      },
      fallback: async () => ({
        value: { found: false, reason: "openai_failed" } as OcrFrontResult,
        provider: "tesseract",
      }),
    });
  } catch {
    return { found: false, reason: "openai_failed" };
  }

  void setCached(cacheKey, value);
  return value;
}
