/**
 * normalizeSectionOrder : recalcul des positions après un drag intra-section.
 *
 * Ces tests verrouillent le contrat de persistance du drag : on ré-attribue
 * le multiset TRIÉ des positions existantes de la section dans le nouvel
 * ordre visuel (permutation LOCALE : l'entrelacement avec l'autre section est
 * préservé, aucune ligne hors section n'est écrite), et la sortie est
 * MINIMALE (seules les lignes dont la position change). Cas dégradé couvert :
 * des positions en doublon (héritage du default 0 avant backfill) déclenchent
 * une renumérotation complète 0..n-1 dans le même appel.
 */
import { normalizeSectionOrder, type RoutinePositionRow } from '@/lib/routine/organize'

function row(itemId: string, timeOfDay: RoutinePositionRow['timeOfDay'], position: number): RoutinePositionRow {
  return { itemId, timeOfDay, position }
}

describe('normalizeSectionOrder : permutation intra-section', () => {
  // Routine entrelacée : matin = A, C, D (positions 0, 2, 5) ; soir = B, E.
  const items = [
    row('A', 'morning', 0),
    row('B', 'evening', 1),
    row('C', 'morning', 2),
    row('D', 'morning', 5),
    row('E', 'evening', 7),
  ]

  it('ré-attribue le multiset trié des positions existantes dans le nouvel ordre', () => {
    const updates = normalizeSectionOrder(items, 'morning', ['D', 'A', 'C'])
    // Multiset {0, 2, 5} ré-attribué : D -> 0, A -> 2, C -> 5.
    expect(updates).toEqual([
      { id: 'D', position: 0 },
      { id: 'A', position: 2 },
      { id: 'C', position: 5 },
    ])
  })

  it('ne touche JAMAIS aux lignes de l autre section', () => {
    const updates = normalizeSectionOrder(items, 'morning', ['D', 'A', 'C'])
    expect(updates.some((u) => u.id === 'B' || u.id === 'E')).toBe(false)
  })

  it('sortie minimale : les items qui gardent leur position ne sont pas émis', () => {
    // A reste en tête (position 0 inchangée) : seuls D et C bougent.
    const updates = normalizeSectionOrder(items, 'morning', ['A', 'D', 'C'])
    expect(updates).toEqual([
      { id: 'D', position: 2 },
      { id: 'C', position: 5 },
    ])
  })

  it('permutation identité -> aucune mise à jour', () => {
    expect(normalizeSectionOrder(items, 'morning', ['A', 'C', 'D'])).toEqual([])
  })

  it('réordonner le soir préserve les positions du matin', () => {
    const updates = normalizeSectionOrder(items, 'evening', ['E', 'B'])
    // Multiset soir {1, 7} : E -> 1, B -> 7.
    expect(updates).toEqual([
      { id: 'E', position: 1 },
      { id: 'B', position: 7 },
    ])
  })
})

describe('normalizeSectionOrder : items both (matin ET soir)', () => {
  const items = [
    row('A', 'morning', 0),
    row('X', 'both', 1),
    row('B', 'evening', 2),
    row('C', 'morning', 3),
  ]

  it('un item both participe à la permutation du matin', () => {
    // Section matin = A, X, C (positions 0, 1, 3).
    const updates = normalizeSectionOrder(items, 'morning', ['X', 'C', 'A'])
    expect(updates).toEqual([
      { id: 'X', position: 0 },
      { id: 'C', position: 1 },
      { id: 'A', position: 3 },
    ])
  })

  it('un item both participe aussi à la permutation du soir', () => {
    // Section soir = X, B (positions 1, 2).
    const updates = normalizeSectionOrder(items, 'evening', ['B', 'X'])
    expect(updates).toEqual([
      { id: 'B', position: 1 },
      { id: 'X', position: 2 },
    ])
  })
})

describe('normalizeSectionOrder : doublons de positions (héritage default 0)', () => {
  it('renumérote TOUTE la liste 0..n-1 en respectant le nouvel ordre de section', () => {
    // Quatre lignes héritées avec position = 0 partout (ordre d'affichage donné).
    const items = [
      row('M1', 'morning', 0),
      row('E1', 'evening', 0),
      row('M2', 'morning', 0),
      row('E2', 'evening', 0),
    ]
    const updates = normalizeSectionOrder(items, 'morning', ['M2', 'M1'])

    // Nouvel ordre complet : M2, E1, M1, E2 -> positions 0..3.
    // M2 garde 0 (déjà sa valeur) : sortie minimale sans lui.
    expect(updates).toEqual([
      { id: 'E1', position: 1 },
      { id: 'M1', position: 2 },
      { id: 'E2', position: 3 },
    ])

    // Preuve : en appliquant les mises à jour, plus aucun doublon, 0..n-1 complet.
    const finalPositions = new Map(items.map((it) => [it.itemId, it.position]))
    for (const u of updates) finalPositions.set(u.id, u.position)
    expect([...finalPositions.values()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })
})

describe('normalizeSectionOrder : entrées défensives', () => {
  it('id inconnu ignoré + item de section oublié rajouté en fin (permutation toujours complète)', () => {
    const items = [row('A', 'morning', 0), row('B', 'morning', 1)]
    // 'ghost' n existe pas ; 'A' est absent du nouvel ordre -> rajouté après B.
    const updates = normalizeSectionOrder(items, 'morning', ['ghost', 'B'])
    expect(updates).toEqual([
      { id: 'B', position: 0 },
      { id: 'A', position: 1 },
    ])
  })

  it('liste vide -> aucune mise à jour', () => {
    expect(normalizeSectionOrder([], 'morning', [])).toEqual([])
  })
})
