/**
 * ScoreRing — anneau de progression du score de peau /100.
 *
 * Même construction que l'anneau des Promesses (Svg Circle, rotation -90°,
 * strokeDasharray/offset), mais orienté "plus haut = mieux" (100 = idéal).
 * `animated` anime le remplissage au montage (strokeDashoffset via Animated,
 * useNativeDriver:false car cette prop SVG n'est pas gérée par le driver natif).
 *
 * Le score PEAU /100 est autorisé au centre (ce n'est PAS un score produit).
 */

import { type FC, useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

interface Props {
  score: number | null
  size: number
  animated?: boolean
}

/** Couleur de l'anneau selon le score peau (100 = idéal). */
export function skinRingColor(score: number): string {
  if (score >= 75) return colors.rating.vert.DEFAULT
  if (score >= 55) return colors.rating.jaune.DEFAULT
  if (score >= 35) return colors.rating.orange.DEFAULT
  return colors.rating.rouge.DEFAULT
}

export const ScoreRing: FC<Props> = ({ score, size, animated = false }) => {
  const stroke = Math.max(5, Math.round(size * 0.09))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const hasScore = score !== null && Number.isFinite(score)
  const safe = hasScore ? Math.min(100, Math.max(0, score as number)) : 0
  const color = hasScore ? skinRingColor(safe) : colors.gray300
  const targetOffset = circumference * (1 - safe / 100)

  const progress = useRef(new Animated.Value(animated ? 0 : safe)).current

  useEffect(() => {
    if (animated) {
      const anim = Animated.timing(progress, {
        toValue: safe,
        duration: 900,
        useNativeDriver: false,
      })
      anim.start()
      return () => anim.stop()
    }
    progress.setValue(safe)
    return undefined
  }, [animated, safe, progress])

  const animatedOffset = animated
    ? progress.interpolate({
        inputRange: [0, 100],
        outputRange: [circumference, 0],
      })
    : targetOffset

  const fontSize = Math.max(14, Math.round(size * 0.28))

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.gray200}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={animatedOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        {hasScore ? (
          <Text style={[styles.score, { fontSize, color: colors.ink }]}>{Math.round(safe)}</Text>
        ) : (
          <Text style={[styles.empty, { fontSize: Math.round(fontSize * 0.7) }]}>--</Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  score: { fontFamily: fontFamilies.bold, letterSpacing: -0.5 },
  empty: { fontFamily: fontFamilies.bold, color: colors.inkLight },
})
