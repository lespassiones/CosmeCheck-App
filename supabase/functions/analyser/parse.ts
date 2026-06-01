/**
 * Parser INCI + heuristique fast-path — port byte-for-byte du web
 * (`CosmetWiki/lib/inciParser.ts` + `isCleanInciInput` de
 * `app/api/analyser/route.ts`). Logique IDENTIQUE à la version mobile
 * `lib/inci/parser.ts`.
 */

export type ParsedToken = {
  /** Valeur brute telle que collée (affichage). */
  raw: string;
  /** Normalisée pour le matching : majuscules, accents retirés, espaces compactés. */
  normalized: string;
  /** Position dans la liste d'origine (0 = premier / ingrédient principal). */
  position: number;
};

const STOP_WORDS = new Set([
  "INGREDIENTS", "INGREDIENT", "INGRÉDIENTS", "INGRÉDIENT",
  "INCI", "COMPOSITION", "LISTE", "INGREDIENTS:", "INCI:",
]);

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
  /\(\+\/?\-\)/g,
  /\(may contain\)/gi,
  /\(peut contenir\)/gi,
  /\([A-Z0-9. ]+\d+\/\d+\)/g,
  /\[\s*\+\/?\-?\s*/g,
  /\b(?:MAY\s+CONTAIN|PEUT\s+CONTENIR)\s*:?/gi,
  /\]/g,
  /\b(?:INGREDIENTS?|INGRÉDIENTS?|INCI|COMPOSITION)\s*:\s*/gi,
  /^\s*[A-Z0-9]{4,}\s*[-:]\s+/,
];

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const PAREN_ALIAS_RE = /\(([^()]{1,60})\)/g;

function looksLikeAliasContent(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return false;
  if (/[.;:!?]/.test(trimmed)) return false;
  if (/^CI\s*\d/i.test(trimmed)) return false;
  if (/^\d/.test(trimmed)) return false;
  return /^[a-zA-ZÀ-ÿ\s/,'-]+$/.test(trimmed);
}

export function parseInciList(text: string): ParsedToken[] {
  if (!text) return [];

  let work = text;

  for (const re of NOISE_PATTERNS) {
    work = work.replace(re, " ");
  }
  work = work.replace(PAREN_ALIAS_RE, (_match, inner: string) =>
    looksLikeAliasContent(inner) ? " " : `(${inner})`,
  );
  work = work.replace(/\([^)]{20,}\)/g, " ");
  const hasRealSeparator = /[,;\n]/.test(work);
  if (hasRealSeparator) {
    work = work.replace(/\*+/g, " ");
  } else {
    work = work.replace(/\s*\*+\s*/g, ", ");
  }
  work = work.replace(/(?<=[A-Za-z)])\.\s+(?=[A-Z])/g, ", ");
  work = work.replace(/\.+$/g, " ");
  work = work.replace(/\s+\/\s+/g, ", ");
  work = work.replace(/([A-Za-z][A-Za-z-]*)\/([A-Za-z][A-Za-z-]*)(?!\s+[A-Za-z])/g, "$1, $2");
  work = work.replace(/(?<=\w)(?:\s+-+\s*|\s*-+\s+)(?=\w)/g, ", ");
  work = work.replace(/(?<=\w)\s*[•·●◆▪]\s*(?=\w)/g, ", ");
  work = work.replace(/\s*[•·●◆▪]\s*/g, ", ");

  const rawParts = work
    .split(/[,;\n]+/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const tokens: ParsedToken[] = [];
  let position = 0;
  const seenNormalized = new Set<string>();

  for (const raw of rawParts) {
    const cleaned = raw
      .replace(/^[\s\-•·]+|[\s\-•·.]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!cleaned) continue;
    if (cleaned.length < 2) continue;
    if (cleaned.length > 260) continue;

    const upper = stripAccents(cleaned).toUpperCase();
    if (STOP_WORDS.has(upper)) continue;
    if (/^[\d\s\-+%]+$/.test(upper)) continue;
    const normalized = stripDescriptivePrefixes(upper);
    if (seenNormalized.has(normalized)) continue;
    seenNormalized.add(normalized);

    tokens.push({ raw: cleaned, normalized, position: position++ });
  }

  return tokens;
}

// ─── Fast-path "clean INCI" (port de app/api/analyser/route.ts) ─────────────
const CLEAN_INCI_CHARSET_RE = /^[\sA-Za-z0-9\-\(\)\.\/,;:'&%À-ſ•·●◆▪\[\]+]+$/;
const SEPARATOR_RE = /[,•·●◆▪]/;

/**
 * "Ce texte INCI a l'air déjà propre — pas besoin du parseur AI / validateur".
 * Quand true, on parse + score DÉTERMINISTIQUEMENT sans aucun appel LLM.
 */
export function isCleanInciInput(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 20) return false;
  if (!SEPARATOR_RE.test(trimmed)) return false;
  const tokens = trimmed
    .split(/[,•·●◆▪]/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length < 4) return false;
  for (const tok of tokens) {
    if (tok.length === 0 || tok.length > 140) return false;
  }
  return CLEAN_INCI_CHARSET_RE.test(trimmed);
}
