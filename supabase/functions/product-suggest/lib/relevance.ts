// Relevance gate for product search results. Port of CosmetWiki
// lib/productSearch/relevance.ts. Free fuzzy-search APIs (OBF, INCIDecoder,
// DuckDuckGo) happily return loosely-related products when the query has no
// good match; without this gate we'd surface "Mitomo" for the query "brian".

const STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "from", "this", "that", "into", "onto",
  "over", "under", "le", "la", "les", "un", "une", "des", "du", "de", "et",
  "ou", "pour", "avec", "sans", "par", "sur", "ce", "cette", "ces", "mon",
  "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses",
]);

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function flatten(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return flatten(s)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Strip common FR/EN plural / nominal suffixes so "cheveux" ↔ "cheveu". */
function stem(w: string): string {
  if (w.length < 5) return w;
  for (const suf of ["ements", "ement", "ation", "tions", "ions", "eaux", "aux", "ies", "es", "s", "x"]) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) {
      return w.slice(0, -suf.length);
    }
  }
  return w;
}

/** True iff at least one significant query token appears in the candidate. */
export function matchesQuery(query: string, candidate: string): boolean {
  const qTokens = tokens(query);
  if (qTokens.length === 0) return true;
  const flat = flatten(candidate);
  if (!flat) return false;
  if (qTokens.some((t) => flat.includes(t))) return true;
  const cStems = tokens(candidate).map(stem);
  if (cStems.length === 0) return false;
  return qTokens.some((qt) => {
    const qs = stem(qt);
    if (qs.length < 3) return false;
    return cStems.some((cs) => cs === qs || cs.includes(qs) || qs.includes(cs));
  });
}
