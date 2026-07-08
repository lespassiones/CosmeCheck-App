/**
 * OnboardingWizard - questionnaire profil en MICRO-ÉTAPES (refonte façon Flowfy).
 *
 * Au lieu de 3 grosses étapes denses, on enchaîne 11 micro-écrans (une question
 * par écran), regroupés en 3 blocs pastel :
 *   - Bloc « Ta peau » (violet)        : visage, corps, état des cheveux
 *   - Bloc « Tes préoccupations » (rose): peau, cheveux, autre
 *   - Bloc « Tes objectifs » (vert)    : visage, corps, cheveux, routine, autre
 *
 * Chrome : barre de progression globale animée + pastilles numérotées de
 * sous-étape (1·2·3 du bloc courant), titre court SANS paragraphe explicatif,
 * transitions glissées entre écrans, nav bas (Précédent / Suivant ou « C'est
 * parti ! »), « Passer » discret (le questionnaire reste entièrement optionnel).
 *
 * Persistance INCHANGÉE : auto-save débouncé ~600ms via saveSkin, flush au
 * finish, completeOnboarding optimiste+synchrone. La navigation post-onboarding
 * est déléguée à l'AuthGuard racine (paywall/home) — pas de router.replace ici,
 * sinon l'accueil clignote 1 frame avant la redirection du guard.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Animated, {
  FadeInLeft,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { useProfile } from '@/hooks/useProfile'
import {
  HAIR_CONCERN_LABEL,
  HAIR_PROBLEM_CONCERNS,
  HAIR_STATE_CONCERNS,
  PROFILE_GOAL_GROUPS,
  PROFILE_GOAL_LABEL,
  SKIN_CONCERN_LABEL,
  SKIN_CONCERNS,
  SKIN_TYPE_BODY_LABEL,
  SKIN_TYPE_FACE_LABEL,
  SKIN_TYPES_BODY,
  SKIN_TYPES_FACE,
  type HairConcern,
  type ProfileGoal,
  type SkinConcern,
  type SkinProfile,
  type SkinTypeBody,
  type SkinTypeFace,
} from '@/lib/skin/profile'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import {
  FreeTextStep,
  MultiSelectStep,
  SingleSelectStep,
  TONES,
  type ToneKey,
} from '@/components/onboarding/OnboardingControls'

const SAVE_DEBOUNCE_MS = 600

type ChangeFn = (patch: Partial<SkinProfile>) => void

interface StepDef {
  id: string
  bloc: 1 | 2 | 3
  blocLabel: string
  tone: ToneKey
  title: string
  /** Auto-avance après sélection (choix unique uniquement). */
  autoAdvance?: boolean
  render: (p: SkinProfile, onChange: ChangeFn, onAdvance: () => void) => ReactNode
}

const goalOptions = (label: string) =>
  PROFILE_GOAL_GROUPS.find((g) => g.label === label)!.goals.map((k) => ({
    key: k,
    label: PROFILE_GOAL_LABEL[k],
  }))

/** Toggle d'une clé dans un tableau (ajout/retrait), renvoie le nouveau tableau. */
function toggleIn<T>(list: T[] | undefined, key: T): T[] {
  const set = new Set<T>(list ?? [])
  if (set.has(key)) set.delete(key)
  else set.add(key)
  return Array.from(set)
}

