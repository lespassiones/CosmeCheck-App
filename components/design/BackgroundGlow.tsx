/**
 * BackgroundGlow — orbes pastels en arrière-plan (atmosphère douce).
 * Positionné en absolute, pointerEvents none, derrière le contenu.
 * Le flou est simulé par un grand borderRadius + faible opacité.
 */

import { memo } from 'react'
import { StyleSheet, View } from 'react-native'

interface Props {
  variant?: 'default' | 'auth' | 'dashboard' | 'minimal'
  opacity?: number
}

interface Orb {
  size: number
  color: string
  top?: number
  bottom?: number
  left?: number
  right?: number
}

const VARIANTS: Record<NonNullable<Props['variant']>, Orb[]> = {
  default: [
    { size: 280, color: 'rgba(244,63,94,0.12)', top: -60, right: -80 },
    { size: 240, color: 'rgba(139,92,246,0.10)', bottom: 80, left: -60 },
    { size: 200, color: 'rgba(59,130,246,0.08)', top: 200, left: 40 },
  ],
  auth: [
    { size: 280, color: 'rgba(244,63,94,0.12)', top: -60, right: -80 },
    { size: 240, color: 'rgba(139,92,246,0.10)', bottom: 80, left: -60 },
    { size: 200, color: 'rgba(59,130,246,0.08)', top: 200, left: 40 },
  ],
  dashboard: [
    { size: 300, color: 'rgba(244,63,94,0.08)', top: -100, right: -100 },
    { size: 200, color: 'rgba(139,92,246,0.08)', bottom: 120, left: -40 },
  ],
  minimal: [{ size: 250, color: 'rgba(244,63,94,0.06)', top: 0, right: 0 }],
}

export const BackgroundGlow = memo(function BackgroundGlow({
  variant = 'default',
  opacity = 1,
}: Props) {
  const orbs = VARIANTS[variant]
  return (
    <View pointerEvents="none" style={styles.container}>
      {orbs.map((orb, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: orb.size,
            height: orb.size,
            borderRadius: orb.size / 2,
            backgroundColor: orb.color,
            opacity,
            top: orb.top,
            bottom: orb.bottom,
            left: orb.left,
            right: orb.right,
          }}
        />
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: -1,
  },
})
