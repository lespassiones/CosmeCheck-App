/**
 * RestrictionWarning — bandeau d'alerte « ingrédients dans vos restrictions »,
 * port mobile du web (CosmetWiki components/analyse/RestrictionWarning.tsx).
 *
 * Rendu uniquement si `restrictedIngredients` n'est pas vide. Affiche un titre
 * (« N ingrédient(s) dans vos restrictions »), des chips (un par ingrédient,
 * tappables → fiche ingrédient), puis un lien « Gérer mes restrictions ».
 *
 * Carte « glass rose » (fond roseSoft, ring rose) — équivalent du
 * GLASS_CARD_ROSE web.
 */

import { memo, type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius, spacing } from '@/constants/spacing'
import type { AnalyseItem } from '@/lib/analysis/types'

interface Props {
  restrictedIngredients: AnalyseItem[]
  onIngredientPress: (slug: string) => void
  onViewRestrictionsPress: () => void
}

function prettyName(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

const RestrictionWarningBase: FC<Props> = ({
  restrictedIngredients,
  onIngredientPress,
  onViewRestrictionsPress,
}) => {
  if (restrictedIngredients.length === 0) return null

  const count = restrictedIngredients.length

  return (
    <View style={styles.card} accessibilityRole="alert">
      <View style={styles.header}>
        <Ionicons name="shield-half" size={16} color={colors.rating.rouge.text} />
        <Text style={styles.title}>
          {count === 1
            ? '1 ingrédient dans vos restrictions'
            : `${count} ingrédients dans vos restrictions`}
        </Text>
      </View>

      <View style={styles.chips}>
        {restrictedIngredients.map((it) => {
          const label = prettyName(it.translationFr ?? it.name ?? it.input ?? '-')
          const slug = it.slug
          return (
            <Pressable
              key={`${it.position}-${it.input}`}
              onPress={() => slug && onIngredientPress(slug)}
              disabled={!slug}
              accessibilityRole={slug ? 'button' : undefined}
              style={({ pressed }) => [styles.chip, pressed && slug && styles.chipPressed]}
            >
              <Text style={styles.chipText} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Pressable
        onPress={onViewRestrictionsPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.manageLink, pressed && styles.manageLinkPressed]}
      >
        <Text style={styles.manageText}>Gérer mes restrictions</Text>
        <Ionicons name="chevron-forward" size={12} color={colors.rating.rouge.DEFAULT} />
      </Pressable>
    </View>
  )
}

export const RestrictionWarning = memo(RestrictionWarningBase)

/**
 * RestrictionsOkBadge — pendant vert du `RestrictionWarning` : pilule discrète
 * « Aucune restriction détectée — Gérer › » à afficher quand AUCUN ingrédient
 * de l'analyse ne tombe dans les restrictions de l'utilisateur. Tap sur la
 * carte (ou le lien Gérer) → /profile/restrictions ; quand l'utilisateur
 * ajoute une restriction qui matche un ingrédient de l'analyse en cours, le
 * parent bascule naturellement vers `RestrictionWarning`.
 */
export const RestrictionsOkBadge: FC<{ onPress: () => void }> = ({ onPress }) => {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Aucune restriction détectée. Gérer mes restrictions."
      style={({ pressed }) => [okStyles.card, pressed && okStyles.cardPressed]}
    >
      <Ionicons name="shield-checkmark" size={16} color={colors.rating.vert.text} />
      <Text style={okStyles.label} numberOfLines={1}>
        Aucune restriction détectée
      </Text>
      <View style={okStyles.actionRow}>
        <Text style={okStyles.actionText}>Gérer</Text>
        <Ionicons name="chevron-forward" size={13} color={colors.rating.vert.text} />
      </View>
    </Pressable>
  )
}

const okStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.rating.vert.bg,
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.20)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: 10,
  },
  cardPressed: {
    opacity: 0.85,
  },
  label: {
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: colors.rating.vert.text,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.rating.vert.text,
  },
})

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.roseSoft,
    borderWidth: 1,
    borderColor: colors.rating.rouge.bg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: colors.rating.rouge.text,
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
  },
  chip: {
    backgroundColor: colors.glass.bgStrong,
    borderWidth: 1,
    borderColor: colors.rating.rouge.bg,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.rating.rouge.text,
  },
  manageLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  manageLinkPressed: {
    opacity: 0.7,
  },
  manageText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.rating.rouge.DEFAULT,
  },
})
