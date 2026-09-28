/**
 * RoutineProductsCard — carte résumé d'un bucket produits sur l'onglet Routine.
 *
 * N'affiche PAS la liste : elle résume (nombre de produits, et pour la routine
 * soin la répartition matin / soir) et ouvre la page détail au tap (même
 * logique que la carte Exposition). Objectif : épurer l'onglet Routine.
 *
 * Sert les DEUX buckets :
 *   - « Ma routine soin » (showSlots) : chips matin / soir.
 *   - « Produits du quotidien » : simple compte (pas de matin/soir).
 */

import { memo } from 'react'
import { Image, type ImageSourcePropType, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { WhiteCard } from '@/components/design/WhiteCard'

interface Props {
  total: number
  morning: number
  evening: number
  onPress: () => void
  style?: object
  /** Titre de la carte (défaut « Ma routine soin »). */
  title?: string
  /** Icône Ionicons (défaut « sparkles-outline »). */
  icon?: keyof typeof Ionicons.glyphMap
  /** Teinte de l'icône + fond (défaut rose). */
  iconTint?: string
  iconBg?: string
  /** Taille (px) de l'icône Ionicons (défaut 22). */
  iconSize?: number
  /** Image d'icône (line-art). Si fournie, rendue SEULE (pas de bloc coloré),
   *  et prime sur `icon`/`iconBg`. */
  iconImage?: ImageSourcePropType
  /** Taille (px) de l'image d'icône (défaut 44). Au-delà, l'image grossit sans
   *  agrandir la carte (elle déborde dans le padding). */
  iconImageSize?: number
  /** Largeur (px) de la colonne de l'icône, centrée dedans. À donner identique à
   *  des cartes empilées pour aligner leurs titres. */
  leadingWidth?: number
  /** Afficher la répartition matin / soir (défaut true : bucket soin). */
  showSlots?: boolean
  /** Texte quand le bucket est vide. */
  emptyText?: string
}

export const RoutineProductsCard = memo(function RoutineProductsCard({
  total,
  morning,
  evening,
  onPress,
  style,
  title = 'Routine produit',
  icon = 'sparkles-outline',
  iconTint = colors.rose,
  iconBg = colors.roseSoft,
  iconSize = 22,
  iconImage,
  iconImageSize = 44,
  leadingWidth,
  showSlots = true,
  emptyText = 'Ajoute tes soins et organise-les matin / soir',
}: Props) {
  return (
    <WhiteCard onPress={onPress} style={style}>
      <View style={styles.row}>
        <View style={[styles.leading, leadingWidth != null && { width: leadingWidth }]}>
          {iconImage ? (
            <Image
              source={iconImage}
              style={[
                styles.iconImage,
                {
                  width: iconImageSize,
                  height: iconImageSize,
                  // Au-delà de 44 px, l'image déborde dans le padding de la carte au
                  // lieu de l'agrandir : la hauteur de la carte ne bouge pas.
                  marginVertical: -Math.max(0, iconImageSize - ICON_FRAME) / 2,
                },
              ]}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
              <Ionicons name={icon} size={iconSize} color={iconTint} />
            </View>
          )}
        </View>
        <View style={styles.main}>
          <Text style={styles.title}>{title}</Text>
          {total > 0 ? (
            <View style={styles.metaRow}>
              <Text style={styles.count}>
                {total} {total > 1 ? 'produits' : 'produit'}
              </Text>
              {showSlots && (
                <>
                  <View style={styles.slotChip}>
                    <Ionicons name="sunny" size={11} color="#F59E0B" />
                    <Text style={styles.slotText}>{morning}</Text>
                  </View>
                  <View style={styles.slotChip}>
                    <Ionicons name="moon" size={10} color="#6366F1" />
                    <Text style={styles.slotText}>{evening}</Text>
                  </View>
                </>
              )}
            </View>
          ) : (
            <Text style={styles.empty}>{emptyText}</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
      </View>
    </WhiteCard>
  )
})

/** Hauteur de référence de l'icône dans la ligne (la carte est calée dessus). */
const ICON_FRAME = 44

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  leading: { alignItems: 'center', justifyContent: 'center' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Icône image nue (sans bloc/fond coloré). Cadre 44x44 pour un alignement
  // stable quel que soit le ratio de l'image (contain).
  iconImage: { width: 44, height: 44 },
  main: { flex: 1, gap: 4 },
  title: { fontFamily: fontFamilies.semiBold, fontSize: 18, color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.inkMuted },
  slotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.gray100,
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  slotText: { fontFamily: fontFamilies.semiBold, fontSize: 11, color: colors.inkMuted },
  empty: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.inkMuted },
})
