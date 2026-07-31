/**
 * OnboardingControls - primitives du questionnaire d'onboarding (refonte
 * « micro-étapes » façon Flowfy : une question par écran, design épuré pastel).
 *
 * Exporte :
 *   - TONES / ToneKey  : palette pastel par bloc (violet=peau, rose=préoc., vert=objectifs).
 *   - SingleSelectStep : choix UNIQUE en grandes cartes pleine largeur (indicateur rond,
 *                        + « Autre » libre).
 *   - MultiSelectStep  : choix MULTIPLE dans les MÊMES grandes cartes (indicateur coche ✓,
 *                        + « Autre » libre optionnel).
 *   - FreeTextStep     : une saisie texte libre seule (préoccupation / objectif « autre »).
 *
 * Les deux pickers partagent la carte `OptionCard` pour un rendu identique :
 * seule l'icône d'état change (rond plein = unique, coche = multiple).
 *
 * Ces composants sont DÉDIÉS au wizard d'onboarding. L'édition du profil
 * (BeautyProfileForm) continue d'utiliser les anciens Step1/2/3 - non touchés.
 */

import { useEffect, useRef, useState, type FC } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Animated, { FadeIn } from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { Reveal } from '@/components/design/Reveal'

// ─── Tons pastel par bloc ───────────────────────────────────────────────────

export type ToneKey = 'violet' | 'rose' | 'vert'

export const TONES: Record<ToneKey, { soft: string; solid: string; text: string }> = {
  violet: { soft: colors.accentSoft, solid: colors.accent, text: colors.accentDeep },
  rose: { soft: colors.roseSoft, solid: colors.rose, text: colors.roseDeep },
  vert: { soft: colors.successSoft, solid: colors.success, text: colors.rating.vert.text },
}

export interface SelectOption {
  key: string
  label: string
}

// ─── Carte d'option commune (choix unique ET multiple) ──────────────────────

const OptionCard: FC<{
  label: string
  selected: boolean
  tone: ToneKey
  multi?: boolean
  onPress: () => void
}> = ({ label, selected, tone, multi = false, onPress }) => {
  const t = TONES[tone]
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {})
        onPress()
      }}
      style={({ pressed }) => [
        styles.card,
        selected
          ? { backgroundColor: t.soft, borderColor: t.solid }
          : { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && styles.cardPressed,
      ]}
    >
      <Text style={[styles.cardLabel, selected && { color: t.text }]}>{label}</Text>
      <View
        style={[
          multi ? styles.checkbox : styles.radio,
          {
            borderColor: selected ? t.solid : colors.gray300,
            backgroundColor: selected && multi ? t.solid : 'transparent',
          },
        ]}
      >
        {selected && multi ? (
          <Ionicons name="checkmark" size={15} color={colors.surface} />
        ) : selected ? (
          <View style={[styles.radioDot, { backgroundColor: t.solid }]} />
        ) : null}
      </View>
    </Pressable>
  )
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
      style={styles.input}
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
  tone: ToneKey
  onPickKey: (key: string) => void
  other?: OtherConfig
  /** Si fourni : avance automatiquement après sélection (non utilisé par défaut). */
  onAdvance?: () => void
}

export const SingleSelectStep: FC<SingleSelectProps> = ({
  options,
  selectedKey,
  tone,
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
    <Reveal stagger={45} style={styles.cardList}>
      {options.map((opt) => (
        <OptionCard
          key={opt.key}
          label={opt.label}
          selected={selectedKey === opt.key}
          tone={tone}
          onPress={() => pick(opt.key)}
        />
      ))}
      {other ? (
        <OptionCard
          key="__other__"
          label="Autre, dis-nous en plus"
          selected={otherOpen}
          tone={tone}
          onPress={toggleOther}
        />
      ) : null}
      {other && otherOpen ? (
        <OtherInput
          value={other.value}
          placeholder={other.placeholder}
          onChange={other.onChange}
        />
      ) : null}
    </Reveal>
  )
}

// ─── MultiSelectStep : choix multiple (MÊMES cartes, indicateur coche) ──────

interface MultiSelectProps {
  options: SelectOption[]
  values: string[]
  tone: ToneKey
  onToggle: (key: string) => void
  other?: OtherConfig
}

export const MultiSelectStep: FC<MultiSelectProps> = ({
  options,
  values,
  tone,
  onToggle,
  other,
}) => {
  const [otherOpen, setOtherOpen] = useState(() => Boolean(other?.value))

  const toggleOther = () => {
    const next = !otherOpen
    setOtherOpen(next)
    other?.onToggle(next)
  }

  return (
    <Reveal stagger={45} style={styles.cardList}>
      {options.map((opt) => (
        <OptionCard
          key={opt.key}
          label={opt.label}
          selected={values.includes(opt.key)}
          tone={tone}
          multi
          onPress={() => onToggle(opt.key)}
        />
      ))}
      {other ? (
        <OptionCard
          key="__other__"
          label="Autre, dis-nous en plus"
          selected={otherOpen}
          tone={tone}
          multi
          onPress={toggleOther}
        />
      ) : null}
      {other && otherOpen ? (
        <OtherInput
          value={other.value}
          placeholder={other.placeholder}
          onChange={other.onChange}
          maxLength={200}
        />
      ) : null}
    </Reveal>
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
    style={styles.textarea}
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
  cardList: {
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
  },
  cardLabel: {
    ...typography.bodyMedium,
    color: colors.ink,
    flex: 1,
    paddingRight: spacing.md,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  textarea: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 120,
    maxHeight: 200,
  },
})
