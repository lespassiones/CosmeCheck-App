// Normalize a free-form product query into a stable cache key. Port of
// CosmetWiki lib/productSearch/normalize.ts.
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 1)
    .sort()
    .join(" ");
}
