/**
 * Règles PAR ZONE du score de compatibilité (personal-insights/relevance).
 *
 * Bêta 28 sept 2026 : « Il analyse les ingrédients d'une crème cheveux comme si
 * c'était pour le visage. » Les filets déterministes (comédogènes × peau grasse,
 * parfum × peau sensible, alcool × peau sèche, sulfates) s'appliquaient quelle
 * que soit la zone du produit, visage et corps fusionnés. On prouve ici que
 * chaque règle ne se déclenche plus que là où elle a un sens, et on SIMULE le
 * score avant/après sur le cas remonté (crème capillaire karité + coco).
 */
import {
  buildCompatLines,
  composeCompatScore,
} from '../../supabase/functions/personal-insights/compat'
import {
  resolveProductContext,
  type ZoneContextLike,
} from '../../supabase/functions/personal-insights/productContext'
import {
  againstFitsUsage,
  detectForcedAgainst,
  inferredSensitivityApplies,
  needFitsZone,
  relevanceVerdictForContext,
  type SkinProfileLike,
} from '../../supabase/functions/personal-insights/relevance'
import {
  buildZoneProfileBlock,
  filterProfileBlockForZone,
} from '../../supabase/functions/personal-insights/zoneProfile'

const inci = (...names: string[]) => names.map((name) => ({ name }))

// Contextes types.
const HAIR_LEAVE: ZoneContextLike = { axis: 'hair', zones: ['hair'], usage: 'leave_on' }
const HAIR_RINSE: ZoneContextLike = { axis: 'hair', zones: ['hair'], usage: 'rinse_off' }
const FACE_LEAVE: ZoneContextLike = { axis: 'face', zones: ['face'], usage: 'leave_on' }
const FACE_RINSE: ZoneContextLike = { axis: 'face', zones: ['face'], usage: 'rinse_off' }
const BODY_LEAVE: ZoneContextLike = { axis: 'body', zones: ['body'], usage: 'leave_on' }
const BODY_RINSE: ZoneContextLike = { axis: 'body', zones: ['body'], usage: 'rinse_off' }
const ORAL: ZoneContextLike = { axis: 'oral', zones: ['oral'], usage: 'rinse_off' }

const OILY_FACE: SkinProfileLike = { skinTypeFace: 'grasse', concerns: ['acne'] }
const SENSITIVE_FACE: SkinProfileLike = { skinTypeFace: 'sensible' }

/** Crème capillaire type (karité + coco + parfum), INCI réaliste. */
const HAIR_CREAM = inci(
  'Aqua', 'Butyrospermum Parkii Butter', 'Cocos Nucifera Oil', 'Cetearyl Alcohol', 'Glycerin',
  'Behentrimonium Chloride', 'Parfum', 'Limonene', 'Linalool', 'Phenoxyethanol',
)

describe('comédogènes : soin VISAGE sans rinçage uniquement', () => {
  it('après-shampooing à l’huile de coco + peau grasse : PLUS pénalisé', () => {
    const items = inci('Aqua', 'Cetearyl Alcohol', 'Cocos Nucifera Oil', 'Behentrimonium Chloride')
    expect(detectForcedAgainst(items, OILY_FACE, HAIR_RINSE)).toEqual([])
    expect(detectForcedAgainst(items, OILY_FACE, HAIR_LEAVE)).toEqual([])
  })

  it('crème visage à l’huile de coco + peau grasse : pénalisée', () => {
    const out = detectForcedAgainst(inci('Aqua', 'Cocos Nucifera Oil', 'Glycerin'), OILY_FACE, FACE_LEAVE)
    expect(out).toEqual([{ name: 'Cocos Nucifera Oil', need: 'ta peau grasse et tes imperfections' }])
  })

  it('nettoyant visage (rincé) ou lait corps : pas de malus comédogène', () => {
    const items = inci('Aqua', 'Cocos Nucifera Oil', 'Theobroma Cacao Seed Butter')
    expect(detectForcedAgainst(items, OILY_FACE, FACE_RINSE)).toEqual([])
    expect(detectForcedAgainst(items, OILY_FACE, BODY_LEAVE)).toEqual([])
  })

  it('zone incertaine (visage OU corps) : prudence, la règle visage s’applique', () => {
    const uncertain: ZoneContextLike = { axis: 'face', zones: ['face', 'body'], usage: 'leave_on' }
    expect(detectForcedAgainst(inci('Cocos Nucifera Oil'), OILY_FACE, uncertain)).toHaveLength(1)
  })
})

