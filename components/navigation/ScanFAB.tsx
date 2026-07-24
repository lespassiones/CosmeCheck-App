/**
 * ScanFAB — bouton d'action flottant central « Scan ».
 *
 * Cercle de 64px en dégradé rose (gradients.fab : rose-400 → pink-500), anneau
 * blanc (ring-4 white/70 → border blanche translucide), halo rose intense
 * (surfaceShadows.fab). À l'intérieur : icône SCAN (viseur) + le label « Scan »
 * en tout petit dessous. Surélevé au-dessus de la barre (marginTop négatif côté
 * parent).
 *
 * Au press : feedback haptique + spring (scale 1 → 0.9 → 1), désactivé si
 * reduce-motion est actif.
 *
 * Props :
 *   - onPress : callback déclenché au tap (ouvre le scan / navigue vers /scan)
 *   - focused?: si l'onglet scan est actif
 */

import { type FC, useEffect, useState } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'

import { ScanIcon } from '@/components/navigation/NavIcons'
import { colors } from '@/constants/colors'
import { gradients } from '@/constants/gradients'
import { surfaceShadows } from '@/constants/shadows'

interface Props {
  onPress: () => void
  focused?: boolean
}

const SIZE = 64

export const ScanFAB: FC<Props> = ({ onPress, focused = false }) => {
  const scale = useSharedValue(1)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduceMotion(v))
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduceMotion(v),
    )
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    onPress()
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Scanner un produit"
      accessibilityState={{ selected: focused }}
      onPress={handlePress}
      onPressIn={() => {
        if (!reduceMotion) scale.value = withSpring(0.9, { damping: 14, stiffness: 220 })
      }}
      onPressOut={() => {
        if (!reduceMotion) scale.value = withSpring(1, { damping: 12, stiffness: 200 })
      }}
      hitSlop={8}
    >
      <Animated.View style={[styles.shadow, animStyle]}>
        {/* Anneau blanc translucide (ring-4 white/70 du web) */}
        <View style={styles.ring}>
          <LinearGradient
            colors={gradients.fab.colors}
            start={gradients.fab.start}
            end={gradients.fab.end}
            style={styles.gradient}
          >
            <ScanIcon size={20} color={colors.surface} />
            <Text allowFontScaling={false} style={styles.label}>
              Scan
            </Text>
          </LinearGradient>
        </View>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  shadow: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    ...surfaceShadows.fab,
  },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.70)',
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  label: {
    color: colors.surface,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: -0.2,
    lineHeight: 11,
  },
})
