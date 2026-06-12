/**
 * Compare insights — port de `CosmetWiki/lib/ai/compare.ts` +
 * `CosmetWiki/lib/text/shortenProductName.ts` vers Deno.
 *
 * Génère de courts portraits humains de deux produits + un "comment choisir ?".
 * Ne dit JAMAIS "A est mieux que B" : le lecteur déduit lui-même le bon choix.
 *
 * Caché par hash de la paire (ordonnée) de listes d'ingrédients dans
 * cosme_check.ai_cache. PROMPT_VERSION 4 (vrais noms produits, plus "A"/"B").
 */
import {
  AI_MODEL,
  callWithFallback,
  getCached,
  hasMistral,
  hasOpenAI,
  mistralChat,
  openai,
  setCached,
  sha256Hex,
} from "../_shared/aiClient.ts";
import { NO_LONG_DASHES_RULE, stripLongDashes } from "../_shared/sanitize.ts";

/** Sous-ensemble de AnalyseResponse réellement lu ici. */
export type AnalyseResultLike = {
  score: number;
  scoreLabel: string;
  counts: { vert: number; jaune: number; orange: number; rouge: number; matched: number };
  items: {
    position: number;
    input: string;
    name: string | null;
    colorRating: "Vert" | "Jaune" | "Orange" | "Rouge" | null;
    primaryFunction: string | null;
  }[];
};

export type CompareSideInput = {
  name: string;
  result: AnalyseResultLike;
};

export type CompareInsights = {
  portraitA: string;
  portraitB: string;
  common: string;
  howToChoose: string;
};

// v5 : personnalisation "Comment choisir ?" via profil peau + restrictions user.
const PROMPT_VERSION = 5;

// ── shortenProductName (port verbatim du web) ───────────────────────────────

const LOW_SIGNAL_WORDS = new Set<string>([
  "professionnel",
  "professional",
  "pro",
  "anti-casse",
  "anti-buildup",
  "anti-frizz",
  "anti-frisottis",
  "anti-chute",
  "anti-age",
  "anti-âge",
  "thermo-protecteur",
  "thermoprotector",
  "réparateur",
  "reparateur",
  "repair",
  "jelly",
  "cleansing",
  "shampoo",
  "shampooing",
  "spray",
  "230°c",
  "expression",
  "fusion",
  "care",
]);

function dropRepeatedPrefix(words: string[]): string[] {
  if (words.length >= 2 && words[0].toLowerCase() === words[1].toLowerCase()) {
    return words.slice(1);
  }
  return words;
}

function joinedLen(words: string[]): number {
  if (words.length === 0) return 0;
  return words.reduce((sum, w) => sum + w.length, 0) + (words.length - 1);
}

export function shortenProductName(raw: string, maxLen = 30): string {
  const name = raw.trim();
  if (!name) return name;
  if (name.length <= maxLen) return name;

  let words = dropRepeatedPrefix(name.split(/\s+/));

  const front: string[] = [];
  for (const w of words) {
    if (joinedLen([...front, w]) <= maxLen) front.push(w);
    else break;
  }
  if (front.length >= 2) return front.join(" ");

  words = words.filter((w) => !LOW_SIGNAL_WORDS.has(w.toLowerCase()));
  const front2: string[] = [];
  for (const w of words) {
    if (joinedLen([...front2, w]) <= maxLen) front2.push(w);
    else break;
  }
  if (front2.length >= 2) return front2.join(" ");
  if (front2.length === 1) return front2[0];

  return name.slice(0, maxLen - 1).trimEnd() + "…";
}

// ── Cache key (sha256 de la paire ordonnée) ─────────────────────────────────

function fingerprint(side: CompareSideInput): string {
  return side.result.items
    .map((i) => `${(i.name ?? i.input).trim().toUpperCase()}:${i.colorRating ?? "?"}`)
    .join("|");
}

async function makeCacheKey(
  a: CompareSideInput,
  b: CompareSideInput,
  profileFingerprint?: string,
): Promise<string> {
  const profileSuffix = profileFingerprint ? `|profile:${profileFingerprint}` : "";
  const raw = `${fingerprint(a)}<>${fingerprint(b)}|v=${PROMPT_VERSION}${profileSuffix}`;
  const hash = (await sha256Hex(raw)).slice(0, 32);
  return `compare:${hash}`;
}

// ── Prompt ──────────────────────────────────────────────────────────────────

