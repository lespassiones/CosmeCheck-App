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
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { CreditsPill } from '@/components/shared/CreditsPill'

interface Props {
  title: string
  /** Ornement à droite du titre (ex. emoji, icône feuille). */
  titleAdornment?: ReactNode
  /** Si fourni, affiche un chevron retour à gauche du titre (ex. onglet ouvert
   *  depuis une autre page qui doit pouvoir y revenir). */
  onBack?: () => void
}

export const ScreenHeader: FC<Props> = ({ title, titleAdornment, onBack }) => {
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
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={12}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>
          ) : null}
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
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
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