const STEPS: StepDef[] = [
  // ── Bloc 1 : Ta peau (violet) ─────────────────────────────────────────
  {
    id: 'face',
    bloc: 1,
    blocLabel: 'Ta peau',
    tone: 'violet',
    title: 'Ton type de peau au visage ?',
    render: (p, onChange) => (
      <SingleSelectStep
        tone="violet"
        options={SKIN_TYPES_FACE.map((k) => ({ key: k, label: SKIN_TYPE_FACE_LABEL[k] }))}
        selectedKey={p.skinTypeFace}
        onPickKey={(key) =>
          onChange({
            skinTypeFace:
              p.skinTypeFace === key ? undefined : (key as SkinTypeFace),
            otherSkinTypeFace: undefined,
          })
        }
        other={{
          value: p.otherSkinTypeFace,
          placeholder: 'Décris ta peau du visage',
          onToggle: (open) =>
            onChange(
              open
                ? { skinTypeFace: undefined }
                : { otherSkinTypeFace: undefined },
            ),
          onChange: (t) => onChange({ otherSkinTypeFace: t }),
        }}
      />
    ),
  },
  {
    id: 'body',
    bloc: 1,
    blocLabel: 'Ta peau',
    tone: 'violet',
    title: 'Et la peau de ton corps ?',
    render: (p, onChange) => (
      <SingleSelectStep
        tone="violet"
        options={SKIN_TYPES_BODY.map((k) => ({ key: k, label: SKIN_TYPE_BODY_LABEL[k] }))}
        selectedKey={p.skinTypeBody}
        onPickKey={(key) =>
          onChange({
            skinTypeBody:
              p.skinTypeBody === key ? undefined : (key as SkinTypeBody),
            otherSkinTypeBody: undefined,
          })
        }
        other={{
          value: p.otherSkinTypeBody,
          placeholder: 'Décris la peau de ton corps',
          onToggle: (open) =>
            onChange(
              open
                ? { skinTypeBody: undefined }
                : { otherSkinTypeBody: undefined },
            ),
          onChange: (t) => onChange({ otherSkinTypeBody: t }),
        }}
      />
    ),
  },
  {
    id: 'hairState',
    bloc: 1,
    blocLabel: 'Ta peau',
    tone: 'violet',
    title: 'Comment sont tes cheveux ?',
    render: (p, onChange) => (
      <MultiSelectStep
        tone="violet"
        options={HAIR_STATE_CONCERNS.map((k) => ({ key: k, label: HAIR_CONCERN_LABEL[k] }))}
        values={p.hairConcerns ?? []}
        onToggle={(key) =>
          onChange({ hairConcerns: toggleIn(p.hairConcerns, key as HairConcern) })
        }
        other={{
          value: p.otherHair,
          placeholder: "Décris l'état de tes cheveux",
          onToggle: (open) =>
            onChange(open ? {} : { otherHair: undefined }),
          onChange: (t) => onChange({ otherHair: t }),
        }}
      />
    ),
  },

  // ── Bloc 2 : Tes préoccupations (rose) ────────────────────────────────
  {
    id: 'skinConcerns',
    bloc: 2,
    blocLabel: 'Tes préoccupations',
    tone: 'rose',
    title: "Qu'est-ce qui te préoccupe ?",
    render: (p, onChange) => (
      <MultiSelectStep
        tone="rose"
        options={SKIN_CONCERNS.map((k) => ({ key: k, label: SKIN_CONCERN_LABEL[k] }))}
        values={p.concerns ?? []}
        onToggle={(key) =>
          onChange({ concerns: toggleIn(p.concerns, key as SkinConcern) })
        }
      />
    ),
  },
  {
    id: 'hairConcerns',
    bloc: 2,
    blocLabel: 'Tes préoccupations',
    tone: 'rose',
    title: 'Et côté cheveux ?',
    render: (p, onChange) => (
      <MultiSelectStep
        tone="rose"
        options={HAIR_PROBLEM_CONCERNS.map((k) => ({ key: k, label: HAIR_CONCERN_LABEL[k] }))}
        values={p.hairConcerns ?? []}
        onToggle={(key) =>
          onChange({ hairConcerns: toggleIn(p.hairConcerns, key as HairConcern) })
        }
      />
    ),
  },
  {
    id: 'otherConcern',
    bloc: 2,
    blocLabel: 'Tes préoccupations',
    tone: 'rose',
    title: 'Autre chose à signaler ?',
    render: (p, onChange) => (
      <FreeTextStep
        value={p.otherConcerns}
        placeholder="ex : tiraillements, allergie connue, ingrédient à éviter…"
        onChange={(t) => onChange({ otherConcerns: t })}
      />
    ),
  },

  // ── Bloc 3 : Tes objectifs (vert) ─────────────────────────────────────
  {
    id: 'goalsFace',
    bloc: 3,
    blocLabel: 'Tes objectifs',
    tone: 'vert',
    title: 'Tes objectifs pour le visage',
    render: (p, onChange) => (
      <MultiSelectStep
        tone="vert"
        options={goalOptions('Visage')}
        values={p.goals ?? []}
        onToggle={(key) => onChange({ goals: toggleIn(p.goals, key as ProfileGoal) })}
      />
    ),
  },
  {
    id: 'goalsBody',
    bloc: 3,
    blocLabel: 'Tes objectifs',
    tone: 'vert',
    title: 'Tes objectifs pour le corps',
    render: (p, onChange) => (
      <MultiSelectStep
        tone="vert"
        options={goalOptions('Corps')}
        values={p.goals ?? []}
        onToggle={(key) => onChange({ goals: toggleIn(p.goals, key as ProfileGoal) })}
      />
    ),
  },
  {
    id: 'goalsHair',
    bloc: 3,
    blocLabel: 'Tes objectifs',
    tone: 'vert',
    title: 'Tes objectifs cheveux',
    render: (p, onChange) => (
      <MultiSelectStep
        tone="vert"
        options={goalOptions('Cheveux')}
        values={p.goals ?? []}
        onToggle={(key) => onChange({ goals: toggleIn(p.goals, key as ProfileGoal) })}
      />
    ),
  },
  {
    id: 'goalsRoutine',
    bloc: 3,
    blocLabel: 'Tes objectifs',
    tone: 'vert',
    title: 'Et ta routine ?',
    render: (p, onChange) => (
      <MultiSelectStep
        tone="vert"
        options={goalOptions('Routine')}
        values={p.goals ?? []}
        onToggle={(key) => onChange({ goals: toggleIn(p.goals, key as ProfileGoal) })}
      />
    ),
  },
  {
    id: 'otherGoal',
    bloc: 3,
    blocLabel: 'Tes objectifs',
    tone: 'vert',
    title: 'Un autre objectif en tête ?',
    render: (p, onChange) => (
      <FreeTextStep
        value={p.otherGoals}
        placeholder="Un objectif qui n'est pas dans la liste ?"
        onChange={(t) => onChange({ otherGoals: t })}
      />
    ),
  },
]

