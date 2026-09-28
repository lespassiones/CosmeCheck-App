/**
 * Annuaire des ingrédients : sections par lettre, pagination en deux phases,
 * libellés. Test pur (env node).
 */
import {
  buildDirectoryItems,
  buildSearchItems,
  firstPageParam,
  formatCount,
  formatPrevalence,
  letterOf,
  toDirectoryPage,
  type DirectoryItem,
  type DirectoryPage,
  type DirectoryRow,
} from '@/components/ingredient/directory'

function row(name: string, slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')): DirectoryRow {
  return { slug, name, color_rating: 'Vert', prevalence_pct: null, sort_name: name.toLowerCase() }
}

/** Représentation compacte : « A » pour un en-tête, « [nom] » pour une ligne. */
function shape(items: DirectoryItem[]): string[] {
  return items.map((i) =>
    i.kind === 'header'
      ? i.letter
      : `${i.first ? '(' : ''}${i.row.name}${i.last ? ')' : ''}`,
  )
}

describe('letterOf', () => {
  it('range par première lettre, accents ignorés', () => {
    expect(letterOf('ALLANTOIN')).toBe('A')
    expect(letterOf('bisabolol')).toBe('B')
    expect(letterOf('Éthylhexylglycérine')).toBe('E')
  })

  it('met les chiffres et symboles dans « # »', () => {
    expect(letterOf('1,2-HEXANEDIOL')).toBe('#')
    expect(letterOf('(+)-LIMONENE')).toBe('#')
    expect(letterOf('')).toBe('#')
  })
})

describe('firstPageParam', () => {
  it('démarre au A par défaut (les noms en chiffre passent après Z)', () => {
    expect(firstPageParam('A')).toEqual({ phase: 'letters', after: { name: 'a', slug: '' } })
  })

  it('se place sur la lettre choisie dans l’index', () => {
    expect(firstPageParam('M')).toEqual({ phase: 'letters', after: { name: 'm', slug: '' } })
  })

  it('« # » lit le début de la table', () => {
    expect(firstPageParam('#')).toEqual({ phase: 'other', after: null })
  })
})

describe('toDirectoryPage', () => {
  it('page pleine en phase lettres : continue après la dernière ligne', () => {
    const raw = [row('ABIES'), row('ACACIA')]
    const page = toDirectoryPage(firstPageParam('A'), raw, 2)
    expect(page.rows).toHaveLength(2)
    expect(page.next).toEqual({ phase: 'letters', after: { name: 'acacia', slug: 'acacia' } })
  })

  it('fin des lettres : enchaîne sur les noms en chiffre', () => {
    const page = toDirectoryPage(firstPageParam('Z'), [row('ZINC OXIDE')], 60)
    expect(page.next).toEqual({ phase: 'other', after: null })
  })

  it('phase « # » : garde les chiffres et s’arrête à la première lettre', () => {
    const raw = [row('1,2-HEXANEDIOL'), row('7-DEHYDROCHOLESTEROL'), row('A-TERPINYL ACETATE')]
    const page = toDirectoryPage({ phase: 'other', after: null }, raw, 3)
    expect(page.rows.map((r) => r.name)).toEqual(['1,2-HEXANEDIOL', '7-DEHYDROCHOLESTEROL'])
    expect(page.next).toBeNull()
  })

  it('phase « # » sur une page pleine de chiffres : page suivante', () => {
    const raw = [row('1-NAPHTHOL'), row('2-METHYLRESORCINOL')]
    const page = toDirectoryPage({ phase: 'other', after: null }, raw, 2)
    expect(page.rows).toHaveLength(2)
    expect(page.next).toEqual({
      phase: 'other',
      after: { name: '2-methylresorcinol', slug: '2-methylresorcinol' },
    })
  })

  it('phase « # » vide : terminé', () => {
    expect(toDirectoryPage({ phase: 'other', after: null }, [], 60).next).toBeNull()
  })
})

