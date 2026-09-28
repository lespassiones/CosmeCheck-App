/**
 * OnboardingFlow : le parcours « Le diagnostic de Perle », écran par écran.
 *
 * Remplace le carrousel de présentation (invité) et l'ancien questionnaire en
 * douze micro-étapes (connecté). Une seule route, un état local, des écrans qui
 * se succèdent avec une transition glissée :
 *
 *   - chaque réponse est écrite dans le brouillon (`lib/onboarding/draft.ts`),
 *     en mémoire et sur disque : l'app peut être tuée à tout moment, on reprend
 *     au même écran ;
 *   - la liste des écrans visibles est recalculée à chaque pas
 *     (`visibleSteps`), car elle dépend des réponses (consentement refusé,
 *     produit scanné ou non) ;
 *   - en fin de parcours invité, on marque le parcours comme terminé et on
 *     ouvre l'écran de compte ; l'écriture dans le profil se fera à
 *     l'inscription (`OnboardingDraftFlusher`) ;
 *   - en fin de parcours connecté, on écrit directement, et l'AuthGuard
 *     enchaîne vers le paywall.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import Animated, { FadeInLeft, FadeInRight, ReduceMotion } from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { markPreOnboardingDone } from '@/lib/storage/preOnboarding'
import { applyOnboardingDraft } from '@/lib/onboarding/applyDraft'
import {
  emptyDraft,
  getDraft,
  loadDraft,
  saveDraft,
  type OnboardingDraft,
} from '@/lib/onboarding/draft'
import {
  NO_CHROME,
  nextStep,
  previousStep,
  progressPercent,
  visibleSteps,
  type FlowMode,
  type StepContext,
  type StepId,
} from '@/lib/onboarding/steps'
import { FlowHeader, PrimaryButton } from '@/components/onboarding/flow/ui'
import { HookFront, HookTranslator } from '@/components/onboarding/flow/steps/Hooks'
import { ConsentStep } from '@/components/onboarding/flow/steps/Consent'
import {
  AbandonedStep,
  BodySkinStep,
  ConcernsStep,
  GoalsStep,
  HairStep,
  MotivationStep,
  NameStep,
  PainStep,
  RestrictionsStep,
  SkinTestStep,
  VolumeStep,
} from '@/components/onboarding/flow/steps/Questions'
import { PlanStep, ProjectionStep, SkinRevealStep, TruthStep } from '@/components/onboarding/flow/steps/Reveals'
import { ScanStep } from '@/components/onboarding/flow/steps/Scan'
import { VerdictStep } from '@/components/onboarding/flow/steps/Verdict'
import { MontageStep, NotificationsStep } from '@/components/onboarding/flow/steps/Final'
import { OnboardingPaywall, PREMIUM_CREAM } from '@/components/onboarding/flow/OnboardingPaywall'
import { usePaywallCheckout } from '@/hooks/usePaywallCheckout'
import { draftRestrictionFamilies } from '@/lib/onboarding/buildPreferences'
import type { StepProps } from '@/components/onboarding/flow/types'

type Direction = 'forward' | 'back'

/**
 * Paywall du parcours invité, au pic de motivation, AVANT le compte (comme
 * MemoryPilot). Acheter ou « Plus tard » mènent tous deux à la création du
 * compte ; l'achat anonyme y est rattaché par `loginUser` à l'inscription.
 */
const GuestPaywall: FC<{
  draft: OnboardingDraft
  firstName: string
  onDone: (purchased: boolean) => void
}> = ({ draft, firstName, onDone }) => {
  const checkout = usePaywallCheckout({ guest: true, onPurchased: () => onDone(true) })
  const personalized = draft.consent?.granted === true
  return (
    <OnboardingPaywall
      embedded
      checkout={checkout}
      onLater={() => onDone(false)}
      person={{
        firstName: firstName || null,
        skinTypeFace: personalized && draft.skinTest && draft.skinTest !== 'inconnu' ? draft.skinTest : undefined,
        concerns: personalized ? draft.concerns : [],
        restrictionFamilies: personalized ? draftRestrictionFamilies(draft) : [],
      }}
    />
  )
}

