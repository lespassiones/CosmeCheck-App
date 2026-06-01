/**
 * Step1Skin — Étape 1 de l'onboarding : « Parlons de ta peau ».
 *
 * Reproduit à l'identique les questions de l'onboarding web :
 *   - Type de peau VISAGE   (SKIN_TYPES_FACE, choix unique) + « Autre » texte libre
 *   - Type de peau CORPS    (SKIN_TYPES_BODY, choix unique) + « Autre » texte libre
 *   - État des cheveux      (HAIR_STATE_CONCERNS, multi-select)
 *
 * Props (pilotées par OnboardingWizard) :
 *   - value:    SkinProfile courant
 *   - onChange: (patch: Partial<SkinProfile>) => void — merge + auto-save débounce
 *
 * DA : chips neumorphiques (NeuCard raised → pressed) ; état sélectionné =
 * fond accentSoft + bordure accent (peau) ou roseSoft + bordure rose (cheveux).
 */

import { useState, type FC } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import * as Haptics from 'expo-haptics'

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
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { Reveal } from '@/components/design/Reveal'

const OTHER = '__other__'

/**
 * Chip neumorphique sélectionnable. `tone` change la couleur de l'état
 * sélectionné : violet (peau / défaut) ou rose (cheveux).
 */
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
      <Text
        style={[
          styles.chipText,
          { color: selected ? selText : colors.ink },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

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

  const hairSelected = value.hairConcerns ?? []

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
    <View style={styles.root}>
      <Reveal stagger={70}>
        {/* ── Visage ───────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ton type de peau (visage)</Text>
          <Text style={styles.sectionHint}>Choisis ce qui te ressemble le plus.</Text>
          <View style={styles.chips}>
            {SKIN_TYPES_FACE.map((key) => (
              <Chip
                key={key}
                label={SKIN_TYPE_FACE_LABEL[key]}
                selected={value.skinTypeFace === key}
                onPress={() => selectFace(key)}
              />
            ))}
            <Chip
              label="Autre"
              selected={faceOtherOpen}
              onPress={() => selectFace(OTHER)}
            />
          </View>
          {faceOtherOpen ? (
            <TextInput
              style={styles.input}
              value={value.otherSkinTypeFace ?? ''}
              onChangeText={(t) => onChange({ otherSkinTypeFace: t })}
              placeholder="Décris ton type de peau du visage"
              placeholderTextColor={colors.inkLight}
              maxLength={120}
            />
          ) : null}
        </View>

        {/* ── Corps ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ton type de peau (corps)</Text>
          <Text style={styles.sectionHint}>Comment se comporte la peau de ton corps ?</Text>
          <View style={styles.chips}>
            {SKIN_TYPES_BODY.map((key) => (
              <Chip
                key={key}
                label={SKIN_TYPE_BODY_LABEL[key]}
                selected={value.skinTypeBody === key}
                onPress={() => selectBody(key)}
              />
            ))}
            <Chip
              label="Autre"
              selected={bodyOtherOpen}
              onPress={() => selectBody(OTHER)}
            />
          </View>
          {bodyOtherOpen ? (
            <TextInput
              style={styles.input}
              value={value.otherSkinTypeBody ?? ''}
              onChangeText={(t) => onChange({ otherSkinTypeBody: t })}
              placeholder="Décris ton type de peau du corps"
              placeholderTextColor={colors.inkLight}
              maxLength={120}
            />
          ) : null}
        </View>

        {/* ── Cheveux (état) ───────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>L&apos;état de tes cheveux</Text>
          <Text style={styles.sectionHint}>
            Plusieurs choix possibles — laisse vide si tu n&apos;es pas concerné·e.
          </Text>
          <View style={styles.chips}>
            {HAIR_STATE_CONCERNS.map((key) => (
              <Chip
                key={key}
                label={HAIR_CONCERN_LABEL[key]}
                selected={hairSelected.includes(key)}
                onPress={() => toggleHair(key)}
                tone="rose"
              />
            ))}
          </View>
        </View>
      </Reveal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  section: {
    marginBottom: spacing['2xl'],
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
    marginTop: spacing.md,
  },
})
