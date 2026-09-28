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
  /**
   * Variante pleine (onglet actif de la barre du bas). Les détails intérieurs
   * (porte, aiguilles, lignes) sont alors évidés en blanc, le fond de la barre.
   */
  filled?: boolean
}

const DEFAULT_SIZE = 20
const DEFAULT_COLOR = '#1F2937'
/** Couleur des évidements des variantes pleines (= fond blanc de la barre). */
const CUTOUT = '#FFFFFF'

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
})

export const HomeIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, filled = false }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {filled ? (
      <>
        <Path d="M5 9.2 12 3l7 6.2V20H5z" fill={color} />
        <Path d="M3 11l9-8 9 8" />
        <Path d="M10.2 21v-5.4h3.6V21" fill={CUTOUT} stroke={CUTOUT} strokeWidth={1.4} />
      </>
    ) : (
      // Contour de la MÊME silhouette que la variante pleine (toit, murs, porte).
      <>
        <Path d="M3 11l9-8 9 8" />
        <Path d="M5 9.2V20h14V9.2" />
        <Path d="M10.2 20v-5.4h3.6V20" />
      </>
    )}
  </Svg>
)

export const LayersIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, filled = false }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 2 2 7l10 5 10-5-10-5z" fill={filled ? color : 'none'} />
    <Path d="M2 17l10 5 10-5" />
    <Path d="M2 12l10 5 10-5" />
  </Svg>
)

export const ClockIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, filled = false }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={12} cy={12} r={9} fill={filled ? color : 'none'} />
    <Path d="M12 7v5l3 2" stroke={filled ? CUTOUT : color} />
  </Svg>
)

export const UserIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, filled = false }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={12} cy={8} r={4} fill={filled ? color : 'none'} />
    <Path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" fill={filled ? color : 'none'} />
  </Svg>
)

export const CameraIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 8h3l2-2h6l2 2h3v11H4z" />
    <Circle cx={12} cy={13} r={3.5} />
  </Svg>
)

/** Scan — viseur (coins) + ligne de balayage horizontale (icône « scanner »). */
export const ScanIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <Path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <Path d="M20 16v2a2 2 0 0 1-2 2h-2" />
    <Path d="M8 20H6a2 2 0 0 1-2-2v-2" />
    <Path d="M4 12h16" />
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
export const PromisesIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, filled = false }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {filled ? (
      <>
        <Rect x={4} y={3} width={16} height={18} rx={2} fill={color} />
        {/* Coche ramenée dans le document : sur le bord, elle mordrait le contour. */}
        <Path d="M8 7.5h8M8 11.5h5m-4 4 2 2 4-4" stroke={CUTOUT} />
      </>
    ) : (
      // Même dessin intérieur que la variante pleine (coche dans le document).
      <>
        <Rect x={4} y={3} width={16} height={18} rx={2} />
        <Path d="M8 7.5h8M8 11.5h5m-4 4 2 2 4-4" />
      </>
    )}
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

/** Trois points verticaux — variante "kebab" du menu burger. */
export const MoreVerticalIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill={color} stroke="none">
    <Circle cx={12} cy={5} r={1.7} />
    <Circle cx={12} cy={12} r={1.7} />
    <Circle cx={12} cy={19} r={1.7} />
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
/** Fiole de laboratoire — annuaire des ingrédients. */
export const FlaskIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 3h6" />
    <Path d="M10 3v6.5L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.5V3" />
    <Path d="M7.2 14h9.6" />
  </Svg>
)

export const LogoutIcon: FC<Props> = ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }) => (
  <Svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <Path d="m16 17 5-5-5-5" />
    <Path d="M21 12H9" />
  </Svg>
)
