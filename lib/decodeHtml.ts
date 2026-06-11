/**
 * Décode les entités HTML courantes dans les noms de produits issus du scraping.
 * Ex : "L&#x27;Oréal" → "L'Oréal", "Beurre &amp; Co" → "Beurre & Co"
 */
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
  '&#x27;': "'",
  '&#x2F;': '/',
  '&#x60;': '`',
  '&#39;': "'",
  '&#47;': '/',
}

export function decodeHtml(str: string | null | undefined): string {
  if (!str) return str ?? ''
  return str
    .replace(/&#x[0-9A-Fa-f]+;/g, (m) => HTML_ENTITIES[m] ?? m)
    .replace(/&#\d+;/g, (m) => HTML_ENTITIES[m] ?? String.fromCharCode(parseInt(m.slice(2, -1), 10)))
    .replace(/&[a-zA-Z]+;/g, (m) => HTML_ENTITIES[m] ?? m)
}
