/**
 * NeuCard — carte neumorphique (effet "matière douce") sur fond neu.bg #E8ECF1.
 *
 * RN ne supporte qu'une ombre par View → on empile deux wrappers (chacun avec
 * backgroundColor neu.bg pour que l'ombre se rende) : un pour l'ombre claire
 * (haut-gauche) et un pour l'ombre sombre (bas-droit). Sur Android, seul
 * l'`elevation` est utilisé (les ombres colorées custom n'y sont pas supportées).
 *
 * variant: 'flat' | 'raised' (défaut) | 'pressed'. Si `onPress` est fourni et
 * `interactive`, la carte s'anime (scale 0.98 + effet enfoncé) au toucher.
 */

import { type FC, type ReactNode, useState } from 'react'
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { radius as radiusTokens } from '@/constants/spacing'

interface Props {
  children: ReactNode
  variant?: 'flat' | 'raised' | 'pressed'
  style?: StyleProp<ViewStyle>
  onPress?: () => void
  borderRadius?: number
  padding?: number
  interactive?: boolean
}

const PRESSED_BG = '#DDE1E7'

export const NeuCard: FC<Props> = ({
  children,
  variant = 'raised',
  style,
  onPress,
  borderRadius = radiusTokens.card,
  padding = 20,
  interactive = true,
}) => {
  const scale = useSharedValue(1)
  const [pressed, setPressed] = useState(false)

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  const effective: 'flat' | 'raised' | 'pressed' =
    onPress && interactive && pressed ? 'pressed' : variant

  const isIos = Platform.OS === 'ios'

  const darkShadow: ViewStyle =
    effective === 'flat'
      ? {}
      : effective === 'pressed'
        ? isIos
          ? {
              shadowColor: colors.neu.shadowDark,
              shadowOffset: { width: -4, height: -4 },
              shadowOpacity: 0.8,
              shadowRadius: 6,
            }
          : {}
        : isIos
          ? {
              shadowColor: colors.neu.shadowDark,
              shadowOffset: { width: 6, height: 6 },
              shadowOpacity: 1,
              shadowRadius: 14,
            }
          : { elevation: 6 }

  const lightShadow: ViewStyle =
    !isIos || effective === 'flat'
      ? {}
      : effective === 'pressed'
        ? {
            shadowColor: colors.neu.shadowLight,
            shadowOffset: { width: 3, height: 3 },
            shadowOpacity: 0.9,
            shadowRadius: 6,
          }
        : {
            shadowColor: colors.neu.shadowLight,
            shadowOffset: { width: -6, height: -6 },
            shadowOpacity: 1,
            shadowRadius: 14,
          }

  const bg = effective === 'pressed' ? PRESSED_BG : colors.neu.bg

  const card = (
    <View style={[{ borderRadius, backgroundColor: colors.neu.bg }, lightShadow]}>
      <View style={[{ borderRadius, backgroundColor: colors.neu.bg }, darkShadow]}>
        <View style={[{ borderRadius, padding, backgroundColor: bg }, style]}>{children}</View>
      </View>
    </View>
  )

  if (!onPress) return card

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        Haptics.selectionAsync().catch(() => {})
        if (interactive) {
          setPressed(true)
          scale.value = withSpring(0.98, { damping: 20 })
        }
      }}
      onPressOut={() => {
        if (interactive) {
          setPressed(false)
          scale.value = withSpring(1, { damping: 20 })
        }
      }}
    >
      <Animated.View style={animStyle}>{card}</Animated.View>
    </Pressable>
  )
}