function topIngredients(side: CompareSideInput, max: number): string[] {
  return side.result.items
    .slice()
    .sort((x, y) => x.position - y.position)
    .slice(0, max)
    .map((i) => `${i.name ?? i.input}${i.primaryFunction ? ` (${i.primaryFunction})` : ""}`);
}

function flagged(
  side: CompareSideInput,
  color: "Rouge" | "Orange" | "Jaune",
  max: number,
): string[] {
  return side.result.items
    .filter((i) => i.colorRating === color)
    .slice(0, max)
    .map((i) => `${i.name ?? i.input}${i.primaryFunction ? ` (${i.primaryFunction})` : ""}`);
}

function buildPrompt(
  a: CompareSideInput,
  b: CompareSideInput,
  opts: { profileBlock?: string | null; restrictionsBlock?: string | null } = {},
): { system: string; user: string } {
  const sideBlock = (label: string, side: CompareSideInput) => {
    const c = side.result.counts;
    return [
      `${label} : "${side.name}"`,
      `  Note : ${side.result.score.toFixed(1)}/20 (${side.result.scoreLabel})`,
      `  Comptes, vert: ${c.vert}, jaune: ${c.jaune}, orange: ${c.orange}, rouge: ${c.rouge} (sur ${c.matched} reconnus)`,
      `  3 premiers ingrédients : ${topIngredients(side, 3).join(" • ") || "(n.c.)"}`,
      `  Rouges : ${flagged(side, "Rouge", 4).join(" • ") || "(aucun)"}`,
      `  Oranges : ${flagged(side, "Orange", 4).join(" • ") || "(aucun)"}`,
      `  Jaunes : ${flagged(side, "Jaune", 5).join(" • ") || "(aucun)"}`,
    ].join("\n");
  };

  const system =
    "Tu écris une comparaison entre deux produits cosmétiques pour un consommateur français. " +
    "Style : un pote bien informé qui décrit, pas un juge qui tranche. " +
    "Phrases courtes, vocabulaire simple, pas de jargon scientifique. " +
    "Tu n'écris JAMAIS \"X est mieux que Y\", \"X est meilleur\", \"recommandé\", \"à éviter\", " +
    "\"premier choix\", \"vainqueur\" : tu décris ce que chaque produit est et à qui il s'adresse, " +
    "le lecteur déduit lui-même celui qui lui convient. " +
    "Tu utilises TOUJOURS les vrais noms des produits (ceux qui te sont donnés entre guillemets) " +
    "et JAMAIS les mots \"produit A\", \"produit B\", \"A\", \"B\" comme étiquettes - " +
    "ça parle bien plus à l'utilisateur final. " +
    NO_LONG_DASHES_RULE + " " +
    "Pas de marketing (idéal, généreux, agréable...), pas de description sensorielle, pas d'emoji, " +
    "pas de conseil médical. Tu peux mentionner une famille d'ingrédient simple (tensioactif, " +
    "alcool, conservateur, silicone, actif hydratant) si ça aide à comprendre. Tu retournes UNIQUEMENT " +
    "un objet JSON valide, sans markdown, sans texte autour.";

  const profileSection = [opts.profileBlock, opts.restrictionsBlock]
    .filter(Boolean)
    .join("\n\n");

  const howToChooseInstruction = profileSection
    ? `1 à 2 phrases personnalisées qui aident CE LECTEUR SPÉCIFIQUE à choisir en tenant compte de son profil (type de peau, préoccupations, restrictions). Dis explicitement quel produit correspond mieux à son profil et pourquoi, en citant un élément concret du profil (ex : "pour une peau sèche, …"). Pas de 'meilleur', pas de 'préfère X'. JAMAIS "A" / "B" / "produit A" / "produit B" - toujours les vrais noms.`
    : `1 à 2 phrases qui aident le lecteur à choisir SANS trancher. Ex : 'Si tu cherches un soin doux pour peau réactive, ${a.name} correspond à ce profil. Si tu privilégies un nettoyant moussant efficace, ${b.name} est conçu pour ça.' Pas de 'meilleur', pas de 'préfère X'. JAMAIS "A" / "B" / "produit A" / "produit B" - toujours les vrais noms.`;

  const user = `Voici les données de deux produits à comparer. Rédige 4 champs courts.

${sideBlock("PRODUIT 1", a)}

${sideBlock("PRODUIT 2", b)}

NOMS À UTILISER DANS LE TEXTE (verbatim, ne les modifie pas) :
- Pour le produit 1 : "${a.name}"
- Pour le produit 2 : "${b.name}"
${profileSection ? `\n${profileSection}\n` : ""}
Rends un JSON avec exactement ces 4 clés :

{
  "portraitA": "1 à 2 phrases qui décrivent la formule de \"${a.name}\" : son caractère (eau-glycérine, huileux, moussant, à base d'alcool…), ce qu'elle apporte, son point d'attention principal si pertinent. Cite \"${a.name}\" par son nom au moins une fois. Ne dis jamais qu'elle est bonne ou mauvaise.",
  "portraitB": "Idem pour \"${b.name}\". Cite \"${b.name}\" par son nom au moins une fois.",
  "common": "1 phrase concrète qui résume ce que les deux produits ont en commun (type de formule, point de vigilance partagé, ou rien de notable). Si rien d'intéressant en commun, dis 'Les deux suivent des logiques de formulation très différentes.' Tu peux écrire \"les deux produits\" ou citer les noms.",
  "howToChoose": "${howToChooseInstruction}"
}

CONTRAINTES
- JSON valide, rien d'autre.
- Chaque champ : 1 à 2 phrases max, jamais de liste à puces.
- Ne cite pas les notes /20.
- Ne mentionne pas le mot "score" ou "note".
- Ne dis pas qu'un produit est meilleur, gagnant, recommandé, déconseillé.
- Tu peux citer un ingrédient INCI en **gras** (avec doubles astérisques) si ça enrichit, max 2 par champ.
- INTERDIT : "produit A", "produit B", "le produit A", "le produit B", "A pourrait...", "B est conçu...". Utilise toujours les vrais noms ci-dessus.`;

  return { system, user };
}

