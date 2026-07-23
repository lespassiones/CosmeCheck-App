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
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

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
  // `dirty` = des modifications restent à enregistrer. À l'ouverture le profil
  // est déjà persisté → false → le bouton affiche « Enregistré ✓ » (désactivé).
  // Repasse à true à la moindre modif, à false après une sauvegarde réussie.
  const [dirty, setDirty] = useState(false)
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
        // On ne repasse « propre » QUE si rien n'a changé depuis cet envoi
        // (égalité de référence : handleChange crée un nouvel objet à chaque
        // modif). Évite d'afficher « Enregistré » alors qu'une nouvelle édition
        // est déjà en attente d'auto-save.
        if (latestSkin.current === next) setDirty(false)
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
      setDirty(true)
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
  // État du bouton d'enregistrement :
  //  - saving : en cours (spinner, désactivé)
  //  - error  : échec → « Réessayer » (cliquable)
  //  - dirty  : modifs à enregistrer → « Enregistrer » (cliquable)
  //  - saved  : tout est à jour → « Enregistré ✓ » (DÉSACTIVÉ, jusqu'à la
  //             prochaine modification)
  const saveMode: 'saving' | 'error' | 'dirty' | 'saved' = saving
    ? 'saving'
    : status === 'error'
      ? 'error'
      : dirty
        ? 'dirty'
        : 'saved'
  const saveDisabled = saveMode === 'saving' || saveMode === 'saved'

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
        <Pressable
          onPress={handleSaveNow}
          disabled={saveDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: saveDisabled }}
          style={({ pressed }) => [
            styles.saveBtn,
            saveMode === 'saved' && styles.saveBtnSaved,
            pressed && !saveDisabled && styles.saveBtnPressed,
          ]}
        >
          {saveMode === 'saving' ? (
            <View style={styles.saveRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.saveText}>Enregistrement…</Text>
            </View>
          ) : saveMode === 'saved' ? (
            <Text style={[styles.saveText, styles.saveTextSaved]}>Enregistré ✓</Text>
          ) : (
            <Text style={styles.saveText}>
              {saveMode === 'error' ? 'Réessayer' : 'Enregistrer'}
            </Text>
          )}
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
  saveBtnPressed: { opacity: 0.85 },
  // État « à jour » : vert clair, non cliquable — signale que tout est enregistré.
  saveBtnSaved: { backgroundColor: colors.successSoft },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  saveText: { ...typography.button, color: '#FFFFFF' },
  saveTextSaved: { color: colors.success },
  cancelBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelPressed: { opacity: 0.6 },
  cancelText: { ...typography.button, color: colors.inkMuted },
})
