/**
 * Star3D — étoile du bloc « Qualité de la formule » (28/09/2026 : nouveau style).
 *   - forme « dodue » (creux moins profonds) à pointes ARRONDIES : le contour
 *     de même teinte, joints ronds, arrondit chaque pointe ;
 *   - droite (plus d'inclinaison), épaisseur discrète : la même étoile décalée
 *     de 1 vers le bas, en teinte sombre ;
 *   - face en dégradé vertical (clair en haut → teinte) + petit reflet blanc.
 * La forme remplit presque tout le viewBox : peu de vide autour, donc pas
 * d'écart parasite avec le titre au-dessus ni le bord en dessous.
 * Purement présentationnel (props in, pas de fetch).
 */

import { memo } from 'react'
import Svg, { Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg'

export type StarPalette = { face: string; dark: string; light: string }

// Étoile à 5 branches, rayon extérieur 9,6 / intérieur 4,9, centrée en (12, 12.5).
const STAR_PATH =
  'M12 2.9L14.88 8.54L21.13 9.53L16.66 14.01L17.64 20.27L12 17.4L6.36 20.27L7.34 14.01L2.87 9.53L9.12 8.54Z'
/** Épaisseur du contour arrondissant les pointes (unités du viewBox 24). */
const ROUND = 2.8

export const Star3D = memo(function Star3D({
  size,
  palette,
  gradientId,
}: {
  size: number
  palette: StarPalette
  /** Id unique du dégradé dans l'écran (une rangée → `qstar-i`). */
  gradientId: string
}) {
  const fill = `url(#${gradientId})`
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={palette.light} />
          <Stop offset="60%" stopColor={palette.face} />
          <Stop offset="100%" stopColor={palette.face} />
        </LinearGradient>
      </Defs>
      {/* Épaisseur : même étoile décalée vers le bas, teinte sombre. */}
      <Path
        d={STAR_PATH}
        transform="translate(0, 1)"
        fill={palette.dark}
        stroke={palette.dark}
        strokeWidth={ROUND}
        strokeLinejoin="round"
      />
      {/* Face avant en dégradé. */}
      <Path d={STAR_PATH} fill={fill} stroke={fill} strokeWidth={ROUND} strokeLinejoin="round" />
      {/* Reflet. */}
      <Ellipse
        cx={9.4}
        cy={8.9}
        rx={1.9}
        ry={1.1}
        transform="rotate(-35, 9.4, 8.9)"
        fill="#FFFFFF"
        opacity={0.45}
      />
    </Svg>
  )
})
