/**
 * Traduit un brouillon d'onboarding en objet `preferences` complet.
 *
 * Fonction PURE, testée (`lib/__tests__/onboardingPreferences.test.ts`) : c'est
 * le seul endroit qui décide de ce qui est écrit dans le profil à la fin du
 * parcours. Les règles :
 *
 *   - Sans consentement explicite, AUCUNE donnée de peau n'est écrite (ni
 *     `skin`, ni `restrictions`, ni `data_consent`). Le parcours reste marqué
 *     comme vu pour que l'AuthGuard ne le réimpose pas.
 *   - Les réponses récentes remplacent les anciennes champ par champ, sans
 *     effacer ce que le parcours n'a pas demandé (fusion, pas écrasement).
 *   - Les restrictions s'ajoutent à celles qui existent déjà (union).
 *   - Les autres clés de `preferences` (paywall_shown, review_replay…) ne sont
 *     jamais touchées.
 */

import { readRestrictions } from '@/lib/supabase/types'
import { readSkinProfile, type SkinProfile } from '@/lib/skin/profile'
import { readNotificationPrefs } from '@/lib/notifications/prefs'
import {
  MOTIVATION_GOALS,
  RESTRICTION_OPTIONS,
  bodyPrecision,
  facePrecision,
} from '@/lib/onboarding/content'

/** Même borne que les lecteurs serveur (`readShort(…, 120)`). */
const PRECISION_MAX = 120

function joinPrecision(...parts: (string | null | undefined)[]): string | undefined {
  const text = parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' · ')
  return text ? text.slice(0, PRECISION_MAX) : undefined
}
import type { OnboardingDraft } from '@/lib/onboarding/draft'

export const ONBOARDING_CONSENT_VERSION = 1

/** Champs du profil beauté issus du brouillon (seulement ceux répondus). */
export function draftToSkinPatch(d: OnboardingDraft): Partial<SkinProfile> {
  const patch: Partial<SkinProfile> = {}

  if (d.skinTest && d.skinTest !== 'inconnu') patch.skinTypeFace = d.skinTest
  const faceText = joinPrecision(d.skinOther, facePrecision(d.skinTests))
  if (faceText) patch.otherSkinTypeFace = faceText
  if (d.bodySkin && d.bodySkin !== 'inconnu') patch.skinTypeBody = d.bodySkin
  const bodyText = joinPrecision(bodyPrecision(d.bodySkins))
  if (bodyText) patch.otherSkinTypeBody = bodyText

  if (d.concerns.length > 0 || d.concernsNone) patch.concerns = [...d.concerns]
  if (d.otherConcerns?.trim()) patch.otherConcerns = d.otherConcerns.trim()

  const goals = [...d.goals]
  for (const m of d.motivations) {
    const g = MOTIVATION_GOALS[m]
    if (g && !goals.includes(g)) goals.push(g)
  }
  if (goals.length > 0 || d.goalsTouched) patch.goals = goals
  if (d.otherGoals?.trim()) patch.otherGoals = d.otherGoals.trim()

  if (d.hair.length > 0 || d.hairOk) patch.hairConcerns = [...d.hair]
  if (d.allergiesFreeform?.trim()) patch.allergiesFreeform = d.allergiesFreeform.trim()

  return patch
}

/** Familles d'ingrédients cochées à l'écran « ingrédients à éviter ». */
export function draftRestrictionFamilies(d: OnboardingDraft): string[] {
  const out: string[] = []
  for (const key of d.restrictions) {
    const opt = RESTRICTION_OPTIONS.find((o) => o.key === key)
    for (const f of opt?.families ?? []) if (!out.includes(f)) out.push(f)
  }
  return out
}

export function buildOnboardingPreferences(
  current: Record<string, unknown>,
  d: OnboardingDraft,
  nowIso: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, onboardingShown: true }
  const granted = d.consent?.granted === true

  if (granted) {
    const skin = readSkinProfile(current)
    next.skin = { ...skin, ...draftToSkinPatch(d) }

    const existing = readRestrictions(current)
    const families = [...existing.families]
    for (const f of draftRestrictionFamilies(d)) if (!families.includes(f)) families.push(f)
    const ingredients = [...existing.ingredients]
    for (const i of d.restrictionIngredients) {
      if (!ingredients.some((e) => e.slug === i.slug)) ingredients.push({ slug: i.slug, name: i.name })
    }
    next.restrictions = { families, ingredients }

    next.data_consent = {
      granted: true,
      at: d.consent?.at ?? nowIso,
      version: d.consent?.version ?? ONBOARDING_CONSENT_VERSION,
    }
  }

  if (d.notifications === 'granted') {
    const prefs = readNotificationPrefs(
      current.notifications as Record<string, unknown> | null | undefined,
    )
    next.notifications = { ...prefs, enabled: true, promptSeen: true }
  }

  // Paywall déjà montré dans le parcours invité : l'AuthGuard ne le remontre pas
  // après l'inscription.
  if (d.paywallSeen) next.paywall_shown = true

  // Trace du parcours (analyse produit), jamais une donnée de santé.
  next.onboarding = {
    v: 1,
    completedAt: nowIso,
    flow: 'perle',
    motivations: [...d.motivations],
    productsPerDay: d.productsPerDay ?? null,
    abandoned: d.abandoned ?? null,
    painAck: d.painAck ?? null,
    scannedEan: d.scanned?.ean ?? null,
    purchasedBeforeAccount: d.purchased === true,
    consent: granted ? 'granted' : d.consent ? 'refused' : 'unknown',
  }

  return next
}
