/**
 * OnboardingLayout — groupe (onboarding).
 *
 * Stack sans header natif. Protection : si l'utilisateur n'est pas connecté,
 * on redirige vers l'écran de BIENVENUE (welcome, avec Google) — surtout PAS
 * vers la page email/mdp (sign-in), qui ne doit jamais être un point d'entrée.
 * La barre de progression / navigation vit dans OnboardingWizard (index.tsx).
 */

import { type FC } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Redirect, Stack } from 'expo-router'

import { useAuth } from '@/hooks/useAuth'
import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'

const OnboardingLayout: FC = () => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  if (!isAuthenticated) {
    return <Redirect href={ROUTES.AUTH.WELCOME} />
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
    </Stack>
  )
}

export default OnboardingLayout

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
})
