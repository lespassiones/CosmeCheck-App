/**
 * RoutineProductCard — carte produit de la routine.
 *
 * Layout : [blob] [Nom (flex)] [Fréquence ▼] [🗑️]
 * - Tap sur blob/nom → onPress(analysisId).
 * - Tap sur pill fréquence → dropdown inline (Quotidien / Hebdo / Mensuel).
 * - Tap sur poubelle → onDelete(itemId, name) (confirmation gérée par le parent).
 */

import { memo, useCallback, useState } from 'react'
import { StyleSheet, Text, View, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { RoutineFrequency } from '@/lib/supabase/types'
import { IngredientBlob, type BlobCounts } from '@/components/design/IngredientBlob'

const FREQ_OPTIONS: { value: RoutineFrequency; label: string }[] = [
  { value: 'daily', label: 'Quotidien' },
  { value: 'weekly', label: 'Hebdo' },
  { value: 'monthly', label: 'Mensuel' },
]

interface Props {
  itemId: string
  analysisId: string
  name: string
  counts: BlobCounts | null
  frequency: RoutineFrequency
  onPress: (analysisId: string) => void
  onDelete: (itemId: string, name: string) => void
  onFrequencyChange: (itemId: string, frequency: RoutineFrequency) => void
}

export const RoutineProductCard = memo(function RoutineProductCard({
  itemId,
  analysisId,
  name,
  counts,
  frequency,
  onPress,
  onDelete,
  onFrequencyChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const currentLabel = FREQ_OPTIONS.find((o) => o.value === frequency)?.label ?? 'Quotidien'

  const selectFreq = useCallback(
    (value: RoutineFrequency) => {
      setOpen(false)
      if (value !== frequency) {
        Haptics.selectionAsync().catch(() => {})
        onFrequencyChange(itemId, value)
      }
    },
    [frequency, itemId, onFrequencyChange],
  )

  return (
    // zIndex élevé quand le dropdown est ouvert pour passer au-dessus des cartes suivantes
    <View style={[styles.wrap, open && styles.wrapOpen]}>
      <View style={styles.card}>
        {/* Blob — tap → détail analyse */}
        <Pressable onPress={() => onPress(analysisId)} style={styles.blobWrap}>
          {counts ? (
            <IngredientBlob counts={counts} variant="sm" width={44} />
          ) : (
            <View style={styles.blobPlaceholder}>
              <Ionicons name="flask-outline" size={16} color={colors.inkLight} />
            </View>
          )}
        </Pressable>

        {/* Nom — tap → détail analyse */}
        <Pressable onPress={() => onPress(analysisId)} style={styles.nameWrap}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
        </Pressable>

        {/* Pill fréquence + dropdown */}
        <View style={styles.freqContainer}>
          <Pressable
            onPress={() => setOpen((o) => !o)}
            style={[styles.freqPill, open && styles.freqPillOpen]}
          >
            <Text style={styles.freqPillText}>{currentLabel}</Text>
            <Ionicons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={11}
              color={colors.inkMuted}
            />
          </Pressable>

          {open && (
            <View style={styles.dropdown}>
              {FREQ_OPTIONS.map((opt, i) => {
                const active = opt.value === frequency
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => selectFreq(opt.value)}
                    style={[
                      styles.dropdownItem,
                      i < FREQ_OPTIONS.length - 1 && styles.dropdownItemBorder,
                      active && styles.dropdownItemActive,
                    ]}
                  >
                    <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>
                      {opt.label}
                    </Text>
                    {active && (
                      <Ionicons name="checkmark" size={14} color={colors.rose} />
                    )}
                  </Pressable>
                )
              })}
            </View>
          )}
        </View>

        {/* Poubelle */}
        <Pressable
          onPress={() => onDelete(itemId, name)}
          style={styles.trashBtn}
          hitSlop={8}
          accessibilityLabel={`Retirer ${name}`}
        >
          <Ionicons name="trash-outline" size={18} color={colors.rose} />
        </Pressable>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: {
    zIndex: 1,
  },
  wrapOpen: {
    zIndex: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  blobWrap: {
    width: 44,
    alignItems: 'center',
  },
  blobPlaceholder: {
    width: 44,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameWrap: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  freqContainer: {
    position: 'relative',
  },
  freqPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gray100,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  freqPillOpen: {
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  freqPillText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    color: colors.ink,
  },
  dropdown: {
    position: 'absolute',
    top: 34,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 10,
    minWidth: 120,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  dropdownItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dropdownItemActive: {
    backgroundColor: colors.gray50,
  },
  dropdownItemText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.ink,
  },
  dropdownItemTextActive: {
    fontFamily: fontFamilies.semiBold,
    color: colors.rose,
  },
  trashBtn: {
    padding: 4,
  },
})
