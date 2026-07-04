/**
 * INCI list parser : turns a free-form pasted ingredient list into a clean
 * array of normalized tokens, preserving order.
 *
 * Handles : commas, semicolons, "/" between synonyms, parentheses,
 * asterisks, "(F.I.L. ...)", line breaks, double-spaces.
 *
 * Port byte-for-byte du web `lib/inciParser.ts` — logique de scoring IDENTIQUE.
 *
 * ALIGNEMENT avec `@/lib/analysis/types` :
 *   - `ColorRating` ici = forme DB capitalisée ("Vert"/"Jaune"/…), équivalente
 *     au type `DbColorRating` de `analysis/types`. On la ré-exporte sous ce
 *     nom pour rester cohérent avec le reste du code mobile.
 *   - `scoreLabel()` partage exactement les mêmes seuils (≥17 / ≥13 / ≥9) que
 *     `getColorRatingFromScore()` / `toneToColorRating()` déjà présents dans
 *     `analysis/types.ts`. Aucune contradiction : ce module renvoie le couple
 *     {label, tone} brut du web, `analysis/types` mappe le tone → ColorRating.
 */
import type { DbColorRating, ScoreTone } from "@/lib/analysis/types";

export type ParsedToken = {
  /** Original raw value as the user pasted it (kept for display). */
  raw: string;
  /** Normalized for matching: uppercase, accents stripped, spaces collapsed. */
  normalized: string;
  /** Position in the original list (0 = first / main ingredient). */
  position: number;
};

const STOP_WORDS = new Set([
  "INGREDIENTS", "INGREDIENT", "INGRÉDIENTS", "INGRÉDIENT",
  "INCI", "COMPOSITION", "LISTE", "INGREDIENTS:", "INCI:",
]);

// Préfixes marketing / qualité qui décorent un nom INCI mais ne FONT PAS partie
// de la nomenclature (ex : "Certified Organic Coconut Milk" → "Coconut Milk",
// "Vegetable Glycerin" → "Glycerin"). On les retire de la forme normalisée
// envoyée au matcher mais on garde `raw` intact pour l'affichage. Liste
// volontairement conservative : uniquement les qualificatifs qui n'apparaissent
// jamais comme un nucleus INCI réel.
const DESCRIPTIVE_PREFIXES: RegExp[] = [
  /^CERTIFIED\s+ORGANIC\s+/,
  /^COLD[\s-]+PRESSED\s+/,
  /^EXTRA\s+VIRGIN\s+/,
  /^STEAM\s+DISTILLED\s+/,
  /^FAIR[\s-]?TRADE\s+/,
  /^WILD[\s-]?CRAFTED\s+/,
  /^REVERSE\s+OSMOSIS\s+/,
  /^ISSU\s+DE\s+L'AGRICULTURE\s+BIOLOGIQUE\s+/,
  /^ORGANIC\s+/,
  /^NATURAL\s+/,
  /^NATUREL(LE)?\s+/,
  /^VEGETABLE\s+/,
  /^VEGETAL(E)?\s+/,
  /^VIRGIN\s+/,
  /^VIERGE\s+/,
  /^WILD\s+/,
  /^SAUVAGE\s+/,
  /^RAW\s+/,
  /^FRESH\s+/,
  /^PURE\s+/,
  /^PURIFIED\s+/,
  /^PURIFIE(E)?\s+/,
  /^DISTILLED\s+/,
  /^DISTILLE(E)?\s+/,
  /^DEIONIZED\s+/,
  /^DEMINERALIZED\s+/,
  /^DEMINERALISE(E)?\s+/,
  /^FILTERED\s+/,
  /^FILTRE(E)?\s+/,
  /^SPRING\s+/,
  /^IONIZED\s+/,
  /^BIO\s+/,
];

// Ne strippe que si le reste reste plausible (≥ 4 caractères) pour ne pas
// transformer "Vegetable Oil" en "Oil" — un nucleus trop court ne matche
// jamais correctement.
function stripDescriptivePrefixes(upper: string): string {
  let work = upper;
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of DESCRIPTIVE_PREFIXES) {
      const next = work.replace(re, "");
      if (next !== work && next.trim().length >= 4) {
        work = next.trim();
        changed = true;
        break;
      }
    }
  }
  return work;
}

