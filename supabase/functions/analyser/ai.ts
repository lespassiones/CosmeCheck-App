/**
 * Étapes IA de l'analyser (Deno) — ports de :
 *   - CosmetWiki/lib/ai/parseInci.ts   → parseInciWithAI
 *   - CosmetWiki/lib/ai/validate.ts    → validateInciInput
 *   - CosmetWiki/lib/ai/splitInci.ts   → splitInciWithGpt
 *   - CosmetWiki/lib/ai/typo.ts        → correctTypo
 *   - CosmetWiki/lib/ai/categorize.ts  → categorizeProduct
 *   - CosmetWiki/lib/ai/synthesis.ts   → generateSynthesis (prompt v11)
 *
 * Toutes les fonctions DÉGRADENT GRACIEUSEMENT : sans clé OpenAI/Mistral, elles
 * renvoient la valeur "neutre" (parse → null, validate → valid, typo → no match,
 * categorize → "autre", synthesis → null) sans jamais throw. Cela permet à
 * l'orchestrateur de tester la fast-path déterministe AVANT que les secrets IA
 * ne soient posés.
 *
 * Réutilise `_shared/aiClient.ts` (openai/mistralChat/cache/log/hash).
 */
import {
  AI_MODEL,
  getCached,
  hasMistral,
  hasOpenAI,
  logAI,
  mistralChat,
  openai,
  setCached,
  sha256Hex,
} from "../_shared/aiClient.ts";
import { NO_LONG_DASHES_RULE, stripLongDashes } from "../_shared/sanitize.ts";
import type { ProductCategory } from "./engine.ts";
import type { ColorRating } from "./score.ts";

const MISTRAL_MODEL = "mistral-small-latest";

// ─── parseInciWithAI ────────────────────────────────────────────────────────
export type ParseInciResult = { ingredients: string[]; provider: "mistral" | "openai" | "cache" };

const PARSE_PROMPT_VERSION = 2;
const PARSE_SYSTEM = `Tu es un parseur INCI (International Nomenclature of Cosmetic Ingredients). L'utilisateur a collé une liste d'ingrédients cosmétiques qui peut être mal formatée : mots collés sans séparateurs, ponctuation absente, fautes de frappe, sortie OCR. Reconstruis la liste selon la nomenclature INCI standard.

RÈGLES STRICTES :
- N'invente AUCUN ingrédient absent du texte source.
- INTERDIT de remplacer un nom INCI par son synonyme botanique, son ancien nom ou sa version "moderne", même si tu sais que c'est la même substance. Exemples interdits : "Spiraea ulmaria" → "Filipendula ulmaria", "Hamamelis virginiana water" → "Hamamelis virginiana leaf water", "Aloe barbadensis" → "Aloe vera", "Helianthus annuus" → "Sunflower". Tu retournes le nom EXACT donné par l'utilisateur. C'est le rôle du matcher en aval de gérer les synonymes, pas le tien.
- Tu peux corriger des FAUTES DE FRAPPE manifestes (ex : "glyceryne" → "glycerin", "tocoferol" → "tocopherol") mais PAS substituer un nom valide par un autre nom valide.
- Garde l'ordre exact d'apparition.
- Sépare correctement les ingrédients même s'ils sont collés sans espace ni virgule.
- Conserve les synonymes officiels DÉJÀ groupés par l'utilisateur comme UN seul ingrédient (ex : "AQUA/WATER/EAU", "PARFUM/FRAGRANCE"). Mais n'ajoute jamais tes propres synonymes.
- Conserve les colorants "CI 12345" tels quels.
- Ignore les codes/identifiants produit non-INCI (ex : "11075v0", numéros de lot, références internes).
- Les marqueurs "*", "**", "***", "°", "†" placés AVANT ou APRÈS un nom signalent un statut (bio, Ecocert, allergène réglementé UE, actif clé) et NE FONT PAS partie du nom INCI. Retire-les systématiquement.
- Quand la liste est collée sans virgule ni saut de ligne et que les ingrédients sont délimités uniquement par "*", "**" ou "***" (ex : "AQUA **AMMONIUM LAURYL SULFATE *PEG-40 GLYCERYL COCOATE"), traite chaque astérisque (simple, double ou triple) comme un séparateur d'ingrédient. Chaque suite de mots majuscules entre deux astérisques (ou entre le début/fin de chaîne et un astérisque) est UN ingrédient.
- Réponds UNIQUEMENT en JSON : { "ingredients": ["AQUA / WATER / EAU", "ALCOHOL DENAT.", ...] }
- Pas de commentaire, pas de markdown, juste le JSON.`;

