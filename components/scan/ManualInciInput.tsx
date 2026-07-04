/**
 * ManualInciInput — saisie / collage manuel d'une liste INCI.
 *
 * Twin du mode « Coller la composition » du web ScanSheet. Compte les
 * ingrédients EN TEMPS RÉEL via parseInciList (@/lib/inci/parser) — le même
 * parseur que celui utilisé par l'analyse, donc le compteur reflète exactement
 * ce qui sera analysé.
 *
 * Émet l'INCI via onInciReady(inci, productName?) → le parent (ScanSheet) lance
 * runAnalysis({ source: 'manual' }).
 */

import { type FC, useMemo, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { parseInciList } from '@/lib/inci/parser'

interface Props {
  onInciReady: (inci: string, productName?: string) => void
  initialText?: string
  /** Désactive le bouton pendant une analyse en cours. */
  disabled?: boolean
}

const EXAMPLE_TEXT =
  'Aqua, Glycerin, Niacinamide, Sodium Hyaluronate, Panthenol, Allantoin, Tocopherol, Citric Acid, Sodium Benzoate, Potassium Sorbate'

const MIN_LEN = 10

export const ManualInciInput: FC<Props> = ({
  onInciReady,
  initialText = '',
  disabled = false,
}) => {
  const [inciText, setInciText] = useState(initialText)
  const [productName, setProductName] = useState('')
  const [showExample, setShowExample] = useState(false)

  // Compte d'ingrédients via le VRAI parseur (cohérent avec l'analyse).
  const tokenCount = useMemo(() => parseInciList(inciText).length, [inciText])
  const charCount = inciText.length
  const trimmed = inciText.trim()
  const canAnalyse = trimmed.length >= MIN_LEN && !disabled

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Nom du produit (optionnel) */}
      <Text style={styles.label}>Nom du produit (optionnel)</Text>
      <TextInput
        style={styles.nameInput}
        value={productName}
        onChangeText={(t) => setProductName(t.slice(0, 200))}
        placeholder="Ex : CeraVe Foaming Cleanser"
        placeholderTextColor={colors.inkLight}
        selectionColor={colors.textSelection}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="next"
      />

      {/* Zone INCI */}
      <View style={styles.inciLabelRow}>
        <Text style={styles.label}>Liste INCI</Text>
        {inciText.length > 0 && (
          <Pressable onPress={() => setInciText('')} hitSlop={8}>
            <Text style={styles.clear}>Effacer</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.inciWrap}>
        <TextInput
          style={styles.inciInput}
          value={inciText}
          onChangeText={setInciText}
          placeholder={
            'Colle la liste d’ingrédients telle qu’elle apparaît sur l’emballage.\n\nEx : Aqua, Glycerin, Niacinamide…'
          }
          placeholderTextColor={colors.inkLight}
          selectionColor={colors.textSelection}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Compteur live */}
      <View style={styles.counterRow}>
        {trimmed.length === 0 ? (
          <Text style={styles.counterHint}>
            La liste commence souvent par « Aqua » ou « Water ».
          </Text>
        ) : tokenCount > 0 ? (
          <Text style={styles.counterOk}>
            {tokenCount} ingrédient{tokenCount > 1 ? 's' : ''} détecté
            {tokenCount > 1 ? 's' : ''}
          </Text>
        ) : (
          <Text style={styles.counterWarn}>
            Aucun ingrédient détecté — vérifie le format
          </Text>
        )}
        <Text style={styles.charCount}>{charCount} car.</Text>
      </View>

      {/* Exemple repliable */}
      <Pressable
        style={styles.exampleToggle}
        onPress={() => setShowExample((v) => !v)}
        hitSlop={6}
      >
        <Ionicons
          name={showExample ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={colors.inkMuted}
        />
        <Text style={styles.exampleToggleText}>Voir un exemple de format</Text>
      </Pressable>
      {showExample && (
        <Pressable
          style={styles.exampleBox}
          onPress={() => setInciText(EXAMPLE_TEXT)}
        >
          <Text style={styles.exampleText}>{EXAMPLE_TEXT}</Text>
          <Text style={styles.exampleTap}>Toucher pour utiliser cet exemple</Text>
        </Pressable>
      )}

      {/* Bouton Analyser */}
      <Pressable
        style={[styles.cta, !canAnalyse && styles.ctaDisabled]}
        disabled={!canAnalyse}
        onPress={() => {
          const name = productName.trim() || undefined
          setInciText('')
          setProductName('')
          onInciReady(trimmed, name)
        }}
      >
        <Ionicons name="sparkles" size={18} color="#FFFFFF" />
        <Text style={styles.ctaText}>Analyser</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, gap: spacing.xs },
  label: { ...typography.smallSemiBold, color: colors.ink, marginBottom: spacing.xs },
  nameInput: {
    ...typography.small,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.base,
  },
  inciLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clear: { ...typography.xsSemiBold, color: colors.rose },
  inciWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  inciInput: {
    ...typography.small,
    color: colors.ink,
    minHeight: 140,
    maxHeight: 260,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    lineHeight: 22,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  counterHint: { ...typography.xs, color: colors.inkMuted, flex: 1 },
  counterOk: { ...typography.xsSemiBold, color: colors.success, flex: 1 },
  counterWarn: { ...typography.xsSemiBold, color: colors.warning, flex: 1 },
  charCount: { ...typography.xs, color: colors.inkLight },
  exampleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  exampleToggleText: { ...typography.xs, color: colors.inkMuted },
  exampleBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  exampleText: { ...typography.xs, color: colors.inkMuted, lineHeight: 18 },
  exampleTap: { ...typography.caption, color: colors.accent, marginTop: spacing.sm },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    paddingVertical: spacing.base,
    marginTop: spacing.lg,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { ...typography.button, color: '#FFFFFF' },
})
