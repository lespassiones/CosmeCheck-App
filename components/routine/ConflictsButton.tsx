/**
 * ConflictsButton — pilule « Vérifier les conflits » de l'onglet routine.
 *
 * Instantané et gratuit (aucun spinner) : le calcul des conflits est
 * déterministe et local. Un badge rond orange affiche le nombre de conflits
 * ACTIONNABLES (severity !== 'info'), masqué à zéro.
 */
import { StyleSheet, Text, View, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'

export interface ConflictsButtonProps {
  count: number
  onPress: () => void
}

export function ConflictsButton({ count, onPress }: ConflictsButtonProps) {
  return (
    <Pressable
      style={styles.btn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        count > 0
          ? `Vérifier les conflits, ${count} à examiner`
          : 'Vérifier les conflits de ta routine'
      }
    >
      <Ionicons name="git-compare-outline" size={16} color="#FFFFFF" />
      <Text style={styles.label} numberOfLines={1}>
        Vérifier les conflits
      </Text>
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: 8,
  },
  label: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    color: '#FFFFFF',
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
  badgeText: { fontFamily: fontFamilies.bold, fontSize: 10, color: '#FFFFFF' },
})
