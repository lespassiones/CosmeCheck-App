/**
 * RootLayout — point d'entrée Expo Router de Cosme Check.
 *
 * Responsabilités :
 *   1. Charge les polices Inter (useFonts) et garde le splash visible tant que
 *      les polices ne sont pas prêtes ET que l'auth n'est pas résolue.
 *   2. Monte les providers globaux : GestureHandlerRootView > SafeAreaProvider >
 *      QueryClientProvider, + StatusBar.
 *   3. Déclare le Stack de navigation (groupes (auth)/(onboarding)/(tabs) et
 *      les routes push/modal), headers masqués.
 *   4. AuthGuard : redirige selon session + onboarding/profil (voir docs/NAVIGATION.md).
 */

import { useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'

import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'
import { resolveAuthRoute } from '@/lib/navigation/authRoute'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { CreditsExhaustedModal } from '@/components/shared/CreditsExhaustedModal'
import {
  QUERY_PERSIST_BUSTER,
  QUERY_PERSIST_KEY,
  QUERY_PERSIST_MAX_AGE_MS,
  shouldDehydrateQuery,
} from '@/lib/storage/queryPersist'
import { clearExpiredCache } from '@/lib/storage/session'
import { clearExpiredAiCache } from '@/lib/storage/aiCache'
import { getPreOnboardingCache, isPreOnboardingDone } from '@/lib/storage/preOnboarding'
import { queryClient } from '@/lib/storage/queryClient'
import { AppErrorBoundary } from '@/components/shared/AppErrorBoundary'
import { ToastHost } from '@/components/shared/Toast'
import { OfflineBanner } from '@/components/shared/OfflineBanner'
import { initSentry } from '@/lib/reporting/report'

// Garde le splash natif visible jusqu'à ce qu'on soit prêts à afficher l'app.
void SplashScreen.preventAutoHideAsync()

// Sentry initialisé le plus tôt possible pour capturer les erreurs au boot.
initSentry()

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_PERSIST_KEY,
})

/**
 * AuthGuard — redirections en fonction de l'état d'authentification et du
 * profil. Rendu DANS les providers (a besoin de QueryClient via useProfile).
 *
 * Règles (anti-boucle : chaque branche est conditionnée par le segment courant) :
 *   - auth en cours de chargement → on attend (splash visible) ;
 *   - pas de session et hors (auth) → /(auth)/sign-in ;
 *   - session et dans (auth) → onboarding si nécessaire, sinon /(tabs) ;
 *   - session, onboarding non vu et profil incomplet, hors (onboarding)
 *     → /(onboarding) (on attend que le profil soit chargé avant de décider) ;
 *   - sinon : on laisse passer.
 */
function AuthGuard() {
  const { isLoading: authLoading, isAuthenticated } = useAuth()
  const { isProfileComplete, onboardingShown, isLoading: profileLoading } = useProfile()
  const segments = useSegments()
  const router = useRouter()

  // Flag device-level du pré-onboarding (carrousel 1er lancement). `null` = en
  // cours de lecture. Relu à chaque bascule d'auth (ex. déconnexion).
  const [preOnbDone, setPreOnbDone] = useState<boolean | null>(getPreOnboardingCache())
  useEffect(() => {
    let mounted = true
    void isPreOnboardingDone().then((v) => {
      if (mounted) setPreOnbDone(v)
    })
    return () => {
      mounted = false
    }
  }, [isAuthenticated])

  useEffect(() => {
    // Décision déléguée à une fonction pure testée (lib/navigation/authRoute).
    const target = resolveAuthRoute({
      authLoading,
      isAuthenticated,
      profileLoading,
      onboardingShown,
      isProfileComplete,
      preOnbDone,
      group: segments[0],
    })
    switch (target) {
      case 'signin':
        router.replace(ROUTES.AUTH.SIGN_IN)
        break
      case 'preonboarding':
        router.replace(ROUTES.PREONBOARDING.INDEX)
        break
      case 'onboarding':
        router.replace(ROUTES.ONBOARDING.INDEX)
        break
      case 'home':
        router.replace(ROUTES.TABS.HOME)
        break
      default:
        break // null → on laisse passer / on attend
    }
  }, [
    authLoading,
    isAuthenticated,
    profileLoading,
    onboardingShown,
    isProfileComplete,
    preOnbDone,
    segments,
    router,
  ])

  return null
}

/**
 * Cache le splash quand l'auth est résolue ET, pour un utilisateur connecté,
 * quand son profil est chargé. Ainsi la décision de routage de l'AuthGuard
 * (onboarding vs dashboard) est prise DERRIÈRE le splash → aucun flash d'écran
 * intermédiaire au démarrage à froid (le profil n'étant plus persisté disque).
 */
function SplashController() {
  const { isLoading: authLoading, isAuthenticated } = useAuth()
  const { isLoading: profileLoading } = useProfile()

  const ready = !authLoading && (!isAuthenticated || !profileLoading)

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync()
    }
  }, [ready])

  return null
}

/**
 * Garbage-collect des caches AsyncStorage au démarrage. Best-effort,
 * non-bloquant : un fail ne doit jamais empêcher l'app de démarrer (critère
 * App Store / Play Store : pas de hang au premier lancement).
 */
function CacheJanitor() {
  useEffect(() => {
    void clearExpiredCache().catch(() => {})
    void clearExpiredAiCache().catch(() => {})
  }, [])
  return null
}

function RootNavigator() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(preonboarding)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="advisor/index" options={{ animation: 'fade' }} />
      <Stack.Screen name="compare/index" />
      <Stack.Screen name="analyse/[id]" />
      <Stack.Screen name="promesses/nouvelle" options={{ presentation: 'modal' }} />
      <Stack.Screen name="promesses/[id]" />
      <Stack.Screen name="profile/index" />
      <Stack.Screen name="profile/restrictions" />
      <Stack.Screen name="ingredient/[slug]" />
      <Stack.Screen name="offre/index" options={{ presentation: 'modal' }} />
      <Stack.Screen name="legal/cgu" />
      <Stack.Screen name="legal/privacy" />
      <Stack.Screen name="legal/mentions" />
      <Stack.Screen name="legal/about" />
      <Stack.Screen name="+not-found" />
    </Stack>
  )
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  })

  // Tant que les polices ne sont pas prêtes (et qu'aucune erreur n'a coupé le
  // chargement), on ne rend rien → le splash natif reste affiché.
  if (!fontsLoaded && !fontError) {
    return null
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: asyncStoragePersister,
            maxAge: QUERY_PERSIST_MAX_AGE_MS,
            buster: QUERY_PERSIST_BUSTER,
            dehydrateOptions: { shouldDehydrateQuery },
          }}
        >
          <StatusBar style="dark" />
          <SplashController />
          <CacheJanitor />
          <AuthGuard />
          <AppErrorBoundary>
            <RootNavigator />
            <CreditsExhaustedModal />
          </AppErrorBoundary>
          <ToastHost />
          <OfflineBanner />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
