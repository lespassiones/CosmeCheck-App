/**
 * Score de compatibilité — GATING de pertinence (personal-insights/relevance).
 *
 * Couvre « tous les cas » demandés : produits liés / non liés au profil, profils
 * AVEC et SANS données, remplis partiellement (peau seule, cheveux seuls,
 * objectifs seuls, allergies seules). Prouve qu'on ne bloque JAMAIS un produit
 * hors profil (dentifrice…) et qu'on renvoie compléter la BONNE section sinon.
 */
import {
  axisFilled,
  categoryToAxis,
  detectForcedAgainst,
  relevanceVerdict,
  type SkinProfileLike,
} from '../../supabase/functions/personal-insights/relevance'

// ── Profils de test (créés puis jetés — purement en mémoire) ─────────────────
const EMPTY: SkinProfileLike = {}
const SKIN_ONLY: SkinProfileLike = { skinTypeFace: 'grasse', concerns: ['acne'] }
const HAIR_ONLY: SkinProfileLike = { hairConcerns: ['pellicules'] }
const GOALS_SKIN_ONLY: SkinProfileLike = { goals: ['peau_douce'] }
const GOALS_HAIR_ONLY: SkinProfileLike = { goals: ['cheveux_brillants'] }
const ALLERGY_ONLY: SkinProfileLike = { allergiesFreeform: 'allergie au parfum' }
const OTHERHAIR_ONLY: SkinProfileLike = { otherHair: 'cuir chevelu qui gratte' }
const FULL: SkinProfileLike = {
  skinTypeFace: 'sensible',
  concerns: ['secheresse'],
  hairConcerns: ['pellicules', 'cuir_chevelu_sensible'],
  goals: ['hydrater_profondeur', 'cuir_chevelu_sain'],
}

describe('categoryToAxis', () => {
  it('produits cheveux → hair (cheveux avant peau)', () => {
    for (const c of [
      'Shampooing Antipelliculaire',
      'Après-shampoing',
      'Masque cheveux',
      'Soin capillaire',
      'Revitalisant',
      'Coloration',
      'Gel coiffant',
    ]) {
      expect(categoryToAxis(c)).toBe('hair')
    }
  })

  it('produits peau visage/corps → skin', () => {
    for (const c of [
      'Crème visage',
      'Lait corps',
      'Sérum hydratant',
      'Gel douche',
      'Nettoyant visage',
      'Crème solaire SPF50',
      'Fond de teint',
      'Contour des yeux',
    ]) {
      expect(categoryToAxis(c)).toBe('skin')
    }
  })

  it('produits hors profil → none (jamais bloqués)', () => {
    for (const c of [
      'Dentifrice',
      'Brosse à dents',
      'Bain de bouche',
      'Déodorant',
      'Parfum',
      'Eau de toilette',
      'Bougie parfumée',
      null,
      undefined,
      '',
    ]) {
      expect(categoryToAxis(c)).toBe('none')
    }
  })

  it('insensible à la casse et aux accents partiels', () => {
    expect(categoryToAxis('SHAMPOING')).toBe('hair')
    expect(categoryToAxis('crème')).toBe('skin')
  })

  it('SLUGS catalogue : table exacte (niveau 2 prioritaire, puis racine)', () => {
    expect(categoryToAxis('coiffure/shampooing/shampooing-antipelliculaire')).toBe('hair')
    expect(categoryToAxis('soin-du-corps-et-visage/hydratant-corps/lait-corps')).toBe('skin')
    expect(categoryToAxis('hygiene-du-corps/produit-de-bain/gel-douche')).toBe('skin')
    expect(categoryToAxis('hygiene-du-corps/deodorant/deodorant-bille')).toBe('none')
    expect(categoryToAxis('maquillage/fond-de-teint-et-poudre/fond-de-teint')).toBe('skin')
    expect(categoryToAxis('maquillage/maquillage-des-yeux/mascara')).toBe('none')
    expect(categoryToAxis('rasage-et-epilation/apres-rasage')).toBe('skin')
    expect(categoryToAxis('rasage-et-epilation/lames-de-rasoir')).toBe('none')
    expect(categoryToAxis('bien-etre/massage')).toBe('skin')
    expect(categoryToAxis('bien-etre/huile-essentielle')).toBe('none')
    expect(categoryToAxis('soin-et-hygiene-bebe/soin-bebe')).toBe('none')
    expect(categoryToAxis('produit-solaire')).toBe('skin')
    // slug inconnu → fallback regex texte
    expect(categoryToAxis('categorie-inconnue/truc')).toBe('none')
  })
})

