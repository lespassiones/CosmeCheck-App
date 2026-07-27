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
import {
  AGAINST_MAX,
  buildCompatLines,
  composeCompatScore,
  majorityByIngredient,
  negativeSubtitle,
  type CompatBreakdown,
  type CompatTone,
} from "./compat.ts";

// buildPrompt / PersonalInput / PERSONAL_PROMPT_VERSION vivent dans prompt.ts
// (pur, sans dépendance Deno) pour être testables en Jest. Ré-exportés ici pour
// conserver l'API historique du module.
export { buildPrompt, PERSONAL_PROMPT_VERSION } from "./prompt.ts";
export type { PersonalInput } from "./prompt.ts";

export type Tone = "vert" | "ambre" | "rouge" | "neutre";
export type Block = { title: string; description: string; tone: Tone };
export type PersonalBlocks = { goals: Block; skin: Block; watch: Block };

// ─── Score de compatibilité (juil 2026) ──────────────────────────────────────
// Les fonctions PURES (labels, tons, plafonds) vivent dans ./compat.ts (testable
// Jest). Ici : les types de sortie + le glue LLM (coerce + subtitle).
export type Compatibility = {
  score: number; // 0-100, entier
  label: string; // 1 des 10 paliers (dérivé du score → déterministe)
  tone: CompatTone; // couleur de l'anneau (dérivée du score)
  subtitle: string; // phrase IA affichée sous le score
  relevance: "personal" | "product_only";
  /** Détail affichable (base qualité + lignes signées). Absent sur l'ancien persisté. */
  breakdown?: CompatBreakdown;
};
export type PersonalResult = { blocks: PersonalBlocks; compatibility: Compatibility | null };

// Sortie IA v21 : des CONTRIBUTEURS (ingrédients verts OU jaunes qui servent le
// profil, sans distinction de couleur : un jaune bénéfique compte comme un vert)
// et des contre-indications ; aucun chiffre (le code calcule tout).
type RawContributor = { ingredient: string; need: string };
type RawAgainst = { ingredient: string; need: string };
type RawCompat = {
  contributors: RawContributor[];
  against: RawAgainst[];
  subtitle: string;
  relevance: "personal" | "product_only";
};

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
    .replace(/\bglycerine?\b/gi, "glycérine")
    .replace(/\baqua\b/gi, "eau")
    .replace(/salix\s+alba(\s+bark)?(\s+extract)?/gi, "extrait de saule")
    .replace(/butyrospermum\s+parkii(\s+butter)?/gi, "beurre de karité")
    .replace(/sodium\s+hyaluronate|hyaluronic\s+acid/gi, "acide hyaluronique")
    .replace(/niacinamide/gi, "niacinamide")
    .replace(/aloe\s+barbadensis(\s+leaf)?(\s+juice|\s+extract)?/gi, "aloe vera")
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

/** Valide/normalise l'objet compatibility renvoyé par le LLM (contributeurs v16). */
function coerceCompatibility(raw: unknown): RawCompat | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const relevance = o.relevance === "product_only" ? "product_only" : "personal";
  const subtitle = typeof o.subtitle === "string"
    ? plainifyIngredientNames(stripLongDashes(o.subtitle)).replace(/[.\s]+$/, "").slice(0, 90)
    : "";
  const cleanShort = (s: unknown, max: number): string =>
    typeof s === "string" ? plainifyIngredientNames(stripLongDashes(s)).trim().slice(0, max) : "";
  const contributors: RawContributor[] = Array.isArray(o.contributors)
    ? (o.contributors as unknown[])
      .map((m): RawContributor | null => {
        if (!m || typeof m !== "object") return null;
        const mm = m as Record<string, unknown>;
        const ingredient = cleanShort(mm.ingredient, 40);
        const need = cleanShort(mm.need, 60);
        if (!ingredient || !need) return null;
        return { ingredient, need };
      })
      .filter((m): m is RawContributor => m !== null)
      .slice(0, 10)
    : [];
  const against: RawAgainst[] = Array.isArray(o.against)
    ? (o.against as unknown[])
      .map((m): RawAgainst | null => {
        if (!m || typeof m !== "object") return null;
        const mm = m as Record<string, unknown>;
        const ingredient = cleanShort(mm.ingredient, 40);
        const need = cleanShort(mm.need, 60);
        if (!ingredient || !need) return null;
        return { ingredient, need };
      })
      .filter((m): m is RawAgainst => m !== null)
      .slice(0, 15) // borne large : le cap final (AGAINST_MAX) est appliqué dans enforce
    : [];
  return { contributors, against, subtitle, relevance };
}

