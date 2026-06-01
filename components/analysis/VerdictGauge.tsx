/**
 * VerdictGauge — jauge à 5 PASTILLES (cœur / feuille / œil / triangle / stop),
 * port du web (CosmetWiki components/analyse/VerdictGauge.tsx).
 *
 * Contrat visuel :
 *  - Les 5 pastilles gardent TOUJOURS leur teinte (jamais de gris) afin que
 *    l'utilisateur lise l'échelle complète vert → rouge d'un coup d'œil.
 *  - Pastilles inactives : petites, fond pastel de la teinte, opacité ~40 %
 *    (désaturées) — elles reculent visuellement.
 *  - Pastille active : plus grosse, teinte SATURÉE, anneau blanc (« halo »)
 *    qui la fait ressortir, ombre colorée portée — elle « sort » de la barre.
 *
 * `tone` provient de `lib/essentiel/engine` (VerdictTone). Le rendu est purement
 * présentationnel (props in, pas de fetch).
 */

import { memo } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg'

import type { VerdictTone } from '@/lib/essentiel/engine'

type Orientation = 'horizontal' | 'vertical'

// ── Slots + résolution de la teinte ─────────────────────────────────────────

type IconKind = 'heart' | 'leaf' | 'eye' | 'triangle' | 'stop'

type Slot = {
  key: 'very-safe' | 'safe' | 'caution' | 'warning' | 'danger'
  icon: IconKind
  /** Teinte saturée (état actif). */
  activeBg: string
  activeIcon: string
  /** Fond pastel (état inactif). */
  inactiveBg: string
  inactiveIcon: string
  /** Teinte de l'ombre portée colorée de la pastille active. */
  shadow: string
  srLabel: string
}

const SLOTS: Slot[] = [
  {
    key: 'very-safe',
    icon: 'heart',
    activeBg: '#34D399', // emerald-400
    activeIcon: '#022C22', // emerald-950
    inactiveBg: '#D1FAE5', // emerald-100
    inactiveIcon: '#10B981', // emerald-500
    shadow: '#34D399',
    srLabel: 'Formule très douce',
  },
  {
    key: 'safe',
    icon: 'leaf',
    activeBg: '#34D399',
    activeIcon: '#022C22',
    inactiveBg: '#D1FAE5',
    inactiveIcon: '#10B981',
    shadow: '#34D399',
    srLabel: 'Formule globalement saine',
  },
  {
    key: 'caution',
    icon: 'eye',
    activeBg: '#FBBF24', // amber-400
    activeIcon: '#451A03', // amber-950
    inactiveBg: '#FEF3C7', // amber-100
    inactiveIcon: '#F59E0B', // amber-500
    shadow: '#FBBF24',
    srLabel: 'Formule à surveiller',
  },
  {
    key: 'warning',
    icon: 'triangle',
    activeBg: '#F97316', // orange-500
    activeIcon: '#FFFFFF',
    inactiveBg: '#FFEDD5', // orange-100
    inactiveIcon: '#F97316', // orange-500
    shadow: '#F97316',
    srLabel: 'Formule moyenne',
  },
  {
    key: 'danger',
    icon: 'stop',
    activeBg: '#F43F5E', // rose-500
    activeIcon: '#FFFFFF',
    inactiveBg: '#FFE4E6', // rose-100
    inactiveIcon: '#F43F5E', // rose-500
    shadow: '#F43F5E',
    srLabel: 'Formule à examiner attentivement',
  },
]

const ACTIVE_INDEX_BY_TONE: Record<VerdictTone, number> = {
  'very-safe': 0,
  safe: 1,
  caution: 2,
  warning: 3,
  danger: 4,
  // High-risk partage le slot le plus à droite (stop).
  'high-risk': 4,
  // Unknown : aucune pastille active (sentinelle).
  unknown: -1,
}

interface Props {
  tone: VerdictTone
  orientation?: Orientation
  style?: StyleProp<ViewStyle>
}

// Empreinte stable d'un slot (la barre ne saute jamais quand l'index change).
const SLOT = 36
const INACTIVE = 28
const ACTIVE = 48
const RING = 4

export const VerdictGauge = memo(function VerdictGauge({
  tone,
  orientation = 'horizontal',
  style,
}: Props) {
  const activeIdx = ACTIVE_INDEX_BY_TONE[tone]
  const isVertical = orientation === 'vertical'

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Niveau global de la formule"
      accessibilityValue={{
        min: 1,
        max: 5,
        now: activeIdx === -1 ? undefined : activeIdx + 1,
        text: activeIdx === -1 ? 'Indéterminé' : SLOTS[activeIdx].srLabel,
      }}
      style={[styles.row, isVertical && styles.col, style]}
    >
      {SLOTS.map((slot, i) => {
        const active = i === activeIdx
        const dim = active ? ACTIVE : INACTIVE
        return (
          <View key={slot.key} style={styles.slot}>
            <View
              style={[
                styles.pastille,
                {
                  width: dim,
                  height: dim,
                  borderRadius: dim / 2,
                  backgroundColor: active ? slot.activeBg : slot.inactiveBg,
                },
                active
                  ? {
                      borderWidth: RING,
                      borderColor: '#FFFFFF',
                      // Ombre colorée portée (le « pop » 3D).
                      shadowColor: slot.shadow,
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.5,
                      shadowRadius: 12,
                      elevation: 8,
                      zIndex: 10,
                    }
                  : { opacity: 0.42 },
              ]}
            >
              <VerdictIcon
                kind={slot.icon}
                size={active ? 20 : 16}
                color={active ? slot.activeIcon : slot.inactiveIcon}
              />
            </View>
          </View>
        )
      })}
    </View>
  )
})

// ── Icônes SVG (miroir du set web) ──────────────────────────────────────────

function VerdictIcon({
  kind,
  size,
  color,
}: {
  kind: IconKind
  size: number
  color: string
}) {
  switch (kind) {
    case 'heart':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill={color}
          />
        </Svg>
      )
    case 'leaf':
      return (
        <Svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M11 20A7 7 0 0 1 4 13V8a7 7 0 0 1 7-7h7v6a7 7 0 0 1-7 7h-3" />
          <Path d="M2 21c4-5 7-7 14-9" />
        </Svg>
      )
    case 'eye':
      return (
        <Svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
          <Circle cx={12} cy={12} r={3} />
        </Svg>
      )
    case 'triangle':
      return (
        <Svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <Line x1={12} y1={9} x2={12} y2={13} />
          <Circle cx={12} cy={17} r={0.6} fill={color} />
        </Svg>
      )
    case 'stop':
      return (
        <Svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
          <Line x1={15} y1={9} x2={9} y2={15} />
          <Line x1={9} y1={9} x2={15} y2={15} />
        </Svg>
      )
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  col: { flexDirection: 'column' },
  slot: {
    width: SLOT,
    height: SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastille: { alignItems: 'center', justifyContent: 'center' },
})
