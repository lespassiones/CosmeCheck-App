/**
 * User skin profile — porté à l'identique depuis le web (CosmetWiki
 * lib/skin/profile.ts) pour garantir la parité EXACTE des questions
 * d'onboarding et du format de stockage.
 *
 * Stocké dans cosme_check.user_profiles.preferences (jsonb) sous la clé `skin`.
 * Le flag `onboardingShown` vit à la racine de `preferences` (pas sous `skin`).
 */

// ─── Face skin type ───────────────────────────────────────────────────────

export const SKIN_TYPES_FACE = [
  'seche',
  'mixte',
  'grasse',
  'sensible',
  'normale',
] as const
export type SkinTypeFace = (typeof SKIN_TYPES_FACE)[number]

export const SKIN_TYPE_FACE_LABEL: Record<SkinTypeFace, string> = {
  seche: 'Sèche',
  mixte: 'Mixte',
  grasse: 'Grasse',
  sensible: 'Sensible',
  normale: 'Normale',
}

// ─── Body skin type ───────────────────────────────────────────────────────

export const SKIN_TYPES_BODY = [
  'seche',
  'tres_seche',
  'normale',
  'sensible',
  'mixte',
] as const
export type SkinTypeBody = (typeof SKIN_TYPES_BODY)[number]

export const SKIN_TYPE_BODY_LABEL: Record<SkinTypeBody, string> = {
  seche: 'Sèche',
  tres_seche: 'Très sèche / atopique',
  normale: 'Normale',
  sensible: 'Sensible / réactive',
  mixte: 'Mixte (zones sèches et grasses)',
}

// ─── Skin concerns ────────────────────────────────────────────────────────

export const SKIN_CONCERNS = [
  'acne',
  'rides',
  'taches',
  'secheresse',
  'rougeurs',
  'sensibilite',
  'pores_dilates',
  'exces_sebum',
  'cernes_poches',
  'vergetures_cellulite',
] as const
export type SkinConcern =
  | (typeof SKIN_CONCERNS)[number]
  | 'anti-age' // legacy alias for "rides"
  | 'cuir_chevelu' // legacy — migrated to HairConcern.cuir_chevelu_sensible
  | 'cheveux' // legacy — dropped

export const SKIN_CONCERN_LABEL: Record<SkinConcern, string> = {
  acne: 'Acné / boutons',
  rides: 'Rides et ridules',
  taches: 'Taches pigmentaires',
  secheresse: 'Sécheresse / déshydratation',
  rougeurs: 'Rougeurs',
  sensibilite: 'Sensibilité',
  pores_dilates: 'Pores dilatés',
  exces_sebum: 'Excès de sébum / brillance',
  cernes_poches: 'Cernes / poches',
  vergetures_cellulite: 'Cellulite / vergetures',
  'anti-age': 'Rides et ridules',
  cuir_chevelu: 'Cuir chevelu',
  cheveux: 'Cheveux (longueurs)',
}

// ─── Hair section ─────────────────────────────────────────────────────────

export const HAIR_CONCERNS = [
  'secs',
  'gras',
  'cuir_chevelu_sensible',
  'chute',
  'pellicules',
  'ternes_cassants',
] as const
export type HairConcern = (typeof HAIR_CONCERNS)[number]

export const HAIR_CONCERN_LABEL: Record<HairConcern, string> = {
  secs: 'Secs',
  gras: 'Gras',
  cuir_chevelu_sensible: 'Cuir chevelu sensible / affecté',
  chute: 'Chute de cheveux',
  pellicules: 'Pellicules',
  ternes_cassants: 'Cheveux ternes / cassants',
}

/** Sous-ensemble utilisé en étape 1 (état des cheveux au repos). */
export const HAIR_STATE_CONCERNS: readonly HairConcern[] = [
  'secs',
  'gras',
  'cuir_chevelu_sensible',
]

