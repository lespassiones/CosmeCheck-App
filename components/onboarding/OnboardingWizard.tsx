/**
 * OnboardingWizard — orchestrateur du questionnaire en 3 étapes.
 *
 * - State local `SkinProfile`, initialisé depuis useProfile().skin.
 * - À chaque onChange : merge dans le state + auto-save DÉBOUNCÉ ~600ms via
 *   useProfile().saveSkin(patch).
 * - Barre de progression segmentée (1/3, 2/3, 3/3).
 * - Boutons « Précédent » / « Suivant » (et « Passer » en étape < 3).
 *   Étape 3 → CTA « Entrer dans Cosme Check ».
 * - Fin (ou « Passer ») : flush du save en attente → markOnboardingShown()
 *   → router.replace(ROUTES.TABS.HOME).
 */

import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'

import { useProfile } from '@/hooks/useProfile'
import { type SkinProfile } from '@/lib/skin/profile'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { Step1Skin } from '@/components/onboarding/Step1Skin'
import { Step2Concerns } from '@/components/onboarding/Step2Concerns'
import { Step3Goals } from '@/components/onboarding/Step3Goals'

const TOTAL_STEPS = 3
const SAVE_DEBOUNCE_MS = 600

type StepIndex = 1 | 2 | 3

const STEP_TITLES: Record<StepIndex, string> = {
  1: 'Parlons de ta peau',
  2: 'Tes préoccupations',
  3: 'Tes objectifs',
}

export const OnboardingWizard: FC = () => {
  const router = useRouter()
  const { skin, saveSkin, markOnboardingShown } = useProfile()

  const [step, setStep] = useState<StepIndex>(1)
  const [profile, setProfile] = useState<SkinProfile>(skin)
  const [finishing, setFinishing] = useState(false)

  // Garde une trace du dernier patch en attente + son timer pour pouvoir le
  // « flusher » immédiatement à la fin / au skip.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<Partial<SkinProfile> | null>(null)

  // Hydrate le state local quand le profil distant arrive (une seule fois utile,
  // tant que l'utilisateur n'a rien touché).
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    if (skin && Object.keys(skin).length > 0) {
      setProfile(skin)
      hydratedRef.current = true
    }
  }, [skin])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const flushPending = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const patch = pendingRef.current
    pendingRef.current = null
    if (patch) {
      try {
        await saveSkin(patch)
      } catch {
        // best-effort : on n'empêche pas l'utilisateur d'avancer si le save échoue.
      }
    }
  }, [saveSkin])

  const handleChange = useCallback(
    (patch: Partial<SkinProfile>) => {
      setProfile((prev) => ({ ...prev, ...patch }))
      // Accumule les patchs en attente puis débounce un unique save.
      pendingRef.current = { ...(pendingRef.current ?? {}), ...patch }
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const queued = pendingRef.current
        pendingRef.current = null
        timerRef.current = null
        if (queued) void saveSkin(queued).catch(() => {})
      }, SAVE_DEBOUNCE_MS)
    },
    [saveSkin],
  )

  const goBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => {})
    setStep((s) => (s > 1 ? ((s - 1) as StepIndex) : s))
  }, [])

  const goNext = useCallback(() => {
    Haptics.selectionAsync().catch(() => {})
    setStep((s) => (s < TOTAL_STEPS ? ((s + 1) as StepIndex) : s))
  }, [])

  const finish = useCallback(async () => {
    if (finishing) return
    setFinishing(true)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    )
    await flushPending()
    try {
      await markOnboardingShown()
    } catch {
      // on redirige quand même
    }
    router.replace(ROUTES.TABS.HOME)
  }, [finishing, flushPending, markOnboardingShown, router])

  return (
    <View style={styles.root}>
      {/* ── Barre de progression ─────────────────────────────── */}
      <View style={styles.progressRow}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressSeg,
              i < step ? styles.progressSegOn : styles.progressSegOff,
            ]}
          />
        ))}
      </View>
      <View style={styles.headerRow}>
        <Text style={styles.stepCount}>
          Étape {step} sur {TOTAL_STEPS}
        </Text>
        <Text style={styles.stepTitle}>{STEP_TITLES[step]}</Text>
      </View>

      {/* ── Étape courante ───────────────────────────────────── */}
      <View style={styles.stepBody}>
        {step === 1 ? (
          <Step1Skin value={profile} onChange={handleChange} />
        ) : step === 2 ? (
          <Step2Concerns value={profile} onChange={handleChange} />
        ) : (
          <Step3Goals value={profile} onChange={handleChange} />
        )}
      </View>

      {/* ── Navigation ───────────────────────────────────────── */}
      <View style={styles.nav}>
        {step > 1 ? (
          <Pressable
            onPress={goBack}
            disabled={finishing}
            style={({ pressed }) => [styles.btnGhost, pressed && styles.btnGhostPressed]}
          >
            <Text style={styles.btnGhostText}>Précédent</Text>
          </Pressable>
        ) : (
          <View style={styles.navSpacer} />
        )}

        {step < TOTAL_STEPS ? (
          <View style={styles.navRight}>
            <Pressable
              onPress={finish}
              disabled={finishing}
              style={({ pressed }) => [styles.btnSkip, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.btnSkipText}>Passer</Text>
            </Pressable>
            <Pressable
              onPress={goNext}
              style={({ pressed }) => [styles.btnPrimary, pressed && styles.btnPrimaryPressed]}
            >
              <Text style={styles.btnPrimaryText}>Suivant</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={finish}
            disabled={finishing}
            style={({ pressed }) => [
              styles.btnPrimary,
              styles.btnFinish,
              pressed && styles.btnPrimaryPressed,
              finishing && { opacity: 0.7 },
            ]}
          >
            {finishing ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.btnPrimaryText}>Entrer dans Cosme Check</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  progressRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.base,
  },
  progressSeg: {
    flex: 1,
    height: 5,
    borderRadius: radius.full,
  },
  progressSegOn: {
    backgroundColor: colors.accent,
  },
  progressSegOff: {
    backgroundColor: colors.gray200,
  },
  headerRow: {
    marginBottom: spacing.xl,
  },
  stepCount: {
    ...typography.xsSemiBold,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  stepTitle: {
    ...typography.h2,
    color: colors.ink,
  },
  stepBody: {
    marginBottom: spacing.xl,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  navSpacer: {
    flex: 0,
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  btnGhost: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
  },
  btnGhostPressed: {
    opacity: 0.6,
  },
  btnGhostText: {
    ...typography.button,
    color: colors.inkMuted,
  },
  btnSkip: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  btnSkipText: {
    ...typography.smallMedium,
    color: colors.inkMuted,
  },
  btnPrimary: {
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.rose,
    shadowColor: colors.rose,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  btnFinish: {
    flex: 1,
  },
  btnPrimaryPressed: {
    backgroundColor: colors.roseDeep,
  },
  btnPrimaryText: {
    ...typography.button,
    color: colors.surface,
  },
})
