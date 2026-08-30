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

import { useEffect, useState, useSyncExternalStore } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router'
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
import { initRevenueCat, loginUser } from '@/lib/revenucat/client'
import { CreditsExhaustedModal } from '@/components/shared/CreditsExhaustedModal'
import { MaintenanceGate } from '@/components/shared/MaintenanceGate'
import {
  QUERY_PERSIST_BUSTER,
  QUERY_PERSIST_KEY,
  QUERY_PERSIST_MAX_AGE_MS,
  shouldDehydrateQuery,
} from '@/lib/storage/queryPersist'
import { clearExpiredCache } from '@/lib/storage/session'
import { clearExpiredAiCache } from '@/lib/storage/aiCache'
import {
  hasSeenPreOnboardingThisLaunch,
  subscribePreOnboarding,
} from '@/lib/storage/preOnboarding'
import {
  isSignInPending,
  subscribeSignInPending,
} from '@/lib/auth/signInPending'
import { queryClient } from '@/lib/storage/queryClient'
import { AppErrorBoundary } from '@/components/shared/AppErrorBoundary'
import { AnimatedSplash } from '@/components/shared/AnimatedSplash'
import { ToastHost } from '@/components/shared/Toast'
import { OfflineBanner } from '@/components/shared/OfflineBanner'
import { initSentry } from '@/lib/reporting/report'
import { NotificationsInit } from '@/components/notifications/NotificationsInit'

/**
 * Délai au bout duquel on affiche l'app même si les polices ne sont pas prêtes.
 *
 * Le splash NATIF ne se masque qu'à un seul endroit de toute l'app : le montage
 * d'`AnimatedSplash`. Or `AnimatedSplash` n'est rendu qu'une fois `useFonts`
 * résolu. Tant que `useFonts` ne rend ni `true` ni une erreur, `RootLayout`
 * renvoie `null`, l'overlay ne se monte pas, `hideAsync()` n'est jamais appelé,
 * et le splash natif reste indéfiniment. C'est très exactement le motif de rejet
 * 2.1(a) « the app is unresponsive and stays on the splash screen ».
 *
 * Passé ce délai on rend l'app avec la police système. Une typographie de repli
 * pendant une seconde vaut infiniment mieux qu'un écran figé, et la vraie police
 * s'applique d'elle-même dès qu'elle arrive.
 */
const FONTS_TIMEOUT_MS = 2500

/**
 * Filet de dernier recours : le splash natif est masqué au bout de ce délai,
 * quoi qu'il arrive en amont. Il ne devrait jamais servir, puisque le rendu est
 * déjà garanti par `FONTS_TIMEOUT_MS` ; il couvre le cas où le rendu lui-même
 * n'aboutit pas. Un appel de trop à `hideAsync()` est sans effet.
 */
const SPLASH_HARD_LIMIT_MS = 5000

// Garde le splash natif visible jusqu'à ce qu'on soit prêts à afficher l'app.
void SplashScreen.preventAutoHideAsync()

// Filet de dernier recours, armé DÈS L'IMPORT et non dans un effet : si un
// composant lève pendant le rendu, React ne monte aucun effet, et un filet posé
// dans `RootLayout` ne se déclencherait donc jamais. Ici le minuteur tourne même
// si l'app ne rend jamais rien.
//
// Sans lui, `hideAsync()` n'existe qu'à un seul endroit, le montage
// d'`AnimatedSplash`, lui-même conditionné au chargement des polices. Toute
// panne en amont laissait le splash natif à l'écran pour toujours.
setTimeout(() => {
  void SplashScreen.hideAsync().catch(() => {})
}, SPLASH_HARD_LIMIT_MS)

// Sentry initialisé le plus tôt possible pour capturer les erreurs au boot.
// try-catch : le module natif Sentry n'est pas disponible en Expo Go sans dev build.
try {
  initSentry()
} catch {
  // silencieux
}

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
 *   - PAS DE SESSION → /(preonboarding), toujours, tant que le carrousel n'a pas
 *     été traversé pendant ce lancement (règle absolue : l'écran de connexion
 *     n'est jamais un point d'entrée) ;
 *   - session et dans (auth) → onboarding si nécessaire, sinon /(tabs) ;
 *   - session, onboarding requis et consentement non donné → /consent ;
 *   - session, onboarding non vu et profil incomplet, hors (onboarding)
 *     → /(onboarding) (on attend que le profil soit chargé avant de décider) ;
 *   - sinon : on laisse passer.
 */
