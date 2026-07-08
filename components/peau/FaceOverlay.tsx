/**
 * FaceOverlay — repère de cadrage du visage pour le scan visage.
 *
 * Cercle en pointillés (guide) posé au centre d'un masque sombre semi-opaque
 * découpé en anneau : tout est assombri SAUF le disque central, ce qui invite
 * l'utilisateur à placer son visage dans le cercle. Rendu 100% SVG
 * (react-native-svg), sans état, superposé en absolu sur la CameraView.
 */

import { type FC } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg'

interface Props {
  /** Côté du carré de rendu (défaut : rempli par le parent via absoluteFill). */
  size?: number
}

export const FaceOverlay: FC<Props> = ({ size = 320 }) => {
  const cx = size / 2
  const cy = size / 2
  // Le cercle de cadrage occupe ~78% de la largeur, centré.
  const r = (size * 0.78) / 2
  const circumference = 2 * Math.PI * r

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          {/* Masque : blanc = visible (assombri), noir = trou (transparent). */}
          <Mask id="faceHole">
            <Rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
            <Circle cx={cx} cy={cy} r={r} fill="#000000" />
          </Mask>
        </Defs>

        {/* Voile sombre percé d'un disque au centre. */}
        <Rect
          x={0}
          y={0}
          width={size}
          height={size}
          fill="rgba(0,0,0,0.55)"
          mask="url(#faceHole)"
        />

        {/* Anneau guide en pointillés. */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={3}
          strokeDasharray={`${circumference * 0.02} ${circumference * 0.02}`}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  )
}
