/**
 * goals-coverage/core.ts — moteur DÉTERMINISTE de la « Couverture de tes
 * objectifs ». PUR et AUTONOME (aucune API Deno) → importable en Jest (env node)
 * exactement comme personal-insights/relevance.ts.
 *
 * PRINCIPE (demande user, 16 juil 2026) :
 *   - L'IA décide UNIQUEMENT si/combien un produit sert un objectif :
 *     contribution entière 0..3 (0 = rien, 1 = un peu, 2 = bien, 3 = fortement).
 *   - TOUT le calcul du pourcentage est ICI, déterministe, borné et testé :
 *     pondération par la QUALITÉ du produit (étoiles 1→5 dérivées de la note /20)
 *     et par la FRÉQUENCE d'usage, puis agrégation SATURANTE plafonnée à 100 %.
 *   - Un produit NON pertinent (déodorant vs hydratation) contribue 0 et ne
 *     pénalise JAMAIS : le pré-filtre déterministe l'écarte AVANT tout appel IA.
 *
 * SCALABILITÉ : la contribution (produit × objectif) ne dépend PAS de
 * l'utilisateur → elle est mise en cache CROSS-USER (voir index.ts, table
 * ai_cache). Le coût IA est donc O(produits distincts), pas O(users). Ce module
 * ne fait aucun I/O : il reçoit les contributions déjà résolues (cache ou IA).
 *
 * Miroir client : lib/routine/goalsCoverage.ts (signatures + collectGoals +
 * version IDENTIQUES, vérifiés par lib/__tests__/goalsCoverageParity.test.ts).
 *
 * Ce module n'importe RIEN (0 dépendance) : la classification catégorie→axe
 * (personal-insights/relevance.ts) est injectée en paramètre de
 * resolveProductAxis pour rester import-free (compatible Deno ET tsc/Jest sans
 * import « .ts » qui casserait le typecheck de l'app).
 */

/** Bumper si la logique (labels, axes, math, format de cache) change. */
export const GOALS_COVERAGE_VERSION = 1;

export type GoalAxis = "skin" | "hair" | "meta";
export type CoverageTone = "vert" | "jaune" | "orange" | "rouge";
export type RoutineFrequency = "daily" | "weekly" | "monthly";

/**
 * Libellés des objectifs — miroir de PROFILE_GOAL_LABEL (lib/skin/profile.ts).
 * Garder synchronisé si la liste change (parité testée côté client).
 */
export const GOAL_LABELS: Record<string, string> = {
  // Visage
  peau_douce: "Avoir une peau plus douce",
  teint_uniforme: "Uniformiser mon teint",
  attenuer_boutons: "Atténuer mes boutons",
  reduire_rides: "Réduire mes rides et ridules",
  calmer_rougeurs: "Calmer mes rougeurs",
  hydrater_profondeur: "Hydrater ma peau en profondeur",
  reduire_taches: "Réduire mes taches",
  renforcer_barriere: "Renforcer ma peau face aux agressions",
  // Corps
  adoucir_corps: "Adoucir ma peau du corps",
  reduire_vergetures: "Réduire l'apparence des vergetures",
  proteger_soleil: "Mieux protéger ma peau du soleil",
  // Cheveux
  cheveux_brillants: "Avoir des cheveux plus brillants",
  renforcer_cheveux: "Renforcer mes cheveux abîmés",
  definir_boucles: "Définir mes boucles",
  cuir_chevelu_sain: "Avoir un cuir chevelu sain",
  reduire_chute: "Réduire la chute / casse",
  // Routine (meta)
  simplifier_routine: "Simplifier ma routine quotidienne",
  decouvrir_clean: "Découvrir des produits plus clean",
  // Legacy (pré-refonte) — gardés pour les vieux profils
  comprendre_produits: "Mieux comprendre mes produits",
  eviter_risques: "Éviter les ingrédients risqués",
  alternatives_adaptees: "Trouver des alternatives adaptées",
  construire_routine: "Construire / améliorer ma routine",
};

/**
 * Axe de chaque objectif prédéfini. « meta » = objectif transversal (routine
 * entière) : tout produit peut y contribuer → l'IA tranche (pas de pré-filtre).
 */
