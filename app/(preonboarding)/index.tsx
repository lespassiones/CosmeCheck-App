/**
 * Point d'entrée de toute personne non connectée : le parcours
 * « Le diagnostic de Perle » en mode invité (28/09/2026).
 *
 * Remplace le carrousel de présentation. Il pose les questions AVANT le
 * compte, fait scanner un vrai produit, puis ouvre l'écran de compte
 * (/(auth)/welcome). Règle inchangée : l'écran de connexion n'est jamais un
 * point d'entrée, on y arrive depuis ici (« Se connecter » ou fin du parcours).
 */

import { type FC } from 'react'

import { OnboardingFlow } from '@/components/onboarding/flow/OnboardingFlow'

const PreOnboardingScreen: FC = () => <OnboardingFlow mode="guest" />

export default PreOnboardingScreen