/** Sous-ensemble présenté en étape 2 à côté des préoccupations peau. */
export const HAIR_PROBLEM_CONCERNS: readonly HairConcern[] = [
  'chute',
  'pellicules',
  'ternes_cassants',
]

// ─── Goals / souhaits ─────────────────────────────────────────────────────

export const PROFILE_GOALS = [
  // Visage
  'peau_douce',
  'teint_uniforme',
  'attenuer_boutons',
  'reduire_rides',
  'calmer_rougeurs',
  'hydrater_profondeur',
  'reduire_taches',
  'renforcer_barriere',
  // Corps
  'adoucir_corps',
  'reduire_vergetures',
  'proteger_soleil',
  // Cheveux
  'cheveux_brillants',
  'renforcer_cheveux',
  'definir_boucles',
  'cuir_chevelu_sain',
  'reduire_chute',
  // Routine
  'simplifier_routine',
  'decouvrir_clean',
] as const
export type ProfileGoal =
  | (typeof PROFILE_GOALS)[number]
  // Legacy values (pre-rewrite). Kept on the union so old profiles parse.
  | 'comprendre_produits'
  | 'eviter_risques'
  | 'alternatives_adaptees'
  | 'construire_routine'

export const PROFILE_GOAL_LABEL: Record<ProfileGoal, string> = {
  peau_douce: 'Avoir une peau plus douce',
  teint_uniforme: 'Uniformiser mon teint',
  attenuer_boutons: 'Atténuer mes boutons',
  reduire_rides: 'Réduire mes rides et ridules',
  calmer_rougeurs: 'Calmer mes rougeurs',
  hydrater_profondeur: 'Hydrater ma peau en profondeur',
  reduire_taches: 'Réduire mes taches',
  renforcer_barriere: 'Renforcer ma peau face aux agressions',
  adoucir_corps: 'Adoucir ma peau du corps',
  reduire_vergetures: "Réduire l'apparence des vergetures",
  proteger_soleil: 'Mieux protéger ma peau du soleil',
  cheveux_brillants: 'Avoir des cheveux plus brillants',
  renforcer_cheveux: 'Renforcer mes cheveux abîmés',
  definir_boucles: 'Définir mes boucles',
  cuir_chevelu_sain: 'Avoir un cuir chevelu sain',
  reduire_chute: 'Réduire la chute / casse',
  simplifier_routine: 'Simplifier ma routine quotidienne',
  decouvrir_clean: 'Découvrir des produits plus clean',
  comprendre_produits: 'Mieux comprendre mes produits',
  eviter_risques: 'Éviter les ingrédients risqués',
  alternatives_adaptees: 'Trouver des alternatives adaptées',
  construire_routine: 'Construire / améliorer ma routine',
}

/** Objectifs groupés par catégorie pour le picker de l'étape 3. */
export const PROFILE_GOAL_GROUPS: { label: string; goals: readonly ProfileGoal[] }[] = [
  {
    label: 'Visage',
    goals: [
      'peau_douce',
      'teint_uniforme',
      'attenuer_boutons',
      'reduire_rides',
      'calmer_rougeurs',
      'hydrater_profondeur',
      'reduire_taches',
      'renforcer_barriere',
    ],
  },
  {
    label: 'Corps',
    goals: ['adoucir_corps', 'reduire_vergetures', 'proteger_soleil'],
  },
  {
    label: 'Cheveux',
    goals: [
      'cheveux_brillants',
      'renforcer_cheveux',
      'definir_boucles',
      'cuir_chevelu_sain',
      'reduire_chute',
    ],
  },
  {
    label: 'Routine',
    goals: ['simplifier_routine', 'decouvrir_clean'],
  },
]

// ─── Profile ──────────────────────────────────────────────────────────────

