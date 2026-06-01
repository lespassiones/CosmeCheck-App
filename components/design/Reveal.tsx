/**
 * Reveal — animation d'apparition (fade-in + translateY) avec stagger optionnel
 * sur chaque enfant. Utilise les layout animations de react-native-reanimated.
 */

import { Children, type FC, type ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

interface Props {
  children: ReactNode
  stagger?: number
  delay?: number
  duration?: number
  translateY?: number
  style?: StyleProp<ViewStyle>
  enabled?: boolean
}

export const Reveal: FC<Props> = ({
  children,
  stagger = 0,
  delay = 0,
  duration = 400,
  translateY = 16,
  style,
  enabled = true,
}) => {
  if (!enabled) return <View style={style}>{children}</View>

  return (
    <View style={style}>
      {Children.toArray(children).map((child, i) => (
        <Animated.View
          key={i}
          entering={FadeInDown.delay(delay + i * stagger)
            .duration(duration)
            .withInitialValues({ transform: [{ translateY }], opacity: 0 })}
        >
          {child}
        </Animated.View>
      ))}
    </View>
  )
}
