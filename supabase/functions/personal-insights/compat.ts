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
 *  - produit hors profil (product_only) → score = qualité (note/20) SEULE ; le
 *    détail du calcul ne liste PAS d'actifs (ce serait 0 point, source de
 *    confusion). Le positif d'un produit hors profil est porté par les 3 blocs
 *    IA (goals/skin), qui nomment ses vrais atouts pour les bons produits.
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
export const AGAINST_MAX = 7; // jusqu'à 7 contre-indications (l'IA peut en proposer plus ; on garde les 7 premières, on ne lui demande PAS d'en trouver 7)
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
 * product_only : la branche contre-indication est SAUTÉE (le `need` y est
 * générique, pas un besoin du profil → la phrase serait bancale).
 */
export function negativeSubtitle(ctx: {
  score: number;
  restrictionLabels: string[];
  /** Nb de sensibilités déduites du profil détectées (chacune -8, non cochées). */
  inferredCount?: number;
  against: AgainstInput[];
  orange: number;
  red: number;
  productOnly?: boolean;
}): string | null {
  if (ctx.score >= 60) return null;
  if (ctx.restrictionLabels.length === 1) {
    return `contient une de tes restrictions : ${ctx.restrictionLabels[0].toLowerCase()}`;
  }
  if (ctx.restrictionLabels.length > 1) {
    return `contient ${ctx.restrictionLabels.length} de tes restrictions`;
  }
  // Sensibilités déduites du profil (non cochées) : phrase honnête, jamais
  // « tes restrictions » (l'utilisateur ne les a pas cochées) ni « qualité
  // insuffisante » (la formule peut être bonne, c'est l'adéquation profil).
  if ((ctx.inferredCount ?? 0) > 0) {
    return "contient des ingrédients peu adaptés à ton profil";
  }
  if (!ctx.productOnly && ctx.against.length > 0) {
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
 * En product_only, ces lignes ne sont PAS produites (le breakdown reste une
 * explication honnête du score = qualité ; le positif est porté par les 3 blocs IA).
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
 *           product_only puisqu'il n'y a pas de profil pertinent — le positif
 *           d'un produit hors profil est porté par les 3 blocs IA, pas ici)
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
  /** Libellés des restrictions COCHÉES distinctes présentes (une ligne -8 chacune). */
  restrictionLabels: string[];
  /** Libellés des SENSIBILITÉS DÉDUITES du profil présentes ET non déjà cochées
   *  (dédoublonnées en amont) : MÊME -8 qu'une restriction (demande user). */
  inferredRestrictionLabels?: string[];
  productOnly?: boolean;
}): { score: number; label: string; tone: CompatTone; breakdown: CompatBreakdown } {
  const base = qualityScore(ctx.scoreOver20);
  // Lignes IA (clonées pour ne pas muter l'entrée) : bonus des actifs (+) et
  // contre-indications (-). Bornées par construction (buildCompatLines).
  // product_only : IGNORÉES (le score = qualité de la formule ; le détail reste
  // une explication honnête, le positif est porté par les 3 blocs IA).
  const ia = ctx.productOnly ? [] : ctx.iaLines.map((l) => ({ ...l }));
  const lines: CompatLine[] = [...ia];
  let running = base + ia.reduce((s, l) => s + l.points, 0);

  // PLAFOND — le score ne peut JAMAIS dépasser le plafond (couleur s'il y a des
  // oranges/rouges, sinon 100). Crucial : on plafonne AVANT de retirer les
  // restrictions, sinon un bonus qui dépasse 100 « absorbe » le malus (bug vu :
  // 100 % + 1 restriction restait à 100 au lieu de 92). Seul le BONUS des actifs
  // peut faire dépasser (la base ≤ 100) : le surplus est PERDU (un produit déjà
  // au max reste au max, il n'accumule pas de marge pour encaisser un malus).
  const ceiling = colorCeiling(ctx.orange, ctx.red);
  if (running > ceiling) {
    if (ceiling < 100) {
      // Vrai plafond couleur (oranges/rouges) : ligne visible et informative.
      const capLabel = ctx.red > 0
        ? `Plafond : ${ctx.red} ingrédient${ctx.red > 1 ? "s" : ""} rouge${ctx.red > 1 ? "s" : ""}`
        : `Plafond : ${ctx.orange} ingrédient${ctx.orange > 1 ? "s" : ""} orange`;
      lines.push({ label: capLabel, points: ceiling - running });
    } else {
      // Simple clamp au maximum 100 (0 orange/rouge) : SILENCIEUX (jamais de
      // « Plafond : 0 ingrédient orange »). On écrête le bonus des actifs (seul
      // à pouvoir dépasser 100) pour que le breakdown continue de sommer juste.
      let overflow = running - 100;
      for (const l of lines) {
        if (overflow <= 0) break;
        if (l.points > 0) {
          const cut = Math.min(l.points, overflow);
          l.points -= cut;
          overflow -= cut;
        }
      }
    }
    running = ceiling;
  }

  // -8 par restriction COCHÉE distincte, APRÈS le plafonnement → mord TOUJOURS.
  for (const r of ctx.restrictionLabels) {
    lines.push({ label: `${r} : ta restriction`, points: -RESTRICTION_MALUS });
    running -= RESTRICTION_MALUS;
  }
  // -8 par SENSIBILITÉ DÉDUITE du profil, détectée dans le produit et NON déjà
  // cochée (demande user 16 juil 2026 : l'inférence « comble » une restriction
  // manquante avec le MÊME malus). Le dédoublonnage vs les restrictions cochées
  // est fait en amont (enforceCompatibility) → jamais -8 deux fois.
  for (const r of ctx.inferredRestrictionLabels ?? []) {
    lines.push({ label: `${r} : sensibilité de ton profil`, points: -RESTRICTION_MALUS });
    running -= RESTRICTION_MALUS;
  }

  // PAS de plancher qualité : une formule PROPRE sans rien contre l'utilisateur
  // reste haute d'elle-même (base + bonus, aucun malus). Mais dès qu'il y a des
  // CONTRE-INDICATIONS pour CE profil (against) ou des restrictions, le score
  // DOIT pouvoir descendre pour refléter la vraie compatibilité — sinon détecter
  // 7 incompatibilités ne changerait rien (demande user : « le vrai pourcentage »).
  const score = Math.min(100, Math.max(0, Math.round(running)));
  return { score, label: labelForScore(score), tone: toneForScore(score), breakdown: { base, lines } };
}