export type SkinProfile = {
  skinTypeFace?: SkinTypeFace
  otherSkinTypeFace?: string
  skinTypeBody?: SkinTypeBody
  otherSkinTypeBody?: string
  concerns?: SkinConcern[]
  hairConcerns?: HairConcern[]
  allergiesFreeform?: string
  otherConcerns?: string
  otherHair?: string
  /** « Autre » inline de l'étape préoccupations cheveux. */
  otherHairConcerns?: string
  otherNotes?: string
  goals?: ProfileGoal[]
  otherGoals?: string
  /** « Autre » inline par sous-étape objectifs. */
  otherGoalsFace?: string
  otherGoalsBody?: string
  otherGoalsHair?: string
  otherGoalsRoutine?: string
}

export function readSkinProfile(
  prefs: Record<string, unknown> | null | undefined,
): SkinProfile {
  if (!prefs || typeof prefs !== 'object') return {}
  const raw = (prefs as { skin?: unknown }).skin
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>

  const rawConcerns: SkinConcern[] = Array.isArray(r.concerns)
    ? (r.concerns as unknown[]).filter(
        (c): c is SkinConcern =>
          SKIN_CONCERNS.includes(c as (typeof SKIN_CONCERNS)[number]) ||
          c === 'anti-age' ||
          c === 'cuir_chevelu' ||
          c === 'cheveux',
      )
    : []

  const cleanedConcerns = rawConcerns
    .filter((c) => c !== 'cuir_chevelu' && c !== 'cheveux')
    .map((c) => (c === 'anti-age' ? 'rides' : c)) as SkinConcern[]

  const rawHair = Array.isArray(r.hairConcerns)
    ? (r.hairConcerns as unknown[]).filter((c): c is HairConcern =>
        HAIR_CONCERNS.includes(c as HairConcern),
      )
    : []
  const hairSet = new Set<HairConcern>(rawHair)
  if (rawConcerns.includes('cuir_chevelu')) hairSet.add('cuir_chevelu_sensible')

  const readShort = (key: string, max: number): string | undefined => {
    const v = r[key]
    if (typeof v !== 'string') return undefined
    const trimmed = v.trim()
    return trimmed.length > 0 ? trimmed.slice(0, max) : undefined
  }

  const skinTypeFace = SKIN_TYPES_FACE.includes(r.skinTypeFace as SkinTypeFace)
    ? (r.skinTypeFace as SkinTypeFace)
    : undefined
  const otherSkinTypeFace = readShort('otherSkinTypeFace', 120)

  const newBody = SKIN_TYPES_BODY.includes(r.skinTypeBody as SkinTypeBody)
    ? (r.skinTypeBody as SkinTypeBody)
    : undefined
  const legacyBody = SKIN_TYPES_BODY.includes(r.skinType as SkinTypeBody)
    ? (r.skinType as SkinTypeBody)
    : undefined
  const skinTypeBody = newBody ?? legacyBody
  const otherSkinTypeBody =
    readShort('otherSkinTypeBody', 120) ?? readShort('otherSkinType', 120)

  const goals: ProfileGoal[] = Array.isArray(r.goals)
    ? (r.goals as unknown[]).filter(
        (g): g is ProfileGoal => typeof g === 'string' && g in PROFILE_GOAL_LABEL,
      )
    : []

  return {
    skinTypeFace,
    otherSkinTypeFace,
    skinTypeBody,
    otherSkinTypeBody,
    concerns: cleanedConcerns.length > 0 ? cleanedConcerns : undefined,
    hairConcerns: hairSet.size > 0 ? Array.from(hairSet) : undefined,
    allergiesFreeform: readShort('allergiesFreeform', 500),
    otherConcerns: readShort('otherConcerns', 300),
    otherHair: readShort('otherHair', 200),
    otherHairConcerns: readShort('otherHairConcerns', 200),
    otherNotes: readShort('otherNotes', 500),
    goals: goals.length > 0 ? goals : undefined,
    otherGoals: readShort('otherGoals', 300),
    otherGoalsFace: readShort('otherGoalsFace', 200),
    otherGoalsBody: readShort('otherGoalsBody', 200),
    otherGoalsHair: readShort('otherGoalsHair', 200),
    otherGoalsRoutine: readShort('otherGoalsRoutine', 200),
  }
}

