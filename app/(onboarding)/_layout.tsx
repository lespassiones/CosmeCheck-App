/**
 * OnboardingLayout — groupe (onboarding).
 *
 * Ce layout est aussi, de fait, le PREMIER écran monté au démarrage : `app/`
 * n'a pas de route racine et expo-router sert ce groupe sur `/`. Il porte donc
 * deux responsabilités, et la seconde est la plus délicate.
 *
 *   1. Personne non connectée → le CARROUSEL de présentation, jamais un écran
 *      d'auth. Quand il redirigeait vers `welcome`, l'app s'ouvrait sur la page
 *      de connexion et le guard, voyant le groupe `(auth)`, n'osait plus
 *      bouger : le carrousel restait invisible à l'installation.
 *
 *   2. Personne connectée qui n'a RIEN à remplir → on ne monte pas le
 *      questionnaire. Il s'affichait le temps d'une frame avant que le guard ne
 *      redirige vers l'accueil : c'est le « clignotement d'onboarding » visible
 *      à chaque lancement.
 *
 * ── Ce layout ne délègue plus sa sortie (30/08/2026) ────────────────────────
 *
 * Il rendait un indicateur de chargement quand l'onboarding était déjà terminé,
 * en comptant sur l'`AuthGuard` pour le démonter. Cette attente-là n'avait
 * aucune fin garantie : la règle du guard qui l'en sort est conditionnée au
 * segment `(onboarding)`, et rendre l'indicateur revient justement à ne PAS
 * monter le `<Stack>` qui produit ce segment. Écran figé sur un cercle violet,
 * constaté en production Android (build 25) le 30/08/2026.
 *
 * Désormais chaque état connu produit une destination ICI, via `<Redirect>`,
 * qui ne dépend d'aucun segment. La décision est une fonction pure testée :
 * `lib/navigation/onboardingGate.ts`. L'indicateur ne subsiste que le temps
 * d'une réponse en vol, et `LOADER_MAX_MS` le convertit en destination s'il
 * s'éternise : cette porte ne peut plus rester close.
 *
 * La barre de progression / navigation vit dans OnboardingWizard (index.tsx).
 */

import { useEffect, useState, type FC } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Redirect, Stack } from 'expo-router'

import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'
import { resolveOnboardingGate } from '@/lib/navigation/onboardingGate'

/**
 * Plafond d'attente de cet écran, filet de dernier recours.
 *
 * Les deux sources qu'il attend sont déjà bornées chacune de leur côté (8 s
 * pour la session, 6 s par tentative pour le profil). Ce plafond couvre ce
 * qu'aucune des deux ne peut couvrir : un état où les drapeaux se contredisent,
 * ou une réponse qui arrive sans jamais déclencher de rendu. Il est
 * volontairement plus haut que les deux, pour ne jamais couper un démarrage
 * lent qui allait aboutir.
 */
const LOADER_MAX_MS = 15000

const Loader: FC = () => (
  <View style={styles.loader}>
    <ActivityIndicator color={colors.accent} />
  </View>
)

const OnboardingLayout: FC = () => {
  const { isAuthenticated, isLoading } = useAuth()
  const {
    onboardingShown,
    paywallShown,
    profileUnavailable,
    isLoading: profileLoading,
  } = useProfile()

  const [waitedTooLong, setWaitedTooLong] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setWaitedTooLong(true), LOADER_MAX_MS)
    return () => clearTimeout(t)
  }, [])

  const target = resolveOnboardingGate({
    authLoading: isLoading,
    isAuthenticated,
    profileLoading,
    profileUnavailable,
    onboardingShown,
    paywallShown,
    waitedTooLong,
  })

  switch (target) {
    case 'loader':
      return <Loader />
    case 'preonboarding':
      return <Redirect href={ROUTES.PREONBOARDING.INDEX} />
    case 'paywall':
      // Le paywall EST la page /offre. `fromOnboarding=1` y active le bouton
      // « Plus tard », qui doit rester skippable (règle Apple 3.1.1).
      return (
        <Redirect
          href={
            {
              pathname: ROUTES.OFFRE.INDEX,
              params: { fromOnboarding: '1' },
            } as never
          }
        />
      )
    case 'home':
      return <Redirect href={ROUTES.TABS.HOME} />
    case 'wizard':
    default:
      return (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" />
        </Stack>
      )
  }
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
