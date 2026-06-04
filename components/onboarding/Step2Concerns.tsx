/**
 * Step2Concerns — Étape 2 de l'onboarding : « Tes préoccupations ».
 *
 * Reproduit à l'identique l'onboarding web : une grille unifiée mélange les
 * préoccupations PEAU (SKIN_CONCERNS → concerns) et les PROBLÈMES de cheveux
 * (HAIR_PROBLEM_CONCERNS → hairConcerns), suivie de deux champs texte libre :
 *   - Allergies connues   → allergiesFreeform
 *   - Autre préoccupation → otherConcerns
 *
 * Multi-select, aucune limite. Cette étape est entièrement optionnelle.
 *
 * IMPORTANT : `hairConcerns` est partagé avec l'étape 1 (état des cheveux).
 * Les toggles d'ici ne touchent QUE les clés HAIR_PROBLEM_CONCERNS et
 * préservent l'état des cheveux saisi à l'étape 1.
 */

import { type FC } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import * as Haptics from 'expo-haptics'

import {
  HAIR_CONCERN_LABEL,
  HAIR_PROBLEM_CONCERNS,
  SKIN_CONCERN_LABEL,
  SKIN_CONCERNS,
  type HairConcern,
  type SkinConcern,
  type SkinProfile,
} from '@/lib/skin/profile'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { Reveal } from '@/components/design/Reveal'
import { WhiteCard } from '@/components/design/WhiteCard'
import { PackedChips } from '@/components/onboarding/PackedChips'

interface Props {
  value: SkinProfile
  onChange: (patch: Partial<SkinProfile>) => void
}

const Chip: FC<{
  label: string
  selected: boolean
  onPress: () => void
  tone?: 'accent' | 'rose'
}> = ({ label, selected, onPress, tone = 'accent' }) => {
  const selBg = tone === 'rose' ? colors.roseSoft : colors.accentSoft
  const selBorder = tone === 'rose' ? colors.rose : colors.accent
  const selText = tone === 'rose' ? colors.roseDeep : colors.accentDeep
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {})
        onPress()
      }}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: selBg, borderColor: selBorder }
          : { backgroundColor: colors.neu.bg, borderColor: 'transparent' },
        pressed && !selected ? { backgroundColor: '#DDE1E7' } : null,
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? selText : colors.ink }]}>
        {label}
      </Text>
    </Pressable>
  )
}

export const Step2Concerns: FC<Props> = ({ value, onChange }) => {
  const concerns = value.concerns ?? []
  const hairConcerns = value.hairConcerns ?? []

  const toggleConcern = (key: SkinConcern) => {
    const set = new Set<SkinConcern>(concerns)
    if (set.has(key)) set.delete(key)
    else set.add(key)
    onChange({ concerns: Array.from(set) })
  }

  const toggleHair = (key: HairConcern) => {
    const set = new Set<HairConcern>(hairConcerns)
    if (set.has(key)) set.delete(key)
    else set.add(key)
    onChange({ hairConcerns: Array.from(set) })
  }

  return (
    <View style={styles.root}>
      <Reveal stagger={70}>
        {/* ── Grille unifiée peau + problèmes cheveux ──────────── */}
        <WhiteCard style={styles.section}>
          <Text style={styles.sectionTitle}>Ce qui te préoccupe</Text>
          <Text style={styles.sectionHint}>
            Sélectionne tout ce qui te concerne : peau et cheveux.
          </Text>
          <PackedChips>
            {SKIN_CONCERNS.map((key) => (
              <Chip
                key={key}
                label={SKIN_CONCERN_LABEL[key]}
                selected={concerns.includes(key)}
                onPress={() => toggleConcern(key)}
              />
            ))}
            {HAIR_PROBLEM_CONCERNS.map((key) => (
              <Chip
                key={key}
                label={HAIR_CONCERN_LABEL[key]}
                selected={hairConcerns.includes(key)}
                onPress={() => toggleHair(key)}
                tone="rose"
              />
            ))}
          </PackedChips>
        </WhiteCard>

        {/* ── Allergies connues ────────────────────────────────── */}
        <WhiteCard style={styles.section}>
          <Text style={styles.sectionTitle}>Allergies connues</Text>
          <Text style={styles.sectionHint}>
            Indique les ingrédients à éviter : ça affine tes analyses.
          </Text>
          <TextInput
            style={styles.textarea}
            value={value.allergiesFreeform ?? ''}
            onChangeText={(t) => onChange({ allergiesFreeform: t })}
            placeholder="ex : alcool, parfum, lanoline, noix de coco…"
            placeholderTextColor={colors.inkLight}
            multiline
            maxLength={500}
          />
        </WhiteCard>

        {/* ── Autre préoccupation ──────────────────────────────── */}
        <WhiteCard style={styles.section}>
          <Text style={styles.sectionTitle}>Autre préoccupation</Text>
          <Text style={styles.sectionHint}>Un point pas listé ci-dessus ?</Text>
          <TextInput
            style={styles.input}
            value={value.otherConcerns ?? ''}
            onChangeText={(t) => onChange({ otherConcerns: t })}
            placeholder="Décris ta préoccupation"
            placeholderTextColor={colors.inkLight}
            maxLength={300}
          />
        </WhiteCard>
      </Reveal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.ink,
  },
  sectionHint: {
    ...typography.xs,
    color: colors.inkMuted,
    marginTop: spacing.xs,
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
  textarea: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 88,
    maxHeight: 140,
    textAlignVertical: 'top',
  },
})
