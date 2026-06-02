/**
 * WhiteCard — surface blanche avec drop shadow doux, alternative à NeuCard.
 *
 * Utilisée sur le dashboard (Astuce du jour, Dernière analyse, Ta routine) pour
 * un look "carte propre" plutôt que neumorphique. Si `onPress` est fourni, la
 * carte devient interactive (haptic + léger scale au press).
 */

import { type FC, type ReactNode } from 'react'
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'

import { radius as radiusTokens } from '@/constants/spacing'

interface Props {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
  padding?: number
  borderRadius?: number
}

export const WhiteCard: FC<Props> = ({
  children,
  style,
  onPress,
  padding = 20,
  borderRadius = radiusTokens.card,
}) => {
  const base: ViewStyle = {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius,
    padding,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  }

  if (!onPress) {
    return <View style={[base, style]}>{children}</View>
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        Haptics.selectionAsync().catch(() => {})
      }}
      style={({ pressed }) => [
        base,
        pressed && { opacity: 0.96, transform: [{ scale: 0.99 }] },
        style,
      ]}
    >
      {children}
    </Pressable>
  )
}
