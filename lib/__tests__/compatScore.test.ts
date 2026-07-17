/**
 * Score de compatibilité — MOTEUR ADDITIF (personal-insights/compat).
 *
 * Modèle (choisi par le user) :
 *   score = base QUALITÉ (note/20 × 5)
 *         + bonus/malus IA nommés (±5/±10, capés ±20, ignorés en product_only)
 *         → plafond couleurs (1-2 oranges 69 ; 3+ oranges ou rouge 59)
 *         → -8 par restriction distincte
 *         → plancher qualité (formule propre) → clamp [0,100]
 * Le breakdown (base + lignes) doit SOMMER au score (hors clamp/plancher).
 */
import {
  buildCompatLines,
  colorCeiling,
  composeCompatScore,
  labelForScore,
  majorityByIngredient,
  negativeSubtitle,
  qualityScore,
  toneForScore,
  type CompatLine,
} from '../../supabase/functions/personal-insights/compat'

describe('labelForScore — 10 paliers (échelle « adapté »)', () => {
  const cases: [number, string][] = [
    [0, 'Incompatible'],
    [9, 'Incompatible'],
    [10, 'À éviter pour toi'],
    [23, 'Pas adapté'],
    [35, 'Très peu adapté'],
    [48, 'Peu adapté'],
    [55, 'Moyennement adapté'],
    [66, 'Plutôt compatible'],
    [75, 'Compatible'],
    [82, 'Très compatible'],
    [90, 'Totalement compatible'],
    [100, 'Totalement compatible'],
  ]
  it.each(cases)('%i → %s', (score, label) => {
    expect(labelForScore(score)).toBe(label)
  })

  it('sous 60, ne dit JAMAIS « compatible » en positif (règle user)', () => {
    for (let s = 0; s < 60; s++) {
      expect(labelForScore(s)).not.toMatch(/^(Assez|Plutôt|Bien|Très|Totalement) compatible$/)
    }
  })
})

describe('toneForScore', () => {
  it('rouge < 30, orange 30-49, jaune 50-69, vert ≥ 70', () => {
    expect(toneForScore(29)).toBe('rouge')
    expect(toneForScore(30)).toBe('orange')
    expect(toneForScore(49)).toBe('orange')
    expect(toneForScore(50)).toBe('jaune')
    expect(toneForScore(69)).toBe('jaune')
    expect(toneForScore(70)).toBe('vert')
  })
})

describe('qualityScore — note /20 → base 0-100', () => {
  it('conversion', () => {
    expect(qualityScore(20)).toBe(100)
    expect(qualityScore(16.82)).toBe(84)
    expect(qualityScore(15)).toBe(75)
    expect(qualityScore(0.79)).toBe(4)
    expect(qualityScore(0)).toBe(0)
  })
})

describe('colorCeiling — plafonds user', () => {
  it('rouge → 59 ; ≥3 oranges → 59 ; 1-2 oranges → 69 ; propre → 100', () => {
    expect(colorCeiling(0, 1)).toBe(59)
    expect(colorCeiling(3, 0)).toBe(59)
    expect(colorCeiling(1, 0)).toBe(69)
    expect(colorCeiling(2, 0)).toBe(69)
    expect(colorCeiling(0, 0)).toBe(100)
  })
})

