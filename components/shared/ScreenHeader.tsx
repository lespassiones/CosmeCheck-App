/**
 * ScreenHeader — en-tête commun aux onglets (Accueil, Routine, Historique).
 * Aligne visuellement les écrans :
 *   - même paddingTop (safe-area + spacing.base)
 *   - titre à gauche (typography.h3) avec ornement optionnel (icône, emoji)
 *   - CreditsPill à droite, sauf si `right` la remplace (Historique : « Comparer »)
 *   - `below` : bloc optionnel sous le titre (sélecteur d'onglets de l'Historique)
 *   - filet hairline (#c5ccd6) qui déborde la marge horizontale
 *   - plus de place réservée à droite : le bouton menu flottant a disparu avec
 *     le menu latéral (28/09/2026), la CreditsPill se cale au bord.
 *
 * Le conteneur a `backgroundColor: colors.bg` et `zIndex: 20` pour rester
 * au-dessus du contenu qui défile dessous (effet sticky).
 */

import type { FC, ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { CreditsPill } from '@/components/shared/CreditsPill'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'

interface Props {
  title: string
  /** Ornement à droite du titre (ex. emoji, icône feuille). */
  titleAdornment?: ReactNode
  /** Si fourni, affiche un chevron retour à gauche du titre (ex. onglet ouvert
   *  depuis une autre page qui doit pouvoir y revenir). */
  onBack?: () => void
  /** Contenu à droite du titre À LA PLACE de la CreditsPill (ex. « Comparer »
   *  sur l'Historique). */
  right?: ReactNode
  /** Contenu sous la ligne de titre, avant le filet (ex. sélecteur d'onglets),
   *  sticky avec le reste de l'en-tête. */
  below?: ReactNode
  /** Obsolète depuis la suppression du menu latéral (28/09/2026) : ne réserve
   *  plus rien par défaut. Gardé pour compatibilité des appels existants. */
  menuSpace?: boolean
}

export const ScreenHeader: FC<Props> = ({
  title,
  titleAdornment,
  onBack,
  right,
  below,
  menuSpace = false,
}) => {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[
        styles.stickyHeader,
        { paddingTop: insets.top + spacing.base },
      ]}
    >
      <View style={[styles.row, menuSpace && styles.rowWithMenu]}>
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
          {right ?? <CreditsPill />}
        </View>
      </View>
      {below ? <View style={styles.below}>{below}</View> : null}
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
    minHeight: 32,
  },
  // Ancienne réserve pour le bouton menu flottant (`menuSpace`), plus utilisée par défaut.
  rowWithMenu: { paddingRight: 36 },
  below: { marginTop: spacing.md },
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
    // lineHeight 32 (= h3 naturel) : NE PAS resserrer à 24, sinon les jambages
    // (j, g, p, y) sont rognés et le bord de la zone de texte devient visible.
    // L'alignement avec la CreditsPill est assuré par alignItems:'center' de la row.
    lineHeight: 32,
    includeFontPadding: false,
  },
  // Alignée sur le centre du titre via alignItems:'center' (lineHeight 32
  // rétablie) : plus besoin d'abaisser la pastille manuellement.
  creditsWrap: {},
  hairline: {
    height: 1,
    backgroundColor: '#c5ccd6',
    marginTop: spacing.md,
    marginHorizontal: -spacing.base,
  },
})