const TOTAL = STEPS.length

interface Props {
  /** Conservé pour compat - le wizard gère désormais son propre scroll. */
  onStepChange?: () => void
}

export const OnboardingWizard: FC<Props> = ({ onStepChange }) => {
  const { skin, firstName, saveSkin, completeOnboarding } = useProfile()

  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [profile, setProfile] = useState<SkinProfile>(skin)
  const [finishing, setFinishing] = useState(false)

  const scrollRef = useRef<ScrollView>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<Partial<SkinProfile> | null>(null)

  // Hydrate l'état local depuis le profil distant (une seule fois utile).
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

  // Remonte le corps en haut à chaque changement d'étape.
  const onStepChangeRef = useRef(onStepChange)
  onStepChangeRef.current = onStepChange
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false })
    onStepChangeRef.current?.()
  }, [index])

  // ── Barre de progression animée ────────────────────────────────────────
  const progress = useSharedValue((index + 1) / TOTAL)
  useEffect(() => {
    progress.value = withTiming((index + 1) / TOTAL, { duration: 320 })
  }, [index, progress])
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }))

  const handleChange = useCallback(
    (patch: Partial<SkinProfile>) => {
      setProfile((prev) => ({ ...prev, ...patch }))
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
    setDir(-1)
    setIndex((i) => (i > 0 ? i - 1 : i))
  }, [])

  const goNext = useCallback(() => {
    Haptics.selectionAsync().catch(() => {})
    setDir(1)
    setIndex((i) => (i < TOTAL - 1 ? i + 1 : i))
  }, [])

  const finish = useCallback(() => {
    if (finishing) return
    setFinishing(true)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    )
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    pendingRef.current = null
    // `completeOnboarding` pose `onboardingShown=true` dans le cache de façon
    // OPTIMISTE + SYNCHRONE (avant tout await). L'AuthGuard racine détecte ce
    // changement et route DIRECTEMENT vers le paywall (ou home si déjà vu). On
    // ne navigue PAS manuellement ici : un `router.replace(HOME)` faisait
    // clignoter l'accueil ~1 frame avant la redirection du guard vers le paywall.
    // Le spinner (`finishing`) reste affiché le temps de la bascule du guard.
    void completeOnboarding(pending ?? undefined).catch(() => {})
  }, [finishing, completeOnboarding])

  const step = STEPS[index]
  const tone = TONES[step.tone]
  const isLast = index === TOTAL - 1

  // Pastilles de sous-étape du bloc courant.
  const blocSteps = useMemo(
    () => STEPS.filter((s) => s.bloc === step.bloc),
    [step.bloc],
  )
  const blocPos = useMemo(
    () => blocSteps.findIndex((s) => s.id === step.id),
    [blocSteps, step.id],
  )

  const enterAnim = dir === 1 ? FadeInRight : FadeInLeft

  return (
    <View style={styles.root}>
      {/* ── Header : retour + Passer ──────────────────────────────────── */}
      <View style={styles.topRow}>
        {index > 0 ? (
          <Pressable
            onPress={goBack}
            hitSlop={10}
            disabled={finishing}
            accessibilityRole="button"
            accessibilityLabel="Précédent"
            style={styles.iconBtn}
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
        <Pressable
          onPress={finish}
          disabled={finishing}
          hitSlop={10}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
        >
          <Text style={styles.skipText}>Passer</Text>
        </Pressable>
      </View>

      {/* ── Barre de progression globale ──────────────────────────────── */}
      <View style={styles.progressTrack}>
        <Animated.View
          style={[styles.progressFill, { backgroundColor: tone.solid }, progressStyle]}
        />
      </View>

      {/* ── En-tête de bloc : kicker + pastilles numérotées ───────────── */}
      <View style={styles.blocHeader}>
        <Text style={[styles.kicker, { color: tone.text }]}>
          {index === 0 && firstName ? `Bonjour ${firstName}` : step.blocLabel}
        </Text>
        <View style={styles.dotsRow}>
          {blocSteps.map((s, i) => {
            const done = i < blocPos
            const active = i === blocPos
            return (
              <View
                key={s.id}
                style={[
                  styles.dot,
                  active
                    ? { backgroundColor: tone.solid }
                    : done
                      ? { backgroundColor: tone.soft }
                      : { backgroundColor: colors.gray200 },
                ]}
              >
                <Text
                  style={[
                    styles.dotText,
                    active
                      ? { color: colors.surface }
                      : done
                        ? { color: tone.text }
                        : { color: colors.inkLight },
                  ]}
                >
                  {i + 1}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      {/* ── Titre + corps de l'étape (animé) ──────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View key={step.id} entering={enterAnim.duration(280)}>
          <Text style={styles.title}>{step.title}</Text>
          <View style={styles.stepBody}>
            {step.render(profile, handleChange, goNext)}
          </View>
        </Animated.View>
      </ScrollView>

      {/* ── Navigation bas ────────────────────────────────────────────── */}
      <View style={styles.nav}>
        <Pressable
          onPress={isLast ? finish : goNext}
          disabled={finishing}
          style={({ pressed }) => [
            styles.btnPrimary,
            { backgroundColor: tone.solid },
            pressed && { opacity: 0.85 },
            finishing && { opacity: 0.7 },
          ]}
        >
          {finishing ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.btnPrimaryText}>
              {isLast ? "C'est parti !" : 'Suivant'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  skipText: {
    ...typography.smallMedium,
    color: colors.inkMuted,
  },
  progressTrack: {
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.gray200,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  blocHeader: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    ...typography.xsSemiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: {
    ...typography.xsSemiBold,
    fontSize: 11,
  },
  body: {
    flex: 1,
    marginTop: spacing.lg,
  },
  bodyContent: {
    paddingBottom: spacing.xl,
  },
  title: {
    ...typography.h2,
    color: colors.ink,
    marginBottom: spacing.xl,
  },
  stepBody: {
    width: '100%',
  },
  nav: {
    paddingTop: spacing.md,
  },
  btnPrimary: {
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  btnPrimaryText: {
    ...typography.button,
    color: colors.surface,
  },
})