describe('parfum : peau sensible DE LA ZONE, atténué si rincé', () => {
  const perfumed = inci('Aqua', 'Sodium Laureth Sulfate', 'Parfum', 'Limonene', 'Linalool')

  it('shampooing parfumé + peau sensible du VISAGE : aucun malus peau', () => {
    // Le shampooing touche le cuir chevelu, pas le visage : la règle « peau
    // sensible » d'un soin visage sans rinçage ne s'applique pas.
    expect(detectForcedAgainst(perfumed, SENSITIVE_FACE, HAIR_RINSE)).toEqual([])
  })

  it('soin visage sans rinçage parfumé + peau sensible : un malus par allergène (historique)', () => {
    const out = detectForcedAgainst(inci('Aqua', 'Parfum', 'Limonene', 'Linalool'), SENSITIVE_FACE, FACE_LEAVE)
    expect(out.map((o) => o.name)).toEqual(['Parfum', 'Limonene', 'Linalool'])
  })

  it('gel douche (rincé) parfumé + peau du corps sensible : UN SEUL malus', () => {
    const out = detectForcedAgainst(inci('Aqua', 'Limonene', 'Parfum', 'Linalool'), { skinTypeBody: 'sensible' }, BODY_RINSE)
    expect(out).toEqual([{ name: 'Parfum', need: 'ta peau sensible' }])
  })

  it('visage et corps DISTINCTS : lait corps parfumé + seul le visage sensible, pas de malus', () => {
    expect(detectForcedAgainst(inci('Aqua', 'Parfum'), SENSITIVE_FACE, BODY_LEAVE)).toEqual([])
    expect(detectForcedAgainst(inci('Aqua', 'Parfum'), { skinTypeBody: 'sensible' }, BODY_LEAVE)).toHaveLength(1)
  })
})

describe('alcool asséchant : type de peau de la zone, contact prolongé', () => {
  const alcohol = inci('Alcohol Denat.', 'Aqua')

  it('crème visage + seul le corps très sec : pas de malus ; lait corps : malus', () => {
    expect(detectForcedAgainst(alcohol, { skinTypeBody: 'tres_seche' }, FACE_LEAVE)).toEqual([])
    expect(detectForcedAgainst(alcohol, { skinTypeBody: 'tres_seche' }, BODY_LEAVE)).toEqual([
      { name: 'alcool', need: 'ta peau sensible ou sèche' },
    ])
  })

  it('produit rincé : pas de malus alcool', () => {
    expect(detectForcedAgainst(alcohol, { skinTypeFace: 'seche' }, FACE_RINSE)).toEqual([])
  })

  it('soin capillaire sans rinçage + cheveux secs : « tes cheveux secs » (jamais « ta peau »)', () => {
    expect(detectForcedAgainst(alcohol, { skinTypeFace: 'seche', hairConcerns: ['secs'] }, HAIR_LEAVE)).toEqual([
      { name: 'alcool', need: 'tes cheveux secs' },
    ])
    expect(detectForcedAgainst(alcohol, { skinTypeFace: 'seche' }, HAIR_LEAVE)).toEqual([])
  })
})