function AuthGuard() {
  const { isLoading: authLoading, isAuthenticated } = useAuth()
  const {
    isProfileComplete,
    onboardingShown,
    paywallShown,
    dataConsentGiven,
    profileUnavailable,
    isLoading: profileLoading,
  } = useProfile()
  const segments = useSegments()
  const router = useRouter()

  // Les deux drapeaux MÉMOIRE que ce garde consulte. Ils étaient lus dans
  // l'effet sans figurer dans ses dépendances : quand le guard s'abstenait à
  // cause de l'un d'eux, rien ne le réveillait à sa retombée et son « ne bouge
  // pas » devenait définitif. `useSyncExternalStore` les rend observables, donc
  // toute abstention redevient une simple attente.
  const signInPending = useSyncExternalStore(
    subscribeSignInPending,
    isSignInPending,
    isSignInPending,
  )
  const preOnbSeen = useSyncExternalStore(
    subscribePreOnboarding,
    hasSeenPreOnboardingThisLaunch,
    hasSeenPreOnboardingThisLaunch,
  )

  // Le navigateur racine est-il monté ? Une navigation émise avant l'est en
  // pure perte : expo-router la refuse silencieusement. Comme cette clé change
  // dès que le navigateur est prêt, elle est aussi ce qui REJOUE la décision
  // au bon moment, au lieu de la perdre pour de bon.
  const navKey = useRootNavigationState()?.key

  useEffect(() => {
    if (!navKey) return
    // Décision déléguée à une fonction pure testée (lib/navigation/authRoute).
    const target = resolveAuthRoute({
      authLoading,
      signInPending,
      isAuthenticated,
      profileLoading,
      profileUnavailable,
      onboardingShown,
      isProfileComplete,
      paywallShown,
      consentGiven: dataConsentGiven,
      preOnbSeen,
      group: segments[0],
    })
    switch (target) {
      case 'welcome':
        router.replace(ROUTES.AUTH.WELCOME)
        break
      case 'preonboarding':
        router.replace(ROUTES.PREONBOARDING.INDEX)
        break
      case 'consent':
        router.replace(ROUTES.CONSENT.INDEX as any)
        break
      case 'onboarding':
        router.replace(ROUTES.ONBOARDING.INDEX)
        break
      case 'paywall':
        // Le paywall EST la page /offre (UI custom). `fromOnboarding=1` y active
        // le bouton « Plus tard » skippable + marque paywall_shown au choix.
        router.replace({
          pathname: ROUTES.OFFRE.INDEX as any,
          params: { fromOnboarding: '1' },
        })
        break
      case 'home':
        router.replace(ROUTES.TABS.HOME)
        break
      default:
        break // null → on laisse passer / on attend
    }
  }, [
    navKey,
    authLoading,
    signInPending,
    isAuthenticated,
    profileLoading,
    profileUnavailable,
    onboardingShown,
    isProfileComplete,
    paywallShown,
    dataConsentGiven,
    preOnbSeen,
    segments,
    router,
  ])

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

/**
 * Boot RevenueCat SDK au démarrage + login utilisateur quand authentifié.
 */
function RevenueCatInit() {
  const { isAuthenticated, user } = useAuth()

  // Boot SDK au startup
  useEffect(() => {
    void initRevenueCat()
  }, [])

  // Login utilisateur quand authentifié
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      void loginUser(user.id)
    }
  }, [isAuthenticated, user?.id])

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
      <Stack.Screen name="consent/index" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="advisor/index" options={{ animation: 'fade' }} />
      <Stack.Screen name="advisor/recommendations" />
      <Stack.Screen name="compare/index" />
      <Stack.Screen name="routine/exposition" />
      <Stack.Screen name="routine/produits" />
      <Stack.Screen name="routine/item/[id]" />
      <Stack.Screen name="analyse/[id]" />
      <Stack.Screen name="alternatives/[ean]" />
      <Stack.Screen name="promesses/choisir" />
      <Stack.Screen name="promesses/nouvelle" options={{ presentation: 'modal' }} />
      <Stack.Screen name="promesses/[id]" />
      <Stack.Screen name="profile/index" />
      <Stack.Screen name="profile/restrictions" />
      <Stack.Screen name="profile/objectives" />
      <Stack.Screen name="profile/beauty" />
      <Stack.Screen name="profile/credits" />
      <Stack.Screen name="ingredient/[slug]" />
      <Stack.Screen name="offre/index" options={{ presentation: 'modal' }} />
      {/* Bienvenue Premium : plein écran, sans geste de retour. Revenir en
          arrière ramènerait sur le paywall qu'on vient d'acheter. */}
      <Stack.Screen
        name="premium/index"
        options={{ animation: 'fade', gestureEnabled: false }}
      />
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

  // Overlay de lancement animé (points rebondissants + wordmark machine à écrire)
  // affiché tant que `splashDone` est faux. Il masque le splash natif à son
  // montage et se fond dès que l'auth est résolue (voir AnimatedSplash).
  const [splashDone, setSplashDone] = useState(false)

  // Les polices ont assez attendu : on rend avec la police système.
  const [fontsTimedOut, setFontsTimedOut] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setFontsTimedOut(true), FONTS_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [])

  // On ne retient l'affichage que le temps de charger les polices, et jamais
  // au-delà de `FONTS_TIMEOUT_MS` : une app figée sur son splash est un rejet
  // App Store (2.1(a)), une police de repli passagère ne l'est pas.
  if (!fontsLoaded && !fontError && !fontsTimedOut) {
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
          {/* La frontière d'erreur couvre TOUT ce qui est monté à la racine, et
              plus seulement le navigateur. `AuthGuard`, `MaintenanceGate` et
              l'overlay de lancement interrogent le profil ou la config : si
              l'un d'eux levait au rendu, l'app mourait sans écran de repli, ce
              qui se voit de l'extérieur comme une app qui ne répond pas. La
              frontière est une classe autonome, sans dépendance aux providers,
              donc l'élargir ne coûte rien. */}
          <AppErrorBoundary>
            <CacheJanitor />
            <RevenueCatInit />
            <NotificationsInit />
            <AuthGuard />
            <RootNavigator />
            <CreditsExhaustedModal />
            <MaintenanceGate />
            <ToastHost />
            <OfflineBanner />
            {!splashDone ? <AnimatedSplash onFinish={() => setSplashDone(true)} /> : null}
          </AppErrorBoundary>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
