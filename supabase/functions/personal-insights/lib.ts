/**
 * personal-insights/lib.ts — génère 3 encarts PERSONNALISÉS (titre + description
 * + ton couleur) à partir d'une analyse INCI et du PROFIL complet de
 * l'utilisateur (objectifs, préoccupations, type de peau, allergies,
 * restrictions). Remplace l'ancienne « synthèse » par 3 blocs courts et
 * actionnables.
 *
 * Réutilise l'infra de la fonction `synthesis` (profil + restrictions +
 * checkRestrictions) et le client IA mutualisé (_shared/aiClient).
 *
 * Sortie : JSON STRICT { goals, skin, watch }, chaque bloc =
 *   { title: string, description: string, tone: "vert"|"ambre"|"rouge"|"neutre" }
 *
 * DÉGRADE GRACIEUSEMENT : sans clé IA → renvoie null (l'appelant gère).
 */
import {
  AI_MODEL,
  callWithFallback,
  getCached,
  hasMistral,
  hasOpenAI,
  mistralChat,
  MISTRAL_MODEL,
  openai,
  setCached,
  sha256Hex,
} from "../_shared/aiClient.ts";
import { stripLongDashes } from "../_shared/sanitize.ts";
import { buildPrompt, PERSONAL_PROMPT_VERSION, type PersonalInput } from "./prompt.ts";

// buildPrompt / PersonalInput / PERSONAL_PROMPT_VERSION vivent dans prompt.ts
// (pur, sans dépendance Deno) pour être testables en Jest. Ré-exportés ici pour
// conserver l'API historique du module.
export { buildPrompt, PERSONAL_PROMPT_VERSION } from "./prompt.ts";
export type { PersonalInput } from "./prompt.ts";

export type Tone = "vert" | "ambre" | "rouge" | "neutre";
export type Block = { title: string; description: string; tone: Tone };
export type PersonalBlocks = { goals: Block; skin: Block; watch: Block };

/** Clé de cache : ingrédients + profil + restrictions + version de prompt. */
export async function makePersonalCacheKey(input: PersonalInput): Promise<string> {
  const list = input.enriched
    .map((r) => `${(r.name ?? r.input_raw).trim().toUpperCase()}:${r.color_rating ?? "?"}${r.restriction_reason ? ":R" : ""}`)
    .join("|");
  const profileKey = input.profileBlock ? `|prof=${(await sha256Hex(input.profileBlock)).slice(0, 12)}` : "";
  const resKey = input.restrictionsBlock ? `|res=${(await sha256Hex(input.restrictionsBlock)).slice(0, 12)}` : "";
  const hash = (await sha256Hex(`${list}${profileKey}${resKey}|v=${PERSONAL_PROMPT_VERSION}`)).slice(0, 32);
  return `personal-insights:${hash}`;
}

/** Clé profil (persistée sur la ligne) : régénère si le profil change. */
export async function profileSignature(profileBlock: string | null, restrictionsBlock: string | null): Promise<string> {
  const p = profileBlock ? await sha256Hex(profileBlock) : "noprofile";
  const r = restrictionsBlock ? await sha256Hex(restrictionsBlock) : "norestr";
  return `v${PERSONAL_PROMPT_VERSION}:${p.slice(0, 12)}:${r.slice(0, 12)}`;
}

const TONES: Tone[] = ["vert", "ambre", "rouge", "neutre"];

/**
 * Filet de sécurité « langage grand public » : remplace les noms INCI courants
 * que le LLM pourrait recopier par des catégories compréhensibles. Best-effort.
 */
function plainifyIngredientNames(s: string): string {
  return s
    .replace(/sodium\s+(laureth|lauryl)\s+sulfate/gi, "agent lavant sulfaté")
    .replace(/\b(methyl|propyl|butyl|ethyl)paraben\b/gi, "conservateur (parabène)")
    .replace(/(methylchloroiso|methyliso)thiazolinone|phenoxyethanol/gi, "conservateur")
    .replace(/cetearyl\s+alcohol|behentrimonium\s*\w*/gi, "agent adoucissant")
    .replace(/zinc\s+pca/gi, "zinc")
    .replace(/\bpca\b/gi, "")
    .replace(/panthenol/gi, "agent apaisant")
    .replace(/tocopherol/gi, "vitamine E")
    .replace(/dimethicone/gi, "silicone")
    .replace(/glyceryl\s+\w+/gi, "émollient")
    // anti-survente déterministe (« idéal/parfait » → « adapté/très bon »)
    .replace(/\bidéales\b/gi, "adaptées")
    .replace(/\bidéaux\b/gi, "adaptés")
    .replace(/\bidéale\b/gi, "adaptée")
    .replace(/\bidéal\b/gi, "adapté")
    .replace(/\bparfaites\b/gi, "très bonnes")
    .replace(/\bparfaits\b/gi, "très bons")
    .replace(/\bparfaite\b/gi, "très bonne")
    .replace(/\bparfait\b/gi, "très bon")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function coerceBlock(raw: unknown, fallbackTitle: string): Block | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? plainifyIngredientNames(stripLongDashes(o.title)).slice(0, 60) : "";
  const description = typeof o.description === "string" ? plainifyIngredientNames(stripLongDashes(o.description)).slice(0, 200) : "";
  let tone = typeof o.tone === "string" ? (o.tone.trim().toLowerCase() as Tone) : "neutre";
  if (!TONES.includes(tone)) tone = "neutre";
  if (!title && !description) return null;
  return { title: title || fallbackTitle, description, tone };
}

