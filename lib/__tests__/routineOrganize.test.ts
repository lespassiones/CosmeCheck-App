/**
 * organizeRoutine / computePositions : moteur déterministe de réorganisation.
 *
 * Ces tests documentent la TABLE DE RÈGLES (première règle qui matche gagne)
 * et les invariants qui justifient une réorganisation gratuite côté client :
 * zéro IA, zéro crédit, même entrée = même sortie. Ils verrouillent notamment
 * que les tags `filtre-uv` SEULS ne forcent jamais un produit au matin (les
 * crèmes de jour en contiennent) et que la 2e passe est un no-op (idempotence,
 * base du court-circuit « Ta routine est déjà bien organisée »).
 */
import {
  computePositions,
  organizeRoutine,
  type OrganizeInput,
  type TimeOfDay,
} from '@/lib/routine/organize'

/** Accent aigu combinant (U+0301), construit en ASCII pur (pas de littéral). */
const COMBINING_ACUTE = String.fromCharCode(0x0301)

function mkItem(
  slug: string | null,
  tags: string[] = [],
): OrganizeInput['items'][number] {
  return { slug, tags, name: slug ?? 'inconnu', input: slug ?? 'inconnu', position: 1 }
}

function mkInput(opts: {
  id: string
  name: string
  timeOfDay?: TimeOfDay
  position?: number
  category?: string | null
  categoryPrecise?: string | null
  items?: OrganizeInput['items']
}): OrganizeInput {
  return {
    itemId: opts.id,
    currentTimeOfDay: opts.timeOfDay ?? 'morning',
    currentPosition: opts.position ?? 0,
    name: opts.name,
    category: opts.category ?? null,
    categoryPrecise: opts.categoryPrecise ?? null,
    items: opts.items ?? [],
  }
}

describe('organizeRoutine : règle SPF / solaire', () => {
  it('catégorie solaire -> matin, rank 90, reason spf', () => {
    const [p] = organizeRoutine([
      mkInput({ id: 'spf', name: 'Protection quotidienne', category: 'solaire', timeOfDay: 'evening' }),
    ])
    expect(p.reason).toBe('spf')
    expect(p.timeOfDay).toBe('morning')
    expect(p.rank).toBe(90)
    expect(p.changed).toBe(true)
  })

  it('le SPF est le DERNIER geste du matin après tri', () => {
    const inputs = [
      mkInput({ id: 'spf', name: 'Fluide solaire SPF 50', timeOfDay: 'morning', position: 0 }),
      mkInput({ id: 'net', name: 'Gel nettoyant doux', timeOfDay: 'morning', position: 1 }),
      mkInput({ id: 'hyd', name: 'Crème hydratante', timeOfDay: 'morning', position: 2 }),
    ]
    const positions = computePositions(organizeRoutine(inputs), inputs)
    const last = positions[positions.length - 1]
    expect(last.itemId).toBe('spf')
  })

  it('crème de jour avec tag filtre-uv mais nom/catégorie non solaires -> PAS forcée matin (reason hydratant)', () => {
    const [p] = organizeRoutine([
      mkInput({
        id: 'jour',
        name: 'Crème de jour',
        category: 'creme_visage',
        timeOfDay: 'evening',
        items: [mkItem('octocrylene', ['filtre-uv'])],
      }),
    ])
    expect(p.reason).toBe('hydratant')
    expect(p.timeOfDay).toBe('evening') // section inchangée : pas de forçage matin
    expect(p.changed).toBe(false)
  })
})