describe('buildCompatLines — barème v21 (bonus tout actif utile, aucun malus jaune)', () => {
  const a = (name: string) => ({ name })

  it('3 actifs utiles → une ligne agrégée +6 avec les noms (sans « verts »)', () => {
    const out = buildCompatLines({
      contributors: [a('glycérine'), a('aloe vera'), a('karité')],
      against: [],
    })
    expect(out).toEqual([
      { label: '3 actifs utiles à ton profil : glycérine, aloe vera, karité', points: 6 },
    ])
  })

  it('12 actifs → bonus plafonné à +20, noms tronqués à 4, jamais « verts »', () => {
    const out = buildCompatLines({
      contributors: Array.from({ length: 12 }, (_, i) => a(`v${i}`)),
      against: [],
    })
    expect(out[0].points).toBe(20)
    expect(out[0].label).toContain('12 actifs utiles')
    expect(out[0].label).not.toContain('vert') // plus de couleur dans le libellé
    expect(out[0].label).toContain('…') // noms tronqués à 4
  })

  it('un jaune BÉNÉFIQUE reçoit le bonus, comme un vert (pas de distinction de couleur)', () => {
    // acide salicylique est jaune mais utile à l'acné → +2, exactement comme un vert
    const out = buildCompatLines({ contributors: [a('acide salicylique')], against: [] })
    expect(out).toEqual([{ label: '1 actif utile à ton profil : acide salicylique', points: 2 }])
  })

  it("un jaune SANS lien n'a AUCUN malus (il n'est simplement pas listé)", () => {
    // barème v21 : un jaune neutre/technique ne coûte rien (la note /20 le pénalise déjà)
    expect(buildCompatLines({ contributors: [], against: [] })).toEqual([])
  })

  it("against : -5 chacune, nommée (jusqu'à 7)", () => {
    const out = buildCompatLines({
      contributors: [],
      against: [
        { name: 'alcool', need: 'ta peau sèche' },
        { name: 'huile de coco', need: 'ton acné' },
        { name: 'parfum', need: 'ta peau réactive' },
      ],
    })
    expect(out).toEqual([
      { label: 'Alcool : à éviter pour ta peau sèche', points: -5 },
      { label: 'Huile de coco : à éviter pour ton acné', points: -5 },
      { label: 'Parfum : à éviter pour ta peau réactive', points: -5 },
    ])
  })

  it('against plafonné à 7 (8 proposés → 7 gardés)', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `ingredient ${i}`, need: 'ton profil' }))
    const out = buildCompatLines({ contributors: [], against: many })
    expect(out).toHaveLength(7)
    expect(out.every((l) => l.points === -5)).toBe(true)
  })

  it('bonus + contre-indication cumulés (ordre : actifs puis à éviter)', () => {
    const out = buildCompatLines({
      contributors: [a('glycérine'), a('aloe vera')],
      against: [{ name: 'alcool', need: 'ta peau sensible' }],
    })
    expect(out).toEqual([
      { label: '2 actifs utiles à ton profil : glycérine, aloe vera', points: 4 },
      { label: 'Alcool : à éviter pour ta peau sensible', points: -5 },
    ])
  })
})

