/**
 * RoutineActionsRow — rangée d'actions sous les sections Matin / Soir :
 *   [ Vérifier les conflits (badge) ]   [ Suggestions (dégradé rose) ]
 *
 * - « Vérifier les conflits » : instantané et gratuit (moteur déterministe
 *   local). Badge = nombre de conflits actionnables (masqué si 0). Rendu
 *   seulement si conflictsEnabled (flag_conflicts).
 * - « Suggestions » : ouvre le chooser (Réorganiser / Alternatives). Rendu si
 *   au moins une des deux actions est disponible.
 *
 * Si un seul bouton est visible, il prend toute la largeur.
 */

import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { gradients } from '@/constants/gradients'

interface Props {
  conflictsEnabled: boolean
  conflictCount: number
  onCheckConflicts: () => void
  suggestionsEnabled: boolean
  onOpenSuggestions: () => void
}

export const RoutineActionsRow = memo(function RoutineActionsRow({
  conflictsEnabled,
  conflictCount,
  onCheckConflicts,
  suggestionsEnabled,
  onOpenSuggestions,
}: Props) {
  if (!conflictsEnabled && !suggestionsEnabled) return null

  return (
    <View style={styles.row}>
      {conflictsEnabled && (
        <Pressable
          style={[styles.btn, styles.conflictsBtn]}
          onPress={onCheckConflicts}
          accessibilityRole="button"
          accessibilityLabel="Vérifier les conflits de ma routine"
        >
          <Ionicons name="shield-half-outline" size={16} color={colors.ink} />
          <Text style={styles.conflictsText} numberOfLines={1}>
            Vérifier les conflits
          </Text>
          {conflictCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{conflictCount}</Text>
            </View>
          )}
        </Pressable>
      )}

      {suggestionsEnabled && (
        <Pressable
          style={styles.btn}
          onPress={onOpenSuggestions}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir les suggestions"
        >
          <LinearGradient
            colors={gradients.roseCta.colors}
            start={gradients.roseCta.start}
            end={gradients.roseCta.end}
            style={styles.gradient}
          >
            <Ionicons name="sparkles" size={16} color="#FFFFFF" />
            <Text style={styles.suggestText} numberOfLines={1}>
              Suggestions
            </Text>
          </LinearGradient>
        </Pressable>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  btn: {
    flex: 1,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  conflictsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  conflictsText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: colors.ink,
    flexShrink: 1,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.rating.orange.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    color: '#FFFFFF',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  suggestText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
})
