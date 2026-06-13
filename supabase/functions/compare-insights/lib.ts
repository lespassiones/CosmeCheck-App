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

// v6 : portraits en langage courant (pas de noms INCI, pas de conseils d'action).
const PROMPT_VERSION = 6;

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
  opts: { profileBlock?: string | null; restrictionsBlock?: string | null; firstName?: string | null } = {},
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

  const firstName = opts.firstName ?? null;
  const profileSection = [opts.profileBlock, opts.restrictionsBlock].filter(Boolean).join("\n\n");

  const system =
    "Tu es un conseiller cosmétique bienveillant qui s'adresse directement à l'utilisateur. " +
    "Vocabulaire accessible à tous, de 15 à 80 ans — zéro jargon scientifique. " +
    "INTERDIT dans portraitA et portraitB : les noms d'ingrédients INCI en majuscules " +
    "(ALUMINUM CHLOROHYDRATE, DIMETHICONE, PARFUM, etc.). Traduis toujours en français courant : " +
    "'anti-transpirant puissant', 'silicone', 'parfum de synthèse', 'conservateur'. " +
    "INTERDIT partout : 'à tester', 'à utiliser avec précaution', 'recommandé', 'déconseillé', " +
    "'il vaut mieux', 'on vous conseille'. Tu informes UNIQUEMENT avec 'peut + conséquence' " +
    "(ex : 'peut irriter', 'peut boucher les pores', 'peut provoquer des rougeurs'). " +
    "Tu n'écris JAMAIS \"X est mieux que Y\" ou \"X est meilleur\". " +
    "Tu utilises TOUJOURS les vrais noms des produits, JAMAIS \"produit A\" / \"produit B\". " +
    NO_LONG_DASHES_RULE + " " +
    "Pas de marketing, pas d'emoji, pas de conseil médical. " +
    "Tu retournes UNIQUEMENT un objet JSON valide, sans markdown, sans texte autour.";

  const namePrefix = firstName ? `${firstName}, ` : "";

  const portraitInstruction = (productName: string) =>
    `1 à 2 phrases. Commence par "${namePrefix}${productName}" (utilise le vrai nom). ` +
    `Décris ce que fait concrètement ce produit (son rôle : protège, nettoie, hydrate…) ` +
    `puis cite son principal point d'attention en langage courant avec 'peut + conséquence'. ` +
    (profileSection
      ? `Si le produit contient un ingrédient problématique pour le profil fourni, dis-le explicitement.`
      : `Reste général : 'peut réagir sur les peaux sensibles', etc.`);

  const commonInstruction =
    `1 à 2 phrases. Mentionne UN point positif ET UN point négatif que les deux produits partagent. ` +
    `Utilise 'peut + conséquence' pour les points négatifs. En langage courant, ` +
    `pas de noms INCI. Tu peux écrire "les deux" ou citer les noms.`;

  const howToChooseInstruction = profileSection
    ? `1 à 2 phrases personnalisées${firstName ? ` pour ${firstName}` : ""} qui expliquent quel produit correspond mieux à son profil et pourquoi, en citant un élément concret du profil (type de peau, préoccupation). ` +
      `Utilise 'peut + conséquence'. JAMAIS 'meilleur', 'recommandé', 'à éviter'. Toujours les vrais noms.`
    : `1 à 2 phrases qui expliquent à qui s'adresse chacun des deux produits (type d'usage, type de peau). ` +
      `Ex : 'Si tu transpires beaucoup, ${a.name} bloque plus efficacement.' JAMAIS 'meilleur'. Toujours les vrais noms.`;

  const user = `Voici les données de deux produits à comparer. Rédige 4 champs courts.

${sideBlock("PRODUIT 1", a)}

${sideBlock("PRODUIT 2", b)}

NOMS À UTILISER DANS LE TEXTE (verbatim) :
- Produit 1 : "${a.name}"
- Produit 2 : "${b.name}"
${firstName ? `\nPRÉNOM DE L'UTILISATEUR : ${firstName}\n` : ""}${profileSection ? `\n${profileSection}\n` : ""}
JSON avec exactement ces 4 clés :

{
  "portraitA": "${portraitInstruction(a.name)}",
  "portraitB": "${portraitInstruction(b.name)}",
  "common": "${commonInstruction}",
  "howToChoose": "${howToChooseInstruction}"
}

CONTRAINTES ABSOLUES
- JSON valide uniquement, rien d'autre.
- 1 à 2 phrases max par champ, jamais de liste à puces.
- Zéro nom INCI en majuscules dans portraitA et portraitB.
- Zéro 'à tester', 'à utiliser avec précaution', 'recommandé', 'déconseillé'.
- Zéro 'produit A' / 'produit B' / 'A' / 'B' comme étiquette.
- Ne cite pas les notes /20, ne mentionne pas 'score' ou 'note'.`;

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
  profileOpts: { profileBlock?: string | null; restrictionsBlock?: string | null; firstName?: string | null } = {},
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
    firstName?: string | null;
  } = {},
): Promise<CompareInsights | null> {
  const profileOpts = {
    profileBlock: opts.profileBlock ?? null,
    restrictionsBlock: opts.restrictionsBlock ?? null,
    firstName: opts.firstName ?? null,
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
