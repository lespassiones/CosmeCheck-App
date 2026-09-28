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
import { StyleSheet, TextInput } from 'react-native'

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
import { spacing } from '@/constants/spacing'
import { Reveal } from '@/components/design/Reveal'
import { PackedChips } from '@/components/onboarding/PackedChips'
import { ChoiceChip, FormSection, formInput } from '@/components/profile/ProfileFormKit'

interface Props {
  value: SkinProfile
  onChange: (patch: Partial<SkinProfile>) => void
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
    <Reveal stagger={70} style={styles.root}>
      {/* ── Grille unifiée peau + problèmes cheveux ──────────── */}
      <FormSection
        title="Ce qui te préoccupe"
        hint="Sélectionne tout ce qui te concerne : peau et cheveux."
      >
        <PackedChips>
          {SKIN_CONCERNS.map((key) => (
            <ChoiceChip
              key={key}
              label={SKIN_CONCERN_LABEL[key]}
              selected={concerns.includes(key)}
              onPress={() => toggleConcern(key)}
            />
          ))}
          {HAIR_PROBLEM_CONCERNS.map((key) => (
            <ChoiceChip
              key={key}
              label={HAIR_CONCERN_LABEL[key]}
              selected={hairConcerns.includes(key)}
              onPress={() => toggleHair(key)}
            />
          ))}
        </PackedChips>
      </FormSection>

      {/* ── Allergies connues ────────────────────────────────── */}
      <FormSection
        title="Allergies connues"
        hint="Indique les ingrédients à éviter : ça affine tes analyses."
      >
        <TextInput
          style={formInput.area}
          value={value.allergiesFreeform ?? ''}
          onChangeText={(t) => onChange({ allergiesFreeform: t })}
          placeholder="ex : alcool, parfum, lanoline, noix de coco…"
          placeholderTextColor={colors.inkLight}
          multiline
          maxLength={500}
        />
      </FormSection>

      {/* ── Autre préoccupation ──────────────────────────────── */}
      <FormSection title="Autre préoccupation" hint="Un point pas listé ci-dessus ?">
        <TextInput
          style={formInput.line}
          value={value.otherConcerns ?? ''}
          onChangeText={(t) => onChange({ otherConcerns: t })}
          placeholder="Décris ta préoccupation"
          placeholderTextColor={colors.inkLight}
          maxLength={300}
        />
      </FormSection>
    </Reveal>
  )
}

const styles = StyleSheet.create({
  // Sections à plat, bien espacées (design « Profil beauté »).
  root: { gap: spacing.xl },
})
