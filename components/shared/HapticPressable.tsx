/**
 * HapticPressable : bouton de base de l'app, remplaçant direct de `Pressable`.
 *
 * S'importe sous le nom `Pressable` pour rester un remplacement sans autre
 * changement dans les écrans :
 *   import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
 *
 * Ajoute, sans rien retirer à `Pressable` :
 *  1. un RETOUR HAPTIQUE à l'activation (`onPress`, et `onLongPress` s'il
 *     existe), jamais au simple toucher : un doigt qui fait défiler une liste
 *     ne vibre pas. Intensité selon l'utilité de l'action (prop `haptic`,
 *     défaut `secondary`, cf. lib/pressFeedback.ts) ;
 *  2. une MINI-TRANSITION : léger rétrécissement en fondu, SANS rebond, pour
 *     les boutons qui n'ont pas déjà leur propre effet au toucher (style ou
 *     enfants écrits en fonction de `pressed`). `pressScale={false}` la coupe
 *     (fond de modale plein écran), un nombre la règle.
 *
 * Un bouton désactivé ne vibre pas (`Pressable` n'appelle pas `onPress`).
 */
import { forwardRef, type ElementRef } from 'react'
import {
  Pressable as RNPressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import {
  DEFAULT_PRESS_SCALE,
  fireHaptic,
  shouldAnimatePress,
  type HapticLevel,
} from '@/lib/pressFeedback'

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable)

// Fondu court, sans ressort ni rebond (demande explicite, cf. onboarding).
const PRESS_IN = { duration: 90, reduceMotion: ReduceMotion.System }
const PRESS_OUT = { duration: 140, reduceMotion: ReduceMotion.System }

export interface HapticPressableProps extends PressableProps {
  /** Utilité de l'action : dose la vibration. Défaut `secondary`. */
  haptic?: HapticLevel
  /** Vibration d'un appui long (défaut `primary` : un appui long engage). */
  longPressHaptic?: HapticLevel
  /** Échelle au toucher (défaut 0,97) ; `false` = aucune transition. */
  pressScale?: number | false
}

export const HapticPressable = forwardRef<ElementRef<typeof RNPressable>, HapticPressableProps>(
  function HapticPressable(
    {
      haptic = 'secondary',
      longPressHaptic = 'primary',
      pressScale,
      onPress,
      onLongPress,
      onPressIn,
      onPressOut,
      style,
      children,
      ...rest
    },
    ref,
  ) {
    const scale = useSharedValue(1)
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

    const handlePress = onPress
      ? (e: GestureResponderEvent) => {
          fireHaptic(haptic)
          onPress(e)
        }
      : undefined
    const handleLongPress = onLongPress
      ? (e: GestureResponderEvent) => {
          fireHaptic(longPressHaptic)
          onLongPress(e)
        }
      : undefined

    const animate = shouldAnimatePress({
      actionable: Boolean(onPress || onLongPress),
      styleIsFunction: typeof style === 'function',
      childrenIsFunction: typeof children === 'function',
      pressScale,
    })

    if (!animate) {
      return (
        <RNPressable
          ref={ref}
          {...rest}
          style={style}
          onPress={handlePress}
          onLongPress={handleLongPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        >
          {children}
        </RNPressable>
      )
    }

    const target = typeof pressScale === 'number' ? pressScale : DEFAULT_PRESS_SCALE
    return (
      <AnimatedPressable
        ref={ref}
        {...rest}
        style={[style as StyleProp<ViewStyle>, animatedStyle]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPressIn={(e) => {
          scale.value = withTiming(target, PRESS_IN)
          onPressIn?.(e)
        }}
        onPressOut={(e) => {
          scale.value = withTiming(1, PRESS_OUT)
          onPressOut?.(e)
        }}
      >
        {children}
      </AnimatedPressable>
    )
  },
)
