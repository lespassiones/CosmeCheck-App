/**
 * Parcours d'onboarding pour une personne DÉJÀ connectée qui n'a pas de profil
 * (ancien compte jamais terminé, compte de démonstration Apple rejoué).
 *
 * Même parcours « Le diagnostic de Perle » qu'en invité, en mode `member` :
 * pas d'accroche, pas de prénom s'il est connu, consentement seulement s'il
 * n'a pas déjà été donné, et les réponses sont écrites directement à la fin.
 * Le layout du groupe redirige ensuite vers le paywall.
 */

import { type FC } from 'react'

import { OnboardingFlow } from '@/components/onboarding/flow/OnboardingFlow'

const OnboardingScreen: FC = () => <OnboardingFlow mode="member" />

export default OnboardingScreen
