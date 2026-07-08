/**
 * TimeOfDaySwitch — sélecteur 3 états du créneau d'application d'un produit
 * de routine : Matin (soleil) / Matin et soir (soleil + lune) / Soir (lune).
 *
 * Axe ORGANISATIONNEL uniquement (voir lib/supabase/types.ts RoutineTimeOfDay) :
 * le changement est optimiste côté hook (useRoutine.setTimeOfDay).
 */

import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { radius } from '@/constants/spacing'
import type { RoutineTimeOfDay } from '@/lib/supabase/types'

interface Props {
  value: RoutineTimeOfDay
  onChange: (value: RoutineTimeOfDay) => void
  disabled?: boolean
}

const OPTIONS: { value: RoutineTimeOfDay; label: string }[] = [
  { value: 'morning', label: 'Matin' },
  { value: 'both', label: 'Matin et soir' },
  { value: 'evening', label: 'Soir' },
]

export const TimeOfDaySwitch = memo(function TimeOfDaySwitch({ value, onChange, disabled }: Props) {
  return (
    <View style={styles.wrap}>
      {OPTIONS.map((opt) => {
        const active = opt.value === value
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (disabled || active) return
              Haptics.selectionAsync().catch(() => {})
              onChange(opt.value)
            }}
            style={[styles.segment, active && styles.segmentActive]}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
          >
            {opt.value === 'both' ? (
              <View style={styles.bothIcons}>
                <Ionicons
                  name={active ? 'sunny' : 'sunny-outline'}
                  size={11}
                  color={active ? colors.rose : colors.inkLight}
                />
                <Ionicons
                  name={active ? 'moon' : 'moon-outline'}
                  size={10}
                  color={active ? colors.rose : colors.inkLight}
                />
              </View>
            ) : (
              <Ionicons
                name={
                  opt.value === 'morning'
                    ? active
                      ? 'sunny'
                      : 'sunny-outline'
                    : active
                      ? 'moon'
                      : 'moon-outline'
                }
                size={14}
                color={active ? colors.rose : colors.inkLight}
              />
            )}
          </Pressable>
        )
      })}
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  segment: {
    minWidth: 34,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  segmentActive: {
    backgroundColor: colors.roseSoft,
    borderColor: colors.rose,
  },
  bothIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
})
