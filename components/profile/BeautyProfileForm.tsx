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
import { Pressable, StyleSheet, Text, View } from 'react-native'

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

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export const BeautyProfileForm: FC<Props> = ({
  initialSkin,
  onSave,
  onCancel,
  isSaving,
}) => {
  const [skin, setSkin] = useState<SkinProfile>(initialSkin)
  const [hasChanges, setHasChanges] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [confirmCancel, setConfirmCancel] = useState(false)

  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSkin = useRef<SkinProfile>(initialSkin)
  latestSkin.current = skin

  // Nettoyage des timers au démontage.
  useEffect(
    () => () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    },
    [],
  )

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

  const handleSaveNow = useCallback(() => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current)
    void runSave(latestSkin.current)
  }, [runSave])

  const requestCancel = useCallback(() => {
    if (hasChanges) setConfirmCancel(true)
    else onCancel()
  }, [hasChanges, onCancel])

  const saving = isSaving || status === 'saving'

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
      <Step1Skin value={skin} onChange={handleChange} />
      <View style={styles.divider} />

      {/* ── Préoccupations & allergies ───────────────────────── */}
      <Step2Concerns value={skin} onChange={handleChange} />
      <View style={styles.divider} />

      {/* ── Objectifs ────────────────────────────────────────── */}
      <Step3Goals value={skin} onChange={handleChange} />

      <View style={styles.actions}>
        <Pressable
          onPress={handleSaveNow}
          disabled={saving}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.saveBtn,
            (pressed || saving) && styles.saveBtnPressed,
          ]}
        >
          <Text style={styles.saveText}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Text>
        </Pressable>
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
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnPressed: { opacity: 0.85 },
  saveText: { ...typography.button, color: '#FFFFFF' },
  cancelBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelPressed: { opacity: 0.6 },
  cancelText: { ...typography.button, color: colors.inkMuted },
})
