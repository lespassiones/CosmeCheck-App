/**
 * Step3Goals — Étape 3 de l'onboarding : « Tes objectifs ».
 *
 * Reproduit à l'identique l'onboarding web : les objectifs (PROFILE_GOALS) sont
 * présentés en sections regroupées (PROFILE_GOAL_GROUPS : Visage / Corps /
 * Cheveux / Routine), chips multi-select → goals. Un champ texte libre permet
 * d'ajouter un « Autre objectif » → otherGoals.
 *
 * La CTA finale « Entrer dans Cosme Check » est gérée par OnboardingWizard.
 */

import { type FC } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import * as Haptics from 'expo-haptics'

import {
  PROFILE_GOAL_GROUPS,
  PROFILE_GOAL_LABEL,
  type ProfileGoal,
  type SkinProfile,
} from '@/lib/skin/profile'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { Reveal } from '@/components/design/Reveal'

interface Props {
  value: SkinProfile
  onChange: (patch: Partial<SkinProfile>) => void
}

const Chip: FC<{
  label: string
  selected: boolean
  onPress: () => void
}> = ({ label, selected, onPress }) => (
  <Pressable
    onPress={() => {
      Haptics.selectionAsync().catch(() => {})
      onPress()
    }}
    style={({ pressed }) => [
      styles.chip,
      selected
        ? { backgroundColor: colors.accentSoft, borderColor: colors.accent }
        : { backgroundColor: colors.neu.bg, borderColor: 'transparent' },
      pressed && !selected ? { backgroundColor: '#DDE1E7' } : null,
    ]}
  >
    <Text
      style={[styles.chipText, { color: selected ? colors.accentDeep : colors.ink }]}
    >
      {label}
    </Text>
  </Pressable>
)

export const Step3Goals: FC<Props> = ({ value, onChange }) => {
  const goals = value.goals ?? []

  const toggleGoal = (key: ProfileGoal) => {
    const set = new Set<ProfileGoal>(goals)
    if (set.has(key)) set.delete(key)
    else set.add(key)
    onChange({ goals: Array.from(set) })
  }

  return (
    <View style={styles.root}>
      <Text style={styles.intro}>
        Choisis tes objectifs principaux — on personnalisera tes analyses et les
        conseils de ton Beauty Advisor.
      </Text>

      <Reveal stagger={80}>
        {PROFILE_GOAL_GROUPS.map((group) => (
          <View key={group.label} style={styles.section}>
            <Text style={styles.sectionTitle}>{group.label}</Text>
            <View style={styles.chips}>
              {group.goals.map((key) => (
                <Chip
                  key={key}
                  label={PROFILE_GOAL_LABEL[key]}
                  selected={goals.includes(key)}
                  onPress={() => toggleGoal(key)}
                />
              ))}
            </View>
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Autre objectif</Text>
          <TextInput
            style={styles.input}
            value={value.otherGoals ?? ''}
            onChangeText={(t) => onChange({ otherGoals: t })}
            placeholder="Un objectif qui n'est pas dans la liste ?"
            placeholderTextColor={colors.inkLight}
            maxLength={300}
          />
        </View>
      </Reveal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  intro: {
    ...typography.body,
    color: colors.inkMuted,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing['2xl'],
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.ink,
    marginBottom: spacing.base,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  chipText: {
    ...typography.smallMedium,
  },
  input: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
})
