import type { OnboardingDraft } from '@/lib/onboarding/draft'
import type { FlowMode } from '@/lib/onboarding/steps'

/** Contrat commun à tous les écrans du parcours. */
export interface StepProps {
  draft: OnboardingDraft
  /** Fusionne un patch dans le brouillon (mémoire + disque). */
  update: (patch: Partial<OnboardingDraft>) => void
  /** Passe à l'écran suivant (ou termine le parcours). */
  next: () => void
  mode: FlowMode
  /** Prénom connu (brouillon, sinon profil), `''` si aucun. */
  firstName: string
}
