/**
 * Annuaire des ingrédients : logique pure (sections par lettre, pagination,
 * libellés). Testée dans `lib/__tests__/ingredientDirectory.test.ts`.
 *
 * La RPC `cosme_check_list_ingredients_page` trie par nom : les noms qui
 * commencent par un chiffre (« 1,2-HEXANEDIOL », 154 fiches au 29 sept 2026)
 * passent AVANT le A. L'annuaire démarre donc au A et range ces noms dans une
 * section « # » en fin de liste, comme les contacts du téléphone.
 *
 * Pagination par curseur en deux phases :
 *   - `letters` : du curseur (lettre choisie, slug vide) jusqu'à la fin ;
 *   - `other`   : reprend au début de la table et garde les noms qui ne
 *                 commencent pas par une lettre, jusqu'à la première lettre.
 */

export const DIRECTORY_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#',
] as const

export type DirectoryLetter = (typeof DIRECTORY_LETTERS)[number]

export interface DirectoryRow {
  slug: string
  name: string
  color_rating: string | null
  prevalence_pct: number | string | null
  /** Renvoyé par la liste alphabétique seulement (clé de curseur). */
  sort_name?: string
}

export interface DirectoryCursor {
  name: string
  slug: string
}

export interface DirectoryPageParam {
  phase: 'letters' | 'other'
  after: DirectoryCursor | null
}

export interface DirectoryPage {
  phase: 'letters' | 'other'
  rows: DirectoryRow[]
  next: DirectoryPageParam | null
}

export type DirectoryItem =
  | { kind: 'header'; key: string; letter: DirectoryLetter }
  | { kind: 'row'; key: string; row: DirectoryRow; first: boolean; last: boolean }

/** Lettre de rangement d'un nom (accents ignorés), « # » hors alphabet. */
export function letterOf(name: string): DirectoryLetter {
  const first = name.trim().charAt(0).normalize('NFD').charAt(0).toUpperCase()
  return /^[A-Z]$/.test(first) ? (first as DirectoryLetter) : '#'
}

function cursorOf(row: DirectoryRow): DirectoryCursor {
  return { name: row.sort_name ?? row.name.toLowerCase(), slug: row.slug }
}

/** Première page à charger quand on se place sur une lettre de l'index. */
export function firstPageParam(anchor: DirectoryLetter): DirectoryPageParam {
  if (anchor === '#') return { phase: 'other', after: null }
  return { phase: 'letters', after: { name: anchor.toLowerCase(), slug: '' } }
}

/** Transforme une page brute de la RPC en page d'annuaire (+ page suivante). */
export function toDirectoryPage(
  param: DirectoryPageParam,
  raw: readonly DirectoryRow[],
  pageSize: number,
): DirectoryPage {
  const tail = raw[raw.length - 1]
  if (param.phase === 'letters') {
    const next: DirectoryPageParam =
      raw.length >= pageSize && tail
        ? { phase: 'letters', after: cursorOf(tail) }
        : { phase: 'other', after: null }
    return { phase: 'letters', rows: [...raw], next }
  }
  const firstLetter = raw.findIndex((r) => letterOf(r.name) !== '#')
  const rows = firstLetter === -1 ? [...raw] : raw.slice(0, firstLetter)
  const next: DirectoryPageParam | null =
    firstLetter === -1 && raw.length >= pageSize && tail
      ? { phase: 'other', after: cursorOf(tail) }
      : null
  return { phase: 'other', rows, next }
}

/** Marque la première et la dernière ligne de chaque carte. */
function markEdges(items: DirectoryItem[], complete: boolean): DirectoryItem[] {
  return items.map((item, i) => {
    if (item.kind !== 'row') return item
    const prev = items[i - 1]
    const next = items[i + 1]
    return {
      ...item,
      first: !prev || prev.kind === 'header',
      last: next ? next.kind === 'header' : complete,
    }
  })
}

/**
 * Liste à plat (en-têtes de lettre + lignes) pour la FlatList.
 * `complete` : plus rien à charger, la dernière carte peut se fermer.
 */
export function buildDirectoryItems(
  pages: readonly DirectoryPage[],
  complete: boolean,
): DirectoryItem[] {
  const items: DirectoryItem[] = []
  const opened = new Set<DirectoryLetter>()
  let current: DirectoryLetter | null = null
  for (const page of pages) {
    for (const row of page.rows) {
      const own = letterOf(row.name)
      // Un nom hors alphabet trié au milieu des lettres (« Œ… ») reste dans
      // la section en cours ; seule la phase `other` alimente « # ».
      const group: DirectoryLetter =
        page.phase === 'other' ? '#' : own !== '#' ? own : current ?? '#'
      // Une lettre déjà ouverte n'a jamais de second en-tête (clés uniques).
      if (group !== current && !opened.has(group)) {
        items.push({ kind: 'header', key: `h-${group}`, letter: group })
        opened.add(group)
        current = group
      }
      items.push({ kind: 'row', key: row.slug, row, first: false, last: false })
    }
  }
  return markEdges(items, complete)
}

/** Résultats de recherche : une seule carte, sans en-tête de lettre. */
export function buildSearchItems(rows: readonly DirectoryRow[]): DirectoryItem[] {
  return markEdges(
    rows.map((row): DirectoryItem => ({ kind: 'row', key: row.slug, row, first: false, last: false })),
    true,
  )
}

/**
 * « 12,4 % ». Null si inconnu ou sous 0,05 % (s'arrondirait à « 0,0 % ») :
 * ces traces encombraient la moitié des lignes et tassaient les noms.
 */
export function formatPrevalence(pct: number | string | null): string | null {
  if (pct == null) return null
  const n = Number(pct)
  if (!Number.isFinite(n) || n < 0.05) return null
  return `${n.toFixed(1).replace('.', ',')} %`
}

/** « 15 773 » (espace insécable entre les milliers). */
export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}
