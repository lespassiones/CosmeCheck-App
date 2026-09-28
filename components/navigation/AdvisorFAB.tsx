/**
 * AdvisorFAB : bouton du Beauty Advisor, avec la mascotte Perle à l'intérieur.
 *
 * Bouton flottant en bas à droite, au-dessus de la barre d'onglets (le Scan
 * garde le centre de la barre). Cercle blanc, filet rose, Perle posée dedans.
 *
 * Au press : léger enfoncement en fondu (pas de rebond), vibration moyenne.
 */

import { type FC } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'

const PERLE = require('../../assets/images/onboarding/perle-avatar.webp')

interface Props {
  onPress: () => void
  /** Diamètre du bouton en dp (56 par défaut). */
  size?: number
}

export const AdvisorFAB: FC<Props> = ({ onPress, size = 56 }) => {
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const press = (to: number) => {
    scale.value = withTiming(to, { duration: 120, reduceMotion: ReduceMotion.System })
  }
  const round = { width: size, height: size, borderRadius: size / 2 }
  // La goutte occupe ~80 % du cercle, posée en bas : elle « sort » du bouton.
  const perle = Math.round(size * 0.8)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ouvrir le Beauty Advisor"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
        onPress()
      }}
      onPressIn={() => press(0.94)}
      onPressOut={() => press(1)}
      hitSlop={8}
    >
      <Animated.View style={[styles.shadow, round, animStyle]}>
        <View style={[styles.circle, round]}>
          <Image
            source={PERLE}
            style={{ width: perle, height: perle, marginBottom: 1 }}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  shadow: {
    backgroundColor: colors.surface,
    boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.18)',
  },
  circle: {
    borderWidth: 2,
    borderColor: colors.roseSoft,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
})
