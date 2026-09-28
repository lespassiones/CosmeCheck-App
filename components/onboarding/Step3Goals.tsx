/**
 * Step3Goals — Étape 3 de l'onboarding : « Tes objectifs ».
 *
 * Reproduit à l'identique l'onboarding web : les objectifs (PROFILE_GOALS) sont
 * présentés en sections regroupées (PROFILE_GOAL_GROUPS : Visage / Corps /
 * Cheveux / Routine), chips multi-select → goals. Un champ texte libre permet
 * d'ajouter un « Autre objectif » → otherGoals.
 *
 * Utilisé par l'édition du profil (BeautyProfileForm, écran Objectifs).
 */

import { type FC } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'

import {
  PROFILE_GOAL_GROUPS,
  PROFILE_GOAL_LABEL,
  type ProfileGoal,
  type SkinProfile,
} from '@/lib/skin/profile'
import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { Reveal } from '@/components/design/Reveal'
import { PackedChips } from '@/components/onboarding/PackedChips'
import { ChoiceChip, FormGroupLabel, formInput } from '@/components/profile/ProfileFormKit'

interface Props {
  value: SkinProfile
  onChange: (patch: Partial<SkinProfile>) => void
}

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
        Choisis tes objectifs principaux : on personnalisera tes analyses et les
        conseils de ton Beauty Advisor.
      </Text>

      {/* Groupes (Visage / Corps / Cheveux / Routine) : sous-libellé gris + puces. */}
      <Reveal stagger={80} style={styles.groups}>
        {PROFILE_GOAL_GROUPS.map((group) => (
          <View key={group.label} style={styles.group}>
            <FormGroupLabel>{group.label}</FormGroupLabel>
            <PackedChips>
              {group.goals.map((key) => (
                <ChoiceChip
                  key={key}
                  label={PROFILE_GOAL_LABEL[key]}
                  selected={goals.includes(key)}
                  onPress={() => toggleGoal(key)}
                />
              ))}
            </PackedChips>
          </View>
        ))}

        <View style={styles.group}>
          <FormGroupLabel>Autre objectif</FormGroupLabel>
          <TextInput
            style={formInput.line}
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
  root: { gap: spacing.base },
  intro: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkLight,
  },
  groups: { gap: spacing.lg },
  group: { gap: spacing.sm },
})
