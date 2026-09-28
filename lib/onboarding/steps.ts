/**
 * Ordre et visibilité des écrans de l'onboarding « Le diagnostic de Perle ».
 *
 * Deux modes partagent le même parcours :
 *   - `guest`  : personne non connectée. Le parcours commence par l'accroche,
 *     se termine par le montage, puis l'écran de compte (/(auth)/welcome)
 *     enregistre les réponses. Le paywall vient APRÈS le compte (choix produit
 *     du 28/09/2026 : l'achat est ainsi rattaché au bon compte dès le départ).
 *   - `member` : personne déjà connectée qui n'a pas de profil (ancien compte,
 *     compte de démonstration Apple rejoué). Pas d'accroche, pas de prénom si
 *     on l'a déjà, et les réponses sont écrites directement à la fin.
 *
 * Tout est pur ici : la décision de ce qui s'affiche est testée
 * (`lib/__tests__/onboardingSteps.test.ts`).
 */

export type StepId =
  | 'hook1'
  | 'hook2'
  | 'consent'
  | 'name'
  | 'pain'
  | 'motivation'
  | 'skinTest'
  | 'skinReveal'
  | 'bodySkin'
  | 'concerns'
  | 'truth'
  | 'goals'
  | 'restrictions'
  | 'volume'
  | 'projection'
  | 'abandoned'
  | 'plan'
  | 'scan'
  | 'verdict'
  | 'hair'
  | 'notifications'
  | 'montage'
  | 'paywall'

export type FlowMode = 'guest' | 'member'

export const STEP_ORDER: readonly StepId[] = [
  'hook1',
  'hook2',
  'consent',
  'name',
  'pain',
  'motivation',
  'skinTest',
  'skinReveal',
  'bodySkin',
  'concerns',
  'truth',
  'goals',
  'restrictions',
  'volume',
  'projection',
  'abandoned',
  'plan',
  'scan',
  'verdict',
  'hair',
  'notifications',
  'montage',
  // Paywall au pic de motivation, AVANT le compte (mode invité seulement,
  // choix du 28/09/2026, comme MemoryPilot). Un achat fait ici part sous
  // l'identifiant anonyme de RevenueCat, puis `loginUser` (app/_layout.tsx)
  // le rattache au compte créé juste après.
  'paywall',
]

/**
 * Étapes qui recueillent des données de santé (RGPD, article 9) : elles ne
 * s'affichent qu'après un consentement explicite. Refuser le consentement les
 * saute toutes, le reste du parcours reste identique.
 */
export const HEALTH_STEPS: ReadonlySet<StepId> = new Set<StepId>([
  'skinTest',
  'skinReveal',
  'bodySkin',
  'concerns',
  'goals',
  'restrictions',
  'hair',
])

/** Écrans plein cadre, sans en-tête ni barre de progression. */
export const NO_CHROME: ReadonlySet<StepId> = new Set<StepId>([
  'hook1',
  'hook2',
  'consent',
  'plan',
  'montage',
  'paywall',
])

export interface StepContext {
  mode: FlowMode
  /** `null` = pas encore répondu. */
  consentGranted: boolean | null
  /** Consentement déjà donné AVANT ce parcours (compte existant). */
  consentAlreadyGiven: boolean
  /** Prénom déjà connu (compte existant). */
  hasKnownName: boolean
  /** Un produit a été choisi à l'étape scan : le verdict a de quoi s'afficher. */
  hasScannedProduct: boolean
}

export function visibleSteps(ctx: StepContext): StepId[] {
  return STEP_ORDER.filter((id) => {
    if (ctx.mode === 'member' && (id === 'hook1' || id === 'hook2')) return false
    if (id === 'name' && ctx.mode === 'member' && ctx.hasKnownName) return false
    if (id === 'consent' && ctx.consentAlreadyGiven) return false
    if (HEALTH_STEPS.has(id) && ctx.consentGranted === false) return false
    if (id === 'verdict' && !ctx.hasScannedProduct) return false
    // Connecté : le paywall vient après, via /offre (layout du groupe onboarding).
    if (id === 'paywall' && ctx.mode !== 'guest') return false
    return true
  })
}

/**
 * Remplissage de la barre (0 à 100).
 *
 * La courbe est volontairement concave (exposant < 1) : la barre avance vite
 * au début, l'effort paraît court. Le dernier écran à barre (notifications)
 * atteint 100 %.
 */
export function progressPercent(step: StepId, steps: readonly StepId[]): number {
  const tracked = steps.filter((s) => !NO_CHROME.has(s))
  const i = tracked.indexOf(step)
  if (i < 0) return 0
  const t = (i + 1) / tracked.length
  return Math.round(100 * Math.pow(t, 0.8))
}

/** Étape suivante dans la liste visible, ou `null` en fin de parcours. */
export function nextStep(current: StepId, steps: readonly StepId[]): StepId | null {
  const i = steps.indexOf(current)
  if (i < 0) return steps[0] ?? null
  return steps[i + 1] ?? null
}

/** Étape précédente dans la liste visible, ou `null` au début. */
export function previousStep(current: StepId, steps: readonly StepId[]): StepId | null {
  const i = steps.indexOf(current)
  if (i <= 0) return null
  return steps[i - 1] ?? null
}
