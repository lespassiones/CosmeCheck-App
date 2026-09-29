/**
 * ToggleSwitch — interrupteur maison (remplace le `Switch` natif).
 *
 * POURQUOI : sous iOS 26, UISwitch a changé de taille et de rendu (verre, pastille
 * étirable) alors que React Native 0.81 réserve toujours l'ancien cadre 51 x 31 :
 * l'interrupteur sortait décalé vers le haut dans sa ligne (Profil > Notifications).
 * Ce composant a une taille fixe, un rendu identique iOS / Android, et une
 * animation en durée seule (aucun ressort, cf. règle motion du projet).
 */
import { memo, useEffect } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { colors } from '@/constants/colors'

const WIDTH = 51
const HEIGHT = 31
const PAD = 2
const THUMB = HEIGHT - PAD * 2
const TRAVEL = WIDTH - THUMB - PAD * 2

interface Props {
  value: boolean
  onValueChange: (next: boolean) => void
  disabled?: boolean
  accessibilityLabel?: string
  /** Couleur de la piste activée (défaut : encre). */
  activeColor?: string
  inactiveColor?: string
}

export const ToggleSwitch = memo(function ToggleSwitch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  activeColor = colors.gray900,
  inactiveColor = colors.gray300,
}: Props) {
  const progress = useSharedValue(value ? 1 : 0)

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    })
  }, [value, progress])

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]),
  }))
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }],
  }))

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={disabled ? styles.disabled : undefined}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  track: {
    width: WIDTH,
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    padding: PAD,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  disabled: { opacity: 0.5 },
})
