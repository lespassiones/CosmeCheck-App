/**
 * FrequencySelect — pilule de fréquence (Quotidien / Hebdo / Mensuel) qui ouvre
 * un mini bottom-sheet natif (Modal), à la place de l'ancien dropdown
 * absolument positionné (hack zIndex supprimé : indispensable pour cohabiter
 * avec le drag-reorder des lignes de routine).
 */

import { memo, useCallback, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { RoutineFrequency } from '@/lib/supabase/types'

const FREQ_OPTIONS: { value: RoutineFrequency; label: string; hint: string }[] = [
  { value: 'daily', label: 'Quotidien', hint: 'Tous les jours' },
  { value: 'weekly', label: 'Hebdo', hint: 'Environ 1 fois par semaine' },
  { value: 'monthly', label: 'Mensuel', hint: 'Occasionnel' },
]

interface Props {
  value: RoutineFrequency
  onChange: (value: RoutineFrequency) => void
  /** Nom du produit, pour le titre de la feuille. */
  productName?: string
}

export const FrequencySelect = memo(function FrequencySelect({ value, onChange, productName }: Props) {
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const currentLabel = FREQ_OPTIONS.find((o) => o.value === value)?.label ?? 'Quotidien'

  const select = useCallback(
    (next: RoutineFrequency) => {
      setOpen(false)
      if (next !== value) {
        Haptics.selectionAsync().catch(() => {})
        onChange(next)
      }
    },
    [value, onChange],
  )

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.pill}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`Fréquence : ${currentLabel}`}
      >
        <Text style={styles.pillText}>{currentLabel}</Text>
        <Ionicons name="chevron-down" size={11} color={colors.inkMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {productName ? `Fréquence : ${productName}` : 'Fréquence d’utilisation'}
            </Text>
            {FREQ_OPTIONS.map((opt) => {
              const active = opt.value === value
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => select(opt.value)}
                  style={[styles.option, active && styles.optionActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <View style={styles.optionMain}>
                    <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.optionHint}>{opt.hint}</Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={18} color={colors.rose} />}
                </Pressable>
              )
            })}
          </View>
        </View>
      </Modal>
    </>
  )
})

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.gray50,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  pillText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    color: colors.ink,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray300,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  optionActive: {
    backgroundColor: colors.roseSoft,
  },
  optionMain: { flex: 1 },
  optionLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  optionLabelActive: {
    color: colors.rose,
  },
  optionHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 1,
  },
})
