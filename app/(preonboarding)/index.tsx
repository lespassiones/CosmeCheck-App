/**
 * PreOnboardingScreen — point d'entrée du carrousel de présentation.
 * S'affiche uniquement au tout premier lancement (cf. AuthGuard + flag
 * device-level `cosmecheck:preonboarding_done`).
 */

import { type FC } from 'react'
import { StatusBar } from 'expo-status-bar'

import { PreOnboardingCarousel } from '@/components/onboarding/PreOnboardingCarousel'

const PreOnboardingScreen: FC = () => (
  <>
    <StatusBar style="dark" />
    <PreOnboardingCarousel />
  </>
)

export default PreOnboardingScreen
