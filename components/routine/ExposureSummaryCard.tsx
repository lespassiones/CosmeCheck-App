/**
 * ExposureSummaryCard — carte « Exposition cumulée » (score /20 + label + jauge).
 *
 * Partagée entre l'onglet Routine (carte du haut, cliquable + chevron « > » qui
 * mène à la page détail) et la page détail app/routine/exposition.tsx (rappel du
 * score en tête, sans chevron ni onPress). Un seul rendu → parité garantie.
 */

import { type FC } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { WhiteCard } from '@/components/design/WhiteCard'
import { IngredientBlob, type BlobCounts } from '@/components/design/IngredientBlob'
import type { RoutineMetrics } from '@/lib/routine/engine'

/** Couleur du label/score d'exposition selon le palier. */
export function exposureColor(label: RoutineMetrics['exposureLabel']): string {
  if (label === 'Faible') return colors.rating.vert.text
  if (label === 'Modérée') return colors.rating.jaune.text
  if (label === 'Élevée') return colors.rating.orange.text
  return colors.rating.rouge.text
}

interface Props {
  exposureScore: number
  exposureLabel: RoutineMetrics['exposureLabel']
  colorCounts: BlobCounts
  /**
   * Aucune analyse dans la routine : on n'affiche NI 20/20 (faux « parfait »)
   * NI 0/20 (faux « catastrophe »), mais un état vide neutre invitant à ajouter
   * des produits. Le score n'a de sens qu'à partir d'un produit.
   */
  empty?: boolean
  /** Si fourni, la carte devient cliquable (mène au détail). */
  onPress?: () => void
  /** Affiche le chevron « > » en haut à droite (indique une suite). */
  showChevron?: boolean
  style?: StyleProp<ViewStyle>
}

export const ExposureSummaryCard: FC<Props> = ({
  exposureScore,
  exposureLabel,
  colorCounts,
  empty,
  onPress,
  showChevron,
  style,
}) => {
  const fg = exposureColor(exposureLabel)
  return (
    <WhiteCard padding={spacing.lg} onPress={onPress} style={style}>
      <View style={styles.row}>
        <View style={styles.main}>
          <Text style={styles.label}>EXPOSITION CUMULÉE</Text>
          {empty ? (
            <>
              <View style={styles.scoreLine}>
                <Text style={[styles.scoreBig, { color: colors.inkLight }]}>—</Text>
                <Text style={styles.scoreUnit}>/20</Text>
              </View>
              <Text style={styles.emptyHint}>Ajoute des produits pour la calculer</Text>
            </>
          ) : (
            <>
              <View style={styles.scoreLine}>
                <Text style={[styles.scoreBig, { color: fg }]}>{exposureScore.toFixed(1)}</Text>
                <Text style={styles.scoreUnit}>/20</Text>
              </View>
              <Text style={[styles.exposureLabel, { color: fg }]}>{exposureLabel}</Text>
            </>
          )}
        </View>
        <View style={[styles.blobWrap, empty && styles.blobWrapEmpty]}>
          <IngredientBlob counts={colorCounts} variant="md" width={120} neumorphic />
        </View>
      </View>
      {showChevron && (
        <View style={styles.chevron} pointerEvents="none">
          <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
        </View>
      )}
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  main: { flex: 1 },
  label: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.ink,
    marginBottom: 4,
  },
  scoreLine: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  scoreBig: { fontFamily: fontFamilies.bold, fontSize: 30 },
  scoreUnit: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  exposureLabel: { fontFamily: fontFamilies.semiBold, fontSize: 12, marginTop: 2 },
  emptyHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 2,
  },
  blobWrap: { width: 120 },
  // État vide : le demi-donut ne peut afficher que 4 tranches égales (aucun
  // ingrédient) -> on l'atténue pour qu'il se lise comme un placeholder inactif.
  blobWrapEmpty: { opacity: 0.18 },
  chevron: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
})
