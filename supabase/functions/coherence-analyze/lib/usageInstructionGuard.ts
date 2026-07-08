/**
 * Garde déterministe : écarte les MODES D'EMPLOI pris à tort pour des promesses.
 *
 * Le LLM d'extraction transforme parfois une consigne d'usage ("appliquer avant
 * le coucher", "masser jusqu'à pénétration") en promesse `category_slug="autre"`
 * (ex. label "Utilisation optimale"). L'étape d'exploration ne trouve alors
 * aucun ingrédient qui "démontre" ce mode d'emploi → verdict "non démontré" à
 * tort, ce qui fait chuter le score et affiche une fausse promesse ratée.
 * Audit prod 07/2026 : cas confirmés (Triple Dry "appliquer avant le coucher",
 * Garancia "…appliqués par la suite", etc.).
 *
 * PIÈGE ÉVITÉ : de VRAIES promesses contiennent le mot « utilisation »
 * ("+37 % peau plus douce après 7 jours d'utilisation" = tenue, "améliore la
 * sensation pendant et après l'utilisation" = tenue). Un simple token "utilis"
 * les casserait. On ne déclenche donc QUE sur un signal de DIRECTIVE :
 *   1. l'extrait COMMENCE par un verbe d'application (impératif/infinitif), OU
 *   2. le label est explicitement un intitulé de mode d'emploi.
 *
 * Pas de LLM, pas de réseau : simple contrôle de chaîne. PARITÉ STRICTE
 * mobile ↔ web (lib/coherence/usageInstructionGuard.ts côté CosmetWiki).
 */

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/** minuscule + sans accents + ponctuation → espace + espaces compactés. */
function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verbes de DIRECTION D'USAGE (infinitif + impératif tu/vous), NON AMBIGUS.
 * Quand l'extrait COMMENCE par l'un d'eux, c'est un mode d'emploi, pas un effet.
 *
 * VOLONTAIREMENT EXCLUS car ambigus (verbe d'effet possible en tête d'extrait) :
 *   - "laisser/laissez" : "laisser les mains douces", "laisse un film protecteur"
 *     = EFFET (traité via USAGE_PHRASES "laisser poser/agir" uniquement) ;
 *   - "eviter/evitez"   : "éviter la casse / les frisottis" = EFFET ;
 *   - "renouveler"      : "renouvelle les cellules" ≈ effet (usage via phrase).
 */
const DIRECTIVE_VERBS = new Set<string>([
  "appliquer", "appliquez", "applique",
  "utiliser", "utilisez",
  "masser", "massez",
  "rincer", "rincez",
  "deposer", "deposez",
  "etaler", "etalez",
  "vaporiser", "vaporisez",
  "pulveriser", "pulverisez",
  "agiter", "agitez",
  "secouer", "secouez",
  "melanger", "melangez",
  "repartir", "repartissez",
  "tapoter", "tapotez",
  "emulsionner", "emulsionnez",
]);

/**
 * Locutions d'usage recherchées N'IMPORTE OÙ dans l'extrait (normalisé). Servent
 * à capter les verbes ambigus UNIQUEMENT dans leur sens "mode d'emploi".
 */
const USAGE_PHRASES = [
  "laisser poser", "laissez poser",
  "laisser agir", "laissez agir",
  "laisser reposer", "laissez reposer",
  "laisser penetrer", "laissez penetrer",
  "renouveler l application", "renouvelez l application",
];

/** Adverbes/liens qui peuvent précéder le verbe : "bien masser", "puis rincer". */
const LEADING_FILLERS = new Set<string>([
  "bien", "puis", "ensuite", "doucement", "delicatement",
]);

/**
 * Intitulés de label qui signalent un mode d'emploi (et jamais un effet promis).
 * Testés en `includes` sur le label normalisé.
 */
const USAGE_LABEL_MARKERS = [
  "utilisation", // "Utilisation optimale", "Conseils d'utilisation"
  "mode d emploi",
  "mode emploi",
  "conseil d utilisation",
  "conseils d utilisation",
  "posologie",
  "frequence d utilisation",
  "moment d application",
];

/**
 * True si la proposition est en réalité une consigne d'usage / mode d'emploi
 * (à écarter des promesses vérifiables). Conservateur : on ne déclenche que sur
 * un verbe directif EN TÊTE d'extrait, ou un label explicitement "usage".
 */
export function isUsageInstruction(label: string, excerpt: string): boolean {
  const lbl = normalize(label);
  if (lbl && USAGE_LABEL_MARKERS.some((m) => lbl.includes(m))) return true;

  const ex = normalize(excerpt);
  if (!ex) return false;

  // Locution d'usage explicite ("laisser poser"…) n'importe où → mode d'emploi.
  if (USAGE_PHRASES.some((ph) => ex.includes(ph))) return true;

  // Verbe directif NON ambigu en tête (après d'éventuels adverbes de liaison).
  const words = ex.split(" ");
  let i = 0;
  while (i < words.length && i < 2 && LEADING_FILLERS.has(words[i])) i++;
  return DIRECTIVE_VERBS.has(words[i] ?? "");
}