/** True dès qu'au moins un signal de profil est rempli (utilisé par l'advisor). */
export function isProfileStarted(p: SkinProfile): boolean {
  return (
    Boolean(p.skinTypeFace) ||
    Boolean(p.otherSkinTypeFace) ||
    Boolean(p.skinTypeBody) ||
    Boolean(p.otherSkinTypeBody) ||
    (p.concerns?.length ?? 0) > 0 ||
    Boolean(p.otherConcerns) ||
    (p.hairConcerns?.length ?? 0) > 0 ||
    Boolean(p.otherHair) ||
    Boolean(p.otherHairConcerns) ||
    Boolean(p.allergiesFreeform) ||
    Boolean(p.otherNotes) ||
    (p.goals?.length ?? 0) > 0 ||
    Boolean(p.otherGoals) ||
    Boolean(p.otherGoalsFace) ||
    Boolean(p.otherGoalsBody) ||
    Boolean(p.otherGoalsHair) ||
    Boolean(p.otherGoalsRoutine)
  )
}

/** Exige au moins 2 des 3 sections (peau / préoccupations / objectifs). */
export function isProfileComplete(p: SkinProfile): boolean {
  const skinDone =
    Boolean(p.skinTypeFace) ||
    Boolean(p.otherSkinTypeFace) ||
    Boolean(p.skinTypeBody) ||
    Boolean(p.otherSkinTypeBody) ||
    (p.hairConcerns?.length ?? 0) > 0 ||
    Boolean(p.otherHair) ||
    Boolean(p.otherHairConcerns)
  const concernsDone =
    (p.concerns?.length ?? 0) > 0 ||
    Boolean(p.otherConcerns) ||
    Boolean(p.allergiesFreeform) ||
    Boolean(p.otherNotes)
  const goalsDone =
    (p.goals?.length ?? 0) > 0 ||
    Boolean(p.otherGoals) ||
    Boolean(p.otherGoalsFace) ||
    Boolean(p.otherGoalsBody) ||
    Boolean(p.otherGoalsHair) ||
    Boolean(p.otherGoalsRoutine)
  const filled = [skinDone, concernsDone, goalsDone].filter(Boolean).length
  return filled >= 2
}

/**
 * Résumé texte court du profil peau pour contexte IA (≤ 200 chars).
 * Ex: "Peau grasse. Préoccupations: acné, pores dilatés. Objectifs: atténuer boutons."
 * Retourne null si le profil est vide.
 */
export function skinContextSummary(p: SkinProfile): string | null {
  const parts: string[] = []
  if (p.skinTypeFace) parts.push(`Peau ${SKIN_TYPE_FACE_LABEL[p.skinTypeFace].toLowerCase()}`)
  if (p.concerns?.length) {
    parts.push(`Préoccupations: ${p.concerns.slice(0, 3).map((c) => SKIN_CONCERN_LABEL[c]).join(', ')}`)
  }
  if (p.goals?.length) {
    parts.push(`Objectifs: ${p.goals.slice(0, 3).map((g) => PROFILE_GOAL_LABEL[g]).join(', ')}`)
  }
  if (p.allergiesFreeform) parts.push(`Allergies: ${p.allergiesFreeform.slice(0, 80)}`)
  return parts.length > 0 ? parts.join('. ') : null
}

// ─── Onboarding flag ──────────────────────────────────────────────────────

/** Stocké à `preferences.onboardingShown` (racine, pas sous `skin`). */
export function readOnboardingShown(
  prefs: Record<string, unknown> | null | undefined,
): boolean {
  if (!prefs || typeof prefs !== 'object') return false
  return (prefs as { onboardingShown?: unknown }).onboardingShown === true
}
