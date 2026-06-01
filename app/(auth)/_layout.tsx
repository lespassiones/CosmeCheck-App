/**
 * AuthGroupLayout — Stack des écrans du groupe (auth).
 *
 * Protection inverse : si l'utilisateur est déjà connecté, on le renvoie vers
 * les tabs (le guard racine affinera ensuite vers l'onboarding si nécessaire).
 * Pendant la vérification initiale de session, on n'affiche rien de bloquant —
 * le Stack se monte normalement.
 */

import { type FC } from 'react'
import { Redirect, Stack } from 'expo-router'

import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'

const AuthLayout: FC = () => {
  const { isAuthenticated, isLoading } = useAuth()

  if (!isLoading && isAuthenticated) {
    return <Redirect href={ROUTES.TABS.HOME} />
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
    </Stack>
  )
}

export default AuthLayout