describe('sulfates : cuir chevelu / cheveux pour un capillaire, peau de la zone sinon', () => {
  const sls = inci('Aqua', 'Sodium Laureth Sulfate')

  it('shampooing + cuir chevelu sensible : malus cuir chevelu', () => {
    expect(detectForcedAgainst(sls, { hairConcerns: ['cuir_chevelu_sensible'] }, HAIR_RINSE)).toEqual([
      { name: 'Sodium Laureth Sulfate', need: 'ton cuir chevelu sensible' },
    ])
  })

  it('shampooing + peau sèche du visage seulement : aucun malus', () => {
    expect(detectForcedAgainst(sls, { skinTypeFace: 'seche' }, HAIR_RINSE)).toEqual([])
  })

  it('gel douche + peau du corps sèche : malus même rincé (c’est un agent lavant)', () => {
    expect(detectForcedAgainst(sls, { skinTypeBody: 'seche' }, BODY_RINSE)).toEqual([
      { name: 'Sodium Laureth Sulfate', need: 'ta peau sèche' },
    ])
  })

  it('dentifrice au SLS : jamais de règle peau', () => {
    expect(detectForcedAgainst(sls, { skinTypeFace: 'sensible', concerns: ['secheresse'] }, ORAL)).toEqual([])
  })
})

describe('allergie déclarée : toutes zones', () => {
  it('s’applique aussi à un soin capillaire rincé', () => {
    const out = detectForcedAgainst(inci('Aqua', 'Parfum'), { allergiesFreeform: 'allergique au parfum' }, HAIR_RINSE)
    expect(out).toHaveLength(1)
    expect(out[0].need).toContain('ton allergie')
  })
})

describe('sensibilités DÉDUITES du profil : filtrées par zone', () => {
  const comedo = { label: 'Huiles comédogènes', reason: 'acné déclarée' }
  const scalp = { label: 'Sulfates', reason: 'cuir chevelu sensible déclaré' }
  const perfume = { label: 'Parfum / allergènes', reason: 'peau sensible déclarée', slug: 'allergene-parfumant' }
  const allergy = { label: 'Parfum', reason: 'allergie au parfum déclarée' }

  it('« peau acnéique » ne pénalise pas un shampooing, un soin corps ni un nettoyant rincé', () => {
    expect(inferredSensitivityApplies(comedo, HAIR_RINSE)).toBe(false)
    expect(inferredSensitivityApplies(comedo, HAIR_LEAVE)).toBe(false)
    expect(inferredSensitivityApplies(comedo, BODY_LEAVE)).toBe(false)
    expect(inferredSensitivityApplies(comedo, FACE_RINSE)).toBe(false)
    expect(inferredSensitivityApplies(comedo, FACE_LEAVE)).toBe(true)
  })

  it('« cuir chevelu sensible » : shampooing oui, gel douche non', () => {
    expect(inferredSensitivityApplies(scalp, HAIR_RINSE)).toBe(true)
    expect(inferredSensitivityApplies(scalp, BODY_RINSE)).toBe(false)
  })

  it('« peau sensible » : soins de peau oui, capillaire et dentifrice non', () => {
    expect(inferredSensitivityApplies(perfume, BODY_LEAVE)).toBe(true)
    expect(inferredSensitivityApplies(perfume, FACE_RINSE)).toBe(true)
    expect(inferredSensitivityApplies(perfume, HAIR_RINSE)).toBe(false)
    expect(inferredSensitivityApplies(perfume, ORAL)).toBe(false)
  })

  it('allergie : partout (« allergènes » dans un libellé n’est PAS une allergie)', () => {
    for (const ctx of [HAIR_RINSE, BODY_LEAVE, FACE_LEAVE, ORAL]) expect(inferredSensitivityApplies(allergy, ctx)).toBe(true)
  })

  it('zone inconnue : comportement historique (appliqué)', () => {
    expect(inferredSensitivityApplies(comedo, { axis: 'none', usage: 'unknown' })).toBe(true)
  })
})