describe('axisFilled', () => {
  it('none est toujours "rempli" (ne bloque jamais)', () => {
    expect(axisFilled('none', EMPTY)).toBe(true)
  })

  it('hair : rempli via hairConcerns, otherHair, ou objectif capillaire', () => {
    expect(axisFilled('hair', HAIR_ONLY)).toBe(true)
    expect(axisFilled('hair', OTHERHAIR_ONLY)).toBe(true)
    expect(axisFilled('hair', GOALS_HAIR_ONLY)).toBe(true)
    expect(axisFilled('hair', EMPTY)).toBe(false)
    expect(axisFilled('hair', SKIN_ONLY)).toBe(false) // peau ≠ cheveux
    expect(axisFilled('hair', GOALS_SKIN_ONLY)).toBe(false) // objectif peau ≠ cheveux
  })

  it('skin : rempli via type de peau, préoccupations, objectif peau ou allergies', () => {
    expect(axisFilled('skin', SKIN_ONLY)).toBe(true)
    expect(axisFilled('skin', GOALS_SKIN_ONLY)).toBe(true)
    expect(axisFilled('skin', ALLERGY_ONLY)).toBe(true)
    expect(axisFilled('skin', EMPTY)).toBe(false)
    expect(axisFilled('skin', HAIR_ONLY)).toBe(false) // cheveux seuls ≠ peau
    expect(axisFilled('skin', GOALS_HAIR_ONLY)).toBe(false)
  })
})

describe('relevanceVerdict — tous les cas', () => {
  it('SANS profil : bloque les produits liés, laisse passer les autres', () => {
    expect(relevanceVerdict('Shampooing', EMPTY)).toEqual({
      kind: 'profile_incomplete',
      missingSection: 'hair',
    })
    expect(relevanceVerdict('Crème visage', EMPTY)).toEqual({
      kind: 'profile_incomplete',
      missingSection: 'skin',
    })
    expect(relevanceVerdict('Dentifrice', EMPTY)).toEqual({ kind: 'product_only' })
  })

  it('profil PEAU seul : cream = personal, shampoo = complète cheveux', () => {
    expect(relevanceVerdict('Crème visage', SKIN_ONLY)).toEqual({ kind: 'personal', axis: 'skin' })
    expect(relevanceVerdict('Shampooing', SKIN_ONLY)).toEqual({
      kind: 'profile_incomplete',
      missingSection: 'hair',
    })
  })

  it('profil CHEVEUX seul : shampoo = personal, cream = complète peau', () => {
    expect(relevanceVerdict('Shampooing', HAIR_ONLY)).toEqual({ kind: 'personal', axis: 'hair' })
    expect(relevanceVerdict('Crème corps', HAIR_ONLY)).toEqual({
      kind: 'profile_incomplete',
      missingSection: 'skin',
    })
  })

  it('profil OBJECTIFS seuls : suffit à personnaliser la bonne catégorie', () => {
    expect(relevanceVerdict('Crème visage', GOALS_SKIN_ONLY)).toEqual({ kind: 'personal', axis: 'skin' })
    expect(relevanceVerdict('Shampooing', GOALS_HAIR_ONLY)).toEqual({ kind: 'personal', axis: 'hair' })
  })

  it('profil COMPLET : tout est personnel (sauf hors profil)', () => {
    expect(relevanceVerdict('Crème visage', FULL)).toEqual({ kind: 'personal', axis: 'skin' })
    expect(relevanceVerdict('Shampooing', FULL)).toEqual({ kind: 'personal', axis: 'hair' })
  })

  it('produit hors profil : JAMAIS bloqué, quel que soit le profil', () => {
    for (const p of [EMPTY, SKIN_ONLY, HAIR_ONLY, FULL]) {
      expect(relevanceVerdict('Dentifrice', p)).toEqual({ kind: 'product_only' })
      expect(relevanceVerdict('Déodorant', p)).toEqual({ kind: 'product_only' })
    }
  })
})

describe('detectForcedAgainst — filets déterministes (le LLM les rate parfois)', () => {
  it('alcool asséchant + peau sensible/sèche → against forcé', () => {
    const items = [{ name: 'Aqua' }, { name: 'Alcohol Denat' }, { name: 'Glycerin' }]
    expect(detectForcedAgainst(items, { skinTypeFace: 'sensible' })).toEqual([
      { name: 'alcool', need: 'ta peau sensible ou sèche' },
    ])
    expect(detectForcedAgainst(items, { skinTypeBody: 'tres_seche' })).toHaveLength(1)
    expect(detectForcedAgainst(items, { concerns: ['secheresse'] })).toHaveLength(1)
  })

  it('alcool GRAS (cetyl/cetearyl) jamais matché ; peau normale → rien', () => {
    const fatty = [{ name: 'Cetearyl Alcohol' }, { name: 'Cetyl Alcohol' }]
    expect(detectForcedAgainst(fatty, { skinTypeFace: 'sensible' })).toEqual([])
    expect(detectForcedAgainst([{ name: 'Alcohol Denat' }], { skinTypeFace: 'normale' })).toEqual([])
  })

  it('allergie texte libre → against si l’ingrédient est présent', () => {
    const items = [{ name: 'Aqua' }, { name: 'Parfum' }]
    const out = detectForcedAgainst(items, {
      allergiesFreeform: 'allergique au parfum et aux huiles essentielles',
    })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Parfum')
    expect(out[0].need).toContain('ton allergie')
  })

  it('allergie sans ingrédient présent → rien ; max 2 entrées', () => {
    expect(
      detectForcedAgainst([{ name: 'Aqua' }], { allergiesFreeform: 'allergique au parfum' }),
    ).toEqual([])
    const both = detectForcedAgainst(
      [{ name: 'Alcohol' }, { name: 'Parfum' }, { name: 'Limonene' }],
      { skinTypeFace: 'seche', allergiesFreeform: 'allergie parfum et limonene' },
    )
    expect(both.length).toBeLessThanOrEqual(2)
  })
})
