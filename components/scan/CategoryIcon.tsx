/**
 * CategoryIcon : icône au trait d'une catégorie L1 du catalogue (recherche
 * produit : grille des catégories + en-tête de catégorie).
 *
 * Icônes découpées dans la planche fournie le 28/09/2026
 * (assets/Image ChatGPT 28 sept. 2026, 23_21_32.png) : 96 x 96 px, traits noirs
 * sur fond transparent, toutes centrées dans le même carré pour garder leurs
 * proportions d'origine. Teintées à l'affichage via `tintColor`.
 *
 * Catégorie inconnue : repli sur l'icône étiquette d'Ionicons.
 */

import { type FC } from 'react'
import { Image, type ImageSourcePropType } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'

const ICONS: Record<string, ImageSourcePropType> = {
  'Bien-être': require('@/assets/icons/categories/bien-etre.png'),
  'Coiffure': require('@/assets/icons/categories/coiffure.png'),
  'Hygiène dentaire': require('@/assets/icons/categories/hygiene-dentaire.png'),
  'Hygiène du corps': require('@/assets/icons/categories/hygiene-corps.png'),
  'Manucure et pédicure': require('@/assets/icons/categories/manucure-pedicure.png'),
  'Maquillage': require('@/assets/icons/categories/maquillage.png'),
  'Parfum': require('@/assets/icons/categories/parfum.png'),
  'Produit solaire': require('@/assets/icons/categories/produit-solaire.png'),
  'Rasage et épilation': require('@/assets/icons/categories/rasage-epilation.png'),
  'Santé': require('@/assets/icons/categories/sante.png'),
  'Soin du corps et visage': require('@/assets/icons/categories/soin-corps-visage.png'),
  'Soin et hygiène bébé': require('@/assets/icons/categories/bebe.png'),
}

interface Props {
  /** Nom d'affichage de la catégorie L1 (ex. « Coiffure »). */
  name: string | null | undefined
  size?: number
  color?: string
}

export const CategoryIcon: FC<Props> = ({ name, size = 22, color = colors.accent }) => {
  const source = name ? ICONS[name] : undefined
  if (!source) return <Ionicons name="pricetag-outline" size={size} color={color} />
  return (
    <Image
      source={source}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  )
}