export const GOAL_AXIS: Record<string, GoalAxis> = {
  peau_douce: "skin",
  teint_uniforme: "skin",
  attenuer_boutons: "skin",
  reduire_rides: "skin",
  calmer_rougeurs: "skin",
  hydrater_profondeur: "skin",
  reduire_taches: "skin",
  renforcer_barriere: "skin",
  adoucir_corps: "skin",
  reduire_vergetures: "skin",
  proteger_soleil: "skin",
  cheveux_brillants: "hair",
  renforcer_cheveux: "hair",
  definir_boucles: "hair",
  cuir_chevelu_sain: "hair",
  reduire_chute: "hair",
  simplifier_routine: "meta",
  decouvrir_clean: "meta",
  comprendre_produits: "meta",
  eviter_risques: "meta",
  alternatives_adaptees: "meta",
  construire_routine: "meta",
};

/** Un objectif normalisé, prédéfini ou libre (« Autre »). */
export type GoalInput = {
  /** Clé stable : slug prédéfini, ou `free:<hash>` pour un objectif libre. */
  key: string;
  /** Libellé affichable (label prédéfini ou texte libre saisi). */
  label: string;
  axis: GoalAxis;
  isCustom: boolean;
};

/** Sous-ensemble structurel du profil (objectifs uniquement). */
export type SkinProfileGoals = {
  goals?: readonly string[];
  otherGoals?: string;
  otherGoalsFace?: string;
  otherGoalsBody?: string;
  otherGoalsHair?: string;
  otherGoalsRoutine?: string;
};

/** Nb max d'objectifs libres pris en compte (borne le coût IA). */
export const MAX_CUSTOM_GOALS = 5;

/**
 * Objectifs SÉLECTIONNABLES dans le profil mais EXCLUS du bloc « Couverture de
 * tes objectifs » (retiré le 17 juil 2026, demande user) : « simplifier ma
 * routine » n'est PAS une couverture mesurable, son % ne reflétait que le NOMBRE
 * de produits, transformant à tort une routine riche (souvent nécessaire quand
 * on a plusieurs problèmes de peau) en « échec ». L'objectif reste disponible
 * dans le profil (il sert ailleurs : synthèse, suggestions…), il ne produit
 * simplement plus de jauge. `decouvrir_clean` (part de produits bien notés) reste
 * dans le bloc : lui est mesurable.
 */
export const COVERAGE_EXCLUDED_GOAL_KEYS = new Set<string>(["simplifier_routine"]);

/** Hash 32 bits déterministe (djb2) → clé stable d'un objectif libre. */
export function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0; // h*33 + c, 32 bits signés
  }
  return (h >>> 0).toString(36);
}

/** Normalise un texte d'objectif libre (casse/accents/espaces) pour la clé. */
export function normalizeGoalText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** Clé cross-user d'un objectif libre (identique client/serveur). */
export function customGoalKey(text: string): string {
  return `free:${djb2(normalizeGoalText(text))}`;
}

/**
 * Rassemble TOUS les objectifs du profil : les prédéfinis (`goals`, tous
 * groupes confondus = « parties hautes » incluses) PUIS les objectifs libres
 * des 5 champs « Autre » (dédoublonnés, cappés). Ordre = prédéfinis puis libres.
 */
export function collectGoals(skin: SkinProfileGoals): GoalInput[] {
  const out: GoalInput[] = [];
  const seenKeys = new Set<string>();

  for (const g of skin.goals ?? []) {
    if (typeof g !== "string") continue;
    if (!(g in GOAL_LABELS)) continue;
    if (COVERAGE_EXCLUDED_GOAL_KEYS.has(g)) continue; // exclu du bloc de couverture
    if (seenKeys.has(g)) continue;
    seenKeys.add(g);
    out.push({ key: g, label: GOAL_LABELS[g], axis: GOAL_AXIS[g] ?? "meta", isCustom: false });
  }

  const customTexts = [
    skin.otherGoals,
    skin.otherGoalsFace,
    skin.otherGoalsBody,
    skin.otherGoalsHair,
    skin.otherGoalsRoutine,
  ];
  const seenCustomNorm = new Set<string>();
  let customCount = 0;
  for (const raw of customTexts) {
    if (customCount >= MAX_CUSTOM_GOALS) break;
    if (typeof raw !== "string") continue;
    const label = raw.trim();
    if (!label) continue;
    const norm = normalizeGoalText(label);
    if (!norm || seenCustomNorm.has(norm)) continue;
    seenCustomNorm.add(norm);
    const key = customGoalKey(label);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push({ key, label: label.slice(0, 120), axis: "meta", isCustom: true });
    customCount++;
  }

  return out;
}

