/**
 * BeautyProfileForm — édition du profil beauté.
 *
 * Réutilise Step1Skin / Step2Concerns / Step3Goals (les mêmes questions que
 * l'onboarding) dans une vue unifiée scrollable. Maintient une copie locale du
 * SkinProfile, déclenche un auto-save débounce 800 ms à chaque modification, et
 * propose un bouton « Enregistrer » explicite + « Annuler ».
 *
 * PROPS:
 *   - initialSkin: SkinProfile — valeurs actuelles (depuis useProfile().skin)
 *   - onSave: (patch: SkinProfile) => Promise<void> — persiste le profil complet
 *   - onCancel: () => void
 *   - isSaving: boolean — état réseau remonté par le parent
 */

import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import type { SkinProfile } from '@/lib/skin/profile'
import { Step1Skin } from '@/components/onboarding/Step1Skin'
import { Step2Concerns } from '@/components/onboarding/Step2Concerns'
import { Step3Goals } from '@/components/onboarding/Step3Goals'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

interface Props {
  initialSkin: SkinProfile
  onSave: (patch: SkinProfile) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}

const AUTOSAVE_MS = 800
const SAVED_VISIBLE_MS = 2000
// Durée pendant laquelle le bouton du bas affiche « Enregistré ✓ » après un tap
// explicite, avant de revenir à l'état actif « Enregistrer ».
const BTN_SAVED_MS = 1800

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
// État du bouton du bas : indépendant de l'auto-save. Toujours « ready »
// (bouton actif « Enregistrer ») par défaut, même si le profil est déjà
// persisté en base. Passe à « done » (animation ✓) uniquement après un tap.
type BtnState = 'ready' | 'saving' | 'done' | 'error'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export const BeautyProfileForm: FC<Props> = ({
  initialSkin,
  onSave,
  onCancel,
  isSaving,
}) => {
  const [skin, setSkin] = useState<SkinProfile>(initialSkin)
  const [hasChanges, setHasChanges] = useState(false)
  // `status` pilote la pastille discrète du titre (feedback auto-save).
  const [status, setStatus] = useState<SaveStatus>('idle')
  // `btnState` pilote UNIQUEMENT le gros bouton du bas. Découplé de l'auto-save :
  // il reste « ready » (bouton actif « Enregistrer ») par défaut et ne joue
  // l'animation ✓ que sur un tap explicite de l'utilisateur.
  const [btnState, setBtnState] = useState<BtnState>('ready')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const btnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSkin = useRef<SkinProfile>(initialSkin)
  latestSkin.current = skin

  // Valeurs animées du bouton : rebond au tap + apparition du ✓.
  const btnScale = useSharedValue(1)
  const checkScale = useSharedValue(0)
  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }))
  const checkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }))

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduceMotion(v))
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduceMotion(v),
    )
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])

  // Nettoyage des timers au démontage.
  useEffect(
    () => () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      if (btnTimerRef.current) clearTimeout(btnTimerRef.current)
    },
    [],
  )

  // Sauvegarde silencieuse en arrière-plan (auto-save). Ne touche PAS au bouton
  // du bas — seulement la pastille du titre.
  const runSave = useCallback(
    async (next: SkinProfile) => {
      setStatus('saving')
      try {
        await onSave(next)
        setStatus('saved')
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setStatus('idle'), SAVED_VISIBLE_MS)
      } catch {
        setStatus('error')
      }
    },
    [onSave],
  )

  // Merge partiel + planification de l'auto-save débounce.
  const handleChange = useCallback(
    (patch: Partial<SkinProfile>) => {
      setSkin((prev) => {
        const next = { ...prev, ...patch }
        latestSkin.current = next
        return next
      })
      setHasChanges(true)
      if (autosaveRef.current) clearTimeout(autosaveRef.current)
      autosaveRef.current = setTimeout(() => {
        void runSave(latestSkin.current)
      }, AUTOSAVE_MS)
    },
    [runSave],
  )

  // Joue l'animation de confirmation (rebond + pop du ✓) sur le bouton.
  const playSavedAnimation = useCallback(() => {
    if (reduceMotion) return
    btnScale.value = withSequence(
      withTiming(0.95, { duration: 90 }),
      withSpring(1, { damping: 6, stiffness: 200 }),
    )
    checkScale.value = 0
    checkScale.value = withSpring(1, { damping: 9, stiffness: 240 })
  }, [reduceMotion, btnScale, checkScale])

  // Tap explicite « Enregistrer » : le profil est déjà persisté par l'auto-save,
  // mais on refait un envoi (idempotent) et on montre une vraie confirmation
  // animée à l'utilisateur, puis on revient à l'état actif « Enregistrer ».
  const handleSaveNow = useCallback(() => {
    if (btnState === 'saving' || btnState === 'done') return
    if (autosaveRef.current) clearTimeout(autosaveRef.current)
    if (btnTimerRef.current) clearTimeout(btnTimerRef.current)
    setBtnState('saving')
    void (async () => {
      try {
        await onSave(latestSkin.current)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        setBtnState('done')
        playSavedAnimation()
        btnTimerRef.current = setTimeout(() => setBtnState('ready'), BTN_SAVED_MS)
      } catch {
        setBtnState('error')
      }
    })()
  }, [btnState, onSave, playSavedAnimation])

  const requestCancel = useCallback(() => {
    if (hasChanges) setConfirmCancel(true)
    else onCancel()
  }, [hasChanges, onCancel])

  const saving = isSaving || btnState === 'saving'
  const saveMode: BtnState = saving ? 'saving' : btnState
  const saveDisabled = saveMode === 'saving' || saveMode === 'done'

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Mon profil beauté</Text>
        {status === 'saved' ? (
          <View style={styles.savedPill}>
            <Text style={styles.savedText}>Sauvegardé ✓</Text>
          </View>
        ) : status === 'error' ? (
          <View style={[styles.savedPill, styles.errorPill]}>
            <Text style={[styles.savedText, styles.errorText]}>Échec</Text>
          </View>
        ) : null}
      </View>

      {/* ── Type de peau ─────────────────────────────────────── */}
      <Text style={styles.sectionHeader}>Ta peau</Text>
      <Step1Skin value={skin} onChange={handleChange} />
      <View style={styles.divider} />

      {/* ── Préoccupations & allergies ───────────────────────── */}
      <Text style={styles.sectionHeader}>Tes préoccupations</Text>
      <Step2Concerns value={skin} onChange={handleChange} />
      <View style={styles.divider} />

      {/* ── Objectifs ────────────────────────────────────────── */}
      <Text style={styles.sectionHeader}>Tes objectifs</Text>
      <Step3Goals value={skin} onChange={handleChange} />

      <View style={styles.actions}>
        <AnimatedPressable
          onPress={handleSaveNow}
          disabled={saveDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: saveDisabled }}
          style={[
            styles.saveBtn,
            saveMode === 'done' && styles.saveBtnDone,
            btnAnimStyle,
          ]}
        >
          {saveMode === 'saving' ? (
            <View style={styles.saveRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.saveText}>Enregistrement…</Text>
            </View>
          ) : saveMode === 'done' ? (
            <View style={styles.saveRow}>
              <Animated.View style={checkAnimStyle}>
                <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
              </Animated.View>
              <Text style={styles.saveText}>Enregistré</Text>
            </View>
          ) : (
            <Text style={styles.saveText}>
              {saveMode === 'error' ? 'Réessayer' : 'Enregistrer'}
            </Text>
          )}
        </AnimatedPressable>
        <Pressable
          onPress={requestCancel}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelPressed]}
        >
          <Text style={styles.cancelText}>Annuler</Text>
        </Pressable>
      </View>

      <ConfirmDialog
        visible={confirmCancel}
        title="Abandonner les modifications ?"
        message="Tes derniers changements non enregistrés seront perdus."
        confirmLabel="Abandonner"
        cancelLabel="Continuer l'édition"
        destructive
        onConfirm={() => {
          setConfirmCancel(false)
          onCancel()
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: { ...typography.h3, color: colors.ink },
  sectionHeader: {
    ...typography.h3,
    color: colors.rose,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  savedPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.successSoft,
  },
  errorPill: { backgroundColor: colors.errorSoft },
  savedText: { ...typography.xsSemiBold, color: colors.success },
  errorText: { color: colors.error },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  actions: { gap: spacing.md, marginTop: spacing.lg },
  saveBtn: {
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // État « done » (juste après un tap) : reste vert plein — le ✓ animé sert de
  // confirmation. Revient automatiquement à « Enregistrer » après BTN_SAVED_MS.
  saveBtnDone: { backgroundColor: colors.success },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  saveText: { ...typography.button, color: '#FFFFFF' },
  cancelBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelPressed: { opacity: 0.6 },
  cancelText: { ...typography.button, color: colors.inkMuted },
})
