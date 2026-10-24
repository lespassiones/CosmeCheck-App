import type { FC } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'

interface Props {
  listening: boolean
  disabled?: boolean
  /** Volume de la voix (0 à 1) : l'anneau rose grandit quand on parle. */
  level: SharedValue<number>
  onPress: () => void
}

const SIZE = 44

/**
 * Bouton micro de la saisie Advisor. Au repos : micro blanc bordé. En écoute :
 * pastille rose avec un carré « stop » et un anneau qui suit la voix (pas de
 * boucle d'animation : l'anneau ne bouge que sur les variations de volume).
 */
export const VoiceMicButton: FC<Props> = ({ listening, disabled, level, onPress }) => {
  const ringStyle = useAnimatedStyle(() => ({
    opacity: listening ? 0.35 + level.value * 0.4 : 0,
    transform: [{ scale: listening ? 1 + level.value * 0.45 : 1 }],
  }))

  return (
    <View style={styles.wrap}>
      <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      <Pressable
        onPress={onPress}
        disabled={disabled}
        haptic={listening ? 'secondary' : 'primary'}
        style={({ pressed }) => [
          styles.btn,
          listening ? styles.btnListening : styles.btnIdle,
          disabled && styles.btnDisabled,
          pressed && styles.btnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={listening ? 'Arrêter la dictée' : 'Dicter ma question'}
        accessibilityState={{ disabled: !!disabled }}
        testID="advisor-mic"
      >
        {listening ? (
          <View style={styles.stopSquare} />
        ) : (
          <Ionicons name="mic-outline" size={20} color={colors.ink} />
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.roseSoft,
  },
  btn: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIdle: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnListening: {
    backgroundColor: colors.rose,
  },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { opacity: 0.85 },
  stopSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: colors.surface,
  },
})
