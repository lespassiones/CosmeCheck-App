/**
 * AuthGroupLayout — Stack des écrans du groupe (auth).
 *
 * Protection inverse : la redirection d'un utilisateur déjà connecté est
 * déléguée à l'AuthGuard racine (app/_layout.tsx), qui connaît l'état du profil
 * et route DIRECTEMENT vers onboarding / paywall / home selon le cas. On NE
 * redirige PAS vers les tabs ici : ce détour faisait clignoter l'accueil ~1
 * frame avant que le guard n'affine vers l'onboarding (flash au signup).
 * Pendant la vérification initiale de session, le Stack se monte normalement.
 */

import { type FC } from 'react'
import { Stack } from 'expo-router'

const AuthLayout: FC = () => {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
    </Stack>
  )
}

export default AuthLayout