/**
 * Applique les garde-fous DÉTERMINISTES (compat.ts) au score IA puis compose la
 * sortie. Le LLM propose ; finalizeCompatScore borne (restrictions + couleurs)
 * et fige les 10 mots ; ici on ajoute le sous-titre (avec repli).
 */
function enforceCompatibility(
  compat: RawCompat | null,
  ctx: {
    orange: number;
    red: number;
    restrictionMatches: PersonalInput["restrictionMatches"];
    /** Familles DÉDUITES du profil détectées dans le produit (mêmes -8 que les
     *  restrictions cochées, dédoublonnées par slug contre les cochées). */
    inferredMatches?: PersonalInput["restrictionMatches"];
    productOnly?: boolean;
    scoreOver20?: number;
    forcedAgainst?: { name: string; need: string }[];
  },
): Compatibility | null {
  if (!compat) return null;
  // ANTI-DOUBLE-COMPTAGE : un ingrédient déjà pénalisé comme RESTRICTION (-8)
  // ne peut pas être re-pénalisé en contre-indication (-5). Match par nom
  // (inclusion bidirectionnelle, insensible à la casse).
  // INSENSIBLE AUX ACCENTS : le match restriction porte l'INCI brut
  // (« Dimethicone »), l'IA écrit le nom en français (« Diméthicone ») → sans
  // dé-accentuation l'inclusion échouait et le silicone était compté 2×
  // (-5 contre-indication ET -8 restriction famille). Fix calcul juil 2026.
  const norm = (s: string | null | undefined) =>
    (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const restrictedNames = [...ctx.restrictionMatches, ...(ctx.inferredMatches ?? [])]
    .flatMap((m) => [m.inciName, m.label])
    .map(norm)
    .filter(Boolean);
  const isRestricted = (n: string) => {
    const nn = norm(n);
    return nn.length > 0 && restrictedNames.some((r) => r.includes(nn) || nn.includes(r));
  };
  // Contre-indications GARANTIES (filets code) : PRIORITAIRES et fiables. On
  // écarte celles déjà couvertes par une restriction (pénalisée -8 séparément).
  const forced = (ctx.forcedAgainst ?? [])
    .map((f) => ({ name: f.name, need: f.need }))
    .filter((f) => !isRestricted(f.name.toLowerCase().trim()));
  // Contre-indications IA : on retire une éventuelle RESTRICTION (double-comptage
  // -5/-8, trahie par le mot « restriction » dans le besoin) et les doublons d'un forced.
  const aiAgainst = compat.against
    .filter((a) => !/restriction/i.test(a.need))
    .map((a) => ({ name: a.ingredient, need: a.need }))
    .filter((a) => {
      const n = a.name.toLowerCase().trim();
      if (isRestricted(n)) return false;
      return !forced.some((f) => { const fn = f.name.toLowerCase().trim(); return fn.includes(n) || n.includes(fn); });
    });
  const againstInputs = [...forced, ...aiAgainst].slice(0, AGAINST_MAX);
  // ANTI-CONTRADICTION : un ingrédient « à éviter » ne peut PAS être aussi un
  // « actif utile » (vu E2E : huile de coco comptée en bonus ET comédogène acné).
  const contributors = compat.contributors
    .map((c) => ({ name: c.ingredient }))
    .filter((c) => {
      const n = c.name.toLowerCase().trim();
      return !againstInputs.some((a) => { const an = a.name.toLowerCase().trim(); return an.includes(n) || n.includes(an); });
    });
  const iaLines = buildCompatLines({ contributors, against: againstInputs });
  // Restrictions COCHÉES distinctes présentes → libellés (une ligne -8 chacune).
  // On retient les slugs de famille cochés pour ne PAS re-pénaliser une famille
  // déjà cochée via l'inférence.
  const seen = new Set<string>();
  const checkedFamilySlugs = new Set<string>();
  const restrictionLabels: string[] = [];
  for (const m of ctx.restrictionMatches) {
    const key = `${m.kind}:${m.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (m.kind === "family" && m.slug) checkedFamilySlugs.add(m.slug);
    restrictionLabels.push(m.label);
  }
  // Sensibilités DÉDUITES du profil détectées dans le produit → MÊME -8, MAIS
  // uniquement pour les familles NON déjà cochées (sinon double -8). Dédup par slug.
  const inferredSeen = new Set<string>();
  const inferredRestrictionLabels: string[] = [];
  for (const m of ctx.inferredMatches ?? []) {
    if (!m.slug || checkedFamilySlugs.has(m.slug) || inferredSeen.has(m.slug)) continue;
    inferredSeen.add(m.slug);
    inferredRestrictionLabels.push(m.label);
  }
  const { score, label, tone, breakdown } = composeCompatScore({
    scoreOver20: ctx.scoreOver20 ?? 0,
    orange: ctx.orange,
    red: ctx.red,
    iaLines,
    inferredRestrictionLabels,
    restrictionLabels,
    productOnly: ctx.productOnly,
  });
  // La relevance AFFICHÉE suit le verdict DÉTERMINISTE (productOnly), pas le
  // champ IA : le header (« Pour toi » / « Qualité ») reste cohérent avec la
  // base réelle du score.
  const relevance = typeof ctx.productOnly === "boolean"
    ? (ctx.productOnly ? "product_only" : "personal")
    : compat.relevance;
  // Score < 60 → sous-titre NÉGATIF déterministe (jamais un bénéfice sous un
  // score faible). Sinon : sous-titre IA (avec repli neutre).
  const negative = negativeSubtitle({
    score,
    restrictionLabels,
    inferredCount: inferredRestrictionLabels.length,
    against: againstInputs,
    orange: ctx.orange,
    red: ctx.red,
    productOnly: ctx.productOnly,
  });
  let subtitle = negative
    ?? (compat.subtitle && compat.subtitle.trim()
      ? compat.subtitle
      : relevance === "personal"
        ? "d'après ton profil"
        : "d'après la qualité de la formule");
  // FILET product_only : l'IA n'a pas le droit d'attribuer un besoin personnel
  // à un produit hors profil (« ton besoin d'hydratation buccale » sur profil
  // vide, vu en campagne E2E). Le sous-titre négatif (<60), lui, est légitime.
  if (!negative && relevance === "product_only" && /\b(ton|ta|tes)\b/i.test(subtitle)) {
    subtitle = "d'après la qualité de la formule";
  }
  // FILET allergie : si une contre-indication forcée vient d'une allergie
  // déclarée, elle PRIME sur un sous-titre IA positif (même à score ≥ 60).
  const allergyHit = againstInputs.find((a) => a.need.startsWith("ton allergie"));
  if (!negative && allergyHit) {
    subtitle = `${allergyHit.name.toLowerCase()} présent malgré ${allergyHit.need}`;
  }
  return { score, label, tone, subtitle, relevance, breakdown };
}

function parsePersonal(
  raw: string | null,
): { blocks: PersonalBlocks; compat: RawCompat | null } | null {
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
  return { blocks: { goals, skin, watch }, compat: coerceCompatibility(obj.compatibility) };
}

export async function generatePersonalBlocks(input: PersonalInput): Promise<PersonalResult | null> {
  const cacheKey = await makePersonalCacheKey(input);
  const cached = await getCached<PersonalResult>(cacheKey);
  if (cached?.blocks?.goals && cached.blocks.skin && cached.blocks.watch) return cached;

  if (!hasOpenAI() && !hasMistral()) return null;

  const { system, user } = buildPrompt(input);

  try {
    const parsed = await callWithFallback<{ blocks: PersonalBlocks; compat: RawCompat | null } | null>({
      feature: "personal-insights",
      userId: input.userId ?? null,
      timeoutMs: 25_000,
      primary: async () => {
        if (!hasOpenAI()) throw new Error("openai disabled");
        // SELF-CONSISTENCY (assurance user) : 3 appels EN PARALLÈLE (seeds
        // distincts, température basse mais non nulle pour que le vote serve),
        // puis consensus MAJORITAIRE 2/3 sur contributors / against. Les blocs
        // texte viennent du premier run valide. Coût ×3 à
        // la PREMIÈRE génération uniquement (le cache fige le consensus).
        const callOnce = (seed: number) =>
          openai().chat.completions.create({
            model: AI_MODEL,
            temperature: 0.2,
            seed,
            max_tokens: 700,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          });
        const settled = await Promise.allSettled([callOnce(11), callOnce(23), callOnce(37)]);
        let tokensIn = 0;
        let tokensOut = 0;
        const runs: { blocks: PersonalBlocks; compat: RawCompat | null }[] = [];
        for (const s of settled) {
          if (s.status !== "fulfilled") continue;
          tokensIn += s.value.usage?.prompt_tokens ?? 0;
          tokensOut += s.value.usage?.completion_tokens ?? 0;
          const p = parsePersonal(s.value.choices?.[0]?.message?.content ?? null);
          if (p) runs.push(p);
        }
        // Tous les appels OpenAI ont échoué (ex. quota 429) → on THROW pour que
        // callWithFallback bascule sur le FALLBACK MISTRAL. Auparavant on renvoyait
        // `null` (une « réussite » vide) → le fallback était shunté → 503. (fix 27 juil 2026)
        if (!runs.length) throw new Error("openai_all_failed");
        const compats = runs.map((r) => r.compat).filter((c): c is RawCompat => c !== null);
        const compat: RawCompat | null = compats.length
          ? {
            contributors: majorityByIngredient(compats.map((c) => c.contributors)).slice(0, 10),
            against: majorityByIngredient(compats.map((c) => c.against)).slice(0, 15),
            subtitle: compats[0].subtitle,
            relevance: compats[0].relevance,
          }
          : null;
        return { value: { blocks: runs[0].blocks, compat }, tokensIn, tokensOut };
      },
      fallback: async () => {
        if (!hasMistral()) return { value: null, provider: "mistral" as const };
        const raw = await mistralChat({
          model: MISTRAL_MODEL,
          temperature: 0.2,
          maxTokens: 700,
          messages: [
            { role: "system", content: `${system}\n\nRéponds UNIQUEMENT avec l'objet JSON, rien d'autre.` },
            { role: "user", content: user },
          ],
        });
        return { value: parsePersonal(raw), provider: "mistral" as const };
      },
    });

    if (!parsed) return null;
    const orange = input.counts.Orange ?? 0;
    const red = input.counts.Rouge ?? 0;
    const blocks = enforceInvariants(parsed.blocks, {
      orange,
      red,
      scoreTone: input.scoreTone ?? null,
      restrictionHit: input.restrictionMatches.length > 0 || (input.inferredRestrictionMatches?.length ?? 0) > 0,
      signalCats: [
        ...new Set(input.restrictionMatches.map((m) => m.label).filter(Boolean)),
        ...new Set((input.inferredRestrictionMatches ?? []).map((m) => m.label).filter(Boolean)),
        ...new Set(
          input.enriched
            .filter((r) => r.color_rating === "Orange" || r.color_rating === "Rouge")
            .map((r) => r.primary_function)
            .filter((f): f is string => Boolean(f)),
        ),
      ],
    });
    const compatibility = enforceCompatibility(parsed.compat, {
      orange,
      red,
      restrictionMatches: input.restrictionMatches,
      inferredMatches: input.inferredRestrictionMatches,
      productOnly: input.productOnly,
      scoreOver20: input.score,
      forcedAgainst: input.forcedAgainst,
    });
    const result: PersonalResult = { blocks, compatibility };
    void setCached(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}