describe('garde-fou des lignes IA (needFitsZone / againstFitsUsage)', () => {
  it('rejette un besoin de peau sur un soin capillaire, et inversement', () => {
    expect(needFitsZone('ta peau grasse', HAIR_LEAVE)).toBe(false)
    expect(needFitsZone('tes boutons et tes imperfections', HAIR_RINSE)).toBe(false)
    expect(needFitsZone('tes cheveux secs', HAIR_LEAVE)).toBe(true)
    expect(needFitsZone('ton cuir chevelu sensible', FACE_LEAVE)).toBe(false)
  })

  it('visage vs corps', () => {
    expect(needFitsZone('tes boutons', BODY_LEAVE)).toBe(false)
    expect(needFitsZone('ta peau du corps sèche', FACE_LEAVE)).toBe(false)
    expect(needFitsZone('ta peau sensible', BODY_LEAVE)).toBe(true)
  })

  it('besoins neutres et allergies : toujours conservés', () => {
    expect(needFitsZone('ton objectif hydratation', HAIR_LEAVE)).toBe(true)
    expect(needFitsZone('ton allergie au parfum', HAIR_RINSE)).toBe(true)
  })

  it('produit rincé : comédogènes et alcool retirés, le reste gardé', () => {
    expect(againstFitsUsage('huile de coco', FACE_RINSE)).toBe(false)
    expect(againstFitsUsage('alcool', BODY_RINSE)).toBe(false)
    expect(againstFitsUsage('agent lavant sulfaté', BODY_RINSE)).toBe(true)
    expect(againstFitsUsage('huile de coco', FACE_LEAVE)).toBe(true)
  })
})

describe('verdict de pertinence depuis le contexte', () => {
  const hairCtx = resolveProductContext({ productName: 'Crème Capillaire Koni' })
  const faceCtx = resolveProductContext({ productName: 'Crème visage' })
  const bodyCtx = resolveProductContext({ productName: 'Lait corps' })

  it('soin capillaire + profil peau seul : compléter la section cheveux', () => {
    expect(relevanceVerdictForContext(hairCtx, OILY_FACE)).toEqual({ kind: 'profile_incomplete', missingSection: 'hair' })
    expect(relevanceVerdictForContext(hairCtx, { ...OILY_FACE, hairConcerns: ['secs'] })).toEqual({ kind: 'personal', axis: 'hair' })
  })

  it('lait corps + seul le visage renseigné : score = qualité (rien à personnaliser)', () => {
    expect(relevanceVerdictForContext(bodyCtx, { skinTypeFace: 'grasse' })).toEqual({ kind: 'product_only' })
    expect(relevanceVerdictForContext(bodyCtx, { skinTypeBody: 'seche' })).toEqual({ kind: 'personal', axis: 'skin' })
    expect(relevanceVerdictForContext(faceCtx, { skinTypeFace: 'grasse' })).toEqual({ kind: 'personal', axis: 'skin' })
  })

  it('hors profil : dentifrice, parfum, mascara', () => {
    for (const name of ['Dentifrice menthe', 'Eau de parfum rose', 'Mascara volume']) {
      expect(relevanceVerdictForContext(resolveProductContext({ productName: name }), OILY_FACE)).toEqual({ kind: 'product_only' })
    }
  })
})

