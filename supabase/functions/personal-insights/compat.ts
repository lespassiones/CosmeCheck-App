/**
 * personal-insights/compat.ts — logique PURE du score de compatibilité :
 * les 10 paliers (labels), la couleur (ton) et le CADRE déterministe
 * (plafonds couleurs + pénalité restrictions + plancher qualité). Aucune
 * dépendance Deno → testable en Jest (comme prompt.ts). Le LLM propose un
 * score ; ces fonctions le bornent et figent le vocabulaire pour garantir la
 * parité mobile / web.
 *
 * BARÈME v21 (fixé par le user, juil 2026) :
 *  - +2 par ingrédient UTILE au profil (VERT ou JAUNE : un jaune bénéfique,
 *    ex. acide salicylique pour l'acné, compte comme un vert), listé par l'IA, cap +20
 *  - AUCUN malus pour un jaune SANS lien (neutre/technique) : seuls les VRAIS
 *    dangers retirent des points (la qualité /20 pénalise déjà les jaunes)
 *  - -5 par contre-indication personnelle (IA + filets code), max 2
 *  - 1-2 ingrédients orange  → plafond 69
 *  - ≥3 oranges ou ≥1 rouge  → plafond 59 (pas de malus individuel : déjà plafonnés)
 *  - chaque restriction DISTINCTE présente → -8 points
 *  - formule propre (0 rouge, 0 restriction) → plancher = 60 % de la qualité
 *  - produit hors profil (product_only) → base = qualité (note/20), pas l'IA
 */

export type CompatTone = "rouge" | "orange" | "jaune" | "vert";

/**
 * 10 paliers de 10 (0-9 … 90-100) — échelle « adapté » (choisie par le user) :
 * sous 60 on ne dit PLUS « compatible » en positif ; sous 20 verdict franc
 * sans alarmisme.
 */
export const COMPAT_LABELS = [
  "Incompatible",
  "À éviter pour toi",
  "Pas adapté",
  "Très peu adapté",
  "Peu adapté",
  "Moyennement adapté",
  "Plutôt compatible",
  "Compatible",
  "Très compatible",
  "Totalement compatible",
] as const;

export function labelForScore(s: number): string {
  return COMPAT_LABELS[Math.max(0, Math.min(9, Math.floor(s / 10)))];
}

export function toneForScore(s: number): CompatTone {
  return s < 30 ? "rouge" : s < 50 ? "orange" : s < 70 ? "jaune" : "vert";
}

/** Une ligne du détail : bonus (+) ou malus (-) nommé. */
export type CompatLine = { label: string; points: number };
/** Détail affichable du calcul : base qualité + lignes signées. */
export type CompatBreakdown = { base: number; lines: CompatLine[] };

// Barème v21 (fixé par le user) :
export const CONTRIB_BONUS_PER = 2; // +2 par ingrédient UTILE au profil (vert OU jaune)
export const CONTRIB_BONUS_CAP = 20; // plafonné à +20 (10 actifs)
export const AGAINST_MALUS = 5; // -5 par contre-indication personnelle
export const AGAINST_MAX = 2; // 2 contre-indications max
export const RESTRICTION_MALUS = 8; // -8 par restriction distincte présente

/** Plafond « couleurs ». */
export function colorCeiling(orange: number, red: number): number {
  if (red > 0) return 59; // un rouge : « moyennement adapté » max
  if (orange >= 3) return 59; // 3 oranges et plus : idem
  if (orange >= 1) return 69; // 1-2 oranges : « plutôt compatible » max
  return 100;
}

/**
 * Note /20 → score qualité 0-100. C'est la BASE du modèle additif : le score
 * part TOUJOURS de la qualité réelle du produit (jamais d'un chiffre inventé
 * par l'IA), puis les bonus/malus IA et les malus déterministes s'appliquent.
 */
export function qualityScore(scoreOver20: number): number {
  return Math.max(0, Math.min(100, Math.round((scoreOver20 / 20) * 100)));
}

/**
 * Sous-titre NÉGATIF forcé quand le score final est < 60 (demande user) : sous
 * ce seuil, la phrase se concentre sur le danger, JAMAIS sur un bénéfice
 * (incohérence vue en prod : 0 % avec « répond à ton objectif… »).
 * Cascade : restrictions → contre-indication → couleurs → qualité faible.
 * Renvoie null si score ≥ 60 (on garde alors le sous-titre de l'IA).
 */
export function negativeSubtitle(ctx: {
  score: number;
  restrictionLabels: string[];
  against: AgainstInput[];
  orange: number;
  red: number;
}): string | null {
  if (ctx.score >= 60) return null;
  if (ctx.restrictionLabels.length === 1) {
    return `contient une de tes restrictions : ${ctx.restrictionLabels[0].toLowerCase()}`;
  }
  if (ctx.restrictionLabels.length > 1) {
    return `contient ${ctx.restrictionLabels.length} de tes restrictions`;
  }
  if (ctx.against.length > 0) {
    return `${ctx.against[0].name.toLowerCase()} déconseillé pour ${ctx.against[0].need}`;
  }
  if (ctx.red > 0 || ctx.orange > 0) return "formule pénalisée par des ingrédients à risque";
  return "la qualité de la formule est insuffisante";
}

export type ContributorInput = { name: string };
export type AgainstInput = { name: string; need: string };

/**
 * VOTE MAJORITAIRE (self-consistency) : garde les éléments cités dans au moins
 * ⌈n/2⌉ des n runs LLM (2/3 pour 3 runs). Un oubli ponctuel est rattrapé, une
 * hallucination ponctuelle est éliminée → la PREMIÈRE génération (celle qui
 * sera figée en cache) est un consensus, pas un tirage. Dédup par ingrédient
 * normalisé ; l'objet conservé vient du premier run qui le cite.
 */