/** L'utilisateur a-t-il au moins un objectif renseigné ? */
export function hasAnyGoal(skin: SkinProfileGoals): boolean {
  return collectGoals(skin).length > 0;
}

// ── Signaux produit ─────────────────────────────────────────────────────────

/** Note /20 → étoiles 1..5 (mêmes seuils que lib/essentiel/engine.ts). */
export function starsFromScore(score: number | null | undefined): number {
  if (typeof score !== "number" || Number.isNaN(score)) return 3; // neutre si inconnu
  if (score >= 17) return 5;
  if (score >= 13) return 4;
  if (score >= 9) return 3;
  if (score >= 5) return 2;
  return 1;
}

/** Facteur qualité : un bon produit couvre mieux l'objectif qu'un mauvais. */
export function qualityFactor(stars: number): number {
  switch (stars) {
    case 5: return 1.0;
    case 4: return 0.9;
    case 3: return 0.72;
    case 2: return 0.5;
    default: return 0.3;
  }
}

/** Facteur fréquence : un produit quotidien couvre mieux qu'un usage rare. */
export function frequencyFactor(freq: RoutineFrequency): number {
  switch (freq) {
    case "daily": return 1.0;
    case "weekly": return 0.75;
    case "monthly": return 0.55;
    default: return 1.0;
  }
}

/** Axe de pertinence d'un produit (miroir de ProfileAxis de relevance.ts). */
export type ProfileAxisLike = "skin" | "hair" | "none";

/**
 * Axe produit pour la couverture. « unknown » = catégorie absente/illisible :
 * on ne PRÉ-EXCLUT rien, on laisse l'IA trancher pour TOUS les objectifs (elle
 * met 0 si hors sujet). C'est le filet demandé par le user : « l'IA cherche
 * elle-même ; si elle ne trouve rien tant pis ».
 */
export type ProductAxis = ProfileAxisLike | "unknown";

/** Produit prêt à agréger. `axis` vient de resolveProductAxis(...). */
export type ProductInput = {
  key: string;
  axis: ProductAxis;
  stars: number;
  frequency: RoutineFrequency;
};

/**
 * Résout l'axe d'un produit depuis ses champs catégorie (le plus précis
 * d'abord). `classify` = categoryToAxis (injecté pour rester import-free).
 * Renvoie le premier axe peau/cheveux trouvé ; « none » si une catégorie
 * explicite hors profil est reconnue (déo, parfum, dentifrice…) ; « unknown »
 * si AUCUNE catégorie n'est renseignée (→ l'IA décide).
 */
export function resolveProductAxis(
  classify: (category: string) => ProfileAxisLike,
  ...categories: (string | null | undefined)[]
): ProductAxis {
  const present = categories.filter(
    (c): c is string => typeof c === "string" && c.trim().length > 0,
  );
  if (present.length === 0) return "unknown";
  for (const c of present) {
    const a = classify(c);
    if (a !== "none") return a;
  }
  return "none";
}

/**
 * La paire (produit, objectif) mérite-t-elle un jugement IA, ou est-ce un 0
 * DÉTERMINISTE ? Un objectif peau exige un produit peau, un objectif cheveux un
 * produit cheveux ; un objectif meta/libre accepte TOUT produit (un dentifrice
 * peut servir « une belle dentition »). Un produit « none » (déo, parfum) face à
 * un objectif peau/cheveux → 0 sans IA. Un produit « unknown » (catégorie
 * absente) → toujours confié à l'IA (jamais pré-exclu).
 */
export function pairNeedsAI(productAxis: ProductAxis, goalAxis: GoalAxis): boolean {
  if (goalAxis === "meta") return true;
  if (productAxis === "unknown") return true;
  if (goalAxis === "skin") return productAxis === "skin";
  return productAxis === "hair";
}

/** Constante de saturation : 1 produit 5★ quotidien « fortement » (≈3 pts) ≈ 79 %. */
export const COVERAGE_TAU = 1.9;

