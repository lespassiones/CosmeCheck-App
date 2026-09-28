/**
 * Pictogrammes des soucis de peau (écrans « Ce qui t'embête » et « La vérité »).
 *
 * Redessinés en vectoriel d'après la planche générée le 28/09/2026 : un trait
 * fin arrondi, teintable (rose quand l'option est choisie, anthracite sinon),
 * net à toutes les densités et sans poids d'image.
 */

import { memo, type FC } from 'react'
import Svg, { Circle, Path } from 'react-native-svg'

import type { ConcernIconKey } from '@/lib/onboarding/content'

interface Props {
  name: ConcernIconKey
  color: string
  size?: number
}

const STROKE = 1.8

export const ConcernIcon: FC<Props> = memo(function ConcernIcon({ name, color, size = 18 }) {
  const common = { stroke: color, strokeWidth: STROKE, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'boutons' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Circle cx={14.5} cy={9.5} r={1.6} fill={color} />
          <Circle cx={9.5} cy={14.5} r={1.3} fill={color} />
        </>
      )}
      {name === 'pores' && (
        <>
          <Path d="M12 9.5c-2.2 2.6-3.5 4.5-3.5 6.2a3.5 3.5 0 0 0 7 0c0-1.7-1.3-3.6-3.5-6.2Z" {...common} />
          <Circle cx={12} cy={4} r={1.1} fill={color} />
          <Circle cx={6.5} cy={8} r={1.1} fill={color} />
          <Circle cx={17.5} cy={8} r={1.1} fill={color} />
        </>
      )}
      {name === 'brillance' && (
        <Path d="M12 3c.8 4.6 2.4 6.2 7 7-4.6.8-6.2 2.4-7 7-.8-4.6-2.4-6.2-7-7 4.6-.8 6.2-2.4 7-7Z" {...common} />
      )}
      {(name === 'rougeurs' || name === 'rides') && (
        <>
          <Path d="M4 8c2-1.6 4-1.6 6 0s4 1.6 6 0 3-1.2 4-.8" {...common} />
          <Path d="M4 12.5c2-1.6 4-1.6 6 0s4 1.6 6 0 3-1.2 4-.8" {...common} />
          <Path d="M4 17c2-1.6 4-1.6 6 0s4 1.6 6 0 3-1.2 4-.8" {...common} />
        </>
      )}
      {name === 'taches' && (
        <>
          <Circle cx={8} cy={8} r={1.7} fill={color} />
          <Circle cx={15.5} cy={7} r={1.4} fill={color} />
          <Circle cx={12} cy={12.5} r={1.8} fill={color} />
          <Circle cx={7} cy={16} r={1.3} fill={color} />
          <Circle cx={16.5} cy={16.5} r={1.6} fill={color} />
        </>
      )}
      {name === 'secheresse' && (
        <Path d="M12 3.5C9 7.4 6.5 10.6 6.5 14a5.5 5.5 0 0 0 11 0c0-3.4-2.5-6.6-5.5-10.5Z" {...common} />
      )}
      {name === 'cernes' && (
        <>
          <Path d="M2.8 12S6.2 6 12 6s9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6Z" {...common} />
          <Circle cx={12} cy={12} r={2.8} {...common} />
        </>
      )}
      {name === 'reactions' && (
        <>
          <Path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1" {...common} />
          <Circle cx={12} cy={12} r={2.4} {...common} />
        </>
      )}
      {name === 'corps' && (
        <>
          <Path d="M8 4c-1 3-1 6 .5 9S9 18 8 20" {...common} />
          <Path d="M16 4c1 3 1 6-.5 9s-.5 5 .5 7" {...common} />
          <Path d="M10.5 9.5l3 1M10.5 13l3 1" {...common} />
        </>
      )}
      {name === 'rien' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Path d="M8 12h8" {...common} />
        </>
      )}
    </Svg>
  )
})

/** Petite étoile à quatre branches (étincelles de Perle). */
export const Sparkle: FC<{ size?: number; color: string; opacity?: number }> = ({
  size = 16,
  color,
  opacity = 1,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
    <Path d="M12 1.5c1 5.8 3.3 8.2 9.5 10.5-6.2 2.3-8.5 4.7-9.5 10.5-1-5.8-3.3-8.2-9.5-10.5C8.7 9.7 11 7.3 12 1.5Z" fill={color} />
  </Svg>
)
