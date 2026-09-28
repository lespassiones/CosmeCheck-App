/**
 * ProfileFormKit — primitives du design « Profil beauté » (28/09/2026).
 *
 * Aéré : sections à plat (pas de carte), titre en gras, aide grise, puces
 * blanches à liseré gris, champs texte blancs à liseré gris. Puce choisie en
 * ROSE de la marque (fond rose pâle, liseré rose, texte rose foncé) : un peu de
 * couleur demandé le 28/09/2026, le tout-noir faisait trop noir et blanc. Partagé par BeautyProfileForm (Step1Skin,
 * Step2Concerns, Step3Goals), /profile/beauty et /profile/objectives.
 */

import { type FC, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'

/** Puce de choix (simple ou multiple) : blanche bordée, rose si choisie. */
export const ChoiceChip: FC<{
  label: string
  selected: boolean
  onPress: () => void
}> = ({ label, selected, onPress }) => (
  <Pressable
    onPress={() => {
      Haptics.selectionAsync().catch(() => {})
      onPress()
    }}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    style={({ pressed }) => [
      kit.chip,
      selected && kit.chipSelected,
      pressed && !selected && kit.chipPressed,
    ]}
  >
    <Text style={[kit.chipText, selected && kit.chipTextSelected]}>{label}</Text>
  </Pressable>
)

/** Section à plat : titre en gras, aide grise optionnelle, puis le contenu. */
export const FormSection: FC<{
  title: string
  hint?: string
  children?: ReactNode
  style?: StyleProp<ViewStyle>
}> = ({ title, hint, children, style }) => (
  <View style={[kit.section, style]}>
    <View>
      <Text style={kit.sectionTitle}>{title}</Text>
      {hint ? <Text style={kit.sectionHint}>{hint}</Text> : null}
    </View>
    {children}
  </View>
)

/** Sous-libellé gris d'un groupe de puces (ex. « Visage », « Corps »). */
export const FormGroupLabel: FC<{ children: string }> = ({ children }) => (
  <Text style={kit.groupLabel}>{children}</Text>
)

/** Bandeau d'information gris avec icône (i). */
export const InfoBanner: FC<{ text: string }> = ({ text }) => (
  <View style={kit.banner}>
    <Ionicons name="information-circle-outline" size={20} color={colors.ink} />
    <Text style={kit.bannerText}>{text}</Text>
  </View>
)

/** Styles des champs texte du design (à étaler sur un TextInput). */
export const formInput = StyleSheet.create({
  /** Champ une ligne, en pilule. */
  line: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: radius.full,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  /** Zone multiligne. */
  area: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: 88,
    maxHeight: 140,
    textAlignVertical: 'top',
  },
})

const kit = StyleSheet.create({
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.gray300,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.roseSoft, borderColor: colors.rose },
  chipPressed: { backgroundColor: colors.gray50 },
  chipText: { fontFamily: fontFamilies.regular, fontSize: 14, color: colors.ink },
  chipTextSelected: { color: colors.roseDeep, fontFamily: fontFamilies.semiBold },
  section: { gap: spacing.md },
  sectionTitle: { fontFamily: fontFamilies.bold, fontSize: 20, color: colors.ink },
  sectionHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkLight,
    marginTop: 2,
  },
  groupLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.inkMuted,
    marginBottom: -spacing.xs,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  bannerText: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 19,
    color: colors.ink,
  },
})
