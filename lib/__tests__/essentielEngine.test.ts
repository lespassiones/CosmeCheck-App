/**
 * Parité moteur "essentiel" mobile ↔ web (`lib/essentiel/engine.ts`).
 *
 * On vérifie les seuils de verdict (pickTone) et la résolution des verbes
 * contextuels (positives), qui pilotent la carte "L'essentiel".
 */
import { computeEssentiel } from '@/lib/essentiel/engine'
import type { AnalyseItem, AnalyseResponse } from '@/lib/analysis/types'

function item(partial: Partial<AnalyseItem> & { position: number }): AnalyseItem {
  return {
    position: partial.position,
    input: partial.input ?? partial.name ?? `ing-${partial.position}`,
    slug: partial.slug ?? null,
    name: partial.name ?? null,
    colorRating: partial.colorRating ?? null,
    dbColorRating: partial.dbColorRating ?? partial.colorRating ?? null,
    casNumber: null,
    translationFr: partial.translationFr ?? null,
    primaryFunction: partial.primaryFunction ?? null,
    allFunctions: partial.allFunctions,
    tags: partial.tags,
    matchKind: partial.matchKind,
    confidence: 1,
    thresholdContext: null,
    thresholdLabel: null,
  } as AnalyseItem
}

function resp(
  counts: { vert: number; jaune: number; orange: number; rouge: number; matched?: number },
  items: AnalyseItem[] = [],
  score: number | null = 15,
): AnalyseResponse {
  const total = counts.vert + counts.jaune + counts.orange + counts.rouge
  return {
    counts: {
      total,
      matched: counts.matched ?? total,
      vert: counts.vert,
      jaune: counts.jaune,
      orange: counts.orange,
      rouge: counts.rouge,
      unknown: 0,
    },
    score,
    scoreLabel: '',
    scoreTone: 'green',
    items,
    observations: [],
    spectrum: { top5: [], top10: [] },
    synthesis: null,
  } as AnalyseResponse
}

// NOUVEAU CONTRAT : le ton du verdict dérive du SCORE (pastille propriétaire, qui
// intègre déjà la règle douce + le plafond par position), plus des comptes bruts.
// Seuils verdictToneFromScore : >=17 very-safe / >=13 safe / >=9 caution / >=5 warning / <5 danger.
// La nuance high-risk est réappliquée depuis les comptes (>=2 rouge).
describe('computeEssentiel — verdict dérivé du score', () => {
  it('score null (rien de reconnu) → unknown', () => {
    expect(computeEssentiel(resp({ vert: 0, jaune: 0, orange: 0, rouge: 0, matched: 0 }, [], null)).verdict.tone).toBe('unknown')
  });
  it('score >=17 → very-safe', () => {
    expect(computeEssentiel(resp({ vert: 5, jaune: 0, orange: 0, rouge: 0 }, [], 18.5)).verdict.tone).toBe('very-safe')
  });
  it('score 13-17 → safe (règle douce : verts dominants)', () => {
    expect(computeEssentiel(resp({ vert: 3, jaune: 1, orange: 0, rouge: 0 }, [], 15)).verdict.tone).toBe('safe')
  });
  it('score 9-13 → caution', () => {
    expect(computeEssentiel(resp({ vert: 1, jaune: 4, orange: 0, rouge: 0 }, [], 11)).verdict.tone).toBe('caution')
  });
  it('score 5-9 → warning', () => {
    expect(computeEssentiel(resp({ vert: 1, jaune: 0, orange: 1, rouge: 0 }, [], 7)).verdict.tone).toBe('warning')
  });
  it('score <5 → danger', () => {
    expect(computeEssentiel(resp({ vert: 1, jaune: 0, orange: 3, rouge: 0 }, [], 3)).verdict.tone).toBe('danger')
  });
  it('score <5 + 1 rouge → danger', () => {
    expect(computeEssentiel(resp({ vert: 1, jaune: 0, orange: 0, rouge: 1 }, [], 3)).verdict.tone).toBe('danger')
  });
  it('score <5 + >=2 rouge → high-risk', () => {
    expect(computeEssentiel(resp({ vert: 1, jaune: 0, orange: 0, rouge: 2 }, [], 1)).verdict.tone).toBe('high-risk')
  });
});

