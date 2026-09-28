/**
 * OnboardingControls - sélecteurs de l'édition CIBLÉE du profil
 * (/profile/beauty, ouverte depuis la carte de compatibilité).
 *
 * Exporte :
 *   - SingleSelectStep : choix UNIQUE en puces (+ « Autre » libre).
 *   - MultiSelectStep  : choix MULTIPLE en puces (+ « Autre » libre optionnel).
 *   - FreeTextStep     : une saisie texte libre seule.
 *
 * Design « Profil beauté » (28/09/2026) : puces de ProfileFormKit (blanches
 * bordées, noires si choisies), rangées au mieux par PackedChips.
 */

import { useEffect, useRef, useState, type FC } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { PackedChips } from '@/components/onboarding/PackedChips'
import { ChoiceChip, formInput } from '@/components/profile/ProfileFormKit'

export interface SelectOption {
  key: string
  label: string
}

// ─── Champ « Autre » (texte libre déroulant) ────────────────────────────────

const OtherInput: FC<{
  value?: string
  placeholder: string
  onChange: (text: string) => void
  maxLength?: number
}> = ({ value, placeholder, onChange, maxLength = 120 }) => (
  <Animated.View entering={FadeIn.duration(180)}>
    <TextInput
      style={formInput.line}
      value={value ?? ''}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.inkLight}
      selectionColor={colors.textSelection}
      maxLength={maxLength}
      autoFocus
    />
  </Animated.View>
)

interface OtherConfig {
  value?: string
  placeholder: string
  onToggle: (open: boolean) => void
  onChange: (text: string) => void
}

// ─── SingleSelectStep : choix unique (cartes, indicateur rond) ──────────────

interface SingleSelectProps {
  options: SelectOption[]
  selectedKey?: string
  onPickKey: (key: string) => void
  other?: OtherConfig
  /** Si fourni : avance automatiquement après sélection (non utilisé par défaut). */
  onAdvance?: () => void
}

export const SingleSelectStep: FC<SingleSelectProps> = ({
  options,
  selectedKey,
  onPickKey,
  other,
  onAdvance,
}) => {
  const [otherOpen, setOtherOpen] = useState(() => Boolean(other?.value))
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
    },
    [],
  )

  const pick = (key: string) => {
    const wasSelected = selectedKey === key
    if (otherOpen) {
      setOtherOpen(false)
      other?.onToggle(false)
    }
    onPickKey(key)
    if (!wasSelected && onAdvance) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      advanceTimer.current = setTimeout(onAdvance, 280)
    }
  }

  const toggleOther = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    const next = !otherOpen
    setOtherOpen(next)
    other?.onToggle(next)
  }

  return (
    <View style={styles.stack}>
      <PackedChips>
        {options.map((opt) => (
          <ChoiceChip
            key={opt.key}
            label={opt.label}
            selected={selectedKey === opt.key}
            onPress={() => pick(opt.key)}
          />
        ))}
        {other ? (
          <ChoiceChip key="__other__" label="Autre" selected={otherOpen} onPress={toggleOther} />
        ) : null}
      </PackedChips>
      {other && otherOpen ? (
        <OtherInput value={other.value} placeholder={other.placeholder} onChange={other.onChange} />
      ) : null}
    </View>
  )
}

// ─── MultiSelectStep : choix multiple (mêmes puces) ─────────────────────────

interface MultiSelectProps {
  options: SelectOption[]
  values: string[]
  onToggle: (key: string) => void
  other?: OtherConfig
}

export const MultiSelectStep: FC<MultiSelectProps> = ({ options, values, onToggle, other }) => {
  const [otherOpen, setOtherOpen] = useState(() => Boolean(other?.value))

  const toggleOther = () => {
    const next = !otherOpen
    setOtherOpen(next)
    other?.onToggle(next)
  }

  return (
    <View style={styles.stack}>
      <PackedChips>
        {options.map((opt) => (
          <ChoiceChip
            key={opt.key}
            label={opt.label}
            selected={values.includes(opt.key)}
            onPress={() => onToggle(opt.key)}
          />
        ))}
        {other ? (
          <ChoiceChip key="__other__" label="Autre" selected={otherOpen} onPress={toggleOther} />
        ) : null}
      </PackedChips>
      {other && otherOpen ? (
        <OtherInput
          value={other.value}
          placeholder={other.placeholder}
          onChange={other.onChange}
          maxLength={200}
        />
      ) : null}
    </View>
  )
}

// ─── FreeTextStep : saisie libre seule ──────────────────────────────────────

interface FreeTextProps {
  value?: string
  placeholder: string
  onChange: (text: string) => void
  maxLength?: number
}

export const FreeTextStep: FC<FreeTextProps> = ({
  value,
  placeholder,
  onChange,
  maxLength = 300,
}) => (
  <TextInput
    style={formInput.area}
    value={value ?? ''}
    onChangeText={onChange}
    placeholder={placeholder}
    placeholderTextColor={colors.inkLight}
    selectionColor={colors.textSelection}
    multiline
    maxLength={maxLength}
    textAlignVertical="top"
  />
)

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
})