/** Somme de points → pourcentage saturant [0..100]. Jamais > 100, jamais < 0. */
export function saturate(sum: number): number {
  if (sum <= 0) return 0;
  const pct = 100 * (1 - Math.exp(-sum / COVERAGE_TAU));
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** Ton couleur du pourcentage (aligné sur la maquette : 70 vert, 55 jaune, 40 orange, 10 rouge). */
export function coverageTone(pct: number): CoverageTone {
  if (pct >= 70) return "vert";
  if (pct >= 50) return "jaune";
  if (pct >= 30) return "orange";
  return "rouge";
}

/** Contribution IA bornée 0..3 (entier). */
export function clampContribution(c: number): number {
  if (!Number.isFinite(c)) return 0;
  return Math.max(0, Math.min(3, Math.round(c)));
}

/** Résultat par objectif renvoyé au client. */
export type CoverageItem = {
  key: string;
  label: string;
  isCustom: boolean;
  percent: number;
  tone: CoverageTone;
  /** Nb de produits de la routine qui contribuent réellement (points > 0). */
  relevantCount: number;
};

/**
 * Objectifs « méta » (transversaux à la routine) calculés de façon DÉTERMINISTE,
 * SANS IA : leur % ne dépend pas d'une contribution par produit (l'addition par
 * produit serait à l'envers, ex. « simplifier » monterait avec le nb de produits)
 * mais d'une propriété globale de la routine.
 */
export const DETERMINISTIC_GOAL_KEYS = new Set<string>(["decouvrir_clean"]);

export function isDeterministicGoal(key: string): boolean {
  return DETERMINISTIC_GOAL_KEYS.has(key);
}

/**
 * % déterministe d'un objectif méta d'après la routine, ou null si l'objectif
 * n'est pas méta.
 *  - decouvrir_clean : part de produits bien notés (≥4★ = vert).
 * (simplifier_routine a été RETIRÉ du bloc le 17 juil 2026, cf.
 *  COVERAGE_EXCLUDED_GOAL_KEYS : il n'atteint plus computeCoverage.)
 */
export function metaCoverage(
  goalKey: string,
  products: ProductInput[],
): { percent: number; relevantCount: number } | null {
  const n = products.length;
  if (goalKey === "decouvrir_clean") {
    if (n === 0) return { percent: 0, relevantCount: 0 };
    const clean = products.filter((p) => p.stars >= 4).length;
    return { percent: Math.round((100 * clean) / n), relevantCount: clean };
  }
  return null;
}

/**
 * Agrège la couverture par objectif. `contribution(productKey, goalKey)` renvoie
 * la contribution IA 0..3 (0 si inconnue). Les paires écartées par le pré-filtre
 * ne sont JAMAIS demandées ni comptées. Les objectifs méta (isDeterministicGoal)
 * court-circuitent l'IA et utilisent metaCoverage.
 */
export function computeCoverage(
  products: ProductInput[],
  goals: GoalInput[],
  contribution: (productKey: string, goalKey: string) => number,
): CoverageItem[] {
  return goals.map((goal) => {
    const meta = metaCoverage(goal.key, products);
    if (meta) {
      return {
        key: goal.key,
        label: goal.label,
        isCustom: goal.isCustom,
        percent: meta.percent,
        tone: coverageTone(meta.percent),
        relevantCount: meta.relevantCount,
      };
    }
    let sum = 0;
    let relevantCount = 0;
    for (const p of products) {
      if (!pairNeedsAI(p.axis, goal.axis)) continue;
      const c = clampContribution(contribution(p.key, goal.key));
      if (c <= 0) continue;
      const pts = c * qualityFactor(p.stars) * frequencyFactor(p.frequency);
      if (pts <= 0) continue;
      sum += pts;
      relevantCount++;
    }
    const percent = saturate(sum);
    return {
      key: goal.key,
      label: goal.label,
      isCustom: goal.isCustom,
      percent,
      tone: coverageTone(percent),
      relevantCount,
    };
  });
}

// ── Signatures (raw strings, comparées telles quelles côté client — pas de crypto) ──

/**
 * Signature de la routine : change dès qu'un produit est ajouté / retiré (ou
 * change de fréquence). Format IDENTIQUE côté client (lib/routine/goalsCoverage).
 */
export function routineSignature(
  items: { analysis_id: string; frequency: string }[],
): string {
  return items
    .filter((i) => i && typeof i.analysis_id === "string" && i.analysis_id.length > 0)
    .map((i) => `${i.analysis_id}:${i.frequency ?? "daily"}`)
    .sort()
    .join(",");
}

/** Signature de l'ensemble des objectifs : change si un objectif est ajouté/retiré/édité. */
export function goalsSignature(goals: GoalInput[]): string {
  return goals.map((g) => g.key).sort().join("|");
}