describe('organizeRoutine : rétinoïdes et exfoliants', () => {
  it('item avec tag retinoides -> soir, rank 60', () => {
    const [p] = organizeRoutine([
      mkInput({
        id: 'ret',
        name: 'Concentré nuit',
        timeOfDay: 'morning',
        items: [mkItem(null, ['retinoides'])],
      }),
    ])
    expect(p.reason).toBe('retinoide')
    expect(p.timeOfDay).toBe('evening')
    expect(p.rank).toBe(60)
    expect(p.changed).toBe(true)
  })

  it('slug retinol -> soir également', () => {
    const [p] = organizeRoutine([
      mkInput({ id: 'ret2', name: 'Concentré lissant', timeOfDay: 'morning', items: [mkItem('retinol')] }),
    ])
    expect(p.reason).toBe('retinoide')
    expect(p.timeOfDay).toBe('evening')
  })

  it('slug glycolic-acid en sérum -> soir, rank 55, reason exfoliant', () => {
    const [p] = organizeRoutine([
      mkInput({
        id: 'exfo',
        name: 'Sérum exfoliant',
        timeOfDay: 'morning',
        items: [mkItem('glycolic-acid')],
      }),
    ])
    expect(p.reason).toBe('exfoliant')
    expect(p.timeOfDay).toBe('evening')
    expect(p.rank).toBe(55)
  })

  it('nettoyant à l acide salicylique -> reste nettoyant rank 10, section INCHANGÉE (priorité règle 1)', () => {
    const [p] = organizeRoutine([
      mkInput({
        id: 'netbha',
        name: 'Gel moussant',
        category: 'nettoyant_visage',
        timeOfDay: 'morning',
        items: [mkItem('salicylic-acid', ['acide-salicylique'])],
      }),
    ])
    expect(p.reason).toBe('nettoyant')
    expect(p.rank).toBe(10)
    expect(p.timeOfDay).toBe('morning')
    expect(p.changed).toBe(false)
  })
})

describe('organizeRoutine : vitamine C', () => {
  it('slug ascorbic-acid -> matin, rank 55', () => {
    const [p] = organizeRoutine([
      mkInput({ id: 'vitc', name: 'Booster antioxydant', timeOfDay: 'evening', items: [mkItem('ascorbic-acid')] }),
    ])
    expect(p.reason).toBe('vitamine_c')
    expect(p.timeOfDay).toBe('morning')
    expect(p.rank).toBe(55)
    expect(p.changed).toBe(true)
  })

  it('dérivé tetrahexyldecyl-ascorbate -> matin également', () => {
    const [p] = organizeRoutine([
      mkInput({
        id: 'vitc2',
        name: 'Concentré défense',
        timeOfDay: 'evening',
        items: [mkItem('tetrahexyldecyl-ascorbate')],
      }),
    ])
    expect(p.reason).toBe('vitamine_c')
    expect(p.timeOfDay).toBe('morning')
  })
})

describe('computePositions : ordre intra-section', () => {
  it('nettoyant < sérum < contour yeux < hydratant < huile < SPF (positions actuelles brouillées)', () => {
    const inputs = [
      mkInput({ id: 'net', name: 'Gel nettoyant doux', timeOfDay: 'morning', position: 5 }),
      mkInput({ id: 'ser', name: 'Sérum apaisant', timeOfDay: 'morning', position: 4 }),
      mkInput({ id: 'eye', name: 'Contour des yeux', timeOfDay: 'morning', position: 3 }),
      mkInput({ id: 'hyd', name: 'Crème hydratante', timeOfDay: 'morning', position: 2 }),
      mkInput({ id: 'oil', name: 'Huile visage', timeOfDay: 'morning', position: 1 }),
      mkInput({ id: 'spf', name: 'Fluide solaire SPF 50', timeOfDay: 'morning', position: 0 }),
    ]
    const placements = organizeRoutine(inputs)
    const order = computePositions(placements, inputs).map((p) => p.itemId)
    expect(order).toEqual(['net', 'ser', 'eye', 'hyd', 'oil', 'spf'])
  })

  it('tiebreak stable : deux hydratants ordonnés par currentPosition puis nom', () => {
    // Positions différentes : la position actuelle gagne.
    const byPos = [
      mkInput({ id: 'a', name: 'Crème A', timeOfDay: 'morning', position: 5 }),
      mkInput({ id: 'b', name: 'Crème B', timeOfDay: 'morning', position: 2 }),
    ]
    expect(computePositions(organizeRoutine(byPos), byPos).map((p) => p.itemId)).toEqual(['b', 'a'])

    // Positions identiques : le nom départage (ordre alphabétique).
    const byName = [
      mkInput({ id: 'b', name: 'Crème B', timeOfDay: 'morning', position: 1 }),
      mkInput({ id: 'a', name: 'Crème A', timeOfDay: 'morning', position: 1 }),
    ]
    expect(computePositions(organizeRoutine(byName), byName).map((p) => p.itemId)).toEqual(['a', 'b'])
  })
})