describe('composeCompatScore — moteur additif complet', () => {
  const noIa: CompatLine[] = []

  it('base pure : produit 16/20 propre, aucun match → 80', () => {
    const r = composeCompatScore({
      scoreOver20: 16, orange: 0, red: 0, iaLines: noIa, restrictionLabels: [],
    })
    expect(r.score).toBe(80)
    expect(r.label).toBe('Très compatible')
    expect(r.breakdown).toEqual({ base: 80, lines: [] })
  })

  it('bonus IA : 16/20 + fort(+10) + modéré(+5) → 95, lignes qui somment', () => {
    const r = composeCompatScore({
      scoreOver20: 16, orange: 0, red: 0,
      iaLines: [
        { label: 'Glycérine : ton objectif hydratation', points: 10 },
        { label: 'Niacinamide : tes pores', points: 5 },
      ],
      restrictionLabels: [],
    })
    expect(r.score).toBe(95)
    expect(r.label).toBe('Totalement compatible')
    expect(r.breakdown.base + r.breakdown.lines.reduce((s, l) => s + l.points, 0)).toBe(95)
  })

  it('malus IA (contre-indication) : 15/20 - fort(-10) → 65', () => {
    const r = composeCompatScore({
      scoreOver20: 15, orange: 0, red: 0,
      iaLines: [{ label: 'Alcool : ta peau sensible', points: -10 }],
      restrictionLabels: [],
    })
    expect(r.score).toBe(65)
    expect(r.label).toBe('Plutôt compatible')
  })

  it('plafond couleurs matérialisé en ligne : 12/20 +10 = 70 mais 2 oranges → 69', () => {
    const r = composeCompatScore({
      scoreOver20: 12, orange: 2, red: 0,
      iaLines: [{ label: 'Karité : ta peau sèche', points: 10 }],
      restrictionLabels: [],
    })
    expect(r.score).toBe(69)
    const cap = r.breakdown.lines.find((l) => l.label.startsWith('Plafond'))
    expect(cap).toEqual({ label: 'Plafond : 2 ingrédients orange', points: -1 })
  })

  it('restrictions : une ligne -8 par restriction, nommée', () => {
    const r = composeCompatScore({
      scoreOver20: 18, orange: 0, red: 0, iaLines: noIa,
      restrictionLabels: ['Sulfates', 'Silicones'],
    })
    expect(r.score).toBe(74) // 90 - 16
    expect(r.breakdown.lines).toEqual([
      { label: 'Sulfates : ta restriction', points: -8 },
      { label: 'Silicones : ta restriction', points: -8 },
    ])
  })

  it('le déo réel : 0.79/20 + 4 restrictions → 0 « Incompatible »', () => {
    const r = composeCompatScore({
      scoreOver20: 0.79, orange: 6, red: 3, iaLines: noIa,
      restrictionLabels: ['Aluminium', 'A', 'B', 'C'],
    })
    expect(r.score).toBe(0)
    expect(r.label).toBe('Incompatible')
    expect(r.breakdown.lines.filter((l) => l.points === -8)).toHaveLength(4)
  })

  it('product_only : les lignes IA sont IGNORÉES (score = qualité), pas de liste d\'actifs dans le breakdown', () => {
    // Le positif d'un produit hors profil est porté par les 3 blocs IA, pas par
    // le calcul du score : ici le breakdown ne liste aucun actif (v31).
    const r = composeCompatScore({
      scoreOver20: 15, orange: 0, red: 0,
      iaLines: [{ label: 'ne devrait pas compter', points: 10 }],
      restrictionLabels: [], productOnly: true,
    })
    expect(r.score).toBe(75)
    expect(r.breakdown.lines).toHaveLength(0)
  })

  it('product_only : les restrictions cochées mordent quand même (86 - 8 → 78)', () => {
    const r = composeCompatScore({
      scoreOver20: 17.2, orange: 0, red: 0, iaLines: [{ label: 'ignorée', points: 10 }],
      restrictionLabels: ['Sulfates'], productOnly: true,
    })
    expect(r.score).toBe(78)
    expect(r.breakdown.lines).toEqual([{ label: 'Sulfates : ta restriction', points: -8 }])
  })

  it('PAS de plancher : les contre-indications font vraiment baisser (base 40 - 20 → 20)', () => {
    const r = composeCompatScore({
      scoreOver20: 8, orange: 0, red: 0,
      iaLines: [
        { label: 'a', points: -10 },
        { label: 'b', points: -10 },
      ],
      restrictionLabels: [],
    })
    expect(r.score).toBe(20) // 40 - 20, plus de plancher artificiel à 24
  })

  it('une base élevée reste proportionnelle à ses malus (base 84 - 20 → 64)', () => {
    const r = composeCompatScore({
      scoreOver20: 16.82, orange: 0, red: 0,
      iaLines: [
        { label: 'a', points: -10 },
        { label: 'b', points: -10 },
      ],
      restrictionLabels: [],
    })
    expect(r.score).toBe(64)
  })

  it('un produit propre SANS contre-indication reste haut (aucun malus → base + bonus)', () => {
    const r = composeCompatScore({
      scoreOver20: 16, orange: 0, red: 0,
      iaLines: [{ label: '2 actifs utiles à ton profil : a, b', points: 4 }],
      restrictionLabels: [],
    })
    expect(r.score).toBe(84) // 80 + 4
    expect(r.tone).toBe('vert')
  })

  it('clamp haut : 20/20 + bonus → 100 max, SANS ligne « Plafond » (0 orange/rouge)', () => {
    const r = composeCompatScore({
      scoreOver20: 20, orange: 0, red: 0,
      iaLines: [{ label: 'a', points: 10 }],
      restrictionLabels: [],
    })
    expect(r.score).toBe(100)
    // Le clamp à 100 n'est PAS un plafond couleur : aucune ligne « Plafond : 0
    // ingrédient orange » ne doit apparaître quand il n'y a ni orange ni rouge.
    expect(r.breakdown.lines.some((l) => /Plafond/i.test(l.label))).toBe(false)
  })

  it('restriction APRÈS le plafond 100 : 20/20 + 4 actifs (+8) + 1 restriction → 92 (le bonus ne l\'absorbe pas)', () => {
    const r = composeCompatScore({
      scoreOver20: 20, orange: 0, red: 0,
      iaLines: [{ label: '4 actifs utiles à ton profil : glycérine, karité, amande, aloe', points: 8 }],
      restrictionLabels: ['Silicones'],
    })
    expect(r.score).toBe(92) // 100 (plafonné) - 8, PAS 100
    // Le breakdown somme toujours (bonus écrêté par le plafond, restriction -8).
    expect(r.breakdown.base + r.breakdown.lines.reduce((s, l) => s + l.points, 0)).toBe(92)
    // Aucune ligne « Plafond » (clamp 100 silencieux, 0 orange), mais restriction visible.
    expect(r.breakdown.lines.some((l) => /Plafond/i.test(l.label))).toBe(false)
    expect(r.breakdown.lines.some((l) => l.label === 'Silicones : ta restriction')).toBe(true)
  })
})

