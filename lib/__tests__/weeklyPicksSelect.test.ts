/**
 * selectWeeklyPicks : sélection pure des Pépites de la semaine.
 *
 * Ces tests verrouillent le pipeline complet (dédup EAN -> filtre restrictions
 * -> ordre des tiers via score plafonné -> round-robin entre needs -> garde
 * diversité par sous-catégorie -> coupe à max) et surtout ses deux invariants :
 *   - DÉTERMINISME : même input + même graine `${userId}:${weekKey}:${restrictions}`
 *     -> exactement les mêmes picks (base du cache React Query 7 jours) ;
 *     graine différente (autre semaine) -> tirage différent (variété hebdo) ;
 *   - SÉCURITÉ : un produit contenant un ingrédient restreint (token exact) ou
 *     un terme d'allergie freeform (sous-chaîne) n'apparaît JAMAIS, quelle que
 *     soit sa place dans les files.
 *
 * Fixtures : ~30 candidats répartis sur 3 needs (10 par need), forme identique
 * à la sortie mappée de la RPC cosme_check_weekly_picks_candidates.
 */

import {
  buildWeeklyPicksSeed,
  selectWeeklyPicks,
  type WeeklyPickCandidate,
} from '@/lib/weeklyPicks/select'
import {
  buildExclusionSet,
  type ExclusionSet,
} from '@/lib/analysis/alternativesFilter'

const NEEDS = ['hydration_face', 'brightening', 'sun_protection'] as const

/** Candidat de base : pastille verte (score 18), INCI anodin, sans sous-cat. */
function cand(
  ean: string,
  need: string,
  over: Partial<WeeklyPickCandidate> = {},
): WeeklyPickCandidate {
  return {
    ean,
    need,
    brand: 'Marque Test',
    name: `Produit ${ean}`,
    imageUrl: null,
    score: 18,
    scoreLabel: null,
    scoreTone: null,
    countTotal: 20,
    ingredientsText: 'aqua, glycerin, niacinamide',
    countOrange: 0,
    countRouge: 0,
    subCategory: null,
    ...over,
  }
}

/** 30 candidats (3 needs x 10), 5 sous-catégories distinctes par need. */
function makeFixture(): WeeklyPickCandidate[] {
  const out: WeeklyPickCandidate[] = []
  NEEDS.forEach((need, ni) => {
    for (let i = 0; i < 10; i++) {
      out.push(cand(`${need}-${i}`, need, { subCategory: `sub-${ni}-${i % 5}` }))
    }
  })
  return out
}

function noExclusion(): ExclusionSet {
  return { exactNames: new Set(), substrings: [] }
}

const SEED_W28 = buildWeeklyPicksSeed('user-1', '2026-W28', 'aucune')
const SEED_W29 = buildWeeklyPicksSeed('user-1', '2026-W29', 'aucune')

describe('buildWeeklyPicksSeed', () => {
  it('assemble user, semaine ISO et restrictions dans un ordre stable', () => {
    expect(buildWeeklyPicksSeed('u1', '2026-W28', 'sans-parfum')).toBe(
      'u1:2026-W28:sans-parfum',
    )
  })
})