function parseUserPrompt(text: string): string {
  return `Liste à parser :\n"""\n${text}\n"""`;
}

function parseIngredientsJson(content: string): string[] {
  const parsed = JSON.parse(content) as { ingredients?: unknown };
  const list = parsed.ingredients;
  if (!Array.isArray(list)) throw new Error("no ingredients[] in response");
  return list
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0 && s.length < 200);
}

export async function parseInciWithAI(
  text: string,
  userId?: string | null,
): Promise<ParseInciResult | null> {
  if (!text || text.trim().length < 3) return null;

  const hash = (await sha256Hex(`v${PARSE_PROMPT_VERSION}|${text.trim().toLowerCase()}`)).slice(0, 24);
  const key = `parse_inci:${hash}`;
  const cached = await getCached<string[]>(key);
  if (cached && cached.length > 0) return { ingredients: cached, provider: "cache" };

  // 1) Mistral primaire (gratuit)
  if (hasMistral()) {
    const t0 = Date.now();
    try {
      const content = await mistralChat({
        model: MISTRAL_MODEL,
        temperature: 0,
        responseFormat: { type: "json_object" },
        messages: [
          { role: "system", content: PARSE_SYSTEM },
          { role: "user", content: parseUserPrompt(text) },
        ],
      });
      const ingredients = parseIngredientsJson(content || "{}");
      logAI({ feature: "parse_inci", provider: "mistral", status: "success", duration_ms: Date.now() - t0, user_id: userId ?? null });
      if (ingredients.length > 0) {
        void setCached(key, ingredients);
        return { ingredients, provider: "mistral" };
      }
    } catch {
      logAI({ feature: "parse_inci", provider: "mistral", status: "fallback", duration_ms: Date.now() - t0, user_id: userId ?? null });
    }
  }

  // 2) OpenAI fallback
  if (hasOpenAI()) {
    const t0 = Date.now();
    try {
      const r = await openai().chat.completions.create({
        model: AI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PARSE_SYSTEM },
          { role: "user", content: parseUserPrompt(text) },
        ],
      });
      const ingredients = parseIngredientsJson(r.choices?.[0]?.message?.content ?? "{}");
      logAI({ feature: "parse_inci", provider: "openai", status: "success", duration_ms: Date.now() - t0, user_id: userId ?? null });
      if (ingredients.length > 0) {
        void setCached(key, ingredients);
        return { ingredients, provider: "openai" };
      }
    } catch {
      logAI({ feature: "parse_inci", provider: "openai", status: "error", duration_ms: Date.now() - t0, user_id: userId ?? null });
    }
  }

  return null;
}

// ─── validateInciInput ──────────────────────────────────────────────────────
export type ValidateResult = { valid: boolean; reason: string | null };

function quickInciSanityCheck(text: string): { ok: true } | { ok: false; reason: "too_short" | "garbage" } {
  const trimmed = text.trim();
  const commas = (trimmed.match(/,/g) ?? []).length;
  const longWords = (trimmed.match(/\b[A-Za-z]{4,}\b/g) ?? []).length;
  if (commas < 2 && longWords < 4) return { ok: false, reason: "too_short" };
  if (/^[asdfghjklqwertyuiop\s]{6,}$/i.test(trimmed)) return { ok: false, reason: "garbage" };
  return { ok: true };
}

