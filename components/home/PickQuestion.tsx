/**
 * PickQuestion — une question du quiz / idée reçue : énoncé, réponses, puis
 * panneau « Réponse » avec le bouton d'action.
 *
 * Partagé par la série du jour (`DailyPicksCard`, accueil) et la page
 * `/quiz/[id]` ouverte au tap de la notification « Quiz du jour ».
 */

import { type FC, Fragment } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius, spacing } from '@/constants/spacing'
import type { DailyPickItem } from '@/lib/dailyPicks/select'

interface Props {
  item: DailyPickItem
  /** Réponse choisie, null tant que la personne n'a pas répondu. */
  picked: number | null
  onPick: (index: number) => void
  /** Bouton sous la réponse révélée (Suivant, Voir mon score…). */
  action?: { label: string; onPress: () => void }
}

export const PickQuestion: FC<Props> = ({ item, picked, onPick, action }) => {
  const isQuiz = item.kind === 'quiz'
  const correctIdx = item.correct_index
  const showResult = picked !== null

  return (
    <>
      {/* Question */}
      <Text style={styles.question}>
        {isQuiz ? '❓' : '⚖️'} {item.question}
      </Text>

      {/* Options */}
      <View style={styles.options}>
        {item.options.map((opt, i) => {
          const isPicked = picked === i
          const isCorrect = i === correctIdx
          const optStyle = !showResult
            ? styles.optionDefault
            : isCorrect
              ? styles.optionCorrect
              : isPicked
                ? styles.optionWrong
                : styles.optionFaded
          const textStyle = !showResult
            ? styles.optionText
            : isCorrect
              ? styles.optionTextCorrect
              : isPicked
                ? styles.optionTextWrong
                : styles.optionText
          return (
            <Fragment key={i}>
              {/* Trait hors de la ligne : il ne s'estompe pas avec les réponses grisées. */}
              {i > 0 ? <View style={styles.optionDivider} /> : null}
              <Pressable
                disabled={showResult}
                onPress={() => onPick(i)}
                haptic="selection"
                style={({ pressed }) => [
                  styles.option,
                  optStyle,
                  pressed && !showResult && styles.btnPressed,
                ]}
              >
                <Text style={textStyle}>
                  {showResult && isCorrect ? '✓ ' : ''}
                  {showResult && isPicked && !isCorrect ? '✗ ' : ''}
                  {opt}
                </Text>
              </Pressable>
            </Fragment>
          )
        })}
      </View>

      {/* Reveal panel (après réponse) */}
      {showResult ? (
        <View style={styles.reveal}>
          <Text style={styles.revealKicker}>RÉPONSE</Text>
          <Text style={styles.revealText}>{item.reveal}</Text>
          {action ? (
            <Pressable
              onPress={action.onPress}
              haptic="primary"
              style={({ pressed }) => [styles.nextBtn, pressed && styles.btnPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.nextBtnText}>{action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {item.category && !showResult ? (
        <Text style={styles.category}>{item.category}</Text>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  question: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
    marginBottom: spacing.base,
  },
  // Réponses sans bloc de fond (28/09/2026) : de simples lignes séparées par un
  // trait noir. Après la réponse, toute la ligne se colore : verte pour la
  // bonne réponse, rouge pour la mauvaise si c'est celle qui a été choisie.
  options: {},
  option: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
  },
  optionDivider: {
    height: 1,
    backgroundColor: colors.ink,
  },
  optionDefault: {},
  optionCorrect: {
    backgroundColor: colors.rating.vert.bg,
  },
  optionWrong: {
    backgroundColor: colors.rating.rouge.bg,
  },
  optionFaded: {
    opacity: 0.45,
  },
  optionText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.ink,
  },
  optionTextCorrect: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.rating.vert.ink,
  },
  optionTextWrong: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.rating.rouge.ink,
  },
  reveal: {
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: '#F0F9FF',
  },
  revealKicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    letterSpacing: 1.1,
    color: '#0284C7',
    marginBottom: 4,
  },
  revealText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  nextBtn: {
    marginTop: spacing.base,
    backgroundColor: colors.ink,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nextBtnText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  btnPressed: {
    opacity: 0.85,
  },
  category: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'right',
    marginTop: spacing.md,
  },
})