describe('computeEssentiel — positives (fonctions réelles)', () => {
  it('max 3 ingrédients verts triés par position, eau exclue, fonctions affichées', () => {
    const items = [
      // Aqua (eau) est volontairement exclu de "Ce qui est bien" (cf. engine.isWaterName).
      item({ position: 0, name: 'Aqua', colorRating: 'Vert', allFunctions: ['Solvant'] }),
      item({ position: 1, name: 'Glycerin', colorRating: 'Vert', allFunctions: ['Humectant'] }),
      item({ position: 2, name: 'Tocopherol', colorRating: 'Vert', allFunctions: ['Antioxydant'] }),
      item({ position: 3, name: 'Panthenol', colorRating: 'Vert', allFunctions: ['Humectant'] }),
    ]
    const e = computeEssentiel(resp({ vert: 4, jaune: 0, orange: 0, rouge: 0 }, items))
    // Eau retirée → restent Glycerin, Tocopherol, Panthenol (3 max).
    expect(e.positives).toHaveLength(3)
    expect(e.positives.map((p) => p.name)).not.toContain('Aqua')
    // verb = fonctions réelles (plus de table de verbes mappés).
    expect(e.positives[0].verb).toBe('Humectant')
  });

  it('plus de logique contextuelle : tout vert (sauf eau) est gardé avec ses fonctions', () => {
    const items = [
      item({ position: 0, name: 'X', colorRating: 'Vert', allFunctions: ['Antistatique'] }),
      item({
        position: 1,
        name: 'Glycerin',
        colorRating: 'Vert',
        allFunctions: ['Humectant', "Agent d'entretien de la peau"],
      }),
    ]
    const e = computeEssentiel(resp({ vert: 2, jaune: 0, orange: 0, rouge: 0 }, items), {
      category: 'creme_visage',
    })
    // "X" (Antistatique) n'est PLUS sauté : on affiche tout vert non-eau.
    expect(e.positives.map((p) => p.name)).toContain('X')
    expect(e.positives.find((p) => p.name === 'X')?.verb).toBe('Antistatique')
    // "Glycerin" → nom commun FR "Glycérine", fonctions jointes par " · ".
    expect(e.positives.map((p) => p.name)).toContain('Glycérine')
    expect(e.positives.find((p) => p.name === 'Glycérine')?.verb).toBe(
      "Humectant · Agent d'entretien de la peau",
    )
  });

  it('eau/alcools/émulsifiants exclus, actif multi-fonction conservé, max 3 fonctions, "Non classé" ignoré', () => {
    const items = [
      item({ position: 0, name: 'Aqua', colorRating: 'Vert', allFunctions: ['Solvant'] }),
      // Alcool gras → exclu par isAlcoholName (aide à la formulation)
      item({
        position: 1,
        name: 'Cetearyl Alcohol',
        colorRating: 'Vert',
        allFunctions: [
          'Emollient',
          'Agent émulsifiant',
          "Stabilisateur d'émulsion",
          'Agent de contrôle de la viscosité',
        ],
      }),
      // Émulsifiant pur (primaryFunction = "Agent émulsifiant") → exclu
      item({
        position: 2,
        name: 'Glyceryl Stearate',
        colorRating: 'Vert',
        primaryFunction: 'Agent émulsifiant',
        allFunctions: ['Agent émulsifiant'],
      }),
      item({ position: 3, name: 'Mystere', colorRating: 'Vert', allFunctions: ['Non classé'] }),
      // Actif réel multi-fonction (primaryFunction ≠ émulsifiant) → conservé, 4 fns plafonnées à 3
      item({
        position: 4,
        name: 'Niacinamide',
        colorRating: 'Vert',
        allFunctions: ['Vitamine', 'Agent hydratant', 'Anti-seborrhée', 'Antioxydant'],
      }),
    ]
    const e = computeEssentiel(resp({ vert: 5, jaune: 0, orange: 0, rouge: 0 }, items))
    // Aqua, Cetearyl Alcohol, Glyceryl Stearate, Mystere exclus ; reste Niacinamide.
    expect(e.positives).toHaveLength(1)
    expect(e.positives.map((p) => p.name)).not.toContain('Aqua')
    expect(e.positives.map((p) => p.name)).not.toContain('Cetearyl Alcohol')
    expect(e.positives.map((p) => p.name)).not.toContain('Glyceryl Stearate')
    // 4 fonctions → plafonnées à 3
    expect(e.positives[0].verb.split(' · ')).toHaveLength(3)
  });
});

describe('computeEssentiel — concerns', () => {
  it('mappe un tag problématique vers famille + effet', () => {
    const items = [
      item({ position: 0, name: 'Sodium Laureth Sulfate', colorRating: 'Orange', tags: ['sulfate'] }),
    ]
    const e = computeEssentiel(resp({ vert: 0, jaune: 0, orange: 1, rouge: 0 }, items))
    const orange = e.concerns.find((c) => c.tier === 'orange')
    expect(orange?.family).toBe('Sulfates')
    expect(orange?.effect).toBe('peuvent dessécher la peau et le cuir chevelu')
  });
});