export async function validateInciInput(text: string, userId?: string | null): Promise<ValidateResult> {
  const trimmed = text.trim();
  const quick = quickInciSanityCheck(trimmed);
  if (!quick.ok) {
    return {
      valid: false,
      reason: quick.reason === "too_short"
        ? "Texte trop court pour être une liste INCI."
        : "Texte non reconnu comme liste INCI.",
    };
  }
  const commas = (trimmed.match(/,/g) ?? []).length;
  const longWords = (trimmed.match(/\b[A-Za-z]{4,}\b/g) ?? []).length;
  if (commas >= 3 && longWords >= 6) return { valid: true, reason: null };

  const cacheKey = `validate:${trimmed.slice(0, 200).toLowerCase()}`;
  const cached = await getCached<ValidateResult>(cacheKey);
  if (cached) return cached;

  if (!hasOpenAI()) return { valid: true, reason: null };

  const system =
    "Tu es un classificateur strict : on te donne un texte court, tu réponds si oui ou non c'est une liste d'ingrédients INCI cosmétiques (noms anglais/latins séparés par virgules). Tu réponds en JSON `{valid: bool, reason: string}`. Une seule recette de cuisine, une suite de mots aléatoires, une phrase en prose → invalid. Une vraie liste comme 'Aqua, Glycerin, Phenoxyethanol' → valid.";
  const user = `Texte saisi : """${trimmed.slice(0, 800)}"""\n\nEst-ce une liste INCI plausible ? Réponds en JSON.`;

  const t0 = Date.now();
  try {
    const r = await openai().chat.completions.create({
      model: AI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const parsed = JSON.parse(r.choices?.[0]?.message?.content ?? "{}") as { valid?: boolean; reason?: string };
    const value: ValidateResult = { valid: Boolean(parsed.valid), reason: parsed.reason ?? null };
    logAI({ feature: "validate", provider: "openai", status: "success", duration_ms: Date.now() - t0, user_id: userId ?? null });
    void setCached(cacheKey, value);
    return value;
  } catch {
    // En cas d'échec IA : on NE bloque pas un vrai utilisateur.
    logAI({ feature: "validate", provider: "openai", status: "error", duration_ms: Date.now() - t0, user_id: userId ?? null });
    return { valid: true, reason: null };
  }
}

// ─── splitInciWithGpt ───────────────────────────────────────────────────────
export async function splitInciWithGpt(rawText: string): Promise<string | null> {
  if (!hasOpenAI()) return null;
  const text = rawText.trim();
  if (text.length < 20 || text.length > 6000) return null;

  const prompt = `Tu reçois une liste INCI cosmétique collée par un utilisateur sans virgules entre les ingrédients (texte recopié d'une étiquette physique ou OCR'd). Ré-insère UNE virgule entre chaque ingrédient distinct.

Règles strictes :
- N'INVENTE AUCUN ingrédient. Ne reformule pas. Garde la casse d'origine si possible.
- Les noms multilingues séparés par "/" (ex : "AQUA / WATER / EAU") sont des SYNONYMES du MÊME ingrédient — garde-les groupés (ou choisis la première forme), ne les sépare PAS en plusieurs ingrédients.
- Les noms INCI composés avec slash sans espace (ex : "DICAPRYLATE/DICAPRATE", "CAPRYLIC/CAPRIC TRIGLYCERIDE") sont UN SEUL ingrédient.
- Les marqueurs de concentration (0.12%, 1%) restent attachés au nom.
- Renvoie UNIQUEMENT la liste séparée par virgules, sans commentaire, sans préambule.
- Si tu ne reconnais pas le format ou que ce n'est pas une INCI, réponds NONE.

Texte brut :
"""
${text}
"""`;

  try {
    const r = await openai().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const out = (r.choices?.[0]?.message?.content ?? "").trim();
    if (!out || out.toUpperCase() === "NONE") return null;
    if ((out.match(/,/g) || []).length < 3) return null;
    return out;
  } catch {
    return null;
  }
}

// ─── correctTypo ────────────────────────────────────────────────────────────
export type TypoCandidate = { inci_id: number; name: string; primary_function: string | null };
export type TypoResult = {
  matchedInciId: number | null;
  matchedName: string | null;
  confidence: number;
  reason: string | null;
};

export async function correctTypo(
  token: string,
  candidates: TypoCandidate[],
  userId?: string | null,
): Promise<TypoResult> {
  const NONE: TypoResult = { matchedInciId: null, matchedName: null, confidence: 0, reason: null };
  if (candidates.length === 0) return NONE;

  const cacheKey = `typo:${token.toUpperCase()}`;
  const cached = await getCached<TypoResult>(cacheKey);
  if (cached) return cached;

  if (!hasOpenAI()) return NONE;

  const candidatesText = candidates
    .map((c, i) => `${i + 1}. ${c.name}${c.primary_function ? ` - ${c.primary_function}` : ""}`)
    .join("\n");
  const system =
    "Tu es un expert en nomenclature INCI cosmétique. Tu reçois un token mal orthographié ou douteux saisi par un utilisateur, et une liste de candidats INCI proches. Tu dois identifier lequel correspond le plus probablement au token, ou répondre qu'aucun ne correspond. Ne JAMAIS inventer un nom hors de la liste fournie. Si plusieurs candidats sont plausibles, choisis le plus probable. Si tu hésites fortement, retourne null. Réponse en JSON strict, sans texte hors JSON.";
  const user = `Token saisi : "${token}"\n\nCandidats INCI proches :\n${candidatesText}\n\nRéponds en JSON :\n{\n  "matched_index": <numéro 1..${candidates.length} ou null>,\n  "confidence": <nombre 0..1>,\n  "reason": "<phrase courte en français>"\n}`;

  const t0 = Date.now();
  try {
    const r = await openai().chat.completions.create({
      model: AI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const parsed = JSON.parse(r.choices?.[0]?.message?.content ?? "{}") as {
      matched_index: number | null;
      confidence: number;
      reason: string;
    };
    const idx = parsed.matched_index;
    const chosen = idx && idx >= 1 && idx <= candidates.length ? candidates[idx - 1] : null;
    const result: TypoResult = chosen
      ? {
          matchedInciId: chosen.inci_id,
          matchedName: chosen.name,
          confidence: Number((parsed.confidence ?? 0).toFixed(3)),
          reason: parsed.reason ?? null,
        }
      : { matchedInciId: null, matchedName: null, confidence: 0, reason: parsed.reason ?? null };
    logAI({ feature: "typo", provider: "openai", status: "success", duration_ms: Date.now() - t0, user_id: userId ?? null });
    void setCached(cacheKey, result);
    return result;
  } catch {
    logAI({ feature: "typo", provider: "openai", status: "error", duration_ms: Date.now() - t0, user_id: userId ?? null });
    return NONE;
  }
}

// ─── categorizeProduct ──────────────────────────────────────────────────────
const VALID_CATEGORIES = new Set<ProductCategory>([
  "creme_visage", "creme_corps", "shampooing", "apres_shampooing", "solaire",
  "maquillage", "nettoyant_visage", "deodorant", "parfum", "autre",
]);

export async function categorizeProduct(top5: string[], userId?: string | null): Promise<ProductCategory> {
  if (top5.length === 0) return "autre";
  const hash = (await sha256Hex(top5.map((s) => s.toUpperCase().trim()).join("|"))).slice(0, 24);
  const cacheKey = `categorize:${hash}`;
  const cached = await getCached<{ category: ProductCategory }>(cacheKey);
  if (cached?.category) return cached.category;

  if (!hasOpenAI()) return "autre";

  const system =
    "Tu es un expert cosmétique. À partir des 5 premiers ingrédients INCI d'un produit, identifie sa catégorie. Réponds en JSON strict avec une seule clé `category` dont la valeur est exactement l'une des catégories autorisées.";
  const user = `5 premiers ingrédients : ${top5.join(", ")}.\n\nCatégories autorisées (réponds avec la valeur exacte) :\n- creme_visage\n- creme_corps\n- shampooing\n- apres_shampooing\n- solaire\n- maquillage\n- nettoyant_visage\n- deodorant\n- parfum\n- autre\n\nJSON attendu : { "category": "<valeur>" }`;

  const t0 = Date.now();
  try {
    const r = await openai().chat.completions.create({
      model: AI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const parsed = JSON.parse(r.choices?.[0]?.message?.content ?? "{}") as { category?: string };
    const cat = (parsed.category ?? "autre") as ProductCategory;
    const value = VALID_CATEGORIES.has(cat) ? cat : "autre";
    logAI({ feature: "categorize", provider: "openai", status: "success", duration_ms: Date.now() - t0, user_id: userId ?? null });
    void setCached(cacheKey, { category: value });
    return value;
  } catch {
    logAI({ feature: "categorize", provider: "openai", status: "error", duration_ms: Date.now() - t0, user_id: userId ?? null });
    return "autre";
  }
}

// ─── generateSynthesis (prompt v11) ─────────────────────────────────────────
export type SynthesisInput = {
  enriched: {
    input_raw: string;
    name: string | null;
    color_rating: ColorRating | null;
    primary_function: string | null;
    tags: string[] | null;
    position_idx: number;
    threshold_label?: string | null;
  }[];
  counts: Record<string, number>;
  score: number;
  scoreLabel: string;
  observations: { label: string; status: "present" | "absent" | "info" | "warn"; count: number }[];
  productLabel: string | null;
  userId?: string | null;
};

const SYNTH_PROMPT_VERSION = 11;

function buildSynthesisPrompt(input: SynthesisInput): { system: string; user: string } {
  const red = input.enriched.filter((r) => r.color_rating === "Rouge");
  const orange = input.enriched.filter((r) => r.color_rating === "Orange");
  const yellow = input.enriched.filter((r) => r.color_rating === "Jaune");
  const green = input.enriched.filter((r) => r.color_rating === "Vert");
  const total =
    (input.counts.Vert ?? 0) + (input.counts.Jaune ?? 0) +
    (input.counts.Orange ?? 0) + (input.counts.Rouge ?? 0);

  const top3 = input.enriched
    .slice()
    .sort((a, b) => a.position_idx - b.position_idx)
    .slice(0, 3)
    .map((r) => `${r.name ?? r.input_raw}${r.primary_function ? ` (${r.primary_function})` : ""}`);

  const greenWithFunction = green
    .filter((r) => r.primary_function && r.name)
    .slice(0, 6)
    .map((r) => `- ${r.name} : ${r.primary_function}`);

  const fmt = (r: SynthesisInput["enriched"][number]) =>
    `- ${r.name ?? r.input_raw} : ${r.primary_function ?? "fonction inconnue"}`
    + `${r.tags && r.tags.length ? ` [tags: ${r.tags.slice(0, 3).join(", ")}]` : ""}`
    + `${r.threshold_label ? ` [position: ${r.threshold_label}]` : ""}`;

  const system =
    "Tu écris la synthèse d'une analyse cosmétique INCI pour un consommateur français.\n\n"
    + "TON & STYLE : comme un pote bien informé qui te parle franchement, sans tourner autour du pot. Phrases courtes, vocabulaire simple mais jamais enfantin. Tu peux dire \"franchement\", \"honnêtement\", \"au final\", \"bonne nouvelle\", \"là, attention\", \"tu peux respirer\", \"ya pas de mystère\". Tu utilises \"tu\" et la 2e personne. Pas d'emoji, pas de marketing (\"idéal\", \"généreux\", \"rassurant\", \"agréable\"), pas de description sensorielle (texture, odeur, fini), pas de conseil médical.\n\n"
    + "MISE EN FORME : **gras** UNIQUEMENT pour les noms INCI. Pas de titre, pas de préambule, pas de signature.\n\n"
    + NO_LONG_DASHES_RULE + "\n\n"
    + "ROUGES ET ORANGES : pour chaque rouge, fais 1 puce avec un DANGER CONCRET BREF (1 phrase). Pour les oranges :\n"
    + "- 1 à 2 oranges isolés → 1 puce par ingrédient avec un effet concret bref.\n"
    + "- 3 oranges OU plusieurs oranges de la MÊME famille (même tag) → 1 SEULE puce groupée qui les cite tous en **gras** et donne le mécanisme/danger commun en une phrase.\n\n"
    + "JAUNES : 1 à 3 jaunes notables = 1 puce courte chacun. Plus de 3 = regroupés en 1 puce \"À surveiller selon les peaux sensibles : NOM1, NOM2...\".";

  const openingRule =
    `L'utilisateur n'a renseigné ni profil ni restrictions. OUVERTURE OBLIGATOIRE : un hook factuel et concret sur le type de produit ou son caractère, basé sur les 3 premiers ingrédients. Exemple : "Un déo en spray bien classique." OU "Une formule légère dominée par l'eau et la glycérine." (pas générique, pas marketing).`;
  const closingRule =
    `CLOSING (DERNIÈRE PUCE, obligatoire) : 1 phrase de prise de recul factuelle SUIVIE d'un soft nudge à compléter le profil. Exemple : "- Au final, c'est un anti-transpirant efficace mais chargé en parfum. Tu peux remplir ton profil ou tes restrictions dans l'app si tu veux qu'on te dise précisément si ce produit te va."`;

  const user = `Rédige la synthèse de l'analyse INCI ci-dessous en suivant la STRUCTURE imposée.

STRUCTURE OBLIGATOIRE (deux blocs séparés par une ligne vide) :

BLOC 1 (prose, 2 à 3 phrases, pas de puce) :
- Phrase 1 (OUVERTURE) — règle :
  ${openingRule}
- Phrase 2 (CONSTAT CHIFFRÉ, naturel) : ${total === 0 ? "Aucun ingrédient n'a pu être reconnu dans la liste fournie. Dis-le simplement, sans utiliser de chiffres comme \"0 sur 0\"." : `"Sur les ${total} ingrédients identifiés, ${input.counts.Vert ?? 0} sont sans risque connu et ${(input.counts.Jaune ?? 0) + (input.counts.Orange ?? 0) + (input.counts.Rouge ?? 0)} méritent un coup d'œil." (varie la formulation, garde les chiffres).`}
- Phrase 3 (TRANSITION, courte) : "Voici ce qui mérite ton attention :" ou similaire.

BLOC 2 (puces, chaque ligne commence par "- ", 4 à 7 puces max) :
1. ROUGES : 1 puce par ingrédient rouge, avec un DANGER CONCRET BREF.
2. ORANGES : applique la règle de groupage du system prompt.
3. JAUNES : 1 à 3 → 1 puce chacun ; plus de 3 → 1 puce groupée.
4. BONUS optionnel (max 1) : "Bon à savoir" sur UN VERT notable. INTERDIT : ne jamais énumérer ce qui est absent.
5. CLOSING (DERNIÈRE PUCE, obligatoire) — règle :
   ${closingRule}

CONTRAINTES STRICTES :
- Total puces (bloc 2) : 4 à 7 max, closing comprise.
- Chaque puce : 1 à 2 phrases courtes.
- INTERDIT absolu : les verbes "soigne", "traite", "guérit", "cicatrise", "régénère", "répare", "restaure". Utilise à la place : "entretient la peau", "maintient en bon état", "hydrate", "adoucit", "protège", "reconstitue".
- Pas d'emoji, pas d'astérisque autre que les **gras INCI**.
- AUCUN tiret cadratin (—) ni demi-cadratin (–).

DONNÉES :
${input.productLabel ? `Produit : ${input.productLabel}` : "Produit : liste collée par l'utilisateur, pas de nom de produit fourni."}
Note : ${input.score.toFixed(1)}/20 (${input.scoreLabel})
Comptes : Vert=${input.counts.Vert ?? 0}, Jaune=${input.counts.Jaune ?? 0}, Orange=${input.counts.Orange ?? 0}, Rouge=${input.counts.Rouge ?? 0}, total reconnu=${total}.

3 premiers ingrédients :
${top3.length ? top3.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(non disponible)"}

ROUGES :
${red.length ? red.map(fmt).join("\n") : "(aucun)"}

ORANGE :
${orange.length ? orange.map(fmt).join("\n") : "(aucun)"}

JAUNES (jusqu'à 8 cités) :
${yellow.length ? yellow.slice(0, 8).map(fmt).join("\n") + (yellow.length > 8 ? `\n- et ${yellow.length - 8} autres` : "") : "(aucun)"}

VERTS notables :
${greenWithFunction.length ? greenWithFunction.join("\n") : "(aucun avec fonction connue)"}

Écris maintenant la synthèse (Bloc 1 prose, ligne vide, Bloc 2 puces). Pas de titre, pas de préambule, pas de signature.`;

  return { system, user };
}

async function makeSynthesisCacheKey(input: SynthesisInput): Promise<string> {
  const list = input.enriched
    .map((r) => `${(r.name ?? r.input_raw).trim().toUpperCase()}:${r.color_rating ?? "?"}`)
    .join("|");
  const productKey = input.productLabel ? `|p=${input.productLabel.toLowerCase()}` : "";
  const versionKey = `|v=${SYNTH_PROMPT_VERSION}`;
  const hash = (await sha256Hex(list + productKey + versionKey)).slice(0, 32);
  return `synthesis:${hash}`;
}

export async function generateSynthesis(input: SynthesisInput): Promise<string | null> {
  const cacheKey = await makeSynthesisCacheKey(input);
  const cached = await getCached<{ text: string }>(cacheKey);
  if (cached?.text) return cached.text;

  if (!hasOpenAI() && !hasMistral()) return null;

  const { system, user } = buildSynthesisPrompt(input);
  const t0 = Date.now();

  // 1) OpenAI primaire
  if (hasOpenAI()) {
    try {
      const resp = await openai().chat.completions.create({
        model: AI_MODEL,
        temperature: 0.55,
        top_p: 0.95,
        max_tokens: 900,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const raw = resp.choices?.[0]?.message?.content?.trim() ?? null;
      const value = raw ? stripLongDashes(raw) : null;
      logAI({ feature: "synthesis", provider: "openai", status: "success", duration_ms: Date.now() - t0, user_id: input.userId ?? null });
      if (value) void setCached(cacheKey, { text: value });
      return value;
    } catch {
      logAI({ feature: "synthesis", provider: "openai", status: "fallback", duration_ms: Date.now() - t0, user_id: input.userId ?? null });
    }
  }

  // 2) Mistral fallback
  if (hasMistral()) {
    try {
      const raw = await mistralChat({
        model: MISTRAL_MODEL,
        temperature: 0.55,
        maxTokens: 900,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const value = raw ? stripLongDashes(raw.trim()) : null;
      logAI({ feature: "synthesis", provider: "mistral", status: "fallback", duration_ms: Date.now() - t0, user_id: input.userId ?? null });
      if (value) void setCached(cacheKey, { text: value });
      return value;
    } catch {
      logAI({ feature: "synthesis", provider: "mistral", status: "error", duration_ms: Date.now() - t0, user_id: input.userId ?? null });
    }
  }

  return null;
}
