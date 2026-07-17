/**
 * Star3D — étoile « 3D inclinée » du bloc « Qualité de la formule ».
 * Port du web (CosmetWiki components/AnalyseResultPanel.tsx, Star3DIcon) :
 *   - rotation légère (-8°) pour l'inclinaison,
 *   - tranche d'extrusion sombre décalée bas-droite (l'épaisseur 3D),
 *   - face avant en dégradé (reflet haut-gauche → teinte → ombre bas-droite).
 * Purement présentationnel (props in, pas de fetch).
 */

import { memo } from 'react'
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg'

export type StarPalette = { face: string; dark: string; light: string }

const STAR_PATH =
  'M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.77l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.5z'

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
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={gradientId} x1="20%" y1="0%" x2="65%" y2="100%">
          <Stop offset="0%" stopColor={palette.light} />
          <Stop offset="55%" stopColor={palette.face} />
          <Stop offset="100%" stopColor={palette.dark} />
        </LinearGradient>
      </Defs>
      <G transform="rotate(-8, 12, 12)">
        {/* Épaisseur (extrusion) : même étoile décalée bas-droite, teinte sombre. */}
        <Path d={STAR_PATH} transform="translate(0.5, 1.7)" fill={palette.dark} />
        {/* Face avant en dégradé. */}
        <Path d={STAR_PATH} fill={`url(#${gradientId})`} />
      </G>
    </Svg>
  )
})
