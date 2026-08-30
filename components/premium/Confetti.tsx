/**
 * Confetti : pluie de confettis pour l'écran de bienvenue Premium.
 *
 * Écrit avec Reanimated, déjà dans le projet, plutôt qu'avec une bibliothèque
 * de confettis : une dépendance native de plus se paie au build iOS et à chaque
 * montée d'SDK, pour une centaine de lignes d'animation.
 *
 * Chaque pièce anime UNE valeur partagée (sa progression de 0 à 1) et en dérive
 * chute, balancement, rotation et disparition. Tout vit sur le thread UI, donc
 * l'animation ne bronche pas pendant que l'écran interroge le profil.
 *
 * Respecte « réduire les animations » : dans ce cas on n'affiche rien du tout,
 * plutôt qu'une version au ralenti. Des confettis, c'est décoratif par nature.
 */

import { useEffect, useMemo, useState, type FC } from 'react'
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

import { colors } from '@/constants/colors'

const PIECE_COUNT = 44

/** Palette de la marque : rose, violet, vert, or. */
const PALETTE = [
  colors.rose,
  colors.roseDeep,
  colors.accent,
  colors.success,
  '#F5B301',
  '#FDE68A',
]

interface Piece {
  key: string
  startX: number
  driftX: number
  size: number
  color: string
  delay: number
  duration: number
  spins: number
  square: boolean
}

/** Un confetti : chute + balancement + rotation, piloté par une seule valeur. */
const ConfettiPiece: FC<{ piece: Piece; fallHeight: number }> = ({ piece, fallHeight }) => {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withTiming(1, { duration: piece.duration, easing: Easing.linear }),
    )
  }, [progress, piece.delay, piece.duration])

  const style = useAnimatedStyle(() => {
    const p = progress.value
    return {
      transform: [
        { translateY: interpolate(p, [0, 1], [-60, fallHeight + 60]) },
        // Balancement : trois points suffisent à donner l'impression du vent.
        { translateX: interpolate(p, [0, 0.5, 1], [0, piece.driftX, 0]) },
        { rotate: `${p * piece.spins * 360}deg` },
      ],
      // Apparition franche, disparition sur le dernier quart de la chute.
      opacity: interpolate(p, [0, 0.04, 0.75, 1], [0, 1, 1, 0]),
    }
  })

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.piece,
        {
          left: piece.startX,
          width: piece.size,
          height: piece.square ? piece.size : piece.size * 1.9,
          backgroundColor: piece.color,
          borderRadius: piece.square ? 2 : piece.size / 2,
        },
        style,
      ]}
    />
  )
}

export const Confetti: FC = () => {
  const { width, height } = useWindowDimensions()
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduceMotion(v))
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  // Tiré une seule fois : re-tirer à chaque rendu ferait sauter les confettis.
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        key: `c${i}`,
        startX: Math.random() * width,
        driftX: (Math.random() - 0.5) * 90,
        size: 6 + Math.random() * 6,
        color: PALETTE[i % PALETTE.length],
        // Étalé sur 1,4 s : une salve unique ressemble à un bug d'affichage.
        delay: Math.random() * 1400,
        duration: 2600 + Math.random() * 1800,
        spins: 1 + Math.random() * 3,
        square: i % 3 !== 0,
      })),
    [width],
  )

  if (reduceMotion) return null

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece) => (
        <ConfettiPiece key={piece.key} piece={piece} fallHeight={height} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    top: 0,
  },
})
