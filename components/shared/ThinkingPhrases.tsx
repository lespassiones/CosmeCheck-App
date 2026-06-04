/**
 * ThinkingPhrases — ligne de texte qui FAIT DÉFILER une liste de phrases avec
 * une pulsation douce, dans l'esprit des indicateurs « thinking » des
 * assistants IA. Utilisé sous les écrans d'attente (recherche internet,
 * analyse de cohérence…) pour dynamiser le temps de calcul.
 */

import { useEffect, useRef, useState, type FC } from 'react'
import { Animated, StyleSheet, View } from 'react-native'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'

const INTERVAL_MS = 2400

interface Props {
  phrases: string[]
  /** Couleur du texte (défaut : accent violet). */
  color?: string
}

export const ThinkingPhrases: FC<Props> = ({ phrases, color = colors.accent }) => {
  const [idx, setIdx] = useState(0)
  const pulse = useRef(new Animated.Value(1)).current

  // Pulsation continue (effet « vivant »).
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  // Rotation des phrases.
  useEffect(() => {
    if (phrases.length <= 1) return
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % phrases.length)
    }, INTERVAL_MS)
    return () => clearInterval(t)
  }, [phrases.length])

  if (phrases.length === 0) return null

  return (
    <View style={styles.row}>
      <Animated.Text
        style={[styles.text, { color, opacity: pulse }]}
        numberOfLines={2}
      >
        {phrases[idx % phrases.length]}
      </Animated.Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    marginTop: spacing.md,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
})
