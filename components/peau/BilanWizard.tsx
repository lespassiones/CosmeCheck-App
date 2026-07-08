/**
 * BilanWizard — questionnaire hebdo du score de peau (5 questions, ~45 s).
 *
 * Une question par dimension (ordre = SKIN_DIMENSIONS), 5 options chacune,
 * ordonnées de la pire (index 0 -> score 0) à la meilleure (index 4 -> 100),
 * pour matcher directement `answersToScores` (idx * 25). Barre de progression
 * « Question X sur 5 ». Gratuit, aucune interaction crédits.
 */

import { type FC, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { SKIN_DIMENSIONS, type SkinDimension } from '@/lib/skin/score'

interface Question {
  dim: SkinDimension
  kicker: string
  title: string
  /** 5 options, de la pire (0) à la meilleure (100). */
  options: [string, string, string, string, string]
}

const QUESTIONS: Question[] = [
  {
    dim: 'imperfections',
    kicker: 'IMPERFECTIONS',
    title: 'Des imperfections en ce moment (boutons, points noirs) ?',
    options: ['Très nombreuses', 'Nombreuses', 'Modérées', 'Légères', 'Aucune'],
  },
  {
    dim: 'rougeurs',
    kicker: 'ROUGEURS',
    title: 'Comment est ta peau aujourd’hui côté rougeurs ?',
    options: ['Très importantes', 'Importantes', 'Modérées', 'Légères', 'Aucune'],
  },
  {
    dim: 'secheresse',
    kicker: 'SÉCHERESSE',
    title: 'Ta peau tiraille ou pèle ?',
    options: ['Tout le temps', 'Souvent', 'Parfois', 'Rarement', 'Jamais'],
  },
  {
    dim: 'brillance',
    kicker: 'BRILLANCE',
    title: 'Des brillances (excès de sébum) dans la journée ?',
    options: ['Très marquées', 'Marquées', 'Modérées', 'Légères', 'Aucune'],
  },
  {
    dim: 'douceur',
    kicker: 'DOUCEUR',
    title: 'Ta peau est douce et lisse au toucher ?',
    options: ['Pas du tout', 'Peu', 'Moyennement', 'Plutôt douce', 'Très douce'],
  },
]

// Sanity : les questions couvrent exactement les dimensions, dans l'ordre.
if (QUESTIONS.length !== SKIN_DIMENSIONS.length) {
  throw new Error('BilanWizard : questions et SKIN_DIMENSIONS désalignées')
}

interface Props {
  /** Réponses finales, index 0..4 par dimension (ordre SKIN_DIMENSIONS). */
  onComplete: (answers: number[]) => void
  submitting?: boolean
}

export const BilanWizard: FC<Props> = ({ onComplete, submitting = false }) => {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(
    QUESTIONS.map(() => null),
  )

  const q = QUESTIONS[step]
  const selected = answers[step]
  const isLast = step === QUESTIONS.length - 1

  const select = (idx: number) => {
    Haptics.selectionAsync().catch(() => {})
    setAnswers((prev) => prev.map((v, i) => (i === step ? idx : v)))
  }

  const next = () => {
    if (selected === null) return
    if (isLast) {
      const finalAnswers = answers.map((v) => v ?? 2)
      onComplete(finalAnswers)
    } else {
      setStep((s) => s + 1)
    }
  }

  return (
    <View style={styles.root}>
      {/* Progression */}
      <Text style={styles.progressLabel}>
        Question {step + 1} sur {QUESTIONS.length}
      </Text>
      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width: `${((step + 1) / QUESTIONS.length) * 100}%` }]}
        />
      </View>

      <Text style={styles.title}>{q.title}</Text>
      <View style={styles.kickerRow}>
        <Ionicons name="sparkles-outline" size={12} color={colors.rose} />
        <Text style={styles.kicker}>{q.kicker}</Text>
      </View>

      <View style={styles.options}>
        {q.options.map((label, idx) => {
          const active = selected === idx
          return (
            <Pressable
              key={label}
              onPress={() => select(idx)}
              style={[styles.option, active && styles.optionActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
              {active && <Ionicons name="checkmark-circle" size={18} color={colors.rose} />}
            </Pressable>
          )
        })}
      </View>

      <View style={styles.footer}>
        {step > 0 ? (
          <Pressable onPress={() => setStep((s) => s - 1)} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={16} color={colors.inkMuted} />
            <Text style={styles.backText}>Retour</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable
          onPress={next}
          disabled={selected === null || submitting}
          style={[styles.nextBtn, (selected === null || submitting) && styles.nextBtnDisabled]}
          accessibilityRole="button"
        >
          <Text style={styles.nextText}>{isLast ? 'Terminer' : 'Continuer'}</Text>
        </Pressable>
      </View>

      <Text style={styles.durationHint}>Environ 45 secondes au total</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progressLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.gray100,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.rose,
  },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 22,
    lineHeight: 29,
    color: colors.ink,
    textAlign: 'center',
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  kicker: {
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.rose,
  },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  optionActive: {
    borderColor: colors.rose,
    backgroundColor: colors.roseSoft,
  },
  optionText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.ink,
  },
  optionTextActive: {
    fontFamily: fontFamilies.semiBold,
    color: colors.rose,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
  },
  backText: { fontFamily: fontFamilies.medium, fontSize: 13, color: colors.inkMuted },
  nextBtn: {
    backgroundColor: colors.rose,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minWidth: 150,
    alignItems: 'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextText: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: '#FFFFFF' },
  durationHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkLight,
    textAlign: 'center',
    marginTop: spacing.md,
  },
})
