/**
 * ScreenHeader — en-tête commun aux onglets (Accueil, Routine, Historique,
 * Promesses). Aligne visuellement les écrans :
 *   - même paddingTop (safe-area + spacing.base)
 *   - titre à gauche (typography.h3) avec ornement optionnel (icône, emoji)
 *   - CreditsPill à droite (visible sur tous les onglets)
 *   - filet hairline (#c5ccd6) qui déborde la marge horizontale
 *   - réserve `paddingRight: 36` pour ne pas écraser le bouton "3 points"
 *     flottant en haut-droite (rendu par le layout des tabs).
 *
 * Le conteneur a `backgroundColor: colors.bg` et `zIndex: 20` pour rester
 * au-dessus du contenu qui défile dessous (effet sticky).
 */

import type { FC, ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { CreditsPill } from '@/components/shared/CreditsPill'

interface Props {
  title: string
  /** Ornement à droite du titre (ex. emoji, icône feuille). */
  titleAdornment?: ReactNode
}

export const ScreenHeader: FC<Props> = ({ title, titleAdornment }) => {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[
        styles.stickyHeader,
        { paddingTop: insets.top + spacing.base },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {titleAdornment}
        </View>
        <View style={styles.creditsWrap}>
          <CreditsPill />
        </View>
      </View>
      <View style={styles.hairline} />
    </View>
  )
}

const styles = StyleSheet.create({
  stickyHeader: {
    paddingHorizontal: spacing.base,
    backgroundColor: colors.bg,
    zIndex: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    // Réserve la place du bouton menu (3 points) flottant en haut-droite.
    paddingRight: 36,
    minHeight: 32,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  title: {
    ...typography.h3,
    color: colors.ink,
    flexShrink: 1,
    // Aligne le glyphe avec la CreditsPill : on supprime l'espace haut/bas
    // que crée `lineHeight: 32` autour d'un fontSize 24.
    lineHeight: 24,
    includeFontPadding: false,
  },
  // Compense visuellement la cap-line du titre : on abaisse la pastille
  // de quelques pixels pour qu'elle s'aligne sur la baseline du texte.
  creditsWrap: {
    marginTop: 6,
  },
  hairline: {
    height: 1,
    backgroundColor: '#c5ccd6',
    marginTop: spacing.md,
    marginHorizontal: -spacing.base,
  },
})
