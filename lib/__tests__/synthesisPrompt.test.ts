/**
 * Vérifie que le prompt de synthèse est CONSCIENT DE LA CONCENTRATION (ordre
 * INCI). Régression du bug remonté par une utilisatrice formulatrice : sur une
 * crème capillaire riche en huiles (tournesol, avocat en tête), la synthèse
 * mettait en avant l'huile de COCO (placée plus bas, donc moins dosée) juste
 * parce que sa fonction en base est "Conditionneur capillaire", en ignorant les
 * huiles dominantes.
 *
 * On ne peut pas (et ne veut pas) exécuter le LLM ici : on teste la partie
 * DÉTERMINISTE, à savoir le prompt exact envoyé au modèle. buildPrompt est
 * extrait dans supabase/functions/synthesis/prompt.ts (pur, sans dépendance
 * Deno) pour être testable en env node, comme advisor-chat/routineNormalize.
 */
import {
  buildPrompt,
  SYNTH_PROMPT_VERSION,
  type SynthesisInput,
} from '../../supabase/functions/synthesis/prompt'

type Green = { name: string; fn: string; pos: number }

/** Reproduit la crème capillaire de la capture (ordre INCI réel). */
const HAIR_CREAM_GREENS: Green[] = [
  { name: 'Aqua', fn: 'Solvant', pos: 0 },
  { name: 'Helianthus Annuus Seed Oil', fn: 'Émollient', pos: 1 },
  { name: 'Glycerin', fn: 'Humectant', pos: 2 },
  { name: 'Glyceryl Stearate SE', fn: 'Agent émulsifiant', pos: 3 },
  // pos 4 = Triumfetta Bark Extract (non reconnu, pas de couleur)
  { name: 'Persea Gratissima Oil', fn: "Agent d'entretien de la peau", pos: 5 },
  { name: 'Cocos Nucifera Oil', fn: 'Conditionneur capillaire', pos: 6 },
  { name: 'Mangifera Indica Seed Butter', fn: "Agent d'entretien de la peau", pos: 7 },
  { name: 'Ricinus Communis Seed Oil', fn: 'Agent masquant', pos: 8 },
  { name: 'Theobroma Cacao Seed Butter', fn: 'Émollient', pos: 9 },
]

function makeInput(opts?: {
  profileBlock?: string | null
  greens?: Green[]
}): SynthesisInput {
  const greens = opts?.greens ?? HAIR_CREAM_GREENS
  const enriched: SynthesisInput['enriched'] = [
    ...greens.map((g) => ({
      input_raw: g.name,
      name: g.name,
      color_rating: 'Vert' as const,
      primary_function: g.fn,
      tags: null,
      position_idx: g.pos,
    })),
    // Le non reconnu (Triumfetta) : pas de couleur, pas de fonction.
    {
      input_raw: 'Triumfetta Bark Extract',
      name: null,
      color_rating: null,
      primary_function: null,
      tags: null,
      position_idx: 4,
    },
    // Les jaunes de fin de liste.
    { input_raw: 'Parfum', name: 'Parfum', color_rating: 'Jaune' as const, primary_function: 'Agent masquant', tags: ['parfum'], position_idx: 10 },
    { input_raw: 'Benzyl Alcohol', name: 'Benzyl Alcohol', color_rating: 'Jaune' as const, primary_function: 'Conservateur', tags: null, position_idx: 11, threshold_label: '≤ 1 %' },
    { input_raw: 'Dehydroacetic Acid', name: 'Dehydroacetic Acid', color_rating: 'Jaune' as const, primary_function: 'Conservateur', tags: null, position_idx: 12, threshold_label: '≤ 1 %' },
  ]
  return {
    enriched,
    counts: { Vert: 9, Jaune: 3, Orange: 0, Rouge: 0 },
    score: 16,
    scoreLabel: 'Bon',
    observations: [],
    productLabel: 'Crème CAPILLAIRE',
    userId: 'test-user',
    profileBlock:
      opts?.profileBlock === undefined
        ? "PROFIL DE L'UTILISATEUR :\n- Cheveux : Secs"
        : opts.profileBlock,
    restrictionsBlock: null,
  }
}

describe('buildPrompt — conscience de la concentration (ordre INCI)', () => {
  it('la version du prompt est bumpée (régénère les synthèses en cache)', () => {
    // v13 = ancien prompt sans règle de concentration. On doit être au-delà.
    expect(SYNTH_PROMPT_VERSION).toBeGreaterThanOrEqual(14)
  })

  it('chaque vert porte son rang #N dans la liste INCI', () => {
    const { user } = buildPrompt(makeInput())
    expect(user).toContain('Helianthus Annuus Seed Oil (#2 dans la liste INCI)')
    expect(user).toContain('Persea Gratissima Oil (#6 dans la liste INCI)')
    expect(user).toContain('Cocos Nucifera Oil (#7 dans la liste INCI)')
  })

  it('les huiles dominantes sont listées AVANT une huile mineure mais célèbre', () => {
    const { user } = buildPrompt(makeInput())
    const idxSunflower = user.indexOf('Helianthus Annuus Seed Oil (#2')
    const idxAvocado = user.indexOf('Persea Gratissima Oil (#6')
    const idxCoconut = user.indexOf('Cocos Nucifera Oil (#7')
    expect(idxSunflower).toBeGreaterThan(-1)
    expect(idxAvocado).toBeGreaterThan(-1)
    expect(idxCoconut).toBeGreaterThan(-1)
    // Tournesol (#2) et avocat (#6) apparaissent avant la coco (#7).
    expect(idxSunflower).toBeLessThan(idxCoconut)
    expect(idxAvocado).toBeLessThan(idxCoconut)
  })

  it('les verts sont triés par position même si enriched est mélangé', () => {
    const shuffled = [...HAIR_CREAM_GREENS].reverse()
    const { user } = buildPrompt(makeInput({ greens: shuffled }))
    const idxSunflower = user.indexOf('Helianthus Annuus Seed Oil (#2')
    const idxCoconut = user.indexOf('Cocos Nucifera Oil (#7')
    expect(idxSunflower).toBeLessThan(idxCoconut)
  })

  it('la règle de concentration est injectée dans system ET user', () => {
    const { system, user } = buildPrompt(makeInput())
    expect(system).toContain('RÈGLE DE CONCENTRATION')
    expect(system).toContain('ne doit pas voler la vedette')
    expect(user).toContain('RÈGLE DE CONCENTRATION')
    // Instruction de regroupement des bénéfices similaires.
    expect(user).toMatch(/REGROUPE-les/i)
  })

  it('la règle de concentration est présente AUSSI sans profil', () => {
    const { system, user } = buildPrompt(makeInput({ profileBlock: null }))
    expect(system).toContain('RÈGLE DE CONCENTRATION')
    expect(user).toContain('RÈGLE DE CONCENTRATION')
  })

  it('le bloc de personnalisation relie la règle au choix des verts', () => {
    const { system } = buildPrompt(makeInput())
    expect(system).toContain('Applique la RÈGLE DE CONCENTRATION')
  })
})