function tryParse(raw: string): CompareInsights | null {
  if (!raw) return null;
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  try {
    const obj = JSON.parse(s) as Partial<CompareInsights>;
    if (
      typeof obj.portraitA === "string" &&
      typeof obj.portraitB === "string" &&
      typeof obj.common === "string" &&
      typeof obj.howToChoose === "string"
    ) {
      return {
        portraitA: stripLongDashes(obj.portraitA),
        portraitB: stripLongDashes(obj.portraitB),
        common: stripLongDashes(obj.common),
        howToChoose: stripLongDashes(obj.howToChoose),
      };
    }
  } catch {
    // fallthrough
  }
  return null;
}

async function callMistralFallback(
  a: CompareSideInput,
  b: CompareSideInput,
  profileOpts: { profileBlock?: string | null; restrictionsBlock?: string | null } = {},
): Promise<CompareInsights | null> {
  if (!hasMistral()) return null;
  const { system, user } = buildPrompt(a, b, profileOpts);
  const content = await mistralChat({
    temperature: 0.5,
    maxTokens: 700,
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return tryParse(content);
}

export async function generateCompareInsights(
  a: CompareSideInput,
  b: CompareSideInput,
  opts: {
    userId?: string | null;
    profileBlock?: string | null;
    restrictionsBlock?: string | null;
  } = {},
): Promise<CompareInsights | null> {
  const profileOpts = {
    profileBlock: opts.profileBlock ?? null,
    restrictionsBlock: opts.restrictionsBlock ?? null,
  };

  // Cache user-specific quand un profil est présent, global sinon.
  let profileFingerprint: string | undefined;
  if (profileOpts.profileBlock || profileOpts.restrictionsBlock) {
    const raw = (profileOpts.profileBlock ?? "") + "|" + (profileOpts.restrictionsBlock ?? "");
    profileFingerprint = (await sha256Hex(raw)).slice(0, 16);
  }
  const cacheKey = await makeCacheKey(a, b, profileFingerprint);

  const cached = await getCached<CompareInsights>(cacheKey);
  if (cached?.portraitA && cached?.portraitB) return cached;

  if (!hasOpenAI() && !hasMistral()) return null;

  const { system, user } = buildPrompt(a, b, profileOpts);

  try {
    const result = await callWithFallback<CompareInsights | null>({
      feature: "compare",
      userId: opts.userId ?? null,
      timeoutMs: 18_000,
      primary: async () => {
        if (!hasOpenAI()) throw new Error("openai disabled");
        const resp = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0.5,
          max_tokens: 700,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });
        return {
          value: tryParse(resp.choices?.[0]?.message?.content ?? ""),
          tokensIn: resp.usage?.prompt_tokens,
          tokensOut: resp.usage?.completion_tokens,
        };
      },
      fallback: async () => ({
        value: await callMistralFallback(a, b, profileOpts),
        provider: "mistral",
      }),
    });

    if (result) {
      void setCached(cacheKey, result);
    }
    return result;
  } catch {
    return null;
  }
}