describe('organizeRoutine : inclassable', () => {
  it('garde currentTimeOfDay (y compris both), changed === false, rank 50', () => {
    const placements = organizeRoutine([
      mkInput({ id: 'x', name: 'Brume fraicheur', timeOfDay: 'both' }),
      mkInput({ id: 'y', name: 'Brume fraicheur', timeOfDay: 'evening' }),
    ])
    expect(placements[0].reason).toBe('inclassable')
    expect(placements[0].timeOfDay).toBe('both')
    expect(placements[0].changed).toBe(false)
    expect(placements[0].rank).toBe(50)
    expect(placements[1].timeOfDay).toBe('evening')
    expect(placements[1].changed).toBe(false)
  })
})

describe('computePositions : positions globales', () => {
  const inputs = [
    mkInput({ id: 'net', name: 'Gel nettoyant', timeOfDay: 'both', position: 3 }),
    mkInput({ id: 'vitc', name: 'Sérum vitamine C', timeOfDay: 'evening', position: 2, items: [mkItem('ascorbic-acid')] }),
    mkInput({ id: 'ret', name: 'Concentré nuit', timeOfDay: 'morning', position: 1, items: [mkItem('retinol')] }),
    mkInput({ id: 'nuit', name: 'Crème de nuit', timeOfDay: 'evening', position: 0 }),
  ]

  it('0..n-1 sans trous, item both a UNE seule position, matin avant soir-only', () => {
    const placements = organizeRoutine(inputs)
    const positions = computePositions(placements, inputs)

    // Chaque item exactement une fois, positions 0..n-1 sans trous.
    expect(positions).toHaveLength(inputs.length)
    expect(new Set(positions.map((p) => p.itemId)).size).toBe(inputs.length)
    expect(positions.map((p) => p.position).sort((a, b) => a - b)).toEqual([0, 1, 2, 3])

    // Section matin (nettoyant both rank 10, vitC forcée matin rank 55) avant
    // la section soir-only (rétinoïde rank 60, crème de nuit rank 70).
    expect(positions.map((p) => p.itemId)).toEqual(['net', 'vitc', 'ret', 'nuit'])
  })

  it('idempotence : la 2e passe ne change rien (aucun changed, mêmes positions)', () => {
    const firstPlacements = organizeRoutine(inputs)
    const firstPositions = computePositions(firstPlacements, inputs)

    // On rejoue le moteur sur l'état persisté par la 1re passe.
    const secondInputs = inputs.map((input) => {
      const persisted = firstPositions.find((p) => p.itemId === input.itemId)
      if (!persisted) throw new Error('item manquant dans la 1re passe')
      return { ...input, currentTimeOfDay: persisted.timeOfDay, currentPosition: persisted.position }
    })
    const secondPlacements = organizeRoutine(secondInputs)
    expect(secondPlacements.every((p) => !p.changed)).toBe(true)

    const secondPositions = computePositions(secondPlacements, secondInputs)
    expect(secondPositions).toEqual(firstPositions)
  })
})

describe('organizeRoutine : normalisation des accents', () => {
  it('nom accentué NFC « Sérum Éclat » détecté comme sérum', () => {
    const [p] = organizeRoutine([mkInput({ id: 's', name: 'Sérum Éclat' })])
    expect(p.reason).toBe('serum')
    expect(p.rank).toBe(50)
  })

  it('nom en forme DÉCOMPOSÉE (e + accent combinant) détecté également', () => {
    // 'Se' + U+0301 + 'rum' : même rendu que 'Sérum' mais code points différents.
    const decomposed = 'Se' + COMBINING_ACUTE + 'rum E' + COMBINING_ACUTE + 'clat'
    const [p] = organizeRoutine([mkInput({ id: 's2', name: decomposed })])
    expect(p.reason).toBe('serum')
  })
})