/**
 * Invariants DURS appliqués côté code (le LLM est stochastique) :
 *  - watch ne peut JAMAIS être « rien à surveiller » s'il y a orange/rouge/restriction ;
 *    tone watch = rouge (rouge|restriction), ambre (orange seul), vert (rien).
 *  - tone goals borné par les couleurs : rouge si (rouge|>=3 orange), jamais vert si orange/rouge.
 */
function enforceInvariants(
  blocks: PersonalBlocks,
  ctx: {
    orange: number;
    red: number;
    restrictionHit: boolean;
    signalCats: string[];
    scoreTone?: string | null;
  },
): PersonalBlocks {
  const { orange, red, restrictionHit, signalCats, scoreTone } = ctx;
  const concerns = red > 0 || orange > 0 || restrictionHit;

  blocks.watch.tone = red > 0 || restrictionHit ? "rouge" : orange > 0 ? "ambre" : "vert";
  if (
    concerns &&
    /rien\s+à\s+surveiller|aucun\s+ingrédient|rien\s+à\s+signaler/i.test(
      `${blocks.watch.title} ${blocks.watch.description}`,
    )
  ) {
    blocks.watch.title = "Ingrédients à surveiller";
    blocks.watch.description = signalCats.length
      ? `Surveille : ${signalCats.join(", ")}.`
      : `Surveille ${orange + red} ingrédient(s) de cette formule.`;
  }

  if (red > 0 || orange >= 3) blocks.goals.tone = "rouge";
  else if (orange > 0 && blocks.goals.tone === "vert") blocks.goals.tone = "ambre";
  // Ancrage note globale : produit BIEN noté (vert) sans orange ni rouge -> goals
  // ne peut pas rester gris/ambre (contredirait la pastille verte). Un jaune seul
  // ne dégrade pas. Le prompt garantit déjà un TEXTE positif dans ce cas.
  else if (scoreTone === "green" && orange === 0 && red === 0 && blocks.goals.tone !== "vert") {
    blocks.goals.tone = "vert";
  }

  // description watch jamais vide
  if (!blocks.watch.description || !blocks.watch.description.trim()) {
    blocks.watch.description = concerns
      ? signalCats.length
        ? `Surveille : ${signalCats.join(", ")}.`
        : "Garde un œil sur certains ingrédients de cette formule."
      : "Rien d'inquiétant pour toi dans cette formule.";
  }
  return blocks;
}

function parseBlocks(raw: string | null): PersonalBlocks | null {
  if (!raw) return null;
  let jsonText = raw.trim();
  // Robustesse : extraire le 1er objet JSON si le modèle a ajouté du texte.
  const first = jsonText.indexOf("{");
  const last = jsonText.lastIndexOf("}");
  if (first > 0 || last < jsonText.length - 1) {
    if (first >= 0 && last > first) jsonText = jsonText.slice(first, last + 1);
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
  const goals = coerceBlock(obj.goals, "Tes objectifs");
  const skin = coerceBlock(obj.skin, "À quoi ça sert");
  const watch = coerceBlock(obj.watch, "À surveiller pour toi");
  if (!goals || !skin || !watch) return null;
  return { goals, skin, watch };
}

export async function generatePersonalBlocks(input: PersonalInput): Promise<PersonalBlocks | null> {
  const cacheKey = await makePersonalCacheKey(input);
  const cached = await getCached<PersonalBlocks>(cacheKey);
  if (cached?.goals && cached?.skin && cached?.watch) return cached;

  if (!hasOpenAI() && !hasMistral()) return null;

  const { system, user } = buildPrompt(input);

  try {
    const blocks = await callWithFallback<PersonalBlocks | null>({
      feature: "personal-insights",
      userId: input.userId ?? null,
      timeoutMs: 25_000,
      primary: async () => {
        if (!hasOpenAI()) throw new Error("openai disabled");
        const resp = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0.3,
          max_tokens: 600,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });
        return {
          value: parseBlocks(resp.choices?.[0]?.message?.content ?? null),
          tokensIn: resp.usage?.prompt_tokens,
          tokensOut: resp.usage?.completion_tokens,
        };
      },
      fallback: async () => {
        if (!hasMistral()) return { value: null, provider: "mistral" as const };
        const raw = await mistralChat({
          model: MISTRAL_MODEL,
          temperature: 0.3,
          maxTokens: 600,
          messages: [
            { role: "system", content: `${system}\n\nRéponds UNIQUEMENT avec l'objet JSON, rien d'autre.` },
            { role: "user", content: user },
          ],
        });
        return { value: parseBlocks(raw), provider: "mistral" as const };
      },
    });

    if (!blocks) return null;
    const enforced = enforceInvariants(blocks, {
      orange: input.counts.Orange ?? 0,
      red: input.counts.Rouge ?? 0,
      scoreTone: input.scoreTone ?? null,
      restrictionHit: input.restrictionMatches.length > 0,
      signalCats: [
        ...new Set(input.restrictionMatches.map((m) => m.label).filter(Boolean)),
        ...new Set(
          input.enriched
            .filter((r) => r.color_rating === "Orange" || r.color_rating === "Rouge")
            .map((r) => r.primary_function)
            .filter((f): f is string => Boolean(f)),
        ),
      ],
    });
    void setCached(cacheKey, enforced);
    return enforced;
  } catch {
    return null;
  }
}
