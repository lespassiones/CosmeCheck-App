/**
 * StepChecklist : liste d'étapes qui se cochent pendant un long traitement
 * (analyse de promesse). Remplace le spinner + phrases tournantes (28/09/2026).
 *
 *   - faite    : rond encre plein, la coche se TRACE (trait animé) ;
 *   - en cours : anneau qui tourne ;
 *   - à venir  : rond gris vide, libellé grisé.
 *
 * Une requête serveur ne dit pas où elle en est : les étapes avant la dernière
 * se cochent au temps (`stepDelays`), la DERNIÈRE attend la vraie fin
 * (`complete`). À la fin, le reste se coche vite, puis `onCompleted` est appelé
 * pour laisser l'écran passer à la suite une fois la liste entièrement cochée.
 *
 * Motion : timings seulement, aucun ressort ; ReduceMotion.System.
 */

import { useEffect, useRef, useState, type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { StaggerItem } from '@/components/design/motion'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'

const MARK = 26
/** Longueur du tracé de la coche (viewBox 24), un peu arrondie au-dessus. */
const CHECK_LEN = 16
const RING_R = 10
const RING_C = 2 * Math.PI * RING_R
/** Pause entre deux coches quand le travail est fini, et avant `onCompleted`. */
const FINISH_STEP_MS = 220
const FINISH_HOLD_MS = 420
const DEFAULT_DELAYS: readonly number[] = [1400, 3200, 5200]

const AnimatedPath = Animated.createAnimatedComponent(Path)

const DoneMark: FC = () => {
  const fill = useSharedValue(0)
  const draw = useSharedValue(0)
  useEffect(() => {
    fill.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System })
    draw.value = withDelay(
      110,
      withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }),
    )
  }, [fill, draw])
  const circleStyle = useAnimatedStyle(() => ({
    opacity: fill.value,
    transform: [{ scale: 0.72 + 0.28 * fill.value }],
  }))
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - draw.value) }))
  return (
    <Animated.View style={[styles.mark, styles.done, circleStyle]}>
      <Svg width={MARK} height={MARK} viewBox="0 0 24 24">
        <AnimatedPath
          d="M7.2 12.4l3.1 3.1 6.5-6.6"
          stroke={colors.surface}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={CHECK_LEN}
          animatedProps={checkProps}
        />
      </Svg>
    </Animated.View>
  )
}

const ActiveRing: FC = () => {
  const rot = useSharedValue(0)
  useEffect(() => {
    rot.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
      -1,
      false,
    )
    return () => cancelAnimation(rot)
  }, [rot])
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }))
  return (
    <Animated.View style={[styles.mark, spin]}>
      <Svg width={MARK} height={MARK} viewBox="0 0 24 24">
        <Circle
          cx={12}
          cy={12}
          r={RING_R}
          stroke={colors.ink}
          strokeWidth={2.4}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${RING_C * 0.32} ${RING_C}`}
        />
      </Svg>
    </Animated.View>
  )
}

interface Props {
  steps: readonly string[]
  /** Le vrai travail est terminé : cocher le reste puis appeler `onCompleted`. */
  complete?: boolean
  onCompleted?: () => void
  /** Moments (ms) où les étapes AVANT la dernière se cochent d'elles-mêmes. */
  stepDelays?: readonly number[]
}

export const StepChecklist: FC<Props> = ({
  steps,
  complete = false,
  onCompleted,
  stepDelays = DEFAULT_DELAYS,
}) => {
  const [doneCount, setDoneCount] = useState(0)
  const onCompletedRef = useRef(onCompleted)
  onCompletedRef.current = onCompleted
  // Lu par ref : un tableau passé en ligne ne doit pas relancer les minuteurs.
  const delaysRef = useRef(stepDelays)
  delaysRef.current = stepDelays
  const firedRef = useRef(false)
  const n = steps.length

  // Au temps, jamais la dernière étape : elle attend la vraie fin.
  useEffect(() => {
    if (complete) return
    const timers = delaysRef.current
      .slice(0, Math.max(0, n - 1))
      .map((ms, i) => setTimeout(() => setDoneCount((c) => Math.max(c, i + 1)), ms))
    return () => timers.forEach(clearTimeout)
  }, [complete, n])

  // Fin réelle : on coche le reste une à une, puis on rend la main.
  useEffect(() => {
    if (!complete) return
    if (doneCount < n) {
      const t = setTimeout(() => setDoneCount((c) => Math.min(n, c + 1)), FINISH_STEP_MS)
      return () => clearTimeout(t)
    }
    if (firedRef.current) return
    const t = setTimeout(() => {
      firedRef.current = true
      onCompletedRef.current?.()
    }, FINISH_HOLD_MS)
    return () => clearTimeout(t)
  }, [complete, doneCount, n])

  return (
    <View style={styles.list} accessibilityRole="progressbar" accessibilityLabel={steps[Math.min(doneCount, n - 1)]}>
      {steps.map((label, i) => {
        const state = i < doneCount ? 'done' : i === doneCount ? 'active' : 'pending'
        return (
          <StaggerItem key={label} index={i} step={70} style={styles.row}>
            {state === 'done' ? (
              <DoneMark />
            ) : state === 'active' ? (
              <ActiveRing />
            ) : (
              <View style={[styles.mark, styles.pending]} />
            )}
            <Text style={[styles.label, state === 'pending' && styles.labelPending]}>{label}</Text>
          </StaggerItem>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 22, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mark: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' },
  done: { borderRadius: MARK / 2, backgroundColor: colors.ink },
  pending: { borderRadius: MARK / 2, borderWidth: 2, borderColor: colors.gray300 },
  label: { flex: 1, fontFamily: fontFamilies.medium, fontSize: 17, lineHeight: 22, color: colors.ink },
  labelPending: { color: colors.inkLight },
})