describe('majorityByIngredient — vote 2/3 (self-consistency)', () => {
  const c = (ingredient: string) => ({ ingredient, need: 'x', color: 'vert' as const })

  it('garde ce qui est cité dans ≥2 runs sur 3, élimine le reste', () => {
    const out = majorityByIngredient([
      [c('glycérine'), c('karité')],
      [c('glycérine'), c('aloe vera')],
      [c('glycérine'), c('karité'), c('hallucination')],
    ])
    expect(out.map((o) => o.ingredient).sort()).toEqual(['glycérine', 'karité'])
  })

  it('rattrape un oubli ponctuel (2/3 suffit) et résiste aux accents/casse', () => {
    const out = majorityByIngredient([
      [c('Glycérine')],
      [c('glycerine')],
      [],
    ])
    expect(out).toHaveLength(1)
  })

  it('1 seul run → passthrough ; 0 run → vide ; doublons intra-run = 1 vote', () => {
    expect(majorityByIngredient([[c('a')]])).toHaveLength(1)
    expect(majorityByIngredient([])).toEqual([])
    const out = majorityByIngredient([
      [c('a'), c('a')],
      [],
      [],
    ])
    expect(out).toEqual([]) // 1 vote sur 3 runs < majorité
  })
})

describe('negativeSubtitle — sous 60, on parle du danger, jamais du bénéfice', () => {
  const base = { against: [], orange: 0, red: 0 }

  it('score ≥ 60 → null (le sous-titre IA est conservé)', () => {
    expect(negativeSubtitle({ ...base, score: 60, restrictionLabels: [] })).toBeNull()
    expect(negativeSubtitle({ ...base, score: 84, restrictionLabels: ['Sulfates'] })).toBeNull()
  })

  it('1 restriction → la nomme', () => {
    expect(negativeSubtitle({ ...base, score: 24, restrictionLabels: ['Silicones'] }))
      .toBe('contient une de tes restrictions : silicones')
  })

  it('plusieurs restrictions → les compte', () => {
    expect(negativeSubtitle({ ...base, score: 0, restrictionLabels: ['Silicones', 'Sulfates', 'Aluminium'] }))
      .toBe('contient 3 de tes restrictions')
  })

  it('contre-indication (sans restriction) → la nomme', () => {
    expect(
      negativeSubtitle({
        score: 40, restrictionLabels: [],
        against: [{ name: 'Alcool', need: 'ta peau sèche' }],
        orange: 0, red: 0,
      }),
    ).toBe('alcool déconseillé pour ta peau sèche')
  })

  it('couleurs à risque → message générique ; sinon qualité insuffisante', () => {
    expect(negativeSubtitle({ ...base, score: 45, restrictionLabels: [], orange: 2 }))
      .toBe('formule pénalisée par des ingrédients à risque')
    expect(negativeSubtitle({ ...base, score: 30, restrictionLabels: [] }))
      .toBe('la qualité de la formule est insuffisante')
  })
})