const NOISE_PATTERNS: RegExp[] = [
  /\(F\.?I\.?L\.?\s+[A-Z0-9]+\/?\d*\)/gi,
  /\(\+\/?\-\)/g,                         // (+/-)
  /\(may contain\)/gi,
  /\(peut contenir\)/gi,
  /\([A-Z0-9. ]+\d+\/\d+\)/g,             // batch codes
  // "MAY CONTAIN:" / "PEUT CONTENIR:" labels (with or without surrounding
  // brackets). The colorants that follow are real ingredients we want to keep,
  // but the LABEL itself is noise that would otherwise become a fake "token".
  /\[\s*\+\/?\-?\s*/g,                    // "[+/-" or "[+ /-" before MAY CONTAIN
  /\b(?:MAY\s+CONTAIN|PEUT\s+CONTENIR)\s*:?/gi,
  /\]/g,                                  // closing bracket of MAY CONTAIN block
  // Standalone "INGREDIENTS:" / "INCI:" / "COMPOSITION:" labels (often pasted
  // from product detail pages). The STOP_WORDS set already drops them when
  // they end up as their own token, but stripping the prefix here ensures the
  // first real ingredient is parsed cleanly even when no separator follows.
  /\b(?:INGREDIENTS?|INGRÉDIENTS?|INCI|COMPOSITION)\s*:\s*/gi,
  // Leading batch/reference codes like "G2047548 -" or "11075v0 -" that some
  // brands print before the actual list. Heuristic: 4+ alphanumeric chars,
  // followed by a dash or colon and whitespace, at the very start of the text.
  /^\s*[A-Z0-9]{4,}\s*[-:]\s+/,
];

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Detects content INSIDE parentheses that looks like an ingredient alias
// (Water / Eau, Tocopherol, INCI:Aqua, etc.). Heuristic: short content
// without weasel words and without slashes pointing to non-ingredient text.
// If matched, we DROP the parenthesized content entirely (it's just a
// translation/synonym of the principal name placed before).
const PAREN_ALIAS_RE = /\(([^()]{1,60})\)/g;

function looksLikeAliasContent(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return false;
  // Reject anything that looks like a sentence fragment (long sentences are
  // handled by the > 60 chars pattern below anyway).
  if (/[.;:!?]/.test(trimmed)) return false;
  // Reject batch/CI codes - those are kept as part of the principal name.
  if (/^CI\s*\d/i.test(trimmed)) return false;
  if (/^\d/.test(trimmed)) return false;
  // Accept tokens or token-lists separated by "/", "," or whitespace.
  // ex: "WATER", "Water / Eau", "Tocopherol", "INCI Aqua"
  return /^[a-zA-ZÀ-ÿ\s/,'-]+$/.test(trimmed);
}

export function parseInciList(text: string): ParsedToken[] {
  if (!text) return [];

  let work = text;

  // Drop common noise and codes
  for (const re of NOISE_PATTERNS) {
    work = work.replace(re, " ");
  }
  // Drop parenthesized aliases like "(Water / Eau)" right after a token -
  // we keep only the principal INCI name. This avoids "Aqua, Water, Eau"
  // being parsed as 3 separate ingredients.
  work = work.replace(PAREN_ALIAS_RE, (_match, inner: string) =>
    looksLikeAliasContent(inner) ? " " : `(${inner})`,
  );
  // Drop parenthesized notes like "(en français)" but keep things like
  // "(i)", "(ii)" by collapsing them
  work = work.replace(/\([^)]{20,}\)/g, " ");
  // Asterisks (`*`, `**`, `***`) are status markers on labels (bio, Ecocert,
  // allergènes UE, actifs clés). When a real separator exists in the input
  // (comma, semicolon, newline) we just strip them. When the user pasted a
  // mobile-flattened list without any other separator (ex: from iOS Notes,
  // the newlines are turned into spaces on paste), the asterisks are the
  // ONLY thing separating ingredients, so we turn them into commas instead.
  const hasRealSeparator = /[,;\n]/.test(work);
  if (hasRealSeparator) {
    work = work.replace(/\*+/g, " ");
  } else {
    work = work.replace(/\s*\*+\s*/g, ", ");
  }
  // Some lists use periods as separators instead of commas (ex: "AQUA. GLYCERIN.
  // PROPANEDIOL."). We detect this pattern - period preceded by a letter or
  // closing paren and followed by whitespace + an uppercase letter - and turn
  // it into a comma. Intra-name periods like "F.I.L. 12345" or "2.5%" are NOT
  // matched (no whitespace, or not followed by a letter).
  work = work.replace(/(?<=[A-Za-z)])\.\s+(?=[A-Z])/g, ", ");
  // Final period at end-of-list
  work = work.replace(/\.+$/g, " ");
  // Split synonyms separated by " / " (spaces on both sides) into separate tokens.
  // ex : "AQUA / WATER" → "AQUA, WATER"
  // Do NOT split "CAPRYLIC/CAPRIC TRIGLYCERIDE" or "LEUCONOSTOC/RADISH ROOT FERMENT
  // FILTRATE" - those are compound INCI names where the slash has no surrounding space.
  work = work.replace(/\s+\/\s+/g, ", ");
  // Also split slash-joined synonyms WITHOUT spaces when both sides are single words,
  // e.g. "Aqua/Water" → "Aqua, Water". The negative lookahead (?!\s+[A-Za-z])
  // preserves compound names like "CAPRYLIC/CAPRIC TRIGLYCERIDE" (second part is
  // followed by more words) and numeric INCI like "PEG-10/PPG-10" (digits break
  // the [A-Za-z-]* match before the slash).
  work = work.replace(/([A-Za-z][A-Za-z-]*)\/([A-Za-z][A-Za-z-]*)(?!\s+[A-Za-z])/g, "$1, $2");
  // Replace hyphens used as separators by commas. Catch all asymmetric spacing
  // patterns: "X - Y", "X -Y", "X- Y" (but NOT "X-Y", which is too risky - many
  // INCI names have intra-name hyphens like "PEG-100 Stearate" or "C12-15 Alkyl
  // Benzoate"). Bullets/middots can also be used as separators in pasted lists.
  work = work.replace(/(?<=\w)(?:\s+-+\s*|\s*-+\s+)(?=\w)/g, ", ");
  // Bullet/middot/black-circle/diamond glyphs used by some brands instead of
  // commas (●, •, ·, ◆, ▪). When sandwiched between two ingredient tokens
  // they're real separators.
  work = work.replace(/(?<=\w)\s*[•·●◆▪]\s*(?=\w)/g, ", ");
  // Also: when a bullet stands ALONE (e.g. just before "[+/- MAY CONTAIN]"
  // where we've already stripped the bracket as noise), turn it into a comma
  // too so the previous ingredient doesn't get concatenated with the next.
  work = work.replace(/\s*[•·●◆▪]\s*/g, ", ");

  // Split on common separators
  const rawParts = work
    .split(/[,;\n]+/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const tokens: ParsedToken[] = [];
  let position = 0;
  const seenNormalized = new Set<string>();

  for (const raw of rawParts) {
    // Strip leading/trailing parens leftovers, dashes, dots
    const cleaned = raw
      .replace(/^[\s\-•·]+|[\s\-•·.]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!cleaned) continue;
    if (cleaned.length < 2) continue;
    if (cleaned.length > 260) continue; // likely garbage paragraph (longest real INCI ~255 chars)

    const upper = stripAccents(cleaned).toUpperCase();
    if (STOP_WORDS.has(upper)) continue;
    if (/^[\d\s\-+%]+$/.test(upper)) continue; // pure numbers
    const normalized = stripDescriptivePrefixes(upper);
    if (seenNormalized.has(normalized)) continue;
    seenNormalized.add(normalized);

    tokens.push({
      raw: cleaned,
      normalized,
      position: position++,
    });
  }

  return tokens;
}

