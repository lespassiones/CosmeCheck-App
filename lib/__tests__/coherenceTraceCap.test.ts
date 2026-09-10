/**
 * Non-régression du PLAFOND DE POSITION du barème de cohérence (v12).
 *
 * Le refactor du 8 juil 2026 (commit 7a26e52, ALGO_VERSION v4 -> v10) avait
 * remplacé le barème déterministe par le score rendu directement par le LLM.
 * Or le LLM ne reçoit pas la position des ingrédients : il a donc noté
 * « 100 % tenue » des promesses dont le seul actif était en 25e ou 33e place,
 * sous le seuil du parfum ou du conservateur.
 *
 * Mesuré en prod sur les promesses hors « sans X » dont TOUS les actifs
 * trouvés étaient en trace : avant le 8 juil, 17 cas, 0 au-dessus de 60.
 * Après, 89 cas, 71 au-dessus de 60 dont 21 à 100 %.
 *
 * Ces tests rejouent les cas réels observés en prod pour garantir que le
 * plafond tient : un actif en trace ne dépasse JAMAIS 60, quel que soit son
 * niveau de preuve.
 */
import { resolveOpenPromise, type LlmPromiseProposal, type OpenLlmMatch } from '@/lib/coherence/engine'
import type { AnalyseItem } from '@/lib/analysis/types'

function item(partial: Partial<AnalyseItem> & { position: number }): AnalyseItem {
  return {
    position: partial.position,
    input: partial.input ?? partial.name ?? `ing-${partial.position}`,
    slug: partial.slug ?? null,
    name: partial.name ?? null,
    colorRating: null,
    dbColorRating: null,
    casNumber: null,
    translationFr: null,
    primaryFunction: null,
    allFunctions: undefined,
    tags: undefined,
    matchKind: undefined,
    confidence: 1,
    thresholdContext: partial.thresholdContext ?? null,
    thresholdLabel: null,
  } as AnalyseItem
}

/** Formule où l'actif visé est listé APRÈS le parfum, donc en trace (<1 %). */
function formulaWithActiveInTrace(slug: string, name: string, position: number): AnalyseItem[] {
  return [
    item({ position: 0, slug: 'aqua', name: 'Aqua', thresholdContext: 'before_fragrance' }),
    item({ position: 1, slug: 'parfum', name: 'Parfum', thresholdContext: 'before_fragrance' }),
    item({ position, slug, name, thresholdContext: 'after_fragrance' }),
  ]
}

function match(slug: string, name: string, evidence: OpenLlmMatch['evidence']): OpenLlmMatch {
  return { item_slug: slug, item_name: name, evidence, reason: 'test' }
}

describe('plafond de position — cas de régression réels observés en prod', () => {
  // Chaque ligne = une promesse réellement notée trop haut par le score LLM
  // entre juillet et septembre 2026, avec le score qui était affiché.
  const CAS: {
    promesse: string
    slug: string
    actif: string
    position: number
    scoreLlmAffiche: number
  }[] = [
    { promesse: 'relance la croissance capillaire', slug: 'calcium-pantothenate', actif: 'CALCIUM PANTOTHENATE', position: 33, scoreLlmAffiche: 90 },
    { promesse: 'répare les pieds très secs', slug: 'tocopherol', actif: 'TOCOPHEROL', position: 27, scoreLlmAffiche: 90 },
    { promesse: 'nourrit la peau', slug: 'brassica-napus-seed-oil', actif: 'BRASSICA NAPUS SEED OIL', position: 25, scoreLlmAffiche: 100 },
    { promesse: 'adoucit la peau', slug: 'helianthus-annuus-seed-oil', actif: 'HELIANTHUS ANNUUS SEED OIL', position: 22, scoreLlmAffiche: 100 },
  ]

  it.each(CAS)(
    '« $promesse » : $actif en position $position (en trace) ne peut pas valoir $scoreLlmAffiche',
    ({ promesse, slug, actif, position, scoreLlmAffiche }) => {
      const proposal: LlmPromiseProposal = {
        category_slug: 'autre',
        label: promesse,
        excerpt: promesse,
      }
      const p = resolveOpenPromise(
        proposal,
        formulaWithActiveInTrace(slug, actif, position),
        // Niveau de preuve le plus favorable : même « documented » ne suffit pas.
        [match(slug, actif, 'documented')],
        [],
      )
      expect(p.score).toBeLessThanOrEqual(60)
      expect(p.score).toBeLessThan(scoreLlmAffiche)
      expect(p.verdict).toBe('partielle')
      // L'actif reste affiché, avec son drapeau de position.
      expect(p.foundActives).toHaveLength(1)
      expect(p.foundActives[0]).toMatchObject({ position, inTrace: true })
    },
  )
})

