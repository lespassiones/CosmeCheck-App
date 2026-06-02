/**
 * Layout du groupe (preonboarding) — carrousel de présentation au 1er lancement.
 * Headers masqués (chrome géré dans le carrousel lui-même).
 */

import { Stack } from 'expo-router'

export default function PreOnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
