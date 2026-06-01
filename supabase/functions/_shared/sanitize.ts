/**
 * Sanitizer de texte + fragment de prompt partagé pour tout appel IA de prose.
 *
 * Port verbatim de `lib/ai/sanitize.ts` (CosmetWiki web). Aucune dépendance
 * Node/DOM : du pur ECMAScript, compatible Deno tel quel.
 *
 * GPT (et les autres LLM) injectent par habitude des tirets cadratins (—) et
 * demi-cadratins (–) dans la prose française. On utilise un triple filet de
 * sécurité :
 *   1. Instruction stricte dans chaque system prompt (`NO_LONG_DASHES_RULE`).
 *   2. Nettoyage des données source avant qu'elles n'atteignent le modèle.
 *   3. Post-traitement `stripLongDashes()` sur chaque chaîne générée.
 */

/** Snippet d'instruction à coller dans tout system prompt produisant de la prose FR. */
export const NO_LONG_DASHES_RULE =
  "INTERDICTION ABSOLUE : aucun tiret cadratin (—) ni demi-cadratin (–) dans " +
  "ta réponse, nulle part. Utilise une virgule, un deux-points, ou découpe " +
  'en deux phrases. Le tiret simple "-" n\'est autorisé que dans deux cas, ' +
  "et UNIQUEMENT ces deux cas : (a) les mots composés (sous-jacent, " +
  "peau-sébum…), (b) le marqueur de PUCE markdown EN DÉBUT DE LIGNE, " +
  'sous la forme exacte "- " (tiret + espace) au tout début d\'une ligne. ' +
  "Toute autre utilisation est considérée comme une faute. Les puces " +
  'markdown "- " en début de ligne sont OBLIGATOIRES quand on te demande ' +
  "une liste à puces : ne les remplace JAMAIS par des virgules, des points " +
  "ou des numéros.";

/**
 * Remplace chaque cadratin (—) et demi-cadratin (–), plus les traits d'union
 * ascii utilisés comme tirets intercalaires, par une virgule, puis fusionne
 * les doubles espaces inline laissés derrière.
 *
 * IMPORTANT : on ne touche QU'aux espaces et tabulations, jamais aux retours
 * à la ligne. Le formateur de synthèse s'appuie sur `\n\n` pour séparer les
 * paragraphes et `\n` pour les puces.
 *
 * Les marqueurs de puce markdown ("- " en tout début de ligne) sont PRÉSERVÉS.
 */
export function stripLongDashes(s: string): string {
  if (!s) return s;
  return s
    // Vrais cadratins/demi-cadratins n'importe où → virgule.
    .replace(/[ \t]*[–—][ \t]*/g, ", ")
    // Trait d'union ascii "-" comme tiret intercalaire : seulement précédé
    // d'un non-espace (on saute les puces en début de ligne) ET suivi d'au
    // moins un espace (on saute les mots composés type "sous-jacent").
    .replace(/(?<=\S)[ \t]*-[ \t]+/g, ", ")
    .replace(/,[ \t]*,/g, ",")
    // Fusionne les doubles espaces/tabs mais garde \n / \r intacts.
    .replace(/[ \t]{2,}/g, " ")
    // Supprime l'espace horizontal avant la ponctuation (pas les \n).
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();
}

/**
 * Retire la puce d'absences "Sans parabens, sans sulfates, ..." d'une
 * synthèse (déjà affichée par le panneau Observations dédié).
 *
 * Règle de détection conservatrice :
 *   - La ligne, après retrait d'un éventuel "- " de puce, commence par
 *     "Sans " (insensible à la casse).
 *   - ET contient au moins 2 occurrences ", sans " supplémentaires.
 */
export function stripAbsencesParagraph(s: string): string {
  if (!s) return s;
  const ABSENCES_RE = /^(?:[-•*]\s+)?sans\s+\S/i;
  const kept: string[] = [];
  for (const line of s.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (ABSENCES_RE.test(trimmed)) {
      const enumerations = (trimmed.match(/,\s*sans\s/gi) ?? []).length;
      if (enumerations >= 2) continue; // on retire cette puce
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