describe('selectWeeklyPicks : déterminisme', () => {
  it('même input + même graine -> tableau strictement identique', () => {
    const a = selectWeeklyPicks({
      candidates: makeFixture(),
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    const b = selectWeeklyPicks({
      candidates: makeFixture(),
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    expect(a).toEqual(b)
    expect(a.map((p) => p.ean)).toEqual(b.map((p) => p.ean))
  })

  it('graine différente (autre semaine) -> tirage différent sur la fixture', () => {
    const w28 = selectWeeklyPicks({
      candidates: makeFixture(),
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    const w29 = selectWeeklyPicks({
      candidates: makeFixture(),
      exclusion: noExclusion(),
      seed: SEED_W29,
    })
    expect(w28.map((p) => p.ean).join(',')).not.toBe(
      w29.map((p) => p.ean).join(','),
    )
  })
})

describe('selectWeeklyPicks : sécurité restrictions', () => {
  const exclusion = buildExclusionSet({
    restrictions: {
      families: [],
      ingredients: [{ slug: 'parfum', name: 'Parfum' }],
    },
    familyIngredientNames: [],
    allergiesFreeform: 'limonene',
  })

  it("un candidat contenant l'ingrédient exclu (token exact) n'apparaît jamais", () => {
    const candidates = [
      // Score très haut : sans le filtre il sortirait en tête de file.
      cand('banni-exact', 'hydration_face', {
        score: 19,
        ingredientsText: 'Aqua, Parfum, Glycerin',
      }),
      ...makeFixture(),
    ]
    const picks = selectWeeklyPicks({ candidates, exclusion, seed: SEED_W28 })
    expect(picks.map((p) => p.ean)).not.toContain('banni-exact')
    expect(picks.length).toBeGreaterThan(0)
  })

  it("un candidat matché par un terme freeform (sous-chaîne) n'apparaît jamais", () => {
    const candidates = [
      cand('banni-freeform', 'brightening', {
        score: 19,
        ingredientsText: 'Aqua, Limonene, Citral',
      }),
      ...makeFixture(),
    ]
    const picks = selectWeeklyPicks({ candidates, exclusion, seed: SEED_W28 })
    expect(picks.map((p) => p.ean)).not.toContain('banni-freeform')
  })

  it('tous les candidats exclus -> tableau vide (état "reviens la semaine prochaine")', () => {
    const candidates = NEEDS.map((need, i) =>
      cand(`p-${i}`, need, { ingredientsText: 'Aqua, Parfum' }),
    )
    expect(selectWeeklyPicks({ candidates, exclusion, seed: SEED_W28 })).toEqual([])
  })
})

describe('selectWeeklyPicks : dédoublonnage EAN inter-needs', () => {
  it('un même EAN présent sous 2 needs ne sort qu\'une fois, rattaché au 1er need', () => {
    const candidates = [
      cand('dup-1', 'hydration_face'),
      cand('dup-1', 'brightening'),
      cand('autre', 'brightening'),
    ]
    const picks = selectWeeklyPicks({
      candidates,
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    const dups = picks.filter((p) => p.ean === 'dup-1')
    expect(dups).toHaveLength(1)
    expect(dups[0].need).toBe('hydration_face')
  })
})

describe('selectWeeklyPicks : round-robin entre needs', () => {
  it('les 3 premiers picks couvrent 3 needs distincts quand possible', () => {
    const picks = selectWeeklyPicks({
      candidates: makeFixture(),
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    const firstThreeNeeds = new Set(picks.slice(0, 3).map((p) => p.need))
    expect(firstThreeNeeds.size).toBe(3)
  })

  it('tiers préservés : une pastille verte (plafonné >= 17) sort avant un rouge dans sa file', () => {
    const candidates = [
      ...Array.from({ length: 5 }, (_, i) =>
        cand(`b-rouge-${i}`, 'brightening', { score: 3 }),
      ),
      cand('b-vert', 'brightening', { score: 18 }),
      ...Array.from({ length: 5 }, (_, i) => cand(`h-${i}`, 'hydration_face')),
      ...Array.from({ length: 5 }, (_, i) => cand(`s-${i}`, 'sun_protection')),
    ]
    const picks = selectWeeklyPicks({
      candidates,
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    const brightening = picks.filter((p) => p.need === 'brightening')
    expect(brightening.length).toBeGreaterThan(0)
    expect(brightening[0].ean).toBe('b-vert')
    // Aucun rouge de la file brightening ne précède le vert dans la sortie.
    const greenIdx = picks.findIndex((p) => p.ean === 'b-vert')
    const firstRedIdx = picks.findIndex((p) => p.ean.startsWith('b-rouge-'))
    if (firstRedIdx !== -1) expect(greenIdx).toBeLessThan(firstRedIdx)
  })
})

describe('selectWeeklyPicks : garde diversité par sous-catégorie', () => {
  it('jamais plus de 2 produits de la même sous-catégorie (défaut)', () => {
    // 3 needs dont les candidats partagent massivement la même sous-catégorie.
    const candidates = NEEDS.flatMap((need) =>
      Array.from({ length: 10 }, (_, i) =>
        cand(`${need}-${i}`, need, { subCategory: 'creme visage' }),
      ),
    )
    const picks = selectWeeklyPicks({
      candidates,
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    expect(picks).toHaveLength(2)
  })

  it('la sous-catégorie est comparée normalisée (casse / espaces)', () => {
    const candidates = [
      cand('a', 'hydration_face', { subCategory: 'Creme Visage' }),
      cand('b', 'brightening', { subCategory: 'creme visage ' }),
      cand('c', 'sun_protection', { subCategory: 'CREME VISAGE' }),
    ]
    const picks = selectWeeklyPicks({
      candidates,
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    expect(picks).toHaveLength(2)
  })

  it('fallback sur le need quand subCategory est null : max 2 par need', () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      cand(`h-${i}`, 'hydration_face', { subCategory: null }),
    )
    const picks = selectWeeklyPicks({
      candidates,
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    expect(picks).toHaveLength(2)
    for (const p of picks) expect(p.need).toBe('hydration_face')
  })

  it('respecte maxPerSubCategory quand il est fourni', () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      cand(`h-${i}`, 'hydration_face', { subCategory: 'serum' }),
    )
    const picks = selectWeeklyPicks({
      candidates,
      exclusion: noExclusion(),
      seed: SEED_W28,
      maxPerSubCategory: 3,
    })
    expect(picks).toHaveLength(3)
  })
})

describe('selectWeeklyPicks : garde diversité par grande famille + backfill', () => {
  const famCand = (ean: string, need: string, family: string, sub: string) =>
    cand(ean, need, { family, subCategory: sub })

  it('plafonne une grande famille quand une autre est disponible', () => {
    const candidates = [
      ...Array.from({ length: 5 }, (_, i) =>
        famCand(`a-${i}`, 'anti_aging', 'Soin du corps et visage', `sa-${i}`),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        famCand(`c-${i}`, 'shampoo_dry_hair', 'Coiffure', `sc-${i}`),
      ),
    ]
    const picks = selectWeeklyPicks({
      candidates,
      exclusion: noExclusion(),
      seed: SEED_W28,
      max: 4,
      maxPerFamily: 2,
    })
    expect(picks).toHaveLength(4)
    expect(picks.filter((p) => p.family === 'Soin du corps et visage')).toHaveLength(2)
    expect(picks.filter((p) => p.family === 'Coiffure')).toHaveLength(2)
  })

  it('backfill : profil mono-famille -> liste pleine (jamais appauvrie au plafond)', () => {
    // 6 sous-catégories distinctes, TOUTES la même famille. Plafond famille 3,
    // mais on veut 6 picks : le backfill relâche la famille.
    const candidates = Array.from({ length: 6 }, (_, i) =>
      famCand(`h-${i}`, 'hydration_face', 'Soin du corps et visage', `sub-${i}`),
    )
    const picks = selectWeeklyPicks({
      candidates,
      exclusion: noExclusion(),
      seed: SEED_W28,
      max: 6,
      maxPerFamily: 3,
      maxPerSubCategory: 1,
    })
    expect(picks).toHaveLength(6)
  })

  it('le backfill relâche la famille mais JAMAIS le plafond sous-catégorie', () => {
    // Même famille, 2 sous-cats seulement, maxPerSub 2 -> au plus 4 picks
    // malgré max 6 (le backfill ne touche pas la garde sous-catégorie).
    const candidates = [
      ...Array.from({ length: 5 }, (_, i) =>
        famCand(`x-${i}`, 'hydration_face', 'Soin du corps et visage', 'subX'),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        famCand(`y-${i}`, 'brightening', 'Soin du corps et visage', 'subY'),
      ),
    ]
    const picks = selectWeeklyPicks({
      candidates,
      exclusion: noExclusion(),
      seed: SEED_W28,
      max: 6,
      maxPerFamily: 3,
      maxPerSubCategory: 2,
    })
    expect(picks).toHaveLength(4)
  })

  it('famille absente (null) -> fallback sur le need, comportement inchangé', () => {
    // Fixture sans family : 3 needs => 3 familles de fallback, 6 picks classiques.
    const picks = selectWeeklyPicks({
      candidates: makeFixture(),
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    expect(picks).toHaveLength(6)
  })
})

describe('selectWeeklyPicks : plancher santé (minCappedScore)', () => {
  it('écarte les produits sous le seuil (jaune/orange/rouge) quand minCappedScore=13', () => {
    const candidates = [
      cand('vert-1', 'hydration_face', { score: 18 }), // cœur vert 5★
      cand('vert-2', 'brightening', { score: 14 }), // feuille verte 4★
      cand('jaune', 'sun_protection', { score: 10 }), // 3★ -> écarté
      cand('orange', 'hydration_face', { score: 6 }), // écarté
      cand('rouge', 'brightening', { score: 2 }), // écarté
    ]
    const picks = selectWeeklyPicks({
      candidates,
      exclusion: noExclusion(),
      seed: SEED_W28,
      minCappedScore: 13,
    })
    const eans = picks.map((p) => p.ean)
    expect(eans).toContain('vert-1')
    expect(eans).toContain('vert-2')
    expect(eans).not.toContain('jaune')
    expect(eans).not.toContain('orange')
    expect(eans).not.toContain('rouge')
  })

  it('applique le plancher sur la note PLAFONNÉE : note haute mais 2 rouges -> écartée', () => {
    const candidates = [
      // Note stockée verte (16) mais 2 ingrédients rouges -> plafonnée à 8.9.
      cand('corrompu', 'hydration_face', { score: 16, countRouge: 2 }),
      cand('sain', 'brightening', { score: 18 }),
    ]
    const picks = selectWeeklyPicks({
      candidates,
      exclusion: noExclusion(),
      seed: SEED_W28,
      minCappedScore: 13,
    })
    expect(picks.map((p) => p.ean)).toEqual(['sain'])
  })

  it('tous sous le seuil -> tableau vide', () => {
    const candidates = NEEDS.map((need, i) => cand(`p-${i}`, need, { score: 8 }))
    expect(
      selectWeeklyPicks({
        candidates,
        exclusion: noExclusion(),
        seed: SEED_W28,
        minCappedScore: 13,
      }),
    ).toEqual([])
  })

  it('minCappedScore absent -> aucun filtre santé (rétrocompatible)', () => {
    const candidates = [cand('bas', 'hydration_face', { score: 6 })]
    const picks = selectWeeklyPicks({
      candidates,
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    expect(picks.map((p) => p.ean)).toEqual(['bas'])
  })
})

describe('selectWeeklyPicks : bornes et coupes', () => {
  it('coupe à max (défaut 6) sur la fixture de 30 candidats', () => {
    const picks = selectWeeklyPicks({
      candidates: makeFixture(),
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    expect(picks).toHaveLength(6)
  })

  it('respecte un max personnalisé', () => {
    const picks = selectWeeklyPicks({
      candidates: makeFixture(),
      exclusion: noExclusion(),
      seed: SEED_W28,
      max: 4,
    })
    expect(picks).toHaveLength(4)
  })

  it('input vide -> []', () => {
    expect(
      selectWeeklyPicks({
        candidates: [],
        exclusion: noExclusion(),
        seed: SEED_W28,
      }),
    ).toEqual([])
  })

  it('max <= 0 -> []', () => {
    expect(
      selectWeeklyPicks({
        candidates: makeFixture(),
        exclusion: noExclusion(),
        seed: SEED_W28,
        max: 0,
      }),
    ).toEqual([])
  })

  it('ne renvoie jamais deux fois le même EAN', () => {
    const picks = selectWeeklyPicks({
      candidates: [...makeFixture(), ...makeFixture()],
      exclusion: noExclusion(),
      seed: SEED_W28,
    })
    const eans = picks.map((p) => p.ean)
    expect(new Set(eans).size).toBe(eans.length)
  })
})
