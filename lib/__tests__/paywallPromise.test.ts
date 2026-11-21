import { buildPaywallPromise, goalToYou } from '@/lib/onboarding/paywallPromise'

const title = (p: ReturnType<typeof buildPaywallPromise>) => `${p.lead}${p.highlight}${p.tail}`

describe('buildPaywallPromise', () => {
  it('cite les deux premiers soucis dans le titre', () => {
    const p = buildPaywallPromise({
      name: 'John',
      skinTypeFace: 'grasse',
      concerns: ['pores_dilates', 'taches', 'acne'],
      goals: [],
      without: null,
    })
    expect(title(p)).toBe('John, on va trouver ta routine contre tes boutons et tes pores.')
    expect(p.subtitle).toContain('pour ta peau grasse')
    expect(p.pills).toEqual(['Taches'])
  })

  it('met les objectifs en pastilles quand les soucis sont au titre', () => {
    const p = buildPaywallPromise({
      name: null,
      concerns: ['taches'],
      goals: ['teint_uniforme', 'hydrater_profondeur'],
      without: 'Sans parfum ni sulfates',
    })
    expect(title(p)).toBe('On va trouver ta routine contre tes taches.')
    expect(p.pills).toEqual(['Uniformiser ton teint', 'Hydrater ta peau en profondeur'])
    expect(p.subtitle).toBe('Perle passe chaque produit au crible pour toi, sans parfum ni sulfates, et te dit lesquels garder.')
  })

  it("sans souci, le premier objectif fait le titre et n'est pas répété", () => {
    const p = buildPaywallPromise({ name: 'Léa', concerns: [], goals: ['reduire_rides', 'peau_douce'], without: null })
    expect(title(p)).toBe('Léa, on va trouver ta routine pour réduire tes rides et ridules.')
    expect(p.pills).toEqual(['Avoir une peau plus douce'])
  })

  it('retombe sur le type de peau, puis sur « toi »', () => {
    expect(title(buildPaywallPromise({ name: null, skinTypeFace: 'seche', concerns: [], goals: [], without: null }))).toBe(
      'On va trouver la routine faite pour ta peau sèche.',
    )
    const empty = buildPaywallPromise({ name: null, concerns: [], goals: [], without: null })
    expect(title(empty)).toBe('On va trouver la routine faite pour toi.')
    expect(empty.pills).toEqual([])
  })

  it('passe les objectifs au tutoiement', () => {
    expect(goalToYou('Calmer mes rougeurs')).toBe('calmer tes rougeurs')
    expect(goalToYou('Renforcer ma peau face aux agressions')).toBe('renforcer ta peau face aux agressions')
  })
})