export function majorityByIngredient<T extends { ingredient: string }>(
  lists: T[][],
): T[] {
  const runs = lists.length;
  if (runs === 0) return [];
  if (runs === 1) return lists[0];
  const majority = Math.ceil(runs / 2);
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const count = new Map<string, { n: number; item: T }>();
  for (const list of lists) {
    const seen = new Set<string>();
    for (const item of list) {
      const k = norm(item.ingredient);
      if (!k || seen.has(k)) continue; // un vote max par run
      seen.add(k);
      const e = count.get(k);
      if (e) e.n++;
      else count.set(k, { n: 1, item });
    }
  }
  return [...count.values()].filter((e) => e.n >= majority).map((e) => e.item);
}

/**
 * Construit les lignes IA du barème v21 à partir des CONTRIBUTEURS listés par
 * l'IA (caps appliqués À LA CONSTRUCTION → les lignes somment exactement) :
 *  - 1 ligne agrégée « N actifs utiles à ton profil : a, b… » = +2 par actif
 *    UTILE, VERT OU JAUNE (un jaune bénéfique compte comme un vert), cap +20 ;
 *  - 1 ligne par contre-indication « X : à éviter pour <besoin> » = -5, max 2.
 * Un ingrédient SANS lien avec le profil (neutre/technique) n'a AUCUN malus : la
 * note qualité /20 pénalise déjà les jaunes ; seuls les VRAIS dangers (contre-
 * indications ici, restrictions dans composeCompatScore) retirent des points.
 */
export function buildCompatLines(input: {
  contributors: ContributorInput[];
  against: AgainstInput[];
}): CompatLine[] {
  const lines: CompatLine[] = [];

  if (input.contributors.length > 0) {
    const pts = Math.min(input.contributors.length * CONTRIB_BONUS_PER, CONTRIB_BONUS_CAP);
    const names = input.contributors.map((c) => c.name);
    const shown = names.slice(0, 4).join(", ");
    const suffix = names.length > 4 ? "…" : "";
    const s = input.contributors.length > 1 ? "s" : "";
    lines.push({ label: `${input.contributors.length} actif${s} utile${s} à ton profil : ${shown}${suffix}`, points: pts });
  }

  for (const a of input.against.slice(0, AGAINST_MAX)) {
    const name = a.name.charAt(0).toUpperCase() + a.name.slice(1);
    lines.push({ label: `${name} : à éviter pour ${a.need}`, points: -AGAINST_MALUS });
  }

  return lines;
}

/**
 * MOTEUR ADDITIF (choisi par le user, juil 2026) :
 *   score = base QUALITÉ (note/20 × 5)
 *         + bonus/malus IA nommés (matchs profil, capés ±20 ; ignorés en
 *           product_only puisqu'il n'y a pas de profil pertinent)
 *         → plafond couleurs (matérialisé comme une ligne si actif)
 *         → -8 par restriction distincte (une ligne par restriction)
 *         → plancher qualité si formule propre → clamp [0,100].
 * Renvoie aussi le BREAKDOWN affichable (base + lignes) : les lignes somment
 * au score final, au clamp 0/100 et au plancher près.
 */
export function composeCompatScore(ctx: {
  scoreOver20: number;
  orange: number;
  red: number;
  /** Bonus/malus IA (mode personal) : label + points signés (±5 / ±10). */
  iaLines: CompatLine[];
  /** Libellés des restrictions DISTINCTES présentes (une ligne de -8 chacune). */
  restrictionLabels: string[];
  productOnly?: boolean;
}): { score: number; label: string; tone: CompatTone; breakdown: CompatBreakdown } {
  const base = qualityScore(ctx.scoreOver20);
  // Les lignes IA arrivent déjà bornées par construction (buildCompatLines).
  const ia = ctx.productOnly ? [] : ctx.iaLines;
  const lines: CompatLine[] = [...ia];
  let running = base + ia.reduce((s, l) => s + l.points, 0);

  // Plafond couleurs — visible dans le détail UNIQUEMENT quand un VRAI plafond
  // (des oranges/rouges) rabote le score. Sans orange ni rouge, colorCeiling
  // vaut 100 : dépasser 100 n'est alors qu'un simple clamp au maximum (géré plus
  // bas), PAS un plafond → on n'affiche jamais l'absurde « Plafond : 0 orange ».
  const ceiling = colorCeiling(ctx.orange, ctx.red);
  if (ceiling < 100 && running > ceiling) {
    const capLabel = ctx.red > 0
      ? `Plafond : ${ctx.red} ingrédient${ctx.red > 1 ? "s" : ""} rouge${ctx.red > 1 ? "s" : ""}`
      : `Plafond : ${ctx.orange} ingrédient${ctx.orange > 1 ? "s" : ""} orange`;
    lines.push({ label: capLabel, points: ceiling - running });
    running = ceiling;
  }

  // -8 par restriction distincte, une ligne nommée chacune.
  for (const r of ctx.restrictionLabels) {
    lines.push({ label: `${r} : ta restriction`, points: -RESTRICTION_MALUS });
    running -= RESTRICTION_MALUS;
  }

  // PLANCHER : une formule PROPRE (0 restriction, 0 rouge) ne peut PAS être
  // « incompatible » ; elle reste au moins proportionnelle à sa qualité.
  const clean = ctx.restrictionLabels.length === 0 && ctx.red === 0;
  const floor = clean ? Math.min(ceiling, Math.round(base * 0.6)) : 0;
  const score = Math.max(floor, Math.min(100, Math.max(0, Math.round(running))));
  return { score, label: labelForScore(score), tone: toneForScore(score), breakdown: { base, lines } };
}
