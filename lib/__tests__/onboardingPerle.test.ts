/**
 * Onboarding « Le diagnostic de Perle » : logique pure.
 *
 * Verrouille les trois choses qui ne doivent jamais régresser :
 *   1. aucune donnée de peau n'est écrite sans consentement explicite ;
 *   2. toutes les questions de l'ancien questionnaire ont un champ d'arrivée ;
 *   3. le verdict express ne cite que des ingrédients réellement présents.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}))

import {
  STEP_ORDER,
  HEALTH_STEPS,
  nextStep,
  previousStep,
  progressPercent,
  visibleSteps,
  type StepContext,
} from '@/lib/onboarding/steps'
import {
  buildOnboardingPreferences,
  draftRestrictionFamilies,
  draftToSkinPatch,
} from '@/lib/onboarding/buildPreferences'
import { emptyDraft, parseDraft, DRAFT_TTL_MS, type OnboardingDraft } from '@/lib/onboarding/draft'
import {
  FACE_EXCLUSIVE,
  bodyPrecision,
  facePrecision,
  ingredientsPerDay,
  planChartNotes,
  planLead,
  planLines,
  resolveBodySkin,
  resolveFaceSkin,
  skinRevealFor,
  toggleAnswer,
  preselectedGoals,
  truthBubble,
  withoutLabel,
  montageLines,
} from '@/lib/onboarding/content'
import {
  buildQuickVerdict,
  detectClaims,
  prettyInci,
  type MatchedIngredient,
} from '@/lib/onboarding/verdict'
import { readSkinProfile, isProfileComplete } from '@/lib/skin/profile'
import { readRestrictions } from '@/lib/supabase/types'

const guest: StepContext = {
  mode: 'guest',
  consentGranted: null,
  consentAlreadyGiven: false,
  hasKnownName: false,
  hasScannedProduct: false,
}

function draft(patch: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return { ...emptyDraft(new Date('2026-09-28T10:00:00Z')), ...patch }
}

const NOW = '2026-09-28T10:05:00.000Z'

describe('étapes visibles', () => {
  it('parcours invité complet : accroche, consentement, questions, scan, montage, paywall', () => {
    const steps = visibleSteps({ ...guest, consentGranted: true, hasScannedProduct: true })
    expect(steps[0]).toBe('hook1')
    expect(steps).toContain('consent')
    expect(steps).toContain('bodySkin')
    expect(steps).toContain('goals')
    // Paywall au pic de motivation, juste après le montage et AVANT le compte.
    expect(steps.slice(-2)).toEqual(['montage', 'paywall'])
    expect(steps).toEqual(STEP_ORDER)
  })

  it('connecté : pas de paywall dans le parcours (il vient après, via /offre)', () => {
    const steps = visibleSteps({ ...guest, mode: 'member', consentGranted: true })
    expect(steps).not.toContain('paywall')
    expect(steps[steps.length - 1]).toBe('montage')
  })

  it('consentement refusé : aucune question de santé', () => {
    const steps = visibleSteps({ ...guest, consentGranted: false })
    for (const s of HEALTH_STEPS) expect(steps).not.toContain(s)
    expect(steps).toContain('volume')
    expect(steps).toContain('scan')
  })

  it("le verdict n'apparaît qu'avec un produit choisi", () => {
    expect(visibleSteps(guest)).not.toContain('verdict')
    expect(visibleSteps({ ...guest, hasScannedProduct: true })).toContain('verdict')
  })

  it('mode connecté : pas d’accroche, pas de prénom déjà connu, pas de consentement déjà donné', () => {
    const steps = visibleSteps({
      ...guest,
      mode: 'member',
      hasKnownName: true,
      consentAlreadyGiven: true,
      consentGranted: true,
    })
    expect(steps).not.toContain('hook1')
    expect(steps).not.toContain('hook2')
    expect(steps).not.toContain('name')
    expect(steps).not.toContain('consent')
    expect(steps[0]).toBe('pain')
  })

  it('la barre avance vite au début et finit à 100 % aux notifications', () => {
    const steps = visibleSteps({ ...guest, consentGranted: true, hasScannedProduct: true })
    const first = progressPercent('name', steps)
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(15)
    expect(progressPercent('notifications', steps)).toBe(100)
    expect(progressPercent('hook1', steps)).toBe(0)
    expect(progressPercent('volume', steps)).toBeGreaterThan(50)
  })

  it('navigation avant / arrière', () => {
    const steps = visibleSteps(guest)
    expect(nextStep('hook1', steps)).toBe('hook2')
    expect(previousStep('hook2', steps)).toBe('hook1')
    expect(previousStep('hook1', steps)).toBeNull()
    expect(nextStep('montage', steps)).toBe('paywall')
    expect(nextStep('paywall', steps)).toBeNull()
  })
})

describe("aucune question de l'ancien questionnaire n'est perdue", () => {
  const full = draft({
    consent: { granted: true, at: '2026-09-28T10:00:00Z', version: 1 },
    skinTest: 'mixte',
    skinOther: 'zones sèches sur les ailes du nez',
    bodySkin: 'tres_seche',
    concerns: ['acne', 'exces_sebum', 'vergetures_cellulite'],
    otherConcerns: 'tiraillements le soir',
    goals: ['attenuer_boutons', 'reduire_vergetures', 'cheveux_brillants'],
    otherGoals: 'une routine en 3 produits',
    motivations: ['comprendre', 'simplifier', 'clean'],
    hair: ['secs', 'chute'],
    allergiesFreeform: 'allergie au nickel',
    restrictions: ['parfum', 'sulfates'],
  })

  it('chaque ancienne question a son champ', () => {
    const p = draftToSkinPatch(full)
    expect(p.skinTypeFace).toBe('mixte') // ancienne étape 1 (visage)
    expect(p.otherSkinTypeFace).toBe('zones sèches sur les ailes du nez')
    expect(p.skinTypeBody).toBe('tres_seche') // étape 2 (corps)
    expect(p.hairConcerns).toEqual(['secs', 'chute']) // étapes 3 et 5 (cheveux)
    expect(p.concerns).toEqual(['acne', 'exces_sebum', 'vergetures_cellulite']) // étape 4
    expect(p.otherConcerns).toBe('tiraillements le soir') // étape 6
    // étapes 7 à 10 : objectifs visage, corps, cheveux, routine
    expect(p.goals).toEqual(
      expect.arrayContaining([
        'attenuer_boutons',
        'reduire_vergetures',
        'cheveux_brillants',
        'simplifier_routine',
        'decouvrir_clean',
      ]),
    )
    expect(p.otherGoals).toBe('une routine en 3 produits') // étape 11
    expect(p.allergiesFreeform).toBe('allergie au nickel')
  })

  it("seules les motivations « routine » deviennent des objectifs", () => {
    const p = draftToSkinPatch(full)
    expect(p.goals).not.toContain('comprendre_produits')
  })

  it('le profil écrit est reconnu comme complet', () => {
    const prefs = buildOnboardingPreferences({}, full, NOW)
    expect(isProfileComplete(readSkinProfile(prefs))).toBe(true)
  })
})

describe('écriture du profil', () => {
  it('consentement donné : peau, restrictions et trace du consentement', () => {
    const d = draft({
      consent: { granted: true, at: '2026-09-28T10:00:00Z', version: 1 },
      skinTest: 'sensible',
      restrictions: ['parfum', 'silicones'],
    })
    const prefs = buildOnboardingPreferences({ paywall_shown: false, review_replay: true }, d, NOW)
    expect(prefs.onboardingShown).toBe(true)
    expect(readSkinProfile(prefs).skinTypeFace).toBe('sensible')
    expect(readRestrictions(prefs).families).toEqual([
      'parfum-synthese',
      'allergene-parfumant',
      'silicone',
    ])
    expect(prefs.data_consent).toEqual({ granted: true, at: '2026-09-28T10:00:00Z', version: 1 })
    // Les autres clés ne bougent pas.
    expect(prefs.paywall_shown).toBe(false)
    expect(prefs.review_replay).toBe(true)
  })

  it('consentement refusé : AUCUNE donnée de peau, mais le parcours est marqué vu', () => {
    const d = draft({
      consent: { granted: false, at: NOW, version: 1 },
      skinTest: 'grasse',
      restrictions: ['parfum'],
    })
    const prefs = buildOnboardingPreferences({}, d, NOW)
    expect(prefs.onboardingShown).toBe(true)
    expect(prefs.skin).toBeUndefined()
    expect(prefs.restrictions).toBeUndefined()
    expect(prefs.data_consent).toBeUndefined()
    expect((prefs.onboarding as { consent: string }).consent).toBe('refused')
  })

  it('les restrictions existantes sont conservées (union)', () => {
    const d = draft({
      consent: { granted: true, at: NOW, version: 1 },
      restrictions: ['parfum'],
    })
    const prefs = buildOnboardingPreferences(
      { restrictions: { families: ['paraben'], ingredients: [{ slug: 'nickel', name: 'Nickel' }] } },
      d,
      NOW,
    )
    const r = readRestrictions(prefs)
    expect(r.families).toEqual(['paraben', 'parfum-synthese', 'allergene-parfumant'])
    expect(r.ingredients).toEqual([{ slug: 'nickel', name: 'Nickel' }])
  })

  it('les champs non demandés du profil existant sont gardés', () => {
    const d = draft({ consent: { granted: true, at: NOW, version: 1 }, skinTest: 'seche' })
    const prefs = buildOnboardingPreferences(
      { skin: { skinTypeBody: 'normale', goals: ['peau_douce'] } },
      d,
      NOW,
    )
    const skin = readSkinProfile(prefs)
    expect(skin.skinTypeFace).toBe('seche')
    expect(skin.skinTypeBody).toBe('normale')
    expect(skin.goals).toEqual(['peau_douce'])
  })

  it('notifications acceptées : préférences activées', () => {
    const prefs = buildOnboardingPreferences({}, draft({ notifications: 'granted' }), NOW)
    expect(prefs.notifications).toEqual(expect.objectContaining({ enabled: true, promptSeen: true }))
  })

  it('familles écrites pour chaque restriction', () => {
    expect(draftRestrictionFamilies(draft({ restrictions: ['alcool', 'huiles', 'parabenes', 'sulfates'] }))).toEqual([
      'alcool',
      'huile-essentielle',
      'paraben',
      'sulfate',
    ])
  })
})

describe('brouillon', () => {
  it('relit un brouillon valide', () => {
    const d = draft({ firstName: 'Camille', completed: true })
    const back = parseDraft(JSON.stringify(d), Date.parse('2026-09-28T12:00:00Z'))
    expect(back?.firstName).toBe('Camille')
    expect(back?.completed).toBe(true)
  })

  it('ignore un brouillon périmé ou abîmé', () => {
    const d = draft()
    expect(parseDraft(JSON.stringify(d), Date.parse(d.savedAt) + DRAFT_TTL_MS + 1)).toBeNull()
    expect(parseDraft('{pas du json')).toBeNull()
    expect(parseDraft(JSON.stringify({ v: 2 }))).toBeNull()
    expect(parseDraft(null)).toBeNull()
  })
})

describe('réactions', () => {
  it('projection : produits × 25', () => {
    expect(ingredientsPerDay(5)).toBe(125)
    expect(ingredientsPerDay(12)).toBe(300)
  })

  it('objectifs pré-cochés d’après les soucis', () => {
    expect(preselectedGoals(['acne', 'rougeurs', 'cernes_poches'])).toEqual([
      'attenuer_boutons',
      'calmer_rougeurs',
    ])
  })

  it('bulle de la vérité selon le nombre de soucis', () => {
    expect(truthBubble(3)).toMatch(/ces 3 soucis/)
    expect(truthBubble(1)).toMatch(/ce souci/)
    expect(truthBubble(0)).toMatch(/Je veille/)
  })

  it('« Sans parfum ni sulfates »', () => {
    expect(withoutLabel(['parfum', 'sulfates'])).toBe('Sans parfum ni sulfates')
    expect(withoutLabel(['parfum', 'sulfates', 'silicones'])).toBe('Sans parfum, sulfates ni silicones')
    expect(withoutLabel([])).toBeNull()
  })

  it('plan : reprend la peau, les soucis et les restrictions', () => {
    const lead = planLead({ skin: 'mixte', concerns: ['acne', 'exces_sebum', 'rougeurs'], restrictionShorts: [] })
    expect(`${lead.before}${lead.skin}${lead.middle}${lead.concerns}`).toBe('Pour ta peau mixte et tes 3 soucis')
    expect(planLines().map((l) => l.text)).toEqual([
      'Des produits qui correspondent parfaitement à ton profil',
      'Des ingrédients faits pour toi, pensés pour tes objectifs',
      'Les ingrédients à risque signalés dans chaque produit que tu scannes',
      'Une routine simple, sans doublons',
      "Plus aucun achat à l'aveugle",
    ])
  })

  it('graphe du plan : des gains chiffrés, repris des réponses (pas inventés)', () => {
    // « 3 à 5 » produits arrêtés cette année → 4, comme la réaction de Perle.
    expect(planChartNotes({ productsPerDay: 5, abandoned: 'trois_cinq' })).toEqual({
      tag: '100 % de ta routine vérifiée',
      note: '-4 produits ratés par an',
    })
    expect(planChartNotes({ productsPerDay: 5, abandoned: 'un_deux' }).note).toBe('-2 produits ratés par an')
    expect(planChartNotes({ productsPerDay: 5, abandoned: 'plus_cinq' }).note).toBe('-5 produits ratés par an')
    // Aucun produit raté : le gain chiffré devient les ingrédients décryptés (5 × 25).
    expect(planChartNotes({ productsPerDay: 5, abandoned: 'aucun' }).note).toBe('125 ingrédients décryptés')
    expect(planChartNotes({ productsPerDay: null, abandoned: null }).note).toBe('125 ingrédients décryptés')
    expect(planChartNotes({ productsPerDay: 2, abandoned: null }).note).toBe(
      `${ingredientsPerDay(2)} ingrédients décryptés`,
    )
  })

  it('montage : reprend la peau et les restrictions', () => {
    expect(montageLines({ skin: 'mixte', restrictionShorts: ['parfum', 'sulfates'] })).toEqual([
      'Je lis tes réponses…',
      'Je note ta peau mixte…',
      "J'ajoute le parfum et les sulfates à ta liste…",
      'Je prépare tes alternatives…',
    ])
  })
})

describe('verdict express', () => {
  const m = (name: string, color: string, tags: string[] = []): MatchedIngredient => ({
    input_token: name.toLowerCase(),
    position_idx: 0,
    name,
    color_rating: color,
    tags,
    match_kind: 'exact',
  })
  const matches = [
    m('AQUA', 'Vert'),
    m('GLYCERIN', 'Vert'),
    m('PANTHENOL', 'Vert'),
    m('PARFUM', 'Jaune', ['parfum-synthese']),
    m('LINALOOL', 'Jaune', ['allergene-parfumant', 'allergene-reglemente']),
    m('ALCOHOL DENAT.', 'Jaune', ['alcool', 'cov']),
    m('METHYLPARABEN', 'Rouge', ['paraben']),
  ]

  it('cite le parfum évité avec ses vrais noms et la réponse de la personne', () => {
    const v = buildQuickVerdict({
      productName: 'Crème Douceur Apaisante peaux sensibles',
      score: 11.4,
      scoreLabel: 'Moyen',
      ingredientCount: 27,
      matches,
      skin: 'sensible',
      restrictions: ['parfum'],
      personalized: true,
    })
    expect(v.alerts[0]).toEqual({
      title: 'Contient du parfum (Parfum, Linalool)',
      detail: 'Tu as dit : peau sensible, parfum à éviter',
    })
    expect(v.positives[0].title).toBe('Glycérine et panthénol')
    // Un seul ingrédient rouge plafonne à 12,9 : 11,4 reste « Moyen ».
    expect(v.scoreLabel).toBe('Moyen')
    expect(v.starTone).toBe('caution')
    expect(v.tone).toBe('orange')
    expect(v.kind).toBe('alerts')
    expect(v.claims).toEqual(expect.arrayContaining(['Peaux sensibles', 'Formule douce', 'Apaisant']))
    expect(v.counts).toEqual({ vert: 3, jaune: 3, orange: 0, rouge: 1, total: 27 })
  })

  it('ajoute ce que son type de peau doit surveiller', () => {
    const v = buildQuickVerdict({
      productName: 'Gel',
      score: 14,
      scoreLabel: 'Bien',
      ingredientCount: 7,
      matches,
      skin: 'mixte',
      restrictions: [],
      personalized: true,
    })
    expect(v.alerts[0].title).toBe("Contient de l'alcool asséchant (Alcohol denat.)")
    expect(v.alerts[0].detail).toBe('Tu as une peau mixte : assèche les joues')
  })

  it('plafond couleur : mêmes étoiles que l’aperçu de scan', () => {
    const v = buildQuickVerdict({
      productName: 'Crème',
      score: 14.2,
      scoreLabel: 'Bien',
      ingredientCount: 5,
      matches: [m('AQUA', 'Vert'), m('METHYLPARABEN', 'Rouge', ['paraben']), m('PROPYLPARABEN', 'Rouge', ['paraben'])],
      skin: 'normale',
      restrictions: [],
      personalized: true,
    })
    // 2 rouges : la note affichée ne peut pas dépasser 8,9, quoi que dise le catalogue.
    expect(v.scoreLabel).toBe('Faible')
    expect(v.starTone).toBe('warning')
  })

  it("n'invente rien : produit propre = bonne pioche", () => {
    const v = buildQuickVerdict({
      productName: 'Lait',
      score: 17.2,
      scoreLabel: null,
      ingredientCount: 3,
      matches: [m('AQUA', 'Vert'), m('GLYCERIN', 'Vert')],
      skin: 'seche',
      restrictions: ['parfum', 'sulfates'],
      personalized: true,
    })
    expect(v.alerts).toEqual([])
    expect(v.kind).toBe('clean')
    expect(v.scoreLabel).toBe('Très bien')
    expect(v.starTone).toBe('very-safe')
  })

  it('sans consentement : seulement ce que la base note orange ou rouge', () => {
    const v = buildQuickVerdict({
      productName: 'Lait',
      score: null,
      scoreLabel: null,
      ingredientCount: 7,
      matches,
      skin: null,
      restrictions: ['parfum'],
      personalized: false,
    })
    expect(v.alerts).toEqual([
      { title: 'À surveiller : Methylparaben', detail: 'Notés orange ou rouge dans notre base' },
    ])
    expect(v.scoreLabel).toBeNull()
    expect(v.starTone).toBe('unknown')
  })

  it('mise en forme des noms INCI', () => {
    expect(prettyInci('ALCOHOL DENAT.')).toBe('Alcohol denat.')
    expect(prettyInci('PEG-40 HYDROGENATED CASTOR OIL')).toBe('PEG-40 Hydrogenated Castor Oil')
    expect(detectClaims('Shampooing')).toEqual([])
  })
})

describe('peau : plusieurs réponses, un profil lisible par la compatibilité', () => {
  it('les réponses exclusives remplacent les autres', () => {
    expect(toggleAnswer(['mixte', 'sensible'], 'inconnu', FACE_EXCLUSIVE)).toEqual(['inconnu'])
    expect(toggleAnswer(['normale'], 'seche', FACE_EXCLUSIVE)).toEqual(['seche'])
    expect(toggleAnswer(['seche'], 'seche', FACE_EXCLUSIVE)).toEqual([])
  })

  it('visage : zone T + chauffe ou rougit = mixte et sensible', () => {
    expect(resolveFaceSkin(['mixte', 'sensible'])).toEqual({ primary: 'mixte', sensitive: true, extras: [] })
    expect(facePrecision(['mixte', 'sensible'])).toBe('Aussi : chauffe ou rougit pour un rien')
  })

  it('visage : brille partout + tire = mixte, les deux gardés en précision', () => {
    expect(resolveFaceSkin(['grasse', 'seche']).primary).toBe('mixte')
    expect(facePrecision(['grasse', 'seche'])).toBe('Aussi : brille partout, tire après la douche')
  })

  it('visage : seulement « chauffe ou rougit » = peau sensible', () => {
    expect(resolveFaceSkin(['sensible'])).toEqual({ primary: 'sensible', sensitive: false, extras: [] })
    expect(facePrecision(['sensible'])).toBeNull()
  })

  it('corps : sensible passe en premier, la sécheresse part en précision', () => {
    expect(resolveBodySkin(['seche', 'sensible'])).toEqual({ primary: 'sensible', extras: ['seche'] })
    expect(bodyPrecision(['seche', 'sensible'])).toBe('Aussi : sèche')
    expect(resolveBodySkin(['inconnu'])).toEqual({ primary: 'inconnu', extras: [] })
  })

  it('le profil écrit garde un type principal et une précision (120 caractères au plus)', () => {
    const prefs = buildOnboardingPreferences(
      {},
      draft({
        consent: { granted: true, at: NOW, version: 1 },
        skinTests: ['grasse', 'seche', 'sensible'],
        skinTest: 'mixte',
        skinSensitive: true,
        skinOther: 'des plaques en hiver',
        bodySkins: ['tres_seche', 'sensible'],
        bodySkin: 'sensible',
      }),
      NOW,
    )
    const skin = readSkinProfile(prefs)
    expect(skin.skinTypeFace).toBe('mixte')
    expect(skin.otherSkinTypeFace).toBe(
      'des plaques en hiver · Aussi : brille partout, tire après la douche, chauffe ou rougit pour un rien',
    )
    expect((skin.otherSkinTypeFace ?? '').length).toBeLessThanOrEqual(120)
    expect(skin.skinTypeBody).toBe('sensible')
    expect(skin.otherSkinTypeBody).toBe('Aussi : très sèche, voire atopique')
  })

  it("l'écran de réaction tient compte d'une peau aussi sensible", () => {
    const v = skinRevealFor('mixte', true)
    expect(v.title).toBe('Peau mixte et sensible.')
    expect(v.watch.map((w) => w.inci)).toEqual(['Alcohol denat.', 'Parfum'])
    expect(skinRevealFor('sensible', true).title).toBe('Peau sensible.')
  })
})

describe('ingrédients précis et paywall', () => {
  it('les ingrédients choisis dans les suggestions rejoignent la liste à éviter', () => {
    const prefs = buildOnboardingPreferences(
      { restrictions: { families: [], ingredients: [{ slug: 'nickel', name: 'NICKEL' }] } },
      draft({
        consent: { granted: true, at: NOW, version: 1 },
        restrictionIngredients: [
          { slug: 'linalool', name: 'LINALOOL' },
          { slug: 'nickel', name: 'NICKEL' },
        ],
      }),
      NOW,
    )
    expect(readRestrictions(prefs).ingredients).toEqual([
      { slug: 'nickel', name: 'NICKEL' },
      { slug: 'linalool', name: 'LINALOOL' },
    ])
  })

  it("paywall vu avant le compte : il ne se remontre pas après l'inscription", () => {
    const prefs = buildOnboardingPreferences({}, draft({ paywallSeen: true, purchased: true }), NOW)
    expect(prefs.paywall_shown).toBe(true)
    expect((prefs.onboarding as { purchasedBeforeAccount: boolean }).purchasedBeforeAccount).toBe(true)
    expect(buildOnboardingPreferences({}, draft(), NOW).paywall_shown).toBeUndefined()
  })

  it('verdict : un ingrédient précis évité est signalé en premier', () => {
    const v = buildQuickVerdict({
      productName: 'Lait',
      score: 15,
      scoreLabel: 'Bien',
      ingredientCount: 3,
      matches: [
        { input_token: 'aqua', position_idx: 0, name: 'AQUA', slug: 'aqua', color_rating: 'Vert', tags: [], match_kind: 'exact' },
        {
          input_token: 'linalool',
          position_idx: 1,
          name: 'LINALOOL',
          slug: 'linalool',
          color_rating: 'Jaune',
          tags: ['allergene-parfumant'],
          match_kind: 'exact',
        },
      ],
      skin: 'normale',
      restrictions: [],
      avoidIngredients: [{ slug: 'linalool', name: 'LINALOOL' }],
      personalized: true,
    })
    expect(v.alerts[0]).toEqual({ title: 'Contient Linalool', detail: 'Tu as dit vouloir l’éviter' })
  })

  it('verdict : peau aussi sensible = « Tu as dit : peau sensible »', () => {
    const v = buildQuickVerdict({
      productName: 'Crème',
      score: 14,
      scoreLabel: 'Bien',
      ingredientCount: 2,
      matches: [
        {
          input_token: 'parfum',
          position_idx: 0,
          name: 'PARFUM',
          color_rating: 'Jaune',
          tags: ['parfum-synthese'],
          match_kind: 'exact',
        },
      ],
      skin: 'mixte',
      sensitive: true,
      restrictions: ['parfum'],
      personalized: true,
    })
    expect(v.alerts[0].detail).toBe('Tu as dit : peau sensible, parfum à éviter')
  })
})
