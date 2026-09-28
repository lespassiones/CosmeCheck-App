/**
 * Prompt de SYNTHÈSE : zone du produit (bêta 28 sept 2026, « crème cheveux
 * analysée comme un soin visage »). Les exemples de personnalisation étaient
 * tous « peau » ; la zone (explicite, ou déduite du nom et de l'INCI) et le
 * profil limité à cette zone les rendent conditionnels.
 */
import { buildPrompt, type SynthesisInput } from '../../supabase/functions/synthesis/prompt'

const FULL_PROFILE = [
  "PROFIL DE L'UTILISATEUR (à prendre en compte pour personnaliser ta réponse) :",
  '- Type de peau visage : Grasse',
  '- Préoccupations : Acné / boutons',
  '- Cheveux : Secs',
  "Adapte tes recommandations à ce profil. Cite les éléments du profil quand c'est pertinent (ex : « pour une peau sèche, … »).",
].join('\n')

function makeInput(over: Partial<SynthesisInput> = {}): SynthesisInput {
  return {
    enriched: [
      { input_raw: 'Aqua', name: 'Aqua', color_rating: 'Vert', primary_function: 'Solvant', tags: null, position_idx: 0 },
      { input_raw: 'Cocos Nucifera Oil', name: 'Cocos Nucifera Oil', color_rating: 'Vert', primary_function: 'Émollient', tags: null, position_idx: 1 },
      { input_raw: 'Parfum', name: 'Parfum', color_rating: 'Jaune', primary_function: 'Parfum', tags: ['parfum'], position_idx: 2 },
    ],
    counts: { Vert: 2, Jaune: 1, Orange: 0, Rouge: 0 },
    score: 15,
    scoreLabel: 'Bien',
    observations: [],
    productLabel: 'Crème Capillaire Koni',
    userId: 'test',
    profileBlock: FULL_PROFILE,
    restrictionsBlock: null,
    ...over,
  }
}

describe('synthèse : zone déduite du nom du produit', () => {
  it('produit capillaire : exemples cheveux, profil sans la peau du visage', () => {
    const { system, user } = buildPrompt(makeInput())
    expect(system).toContain('ZONE DU PRODUIT : cheveux et cuir chevelu')
    expect(system).toContain('produit CAPILLAIRE')
    expect(system).toContain('bon pour tes cheveux secs')
    expect(system).not.toContain('Type de peau visage')
    expect(system).not.toContain('bon pour ta peau sèche')
    expect(user).toContain('Pour tes cheveux secs, voici ce qu')
    expect(user).toContain('À surveiller si ton cuir chevelu est sensible')
    expect(user).toContain("Zone d'application : cheveux et cuir chevelu")
  })

  it('soin visage : exemples peau conservés', () => {
    const { system, user } = buildPrompt(makeInput({ productLabel: 'Crème visage matifiante' }))
    expect(system).toContain('bon pour ta peau sèche')
    expect(system).toContain('Type de peau visage : Grasse')
    expect(system).not.toContain('- Cheveux : Secs')
    expect(user).toContain('Pour ta peau sèche et sensible')
  })

  it('profil rempli mais rien pour la zone : pas de personnalisation, pas d’invitation à compléter', () => {
    const { system, user } = buildPrompt(makeInput({
      productLabel: 'Lait corps',
      profileBlock: "PROFIL DE L'UTILISATEUR :\n- Cheveux : Secs",
    }))
    expect(system).not.toContain('DEUX directions de personnalisation')
    expect(user).toContain('rien ne concerne la zone de ce produit')
    expect(user).not.toContain('Tu peux renseigner ton profil')
  })

  it('zone inconnue : comportement historique (profil complet)', () => {
    const { system } = buildPrompt(makeInput({ productLabel: null, enriched: [] }))
    expect(system).not.toContain('ZONE DU PRODUIT')
    expect(system).toContain('Type de peau visage : Grasse')
  })

  it('aucun tiret long écrit par le prompt (hors règle partagée NO_LONG_DASHES_RULE)', () => {
    const { user } = buildPrompt(makeInput())
    expect(user).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'))
  })
})