/**
 * Compute a /20 score from a list of matched ingredients.
 * Earlier positions weigh more (logarithmic decay).
 *
 *   penalty = { Vert: 0, Jaune: 0.6, Orange: 2.0, Rouge: 4.0 }
 *   score = 20 - sum(penalty * weight(position)) - cocktailPenalty
 *   weight(p) = log(N - p + 1) / log(N + 1)   ∈ [0, 1]
 *
 *   cocktailPenalty = max(0, countOrange - 3) × 0.4
 *                   + max(0, countRouge  - 2) × 0.8
 *
 * `ColorRating` est la forme DB capitalisée — alias de `DbColorRating` de
 * `@/lib/analysis/types` pour rester aligné avec le reste du code mobile.
 */
export type ColorRating = DbColorRating;

const PENALTY: Record<ColorRating, number> = {
  Vert: 0,
  Jaune: 0.6,
  Orange: 2.0,
  Rouge: 4.0,
};

export function computeScore(
  matches: { color_rating: ColorRating | null; position: number }[],
  totalPositions: number,
): number {
  if (totalPositions === 0) return 0;
  let score = 20;
  let countOrange = 0;
  let countRouge = 0;
  for (const m of matches) {
    if (!m.color_rating) continue;
    const p = m.position;
    const N = Math.max(totalPositions, 1);
    // Logarithmic position weight: 1.0 for the first ingredient, ~0.05 for the last
    const weight = Math.log(N - p + 1) / Math.log(N + 1);
    score -= PENALTY[m.color_rating] * weight;
    if (m.color_rating === 'Orange') countOrange++;
    if (m.color_rating === 'Rouge') countRouge++;
  }
  // Cocktail effect: extra penalty when problematic ingredients accumulate,
  // regardless of position (our proprietary positional methodology).
  score -= Math.max(0, countOrange - 3) * 0.4;
  score -= Math.max(0, countRouge - 2) * 0.8;
  return Math.max(0, Math.min(20, score));
}

/** Map a numeric score (0-20) to a qualitative label and color.
 *
 *  Les seuils (≥17 / ≥13 / ≥9) sont IDENTIQUES à
 *  `getColorRatingFromScore()` dans `@/lib/analysis/types`. Le `tone` renvoyé
 *  (`green|amber|orange|rose`) se mappe vers un `ColorRating` via
 *  `toneToColorRating(tone)` de ce même module. */
export function scoreLabel(score: number): { label: string; tone: ScoreTone } {
  if (score >= 17) return { label: "Très bien", tone: "green" };
  if (score >= 13) return { label: "Bien", tone: "amber" };
  if (score >= 9) return { label: "Moyen", tone: "orange" };
  return { label: "Faible", tone: "rose" };
}
