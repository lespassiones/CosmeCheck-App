/**
 * Step1Skin — Étape 1 de l'onboarding : « Parlons de ta peau ».
 *
 * Reproduit à l'identique les questions de l'onboarding web :
 *   - Type de peau VISAGE   (SKIN_TYPES_FACE, choix unique) + « Autre » texte libre
 *   - Type de peau CORPS    (SKIN_TYPES_BODY, choix unique) + « Autre » texte libre
 *   - État des cheveux      (HAIR_STATE_CONCERNS, multi-select)
 *
 * Props (pilotées par BeautyProfileForm) :
 *   - value:    SkinProfile courant
 *   - onChange: (patch: Partial<SkinProfile>) => void — merge + auto-save débounce
 *
 * DA (28/09/2026) : design « Profil beauté » de ProfileFormKit (sections à
 * plat, puces blanches bordées, puce choisie en noir).
 */

import { useState, type FC } from 'react'
import { StyleSheet, TextInput } from 'react-native'

import {
  HAIR_CONCERN_LABEL,
  HAIR_STATE_CONCERNS,
  SKIN_TYPE_BODY_LABEL,
  SKIN_TYPE_FACE_LABEL,
  SKIN_TYPES_BODY,
  SKIN_TYPES_FACE,
  type HairConcern,
  type SkinProfile,
  type SkinTypeBody,
  type SkinTypeFace,
} from '@/lib/skin/profile'
import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { Reveal } from '@/components/design/Reveal'
import { PackedChips } from '@/components/onboarding/PackedChips'
import { ChoiceChip, FormSection, formInput } from '@/components/profile/ProfileFormKit'

const OTHER = '__other__'

interface Props {
  value: SkinProfile
  onChange: (patch: Partial<SkinProfile>) => void
}

export const Step1Skin: FC<Props> = ({ value, onChange }) => {
  // « Autre » est actif si un texte libre est déjà présent.
  const [faceOtherOpen, setFaceOtherOpen] = useState(
    () => Boolean(value.otherSkinTypeFace),
  )
  const [bodyOtherOpen, setBodyOtherOpen] = useState(
    () => Boolean(value.otherSkinTypeBody),
  )
  const [hairOtherOpen, setHairOtherOpen] = useState(
    () => Boolean(value.otherHair),
  )

  const hairSelected = value.hairConcerns ?? []

  const toggleHairOther = () => {
    const next = !hairOtherOpen
    setHairOtherOpen(next)
    // Refermer « Autre » vide le texte libre associé.
    if (!next) onChange({ otherHair: undefined })
  }

  const toggleHair = (key: HairConcern) => {
    const set = new Set<HairConcern>(hairSelected)
    if (set.has(key)) set.delete(key)
    else set.add(key)
    onChange({ hairConcerns: Array.from(set) })
  }

  const selectFace = (key: SkinTypeFace | typeof OTHER) => {
    if (key === OTHER) {
      const next = !faceOtherOpen
      setFaceOtherOpen(next)
      // Choisir « Autre » désélectionne le type prédéfini ; le refermer vide le texte.
      onChange(
        next
          ? { skinTypeFace: undefined }
          : { otherSkinTypeFace: undefined },
      )
      return
    }
    const isSame = value.skinTypeFace === key
    setFaceOtherOpen(false)
    onChange({
      skinTypeFace: isSame ? undefined : key,
      otherSkinTypeFace: undefined,
    })
  }

  const selectBody = (key: SkinTypeBody | typeof OTHER) => {
    if (key === OTHER) {
      const next = !bodyOtherOpen
      setBodyOtherOpen(next)
      onChange(
        next
          ? { skinTypeBody: undefined }
          : { otherSkinTypeBody: undefined },
      )
      return
    }
    const isSame = value.skinTypeBody === key
    setBodyOtherOpen(false)
    onChange({
      skinTypeBody: isSame ? undefined : key,
      otherSkinTypeBody: undefined,
    })
  }

  return (
    <Reveal stagger={70} style={styles.root}>
      {/* ── Visage ───────────────────────────────────────────── */}
      <FormSection title="Ton type de peau (visage)" hint="Choisis ce qui te ressemble le plus.">
        <PackedChips>
          {SKIN_TYPES_FACE.map((key) => (
            <ChoiceChip
              key={key}
              label={SKIN_TYPE_FACE_LABEL[key]}
              selected={value.skinTypeFace === key}
              onPress={() => selectFace(key)}
            />
          ))}
          <ChoiceChip
            key="__other__"
            label="Autre"
            selected={faceOtherOpen}
            onPress={() => selectFace(OTHER)}
          />
        </PackedChips>
        {faceOtherOpen ? (
          <TextInput
            style={formInput.line}
            value={value.otherSkinTypeFace ?? ''}
            onChangeText={(t) => onChange({ otherSkinTypeFace: t })}
            placeholder="Décris ton type de peau du visage"
            placeholderTextColor={colors.inkLight}
            maxLength={120}
          />
        ) : null}
      </FormSection>

      {/* ── Corps ────────────────────────────────────────────── */}
      <FormSection title="Ton type de peau (corps)" hint="Comment se comporte la peau de ton corps ?">
        <PackedChips>
          {SKIN_TYPES_BODY.map((key) => (
            <ChoiceChip
              key={key}
              label={SKIN_TYPE_BODY_LABEL[key]}
              selected={value.skinTypeBody === key}
              onPress={() => selectBody(key)}
            />
          ))}
          <ChoiceChip
            key="__other__"
            label="Autre"
            selected={bodyOtherOpen}
            onPress={() => selectBody(OTHER)}
          />
        </PackedChips>
        {bodyOtherOpen ? (
          <TextInput
            style={formInput.line}
            value={value.otherSkinTypeBody ?? ''}
            onChangeText={(t) => onChange({ otherSkinTypeBody: t })}
            placeholder="Décris ton type de peau du corps"
            placeholderTextColor={colors.inkLight}
            maxLength={120}
          />
        ) : null}
      </FormSection>

      {/* ── Cheveux (état) ───────────────────────────────────── */}
      <FormSection
        title="L'état de tes cheveux"
        hint="Plusieurs choix possibles, laisse vide si tu n'es pas concerné·e."
      >
        <PackedChips>
          {HAIR_STATE_CONCERNS.map((key) => (
            <ChoiceChip
              key={key}
              label={HAIR_CONCERN_LABEL[key]}
              selected={hairSelected.includes(key)}
              onPress={() => toggleHair(key)}
            />
          ))}
          <ChoiceChip
            key="__other__"
            label="Autre"
            selected={hairOtherOpen}
            onPress={toggleHairOther}
          />
        </PackedChips>
        {hairOtherOpen ? (
          <TextInput
            style={formInput.line}
            value={value.otherHair ?? ''}
            onChangeText={(t) => onChange({ otherHair: t })}
            placeholder="Décris l'état de tes cheveux"
            placeholderTextColor={colors.inkLight}
            maxLength={200}
          />
        ) : null}
      </FormSection>
    </Reveal>
  )
}

const styles = StyleSheet.create({
  // Sections à plat, bien espacées (design « Profil beauté »).
  root: { gap: spacing.xl },
})
