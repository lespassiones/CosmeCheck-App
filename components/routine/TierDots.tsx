/**
 * TierDots — rangée de 5 pastilles colorées (connotation app), VERT À DROITE :
 * gauche→droite = rouge, orange, jaune, vert clair, vert foncé. Chaque pastille
 * porte sa vraie couleur ; la position du produit est cerclée d'un ANNEAU
 * (2 cercles) sur la pastille active. Pas de chiffre.
 */
import { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

// index = tier (0 = meilleur … 4 = pire)
const TIER_COLORS = ['#059669', '#34D399', '#FBBF24', '#F97316', '#F43F5E'] as const
// Ordre d'affichage gauche → droite : pire → meilleur (vert à droite).
const VISUAL_ORDER = [4, 3, 2, 1, 0] as const

/** Score (0-20, plafonné) → index de tier (0 = meilleur, 4 = pire). */
export function tierIndex(score: number | null | undefined): number {
  if (score == null) return 2
  if (score >= 17) return 0
  if (score >= 13) return 1
  if (score >= 9) return 2
  if (score >= 5) return 3
  return 4
}

export const TierDots: FC<{ score: number | null | undefined }> = ({ score }) => {
  const active = tierIndex(score)
  return (
    <View style={styles.row}>
      {VISUAL_ORDER.map((tier) => {
        const color = TIER_COLORS[tier]
        const isActive = tier === active
        return (
          <View key={tier} style={[styles.ring, isActive && { borderColor: color }]}>
            <View
              style={[
                styles.dot,
                { backgroundColor: color },
                isActive && styles.dotActive,
              ]}
            />
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  // Anneau (2e cercle) : transparent par défaut, coloré quand actif.
  ring: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotActive: { width: 12, height: 12, borderRadius: 6 },
})