describe('barème déterministe — bonus, malus et plafonds', () => {
  const proposal: LlmPromiseProposal = {
    category_slug: 'hydratation',
    label: 'hydrate en profondeur',
    excerpt: 'hydrate en profondeur',
  }

  /** Formule où les actifs sont AVANT le parfum, donc bien dosés. */
  function wellDosed(slugs: [string, string][]): AnalyseItem[] {
    return [
      item({ position: 0, slug: 'aqua', name: 'Aqua', thresholdContext: 'before_fragrance' }),
      ...slugs.map(([slug, name], i) =>
        item({ position: i + 1, slug, name, thresholdContext: 'before_fragrance' }),
      ),
      item({ position: slugs.length + 1, slug: 'parfum', name: 'Parfum', thresholdContext: 'before_fragrance' }),
    ]
  }

  it('1 actif documenté bien dosé → tenue 80 (et pas 100)', () => {
    const p = resolveOpenPromise(
      proposal,
      wellDosed([['glycerin', 'Glycerin']]),
      [match('glycerin', 'Glycerin', 'documented')],
      [],
    )
    expect(p).toMatchObject({ verdict: 'tenue', score: 80 })
  })

  it('bonus +5 par actif documenté supplémentaire', () => {
    const p = resolveOpenPromise(
      proposal,
      wellDosed([['glycerin', 'Glycerin'], ['sodium-hyaluronate', 'Sodium Hyaluronate']]),
      [
        match('glycerin', 'Glycerin', 'documented'),
        match('sodium-hyaluronate', 'Sodium Hyaluronate', 'documented'),
      ],
      [],
    )
    expect(p).toMatchObject({ verdict: 'tenue', score: 85 })
  })

  it('1 seul actif supportif bien dosé → partielle 55, pas tenue', () => {
    const p = resolveOpenPromise(
      proposal,
      wellDosed([['panthenol', 'Panthenol']]),
      [match('panthenol', 'Panthenol', 'supportive')],
      [],
    )
    expect(p).toMatchObject({ verdict: 'partielle', score: 55 })
  })

  it('2 actifs supportifs bien dosés → tenue 72', () => {
    const p = resolveOpenPromise(
      proposal,
      wellDosed([['panthenol', 'Panthenol'], ['squalane', 'Squalane']]),
      [
        match('panthenol', 'Panthenol', 'supportive'),
        match('squalane', 'Squalane', 'supportive'),
      ],
      [],
    )
    expect(p).toMatchObject({ verdict: 'tenue', score: 72 })
  })

  it('effet uniquement visuel/sensoriel → partielle 30', () => {
    const p = resolveOpenPromise(
      proposal,
      wellDosed([['dimethicone', 'Dimethicone']]),
      [match('dimethicone', 'Dimethicone', 'marketing')],
      [],
    )
    expect(p).toMatchObject({ verdict: 'partielle', score: 30 })
    expect(p.cosmeticActives).toHaveLength(1)
    expect(p.foundActives).toHaveLength(0)
  })

  it('aucun ingrédient réel cité → non démontré 0', () => {
    const p = resolveOpenPromise(proposal, wellDosed([['glycerin', 'Glycerin']]), [], ['niacinamide'])
    expect(p).toMatchObject({ verdict: 'non_demontree', score: 0 })
  })

  it('un actif documenté bien dosé sauve une promesse malgré un second en trace', () => {
    const items = [
      item({ position: 0, slug: 'aqua', name: 'Aqua', thresholdContext: 'before_fragrance' }),
      item({ position: 1, slug: 'glycerin', name: 'Glycerin', thresholdContext: 'before_fragrance' }),
      item({ position: 2, slug: 'parfum', name: 'Parfum', thresholdContext: 'before_fragrance' }),
      item({ position: 30, slug: 'tocopherol', name: 'Tocopherol', thresholdContext: 'after_fragrance' }),
    ]
    const p = resolveOpenPromise(
      proposal,
      items,
      [
        match('glycerin', 'Glycerin', 'documented'),
        match('tocopherol', 'Tocopherol', 'documented'),
      ],
      [],
    )
    // docWellDosed = 1, docTrace = 1 → l'actif en trace ne rapporte pas de bonus.
    expect(p).toMatchObject({ verdict: 'tenue', score: 80 })
  })
})
