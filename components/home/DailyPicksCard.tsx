/**
 * DailyPicksCard — quizz + idée reçue du jour, twin mobile du web.
 *
 * Charge les 10 items du jour depuis Supabase (table `cosme_check.daily_picks`),
 * applique la sélection déterministe `pickTodaysItems`, et persiste le progrès
 * (index courant + score) dans AsyncStorage avec une clé datée UTC.
 *
 * UX :
 *   - Header : "Quizz du jour" (ou "Idée reçue du jour") + compteur "N / 10".
 *   - Barre de progression rose.
 *   - Question + 4 options. Tap → révèle la bonne réponse + texte explicatif.
 *   - "Suivant" passe à l'item suivant. Après le 10ème : écran "Reviens demain".
 */

import { type FC, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery } from '@tanstack/react-query'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius, spacing } from '@/constants/spacing'
import { db } from '@/lib/supabase/client'
import { pickTodaysItems, todayKey, type DailyPickItem } from '@/lib/dailyPicks/select'

const STORAGE_PREFIX = 'cw:dailyPicks'

interface DailyState {
  index: number
  score: number
}

async function readLocalState(): Promise<DailyState> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}:${todayKey()}`)
    if (raw === null) return { index: 0, score: 0 }
    const parsed = JSON.parse(raw) as Partial<DailyState>
    const idx = typeof parsed.index === 'number' && parsed.index >= 0 ? parsed.index : 0
    const sc = typeof parsed.score === 'number' && parsed.score >= 0 ? parsed.score : 0
    return { index: idx, score: sc }
  } catch {
    return { index: 0, score: 0 }
  }
}

async function writeLocalState(state: DailyState): Promise<void> {
  try {
    // Garbage-collect des clés des jours précédents (évite l'accumulation).
    const today = todayKey()
    const keys = await AsyncStorage.getAllKeys()
    const stale = keys.filter(
      (k) => k.startsWith(`${STORAGE_PREFIX}:`) && !k.endsWith(today),
    )
    if (stale.length > 0) await AsyncStorage.multiRemove(stale)
    await AsyncStorage.setItem(`${STORAGE_PREFIX}:${today}`, JSON.stringify(state))
  } catch {
    /* ignore (storage indisponible) */
  }
}

interface Props {
  /** Appelé quand l'utilisateur répond (réponse révélée) — le parent scrolle
   *  pour faire apparaître la réponse + le bouton « Suivant ». */
  onReveal?: () => void
}

export const DailyPicksCard: FC<Props> = ({ onReveal }) => {
  const [hydrated, setHydrated] = useState(false)
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)

  // Auto-scroll vers la réponse + bouton à la réponse. Ref pour ne dépendre
  // QUE de `picked` (sinon le callback inline du parent re-déclenche à chaque
  // render). Petit délai pour laisser le panneau réponse se mettre en page.
  const onRevealRef = useRef(onReveal)
  onRevealRef.current = onReveal
  useEffect(() => {
    if (picked === null) return
    const t = setTimeout(() => onRevealRef.current?.(), 80)
    return () => clearTimeout(t)
  }, [picked])

  // Hydratation : lit AsyncStorage au montage (asynchrone).
  useEffect(() => {
    let mounted = true
    void (async () => {
      const s = await readLocalState()
      if (!mounted) return
      setIndex(s.index)
      setScore(s.score)
      setHydrated(true)
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Catalogue STABLE (queryKey sans date) — persisté à travers les sessions par
  // le persister AsyncStorage (cf. `lib/storage/queryPersist`). Le slicing
  // « 10 items du jour » est dérivé en local via `select`, donc la rotation
  // quotidienne ne déclenche aucun nouveau fetch.
  const { data, isLoading, error } = useQuery<DailyPickItem[], Error, DailyPickItem[]>({
    queryKey: ['dailyPicksCatalog'],
    staleTime: 24 * 60 * 60 * 1000, // 24h — catalogue quasi-statique
    queryFn: async () => {
      const { data: rows, error: e } = await db()
        .from('daily_picks')
        .select('id, kind, order_index, question, options, correct_index, reveal, category')
        .order('order_index', { ascending: true })
      if (e) throw e
      return (rows as DailyPickItem[] | null) ?? []
    },
    select: (rows) => pickTodaysItems(rows),
  })

  function next(wasCorrect: boolean) {
    const newIndex = index + 1
    const newScore = wasCorrect ? score + 1 : score
    setIndex(newIndex)
    setScore(newScore)
    void writeLocalState({ index: newIndex, score: newScore })
    setPicked(null)
  }

  function reset() {
    setIndex(0)
    setScore(0)
    void writeLocalState({ index: 0, score: 0 })
    setPicked(null)
  }

  // Loading / erreur
  if (!hydrated || isLoading || !data) {
    return (
      <WhiteCard padding={spacing.lg}>
        <Text style={styles.kicker}>Quizz & idées reçues du jour</Text>
        <View style={styles.loadingRow}>
          {error ? (
            <Text style={styles.errorText}>Impossible de charger le quizz du jour.</Text>
          ) : (
            <ActivityIndicator color={colors.accent} />
          )}
        </View>
      </WhiteCard>
    )
  }

  if (data.length === 0) {
    return (
      <WhiteCard padding={spacing.lg}>
        <Text style={styles.kicker}>Quizz du jour</Text>
        <Text style={styles.empty}>
          Pas de contenu disponible aujourd&apos;hui. Reviens bientôt.
        </Text>
      </WhiteCard>
    )
  }

  // Tous les items du jour répondus → écran de fin avec score + reset.
  if (index >= data.length) {
    const total = data.length
    const ratio = score / total
    const palette =
      ratio >= 0.8
        ? { bg: '#ECFDF5', fg: '#047857' }
        : ratio >= 0.5
          ? { bg: '#FFFBEB', fg: '#B45309' }
          : { bg: '#FFF1F2', fg: '#9F1239' }
    const message =
      ratio === 1
        ? 'Sans-faute, bravo ! 🎉'
        : ratio >= 0.8
          ? 'Excellent score !'
          : ratio >= 0.5
            ? 'Pas mal, continue comme ça.'
            : 'Tu feras mieux la prochaine fois.'

    return (
      <WhiteCard padding={spacing.lg}>
        <View style={styles.endCenter}>
          <Text style={styles.endSparkle}>✨</Text>
          <Text style={styles.endTitle}>C&apos;est tout pour aujourd&apos;hui !</Text>
          <View style={[styles.endScore, { backgroundColor: palette.bg }]}>
            <Text style={[styles.endScoreNum, { color: palette.fg }]}>{score}</Text>
            <Text style={[styles.endScoreSlash, { color: palette.fg }]}> / {total}</Text>
          </View>
          <Text style={styles.endMsg}>{message}</Text>
          <Text style={styles.endHint}>
            10 nouveaux quizz et idées reçues t&apos;attendent demain.
          </Text>
          <Pressable
            onPress={reset}
            hitSlop={6}
            accessibilityRole="button"
            style={({ pressed }) => pressed && styles.btnPressed}
          >
            <Text style={styles.endReset}>Recommencer la série du jour</Text>
          </Pressable>
        </View>
      </WhiteCard>
    )
  }

  const item = data[index]
  const isQuiz = item.kind === 'quiz'
  const correctIdx = item.correct_index
  const total = data.length
  const showResult = picked !== null
  const progressPct = ((index + (picked !== null ? 1 : 0)) / total) * 100

  return (
    <WhiteCard padding={spacing.lg}>
      {/* Header : kicker + compteur */}
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>{isQuiz ? 'Quizz du jour' : 'Idée reçue du jour'}</Text>
        <Text style={styles.counter}>
          {index + 1} / {total}
        </Text>
      </View>

      {/* Barre de progression */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>

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
            <Pressable
              key={i}
              disabled={showResult}
              onPress={() => setPicked(i)}
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
          )
        })}
      </View>

      {/* Reveal panel (après réponse) */}
      {showResult ? (
        <View style={styles.reveal}>
          <Text style={styles.revealKicker}>RÉPONSE</Text>
          <Text style={styles.revealText}>{item.reveal}</Text>
          <Pressable
            onPress={() => next(picked === correctIdx)}
            style={({ pressed }) => [styles.nextBtn, pressed && styles.btnPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.nextBtnText}>
              {index + 1 < total ? 'Suivant →' : 'Voir mon score'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {item.category && !showResult ? (
        <Text style={styles.category}>{item.category}</Text>
      ) : null}
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.inkLight,
  },
  loadingRow: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  errorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.rating.rouge.text,
  },
  empty: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  counter: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkLight,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: spacing.base,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.rose,
    borderRadius: 2,
  },
  question: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
    marginBottom: spacing.base,
  },
  options: {
    gap: spacing.sm,
  },
  option: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionDefault: {
    backgroundColor: '#F3F4F6',
  },
  optionCorrect: {
    backgroundColor: '#ECFDF5',
  },
  optionWrong: {
    backgroundColor: '#FFF1F2',
  },
  optionFaded: {
    backgroundColor: '#F3F4F6',
    opacity: 0.55,
  },
  optionText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.ink,
  },
  optionTextCorrect: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: '#065F46',
  },
  optionTextWrong: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: '#9F1239',
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
  // Fin de série
  endCenter: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  endSparkle: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  endTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  endScore: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  endScoreNum: {
    fontFamily: fontFamilies.bold,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },
  endScoreSlash: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    opacity: 0.7,
  },
  endMsg: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
    marginBottom: 4,
  },
  endHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  endReset: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.rose,
    textDecorationLine: 'underline',
  },
})