describe('buildDirectoryItems', () => {
  const letters: DirectoryPage = {
    phase: 'letters',
    rows: [row('ALLANTOIN'), row('AQUA'), row('BETAINE'), row('ZINC OXIDE')],
    next: { phase: 'other', after: null },
  }
  const digits: DirectoryPage = {
    phase: 'other',
    rows: [row('1,2-HEXANEDIOL'), row('1-NAPHTHOL')],
    next: null,
  }

  it('une section par lettre, « # » en dernier', () => {
    expect(shape(buildDirectoryItems([letters, digits], true))).toEqual([
      'A', '(ALLANTOIN', 'AQUA)',
      'B', '(BETAINE)',
      'Z', '(ZINC OXIDE)',
      '#', '(1,2-HEXANEDIOL', '1-NAPHTHOL)',
    ])
  })

  it('ne ferme pas la dernière carte tant qu’il reste des pages', () => {
    expect(shape(buildDirectoryItems([letters], false)).slice(-1)).toEqual(['(ZINC OXIDE'])
  })

  it('une section coupée entre deux pages reste une seule carte', () => {
    const p1: DirectoryPage = { phase: 'letters', rows: [row('CAFFEINE')], next: null }
    const p2: DirectoryPage = { phase: 'letters', rows: [row('CITRIC ACID'), row('DIMETHICONE')], next: null }
    expect(shape(buildDirectoryItems([p1, p2], true))).toEqual([
      'C', '(CAFFEINE', 'CITRIC ACID)',
      'D', '(DIMETHICONE)',
    ])
  })

  it('un nom hors alphabet trié parmi les lettres reste dans la section en cours', () => {
    const page: DirectoryPage = {
      phase: 'letters',
      rows: [row('OLEA EUROPAEA'), row('ŒNOTHERA BIENNIS'), row('ORYZA SATIVA')],
      next: null,
    }
    expect(shape(buildDirectoryItems([page], true))).toEqual([
      'O', '(OLEA EUROPAEA', 'ŒNOTHERA BIENNIS', 'ORYZA SATIVA)',
    ])
  })

  it('jamais deux en-têtes pour la même lettre (clés uniques)', () => {
    const page: DirectoryPage = {
      phase: 'letters',
      rows: [row('ACACIA'), row('BETAINE'), row('AVENA SATIVA')],
      next: null,
    }
    const keys = buildDirectoryItems([page], true).map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('liste vide', () => {
    expect(buildDirectoryItems([], true)).toEqual([])
  })
})

describe('buildSearchItems', () => {
  it('une seule carte, sans en-tête', () => {
    expect(shape(buildSearchItems([row('NIACINAMIDE'), row('NIACIN')]))).toEqual([
      '(NIACINAMIDE',
      'NIACIN)',
    ])
    expect(shape(buildSearchItems([row('NIACINAMIDE')]))).toEqual(['(NIACINAMIDE)'])
  })
})

describe('formatPrevalence', () => {
  it('virgule décimale et espace insécable', () => {
    expect(formatPrevalence(12.4)).toBe('12,4 %')
    expect(formatPrevalence('6.5000')).toBe('6,5 %')
  })

  it('les traces ne s’affichent plus (« 0.0 % » avant)', () => {
    expect(formatPrevalence(0.01)).toBeNull()
    expect(formatPrevalence(0.049)).toBeNull()
    expect(formatPrevalence(0.05)).toBe('0,1 %')
  })

  it('rien si inconnu ou nul', () => {
    expect(formatPrevalence(null)).toBeNull()
    expect(formatPrevalence(0)).toBeNull()
    expect(formatPrevalence('abc')).toBeNull()
  })
})

describe('formatCount', () => {
  it('sépare les milliers', () => {
    expect(formatCount(15773)).toBe('15 773')
    expect(formatCount(154)).toBe('154')
    expect(formatCount(1234567)).toBe('1 234 567')
  })
})
