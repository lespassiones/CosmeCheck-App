/**
 * Prompt des 3 blocs IA (personal-insights) : ZONE DU PRODUIT (v32).
 *
 * Bêta 28 sept 2026 : sur une crème capillaire, le LLM recevait tout le profil,
 * une base de connaissances « peau » (comédogènes vs peau grasse) et la consigne
 * « sers-t'en pour juger la PERTINENCE peau ». On vérifie la partie
 * déterministe : zone + usage annoncés, base de connaissances bornée, exemples
 * adaptés, ton de la note corrigé, aucun tiret long.
 */
import {
  buildPrompt,
  PERSONAL_PROMPT_VERSION,
  type PersonalInput,
  scoreToneLabel,
} from '../../supabase/functions/personal-insights/prompt'

function makeInput(over: Partial<PersonalInput> = {}): PersonalInput {
  return {
    enriched: [
      { input_raw: 'Aqua', name: 'Aqua', color_rating: 'Vert', primary_function: 'Solvant', tags: null, position_idx: 0 },
      { input_raw: 'Butyrospermum Parkii Butter', name: 'Butyrospermum Parkii Butter', color_rating: 'Vert', primary_function: 'Émollient', tags: null, position_idx: 1 },
      { input_raw: 'Cocos Nucifera Oil', name: 'Cocos Nucifera Oil', color_rating: 'Vert', primary_function: 'Conditionneur capillaire', tags: null, position_idx: 2 },
    ],
    counts: { Vert: 3, Jaune: 0, Orange: 0, Rouge: 0 },
    score: 15,
    scoreLabel: 'Bien',
    scoreTone: 'green',
    productLabel: 'Crème Capillaire Koni',
    category: null,
    userId: 'test',
    profileBlock: "PROFIL DE L'UTILISATEUR, LIMITÉ À LA ZONE DU PRODUIT (cheveux et cuir chevelu) :\n- Cheveux et cuir chevelu : Secs",
    restrictionsBlock: null,
    restrictionMatches: [],
    ...over,
  }
}

const HAIR = { axis: 'hair' as const, zones: ['hair' as const], usage: 'leave_on' as const }
const FACE = { axis: 'face' as const, zones: ['face' as const], usage: 'leave_on' as const }
const BODY_RINSE = { axis: 'body' as const, zones: ['body' as const], usage: 'rinse_off' as const }

describe('personal-insights buildPrompt : zone du produit', () => {
  it('version incrémentée (régénération gratuite des blocs déjà payés)', () => {
    expect(PERSONAL_PROMPT_VERSION).toBeGreaterThanOrEqual(32)
  })

  it('soin capillaire : zone annoncée, AUCUNE règle comédogène ni exemple « peau grasse »', () => {
    const { system, user } = buildPrompt(makeInput({ productContext: HAIR }))
    expect(system).toContain('ZONE DU PRODUIT')
    expect(system).toContain('Produit CAPILLAIRE')
    expect(system).toContain('DÉJÀ LIMITÉ à cette zone')
    expect(system).not.toContain('-> COMÉDOGÈNES')
    expect(system).not.toContain('adapté à ta peau grasse. »') // modèle goals « peau »
    expect(system).toContain('tes cheveux secs')
    expect(system).toContain('Cuir chevelu sensible / pellicules -> SULFATES')
    expect(user).toContain("Zone d'application : cheveux et cuir chevelu")
    expect(user).not.toContain('PERTINENCE peau')
  })

  it('soin visage sans rinçage : la règle comédogène est bornée au visage', () => {
    const { system } = buildPrompt(makeInput({ productContext: FACE, productLabel: 'Crème visage' }))
    expect(system).toContain('(soin VISAGE sans rinçage UNIQUEMENT) -> COMÉDOGÈNES')
    expect(system).not.toContain('Cuir chevelu sensible / pellicules -> SULFATES')
  })

  it('produit rincé pour le corps : consignes de contact bref, ni comédogènes ni alcool', () => {
    const { system } = buildPrompt(makeInput({ productContext: BODY_RINSE, productLabel: 'Gel douche' }))
    expect(system).toContain('Produit RINCÉ')
    expect(system).toContain('Produit pour le CORPS')
    expect(system).not.toContain('-> COMÉDOGÈNES')
    expect(system).not.toContain('ALCOOL asséchant (alcohol denat, SD alcohol)')
    expect(system).toContain('CAS TOUJOURS OBLIGATOIRE : une ALLERGIE')
  })

  it('sans contexte : prompt historique (base de connaissances complète)', () => {
    const { system } = buildPrompt(makeInput())
    expect(system).not.toContain('ZONE DU PRODUIT (décision SYSTÈME')
    expect(system).toContain('-> COMÉDOGÈNES')
    expect(system).toContain('DEUX CAS TOUJOURS OBLIGATOIRES')
  })

  it('aucun tiret long dans le prompt, avec ou sans zone', () => {
    for (const productContext of [HAIR, FACE, BODY_RINSE, null]) {
      const { system, user } = buildPrompt(makeInput({ productContext }))
      expect(`${system}\n${user}`).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'))
    }
  })
})

describe('ton de la note globale : tons STOCKÉS green/amber/orange/rose', () => {
  it('mappe chaque ton réel (plus de test sur un "red" jamais stocké)', () => {
    expect(scoreToneLabel('green')).toBe('VERT (bonne formule)')
    expect(scoreToneLabel('amber')).toBe('AMBRE (formule moyenne)')
    expect(scoreToneLabel('orange')).toBe('ORANGE (formule faible)')
    expect(scoreToneLabel('rose')).toBe('ROUGE (formule très faible)')
    expect(scoreToneLabel(null)).toBeNull()
  })

  it('le message utilisateur affiche le libellé, jamais le code brut', () => {
    const { user } = buildPrompt(makeInput({ scoreTone: 'rose', score: 3, scoreLabel: 'Faible' }))
    expect(user).toContain('ton ROUGE (formule très faible)')
    expect(user).not.toMatch(/ton rose\b/)
  })
})