function readConsent(prefs: unknown): OnboardingDraft['consent'] | undefined {
  if (!prefs || typeof prefs !== 'object') return undefined
  const raw = (prefs as Record<string, unknown>).data_consent
  if (!raw || typeof raw !== 'object') return undefined
  const c = raw as { granted?: unknown; at?: unknown; version?: unknown }
  if (c.granted !== true) return undefined
  return {
    granted: true,
    at: typeof c.at === 'string' ? c.at : new Date().toISOString(),
    version: typeof c.version === 'number' ? c.version : 1,
  }
}

export const OnboardingFlow: FC<{ mode: FlowMode }> = ({ mode }) => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { profile, firstName: profileName, dataConsentGiven } = useProfile()

  const [ready, setReady] = useState(false)
  const [draft, setDraft] = useState<OnboardingDraft>(() => getDraft() ?? emptyDraft())
  const [step, setStep] = useState<StepId | null>(null)
  const [direction, setDirection] = useState<Direction>('forward')
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState(false)

  const draftRef = useRef(draft)
  const stepRef = useRef<StepId | null>(null)

  const consentAlreadyGiven = mode === 'member' && dataConsentGiven
  const knownName = mode === 'member' ? profileName ?? '' : ''

  const contextFor = useCallback(
    (d: OnboardingDraft): StepContext => ({
      mode,
      consentGranted: d.consent ? d.consent.granted : consentAlreadyGiven ? true : null,
      consentAlreadyGiven,
      hasKnownName: Boolean(knownName),
      hasScannedProduct: Boolean(d.scanned),
    }),
    [mode, consentAlreadyGiven, knownName],
  )

  const update = useCallback((patch: Partial<OnboardingDraft>) => {
    const nextDraft = { ...draftRef.current, ...patch }
    draftRef.current = nextDraft
    setDraft(nextDraft)
    saveDraft(nextDraft)
  }, [])

  const goTo = useCallback(
    (target: StepId, dir: Direction) => {
      setDirection(dir)
      stepRef.current = target
      setStep(target)
      update({ step: target })
    },
    [update],
  )

  // ── Démarrage : brouillon, reprise, parcours déjà terminé ──────────────
  useEffect(() => {
    let alive = true
    void (async () => {
      const loaded = (await loadDraft()) ?? emptyDraft()
      if (!alive) return
      if (mode === 'guest' && loaded.completed) {
        // Réponses déjà données, compte pas encore créé : on reprend au compte.
        markPreOnboardingDone()
        router.replace(ROUTES.AUTH.WELCOME)
        return
      }
      let d = { ...loaded, completed: false }
      if (mode === 'member' && !d.consent) {
        const existing = readConsent(profile?.preferences)
        if (existing) d = { ...d, consent: existing }
      }
      draftRef.current = d
      setDraft(d)
      const steps = visibleSteps(contextFor(d))
      const resume = d.step && steps.includes(d.step) ? d.step : steps[0]
      stepRef.current = resume ?? null
      setStep(resume ?? null)
      setReady(true)
    })()
    return () => {
      alive = false
    }
    // Démarrage unique : le profil connu à cet instant suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finish = useCallback(async () => {
    const done: OnboardingDraft = { ...draftRef.current, completed: true }
    if (!done.firstName && knownName) done.firstName = knownName
    draftRef.current = done
    saveDraft(done)
    if (mode === 'guest') {
      markPreOnboardingDone()
      router.replace(ROUTES.AUTH.WELCOME)
      return
    }
    if (!user?.id) return
    setFinishing(true)
    setFinishError(false)
    try {
      // Écriture optimiste : le layout (onboarding) voit `onboardingShown` et
      // redirige vers le paywall de lui-même.
      await applyOnboardingDraft({ userId: user.id, draft: done, queryClient })
    } catch {
      setFinishError(true)
      setFinishing(false)
    }
  }, [mode, knownName, user?.id, queryClient])

  const next = useCallback(() => {
    const current = stepRef.current
    if (!current) return
    const steps = visibleSteps(contextFor(draftRef.current))
    const target = nextStep(current, steps)
    if (target) goTo(target, 'forward')
    else void finish()
  }, [contextFor, goTo, finish])

  const back = useCallback((): boolean => {
    const current = stepRef.current
    if (!current) return false
    // Montage et paywall ne se rejouent pas en arrière : « Plus tard » est la sortie.
    if (current === 'paywall' || current === 'montage') return true
    const steps = visibleSteps(contextFor(draftRef.current))
    const target = previousStep(current, steps)
    if (!target) return false
    goTo(target, 'back')
    return true
  }, [contextFor, goTo])

  // Geste / bouton retour Android : écran précédent, sinon comportement normal.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => back())
    return () => sub.remove()
  }, [back])

  const steps = useMemo(() => visibleSteps(contextFor(draft)), [contextFor, draft])
  const firstName = draft.firstName?.trim() || knownName

  if (!ready || !step) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.rose} />
      </View>
    )
  }

  const props: StepProps = { draft, update, next, mode, firstName }
  const canGoBack = previousStep(step, steps) !== null
  const chrome = !NO_CHROME.has(step)
  const signIn = () => {
    markPreOnboardingDone()
    router.push(ROUTES.AUTH.SIGN_IN)
  }

  const renderStep = () => {
    switch (step) {
      case 'hook1':
        return <HookFront onStart={next} onSignIn={signIn} />
      case 'hook2':
        return <HookTranslator onStart={next} onSignIn={signIn} />
      case 'consent':
        return mode === 'guest' ? (
          <View style={styles.flex}>
            <HookTranslator onStart={() => {}} onSignIn={() => {}} inert />
            <ConsentStep {...props} asSheet />
          </View>
        ) : (
          <ConsentStep {...props} asSheet={false} />
        )
      case 'name':
        return <NameStep {...props} />
      case 'pain':
        return <PainStep {...props} />
      case 'motivation':
        return <MotivationStep {...props} />
      case 'skinTest':
        return <SkinTestStep {...props} />
      case 'skinReveal':
        return <SkinRevealStep {...props} />
      case 'bodySkin':
        return <BodySkinStep {...props} />
      case 'concerns':
        return <ConcernsStep {...props} />
      case 'truth':
        return <TruthStep {...props} />
      case 'goals':
        return <GoalsStep {...props} />
      case 'restrictions':
        return <RestrictionsStep {...props} />
      case 'volume':
        return <VolumeStep {...props} />
      case 'projection':
        return <ProjectionStep {...props} />
      case 'abandoned':
        return <AbandonedStep {...props} />
      case 'plan':
        return <PlanStep {...props} />
      case 'scan':
        return <ScanStep {...props} />
      case 'verdict':
        return <VerdictStep {...props} />
      case 'hair':
        return <HairStep {...props} />
      case 'notifications':
        return <NotificationsStep {...props} />
      case 'montage':
        return <MontageStep {...props} />
      case 'paywall':
        return (
          <GuestPaywall
            draft={draft}
            firstName={firstName}
            onDone={(purchased) => {
              update({ paywallSeen: true, purchased: purchased || draft.purchased === true })
              void finish()
            }}
          />
        )
      default:
        return null
    }
  }

  const entering = (direction === 'forward' ? FadeInRight : FadeInLeft)
    .duration(260)
    .reduceMotion(ReduceMotion.System)

  return (
    <View style={[styles.root, step === 'paywall' && { backgroundColor: PREMIUM_CREAM }]}>
      <StatusBar style="dark" />
      {/* Le clavier est géré par chaque écran (StepLayout) : il remonte la barre
          du bas et fait défiler vers le champ actif. */}
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.flex}>
          {chrome ? (
            <FlowHeader
              progress={progressPercent(step, steps)}
              onBack={canGoBack ? () => void back() : undefined}
              animateKey={step}
            />
          ) : null}
          <Animated.View key={step} entering={entering} style={styles.flex}>
            {renderStep()}
          </Animated.View>
        </View>
      </SafeAreaView>

      {finishing || finishError ? (
        <View style={styles.overlay}>
          {finishError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Tes réponses n'ont pas pu être enregistrées</Text>
              <Text style={styles.errorText}>Vérifie ta connexion, puis réessaie. Rien n'est perdu.</Text>
              <PrimaryButton label="Réessayer" onPress={() => void finish()} />
            </View>
          ) : (
            <ActivityIndicator color={colors.rose} size="large" />
          )}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250,250,250,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorTitle: { fontFamily: fontFamilies.bold, fontSize: 19, color: colors.ink, textAlign: 'center' },
  errorText: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 21, color: colors.inkMuted, textAlign: 'center' },
})
