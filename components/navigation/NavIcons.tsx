/**
 * NavIcons — jeu d'icônes inline pour la navigation, porté 1:1 du web
 * (CosmetWiki components/nav/NavIcons.tsx) en react-native-svg.
 *
 * Mêmes tracés, strokes only (currentColor → prop `color`), pour rester
 * crisp et facilement recolorables. Les choix d'icônes correspondent au web :
 *   home, layers (Routine), clock (Historique), document/ribbon (Promesses),
 *   sparkles (Advisor), diamond (Offre), user (Profil), camera (FAB Décode).
 */

import type { FC } from 'react'
import Svg, { Path, Circle, Rect } from 'react-native-svg'

type Props = {
  size?: number
  color?: string
}

const DEFAULT_SIZE = 20
const DEFAULT_COLOR = '#1F2937'

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
})

export const HomeIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 11l9-8 9 8" />
    <Path d="M5 10v10h14V10" />
  </Svg>
)

export const LayersIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 2 2 7l10 5 10-5-10-5z" />
    <Path d="M2 17l10 5 10-5" />
    <Path d="M2 12l10 5 10-5" />
  </Svg>
)

export const ClockIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={12} cy={12} r={9} />
    <Path d="M12 7v5l3 2" />
  </Svg>
)

export const UserIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={12} cy={8} r={4} />
    <Path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
  </Svg>
)

export const CameraIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 8h3l2-2h6l2 2h3v11H4z" />
    <Circle cx={12} cy={13} r={3.5} />
  </Svg>
)

export const SparklesIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    <Circle cx={12} cy={12} r={3} />
  </Svg>
)

/**
 * "Promesses" — checklist avec une coche (web PromisesIcon : document + tick).
 */
export const PromisesIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={4} y={3} width={16} height={18} rx={2} />
    <Path d="M8 8h8" />
    <Path d="M8 12h5" />
    <Path d="m14 16 2 2 4-4" />
  </Svg>
)

export const DiamondIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M6 3h12l4 6-10 12L2 9z" />
    <Path d="M2 9h20" />
    <Path d="m6 3 4 6" />
    <Path d="m18 3-4 6" />
    <Path d="M10 9 12 21 14 9" />
  </Svg>
)

/** Burger — trois lignes horizontales. */
export const MenuIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 6h16" />
    <Path d="M4 12h16" />
    <Path d="M4 18h16" />
  </Svg>
)

/** Croix — ferme le drawer burger. */
export const CloseIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M6 6l12 12" />
    <Path d="M18 6 6 18" />
  </Svg>
)

/** Déconnexion — porte de sortie (web MobileBurgerMenu signOut). */
export const LogoutIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <Path d="m16 17 5-5-5-5" />
    <Path d="M21 12H9" />
  </Svg>
)
