/**
 * CatalogPastille — pastille de score unifiée (catalogue, recherche, alternatives).
 *
 * Source de vérité UNIQUE de la pastille produit : seuils 17/13/9/5 identiques à
 * `verdictToneFromScore` (engine.ts) et couleurs alignées sur VerdictGauge.
 * Priorité au score numérique ; fallback sur `tone` ('green'|'amber'|'orange'|'rose')
 * quand le score est absent.
 *
 * Utilisé par ProductSearchMode (résultats / browse) ET par les recommandations
 * (AlternativesCarousel) → garantit que la pastille est TOUJOURS la même.
 */
import { type FC } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg'

export type PastilleKind = 'heart' | 'leaf' | 'eye' | 'triangle' | 'stop'

interface PastilleSlot {
  bg: string
  iconColor: string
  icon: PastilleKind
}

// Seuils 17/13/9/5 :
//   ≥17 → cœur vert · ≥13 → feuille vert · ≥9 → œil jaune · ≥5 → triangle orange · <5 → stop rouge
export function scoreToSlot(score: number | null | undefined): PastilleSlot | null {
  if (score == null) return null
  if (score >= 17) return { bg: '#34D399', iconColor: '#022C22', icon: 'heart' }
  if (score >= 13) return { bg: '#34D399', iconColor: '#022C22', icon: 'leaf' }
  if (score >= 9) return { bg: '#FBBF24', iconColor: '#451A03', icon: 'eye' }
  if (score >= 5) return { bg: '#F97316', iconColor: '#FFFFFF', icon: 'triangle' }
  return { bg: '#F43F5E', iconColor: '#FFFFFF', icon: 'stop' }
}

export const PastilleIcon: FC<{ kind: PastilleKind; size: number; color: string }> = ({
  kind,
  size,
  color,
}) => {
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
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M11 20A7 7 0 0 1 4 13V8a7 7 0 0 1 7-7h7v6a7 7 0 0 1-7 7h-3" />
          <Path d="M2 21c4-5 7-7 14-9" />
        </Svg>
      )
    case 'eye':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
          <Circle cx={12} cy={12} r={3} />
        </Svg>
      )
    case 'triangle':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <Line x1={12} y1={9} x2={12} y2={13} />
          <Circle cx={12} cy={17} r={0.6} fill={color} />
        </Svg>
      )
    case 'stop':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
          <Line x1={15} y1={9} x2={9} y2={15} />
          <Line x1={9} y1={9} x2={15} y2={15} />
        </Svg>
      )
  }
}

/** Pastille ronde colorée + icône, dérivée UNIQUEMENT du score (source unique ;
 *  on ne lit JAMAIS un score_tone stocké → la même pastille partout). */
export const CatalogPastille: FC<{
  score: number | null | undefined
  /** @deprecated ignoré — la pastille vient du score. Gardé pour compat appelants. */
  tone?: string | null
  size?: number
}> = ({ score, size = 32 }) => {
  const slot = scoreToSlot(score)
  if (!slot) return null
  const icon = Math.round(size * 0.44)
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: slot.bg },
      ]}
    >
      <PastilleIcon kind={slot.icon} size={icon} color={slot.iconColor} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
})
