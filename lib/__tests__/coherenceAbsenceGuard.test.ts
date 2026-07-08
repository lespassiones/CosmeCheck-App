/**
 * Garde anti-hallucination des promesses "sans X" (coherence-analyze).
 *
 * Contexte : audit prod 07/2026. Le LLM invente parfois un "sans X" absent de
 * la description ; comme la formule contient X, le verdict devient "contredite"
 * à tort. Ce garde n'accepte une promesse d'absence que si le texte l'affirme
 * (token ingrédient + marqueur de négation proche). PARITÉ avec le web
 * (lib/coherence/absenceGuard.ts côté CosmetWiki).
 */
import { descriptionSupportsAbsenceClaim } from '../../supabase/functions/coherence-analyze/lib/absenceGuard'

describe('descriptionSupportsAbsenceClaim — cas hallucinés (audit réel)', () => {
  it('LRP Lipikar : "sans sulfate" jamais dans le texte → rejeté', () => {
    const d =
      'La Roche-Posay présente Lipikar Huile Lavante AP+ comme une huile de douche légèrement parfumée, formulation minimaliste au beurre de karité et à la niacinamide.'
    expect(descriptionSupportsAbsenceClaim('absence_sulfate', d)).toBe(false)
  })

  it('Caudalie Vinoperfect : "sans parfum" jamais dans le texte → rejeté', () => {
    const d =
      'Le Sérum Éclat Anti-Taches Vinoperfect de Caudalie est enrichi en Viniférine brevetée, un actif issu de la sève de vigne. La texture lactée hydrate sans laisser de fini gras.'
    expect(descriptionSupportsAbsenceClaim('absence_parfum_synthese', d)).toBe(false)
  })

  it('Garnier Micellar : "sans PEG/éthoxylés" jamais dans le texte → rejeté', () => {
    const d =
      'Solution tout-en-un qui nettoie, démaquille et exfolie. Sans rinçage, sans frottement et sans résidu. Vegan et sans cruauté.'
    expect(descriptionSupportsAbsenceClaim('absence_ethoxyle', d)).toBe(false)
  })
})

describe('descriptionSupportsAbsenceClaim — vraies allégations conservées', () => {
  it('"sans sulfate" explicite → accepté', () => {
    expect(
      descriptionSupportsAbsenceClaim('absence_sulfate', 'Formule douce sans sulfate ni savon.'),
    ).toBe(true)
  })

  it('énumération "sans huiles, silicones ni quats" → silicone accepté', () => {
    const d = 'Formule légère sans huiles, silicones ni quats, laisse le cheveu propre.'
    expect(descriptionSupportsAbsenceClaim('absence_silicone', d)).toBe(true)
    expect(descriptionSupportsAbsenceClaim('absence_ammonium_quaternaire', d)).toBe(true)
  })

  it('anglais "sulfate-free" → accepté', () => {
    expect(descriptionSupportsAbsenceClaim('absence_sulfate', 'A gentle sulfate-free cleanser.')).toBe(
      true,
    )
  })

  it('"0 % paraben" → accepté', () => {
    expect(descriptionSupportsAbsenceClaim('absence_paraben', 'Soin 0 % paraben, testé.')).toBe(true)
  })

  it('"hypoallergénique" suffit pour l\'allergène parfumant', () => {
    expect(
      descriptionSupportsAbsenceClaim('absence_allergene_parfumant', 'Crème hypoallergénique testée.'),
    ).toBe(true)
  })

  it('"sans allergène parfumant" explicite → accepté', () => {
    expect(
      descriptionSupportsAbsenceClaim(
        'absence_allergene_parfumant',
        'Ce soin est sans allergène parfumant.',
      ),
    ).toBe(true)
  })
})

describe('descriptionSupportsAbsenceClaim — bornes', () => {
  it('token présent mais aucun marqueur de négation proche → rejeté', () => {
    // "contient du parfum" mentionne le parfum SANS le nier.
    expect(
      descriptionSupportsAbsenceClaim('absence_parfum_synthese', 'Ce produit contient du parfum agréable.'),
    ).toBe(false)
  })

  it('description vide → rejeté', () => {
    expect(descriptionSupportsAbsenceClaim('absence_sulfate', '')).toBe(false)
  })

  it('slug inconnu → fail-open (non bloquant)', () => {
    expect(descriptionSupportsAbsenceClaim('absence_inexistant', 'peu importe')).toBe(true)
  })
})
