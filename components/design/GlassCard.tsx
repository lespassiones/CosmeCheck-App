/**
 * GlassCard — carte glassmorphique : fond blanc semi-transparent + blur
 * (expo-blur) + bordure ring subtile. Sur Android le blur est plus coûteux,
 * on augmente l'opacité du fond en fallback.
 */

import { type FC, type ReactNode } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { radius as radiusTokens } from '@/constants/spacing'

interface Props {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
  onPress?: () => void
  blurIntensity?: number
  opacity?: number
  borderRadius?: number
  padding?: number
  shadow?: boolean
}

export const GlassCard: FC<Props> = ({
  children,
  style,
  contentStyle,
  onPress,
  blurIntensity = 20,
  opacity = 0.7,
  borderRadius = radiusTokens.card,
  padding = 20,
  shadow = true,
}) => {
  const bgOpacity = Platform.OS === 'android' ? Math.max(opacity, 0.92) : opacity

  const inner = (
    <View
      style={[
        {
          borderRadius,
          borderWidth: 1,
          borderColor: colors.glass.border,
          padding,
          backgroundColor: `rgba(255,255,255,${bgOpacity})`,
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  )

  const card = (
    <View
      style={[
        { borderRadius, overflow: 'hidden' },
        shadow && styles.shadow,
        style,
      ]}
    >
      <BlurView intensity={blurIntensity} tint="light" style={StyleSheet.absoluteFill} />
      {inner}
    </View>
  )

  if (!onPress) return card

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Haptics.selectionAsync().catch(() => {})}
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}
    >
      {card}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
})
