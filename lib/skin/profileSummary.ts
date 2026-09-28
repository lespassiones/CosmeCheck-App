/**
 * Textes courts de l'écran Profil (28/09/2026) : résumé du profil beauté et
 * nombre de restrictions. Purs, testés dans lib/__tests__/profileSummary.test.ts
 * (les textes de crédits sont dans lib/credits/refill.ts).
 */
import {
  HAIR_PROBLEM_CONCERNS,
  SKIN_TYPE_FACE_LABEL,
  isProfileStarted,
  type SkinProfile,
  type SkinTypeFace,
} from '@/lib/skin/profile'
import type { UserRestrictions } from '@/lib/supabase/types'

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** « Peau mixte · 3 préoccupations », ou « À compléter » si rien n'est renseigné. */
export function beautyProfileSummary(p: SkinProfile): string {
  if (!isProfileStarted(p)) return 'À compléter'
  const parts: string[] = []
  const face = p.skinTypeFace ? SKIN_TYPE_FACE_LABEL[p.skinTypeFace as SkinTypeFace] : null
  if (face) parts.push(`Peau ${face.toLowerCase()}`)
  // Préoccupations = peau + PROBLÈMES capillaires (comme l'étape « Ce qui te
  // préoccupe ») ; l'état des cheveux (secs, gras…) n'en est pas une.
  const concerns =
    (p.concerns?.length ?? 0) +
    (p.hairConcerns ?? []).filter((c) => HAIR_PROBLEM_CONCERNS.includes(c)).length
  if (concerns > 0) parts.push(plural(concerns, 'préoccupation'))
  if (parts.length === 0 && (p.goals?.length ?? 0) > 0) parts.push(plural(p.goals!.length, 'objectif'))
  return parts.length > 0 ? parts.join(' · ') : 'Renseigné'
}

/** Nombre total de restrictions (familles + ingrédients précis). */
export function restrictionsCount(r: UserRestrictions): number {
  return r.families.length + r.ingredients.length
}
