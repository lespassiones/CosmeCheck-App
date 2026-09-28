/**
 * Brouillon de l'onboarding : les réponses données AVANT la création du compte.
 *
 * Pourquoi un brouillon. Le parcours « Le diagnostic de Perle » se déroule sans
 * compte : on n'a pas encore d'identifiant où écrire. Les réponses vivent donc
 * ici, en mémoire et dans AsyncStorage (pour survivre à une fermeture de l'app),
 * puis sont écrites dans `user_profiles` juste après l'inscription ou la
 * connexion (`applyOnboardingDraft`).
 *
 * Le drapeau « en attente d'écriture » est observable (`useSyncExternalStore`) :
 * l'AuthGuard s'abstient tant qu'un brouillon terminé attend d'être écrit, sinon
 * il enverrait vers le questionnaire une personne qui vient d'y répondre.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

import type { HairConcern, ProfileGoal, SkinConcern } from '@/lib/skin/profile'
import type {
  AbandonedKey,
  BodySkinAnswer,
  MotivationKey,
  RestrictionKey,
  SkinTestAnswer,
} from '@/lib/onboarding/content'
import type { StepId } from '@/lib/onboarding/steps'

export const DRAFT_STORAGE_KEY = 'cosmecheck:onboarding_draft:v1'

/** Au-delà, un brouillon abandonné est ignoré : on repart de l'accroche. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Produit choisi à l'étape « Ton premier scan ». */
export interface ScannedProduct {
  ean: string | null
  brand: string | null
  name: string
  imageUrl: string | null
  ingredientsText: string
  score: number | null
  scoreLabel: string | null
}

export interface OnboardingDraft {
  v: 1
  savedAt: string
  step: StepId | null
  /** Parcours terminé (montage passé) : il ne reste qu'à l'écrire. */
  completed: boolean
  firstName?: string
  /** `granted: false` = « Passer » sur l'écran de consentement. */
  consent?: { granted: boolean; at: string; version: number }
  painAck?: boolean
  motivations: MotivationKey[]
  /** Réponses cochées au petit test visage (choix multiple). */
  skinTests: SkinTestAnswer[]
  /** Type principal déduit de `skinTests` (`resolveFaceSkin`). */
  skinTest?: SkinTestAnswer
  /** « Chauffe ou rougit » coché en plus d'un autre type. */
  skinSensitive?: boolean
  skinOther?: string
  /** Réponses cochées pour la peau du corps (choix multiple). */
  bodySkins: BodySkinAnswer[]
  /** Type principal déduit de `bodySkins` (`resolveBodySkin`). */
  bodySkin?: BodySkinAnswer
  concerns: SkinConcern[]
  concernsNone?: boolean
  /** Les soucis ont été vus : ne plus les pré-cocher au retour sur l'écran. */
  concernsTouched?: boolean
  otherConcerns?: string
  goals: ProfileGoal[]
  /** Les objectifs ont été vus : ne plus les pré-cocher au retour sur l'écran. */
  goalsTouched?: boolean
  otherGoals?: string
  restrictions: RestrictionKey[]
  /** Ingrédients précis choisis dans les suggestions de « + Autre ». */
  restrictionIngredients: { slug: string; name: string }[]
  restrictionsNone?: boolean
  allergiesFreeform?: string
  productsPerDay?: number
  abandoned?: AbandonedKey
  scanned?: ScannedProduct | null
  hair: HairConcern[]
  hairOk?: boolean
  notifications?: 'granted' | 'denied' | 'skipped'
  /** Le paywall d'onboarding a été vu (acheté ou « Plus tard »). */
  paywallSeen?: boolean
  /** Un abonnement a été pris sur ce paywall, avant la création du compte. */
  purchased?: boolean
}

export function emptyDraft(now = new Date()): OnboardingDraft {
  return {
    v: 1,
    savedAt: now.toISOString(),
    step: null,
    completed: false,
    motivations: [],
    skinTests: [],
    bodySkins: [],
    concerns: [],
    goals: [],
    restrictions: [],
    restrictionIngredients: [],
    hair: [],
  }
}

/** Lecture défensive : un brouillon abîmé ou périmé vaut « pas de brouillon ». */
export function parseDraft(raw: string | null, now = Date.now()): OnboardingDraft | null {
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as Partial<OnboardingDraft>
    if (!d || d.v !== 1 || typeof d.savedAt !== 'string') return null
    const saved = Date.parse(d.savedAt)
    if (!Number.isFinite(saved) || now - saved > DRAFT_TTL_MS) return null
    return {
      ...emptyDraft(new Date(saved)),
      ...d,
      motivations: Array.isArray(d.motivations) ? d.motivations : [],
      skinTests: Array.isArray(d.skinTests) ? d.skinTests : d.skinTest ? [d.skinTest] : [],
      bodySkins: Array.isArray(d.bodySkins) ? d.bodySkins : d.bodySkin ? [d.bodySkin] : [],
      restrictionIngredients: Array.isArray(d.restrictionIngredients)
        ? d.restrictionIngredients.filter((i) => i && typeof i.slug === 'string')
        : [],
      concerns: Array.isArray(d.concerns) ? d.concerns : [],
      goals: Array.isArray(d.goals) ? d.goals : [],
      restrictions: Array.isArray(d.restrictions) ? d.restrictions : [],
      hair: Array.isArray(d.hair) ? d.hair : [],
      completed: d.completed === true,
    } as OnboardingDraft
  } catch {
    return null
  }
}

// ── Mémoire observable ───────────────────────────────────────────────────

let current: OnboardingDraft | null = null
let loaded = false
/** Échec d'écriture sur ce lancement : on cesse de bloquer le guard. */
let flushFailed = false
const listeners = new Set<() => void>()

function notify(): void {
  for (const l of listeners) l()
}

export function subscribeDraft(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getDraft(): OnboardingDraft | null {
  return current
}

export function isDraftLoaded(): boolean {
  return loaded
}

/**
 * Un parcours terminé attend d'être écrit dans le profil. C'est ce que lit
 * l'AuthGuard pour ne pas rediriger pendant l'écriture.
 */
export function isDraftPendingFlush(): boolean {
  return Boolean(current?.completed) && !flushFailed
}

/** Chargement au démarrage (idempotent). */
export async function loadDraft(): Promise<OnboardingDraft | null> {
  if (loaded) return current
  try {
    current = parseDraft(await AsyncStorage.getItem(DRAFT_STORAGE_KEY))
  } catch {
    current = null
  }
  loaded = true
  notify()
  return current
}

/** Met à jour le brouillon en mémoire (synchrone) puis le persiste. */
export function saveDraft(next: OnboardingDraft): void {
  current = { ...next, savedAt: new Date().toISOString() }
  loaded = true
  notify()
  void AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(current)).catch(() => {})
}

export async function clearDraft(): Promise<void> {
  current = null
  flushFailed = false
  loaded = true
  notify()
  try {
    await AsyncStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    // au pire, un brouillon périmé sera ignoré au prochain lancement
  }
}

/** L'écriture a échoué : on garde le brouillon, mais on ne bloque plus. */
export function markDraftFlushFailed(): void {
  flushFailed = true
  notify()
}