describe('profil LIMITÉ à la zone', () => {
  const FULL: SkinProfileLike = {
    skinTypeFace: 'grasse',
    skinTypeBody: 'seche',
    concerns: ['acne', 'secheresse', 'vergetures_cellulite'],
    hairConcerns: ['secs', 'pellicules'],
    goals: ['attenuer_boutons', 'definir_boucles', 'adoucir_corps', 'simplifier_routine'],
    allergiesFreeform: 'allergie au limonène',
  }

  it('soin capillaire : ni type de peau ni acné, mais cheveux + allergies + objectifs généraux', () => {
    const block = buildZoneProfileBlock(FULL, HAIR_LEAVE) ?? ''
    expect(block).toContain('Cheveux et cuir chevelu : Secs, Pellicules')
    expect(block).toContain('Définir mes boucles')
    expect(block).toContain('Simplifier ma routine')
    expect(block).toContain('Allergies / intolérances : allergie au limonène')
    expect(block).not.toMatch(/Type de peau|Acné|Atténuer mes boutons|Adoucir ma peau du corps/)
  })

  it('soin visage : type visage + acné, sans corps ni cheveux', () => {
    const block = buildZoneProfileBlock(FULL, FACE_LEAVE) ?? ''
    expect(block).toContain('Type de peau visage : Grasse')
    expect(block).toContain('Acné / boutons')
    expect(block).toContain('Sécheresse')
    expect(block).not.toMatch(/Type de peau corps|Cheveux et cuir chevelu|Définir mes boucles|Cellulite/)
  })

  it('soin corps : type corps + cellulite, sans acné', () => {
    const block = buildZoneProfileBlock(FULL, BODY_LEAVE) ?? ''
    expect(block).toContain('Type de peau corps : Sèche')
    expect(block).toContain('Cellulite / vergetures')
    expect(block).not.toMatch(/Type de peau visage|Acné|Atténuer mes boutons/)
  })

  it('rien pour la zone : null', () => {
    expect(buildZoneProfileBlock({ skinTypeFace: 'grasse' }, BODY_LEAVE)).toBeNull()
  })

  it('bloc TEXTE (synthèse) filtré par zone, y compris la liste d’objectifs', () => {
    const text = [
      "PROFIL DE L'UTILISATEUR (à prendre en compte pour personnaliser ta réponse) :",
      '- Type de peau visage : Grasse',
      '- Préoccupations : Acné / boutons, Sécheresse / déshydratation',
      '- Cheveux : Secs',
      '- Objectifs : Atténuer mes boutons, Définir mes boucles',
      "Adapte tes recommandations à ce profil. Cite les éléments du profil quand c'est pertinent (ex : « pour une peau sèche, … »).",
    ].join('\n')
    const hair = filterProfileBlockForZone(text, HAIR_LEAVE) ?? ''
    expect(hair).toContain('- Cheveux : Secs')
    expect(hair).toContain('- Objectifs : Définir mes boucles')
    expect(hair).not.toMatch(/peau|boutons/i)
    const face = filterProfileBlockForZone(text, FACE_LEAVE) ?? ''
    expect(face).toContain('Type de peau visage')
    expect(face).not.toContain('- Cheveux')
    expect(filterProfileBlockForZone('- Cheveux : Secs', FACE_LEAVE)).toBeNull()
  })
})

describe('SIMULATION : crème capillaire karité + coco, profil peau grasse sensible (cas bêta)', () => {
  // Profil : visage gras + acné + sensibilité, cheveux secs renseignés.
  const PROFILE: SkinProfileLike = {
    skinTypeFace: 'grasse',
    concerns: ['acne', 'sensibilite'],
    hairConcerns: ['secs'],
  }
  // Note 15/20 (verte), 0 orange, 0 rouge, aucune restriction cochée.
  const score = (forced: { name: string; need: string }[]) =>
    composeCompatScore({
      scoreOver20: 15,
      orange: 0,
      red: 0,
      iaLines: buildCompatLines({ contributors: [], against: forced }),
      restrictionLabels: [],
    })

  it('AVANT (zones fusionnées) : 4 malus peau sur un soin cheveux, 55 %', () => {
    const before = detectForcedAgainst(HAIR_CREAM, PROFILE) // contexte historique
    expect(before.map((b) => b.name)).toEqual(['Parfum', 'Limonene', 'Linalool', 'Cocos Nucifera Oil'])
    const s = score(before)
    expect(s.breakdown.base).toBe(75)
    expect(s.score).toBe(55)
    expect(s.label).toBe('Moyennement adapté')
  })

  it('APRÈS (zone cheveux, sans rinçage) : aucun malus peau, 75 % avant bonus IA', () => {
    const ctx = resolveProductContext({ productName: 'Crème Capillaire Koni', categories: ['creme_corps'], items: HAIR_CREAM })
    expect(ctx).toMatchObject({ axis: 'hair', usage: 'leave_on' })
    const after = detectForcedAgainst(HAIR_CREAM, PROFILE, ctx)
    expect(after).toEqual([])
    const s = score(after)
    expect(s.score).toBe(75)
    expect(s.label).toBe('Compatible')
    // Et si le LLM répond malgré tout « huile de coco : ta peau grasse », le
    // garde-fou de zone retire la ligne (enforceCompatibility).
    expect(needFitsZone('ta peau grasse et tes imperfections', ctx)).toBe(false)
  })
})
