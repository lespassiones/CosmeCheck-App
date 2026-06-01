/**
 * PhotoOcrFlow — analyse par photo de l'étiquette (OCR).
 *
 * Twin natif de app/scan/photo (web). Flux mobile :
 *   1. capture : prendre une photo (appareil) ou choisir dans la galerie.
 *   2. resize  : expo-image-manipulator → JPEG max 1600px, compress 0.85, base64.
 *   3. ocr     : supabase.functions.invoke('ocr-scan', { image_back, mimeType }).
 *   4. review  : texte reconnu éditable (TextInput) → confirmer → onInciReady('ocr').
 *
 * Degrade gracefully si ocr-scan est indéployée / erreur : message clair + repli
 * Manuel, jamais de crash.
 */

import { type FC, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { parseInciList } from '@/lib/inci/parser'

interface Props {
  onInciReady: (inci: string, productName?: string) => void
  onFallbackToManual: () => void
  disabled?: boolean
}

type Step = 'capture' | 'processing' | 'review' | 'error'

const MAX_WIDTH = 1600

export const PhotoOcrFlow: FC<Props> = ({
  onInciReady,
  onFallbackToManual,
  disabled = false,
}) => {
  const [step, setStep] = useState<Step>('capture')
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  /** Resize + compress + base64 puis envoi OCR. */
  const processImage = async (uri: string) => {
    setStep('processing')
    setErrorMsg(null)
    try {
      const manipulated = await manipulateAsync(
        uri,
        [{ resize: { width: MAX_WIDTH } }],
        { compress: 0.85, format: SaveFormat.JPEG, base64: true },
      )
      const b64 = manipulated.base64
      if (!b64) {
        setErrorMsg('Impossible de préparer l’image. Réessaie.')
        setStep('error')
        return
      }

      const { supabase } = await import('@/lib/supabase/client')
      const { data, error } = await supabase.functions.invoke('ocr-scan', {
        body: { image_back: b64, mimeType: 'image/jpeg' },
      })
      if (error) {
        setErrorMsg(
          'Reconnaissance de texte indisponible pour le moment. Tu peux coller la liste INCI manuellement.',
        )
        setStep('error')
        return
      }
      const res = data as { found?: boolean; text?: string } | null
      const text = res?.text?.trim() ?? ''
      if (!res?.found || text.length === 0) {
        setErrorMsg(
          'Aucun texte d’ingrédients reconnu. Reprends une photo nette de la liste INCI, ou colle-la manuellement.',
        )
        setStep('error')
        return
      }
      setExtractedText(text)
      setStep('review')
    } catch {
      setErrorMsg('Une erreur est survenue pendant le traitement. Réessaie.')
      setStep('error')
    }
  }

  const takePhoto = async () => {
    if (disabled) return
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      setErrorMsg('Accès caméra refusé. Autorise-le dans les réglages, ou choisis une image.')
      setStep('error')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    })
    if (result.canceled || !result.assets?.[0]) return
    const uri = result.assets[0].uri
    setPreviewUri(uri)
    await processImage(uri)
  }

  const pickImage = async () => {
    if (disabled) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    })
    if (result.canceled || !result.assets?.[0]) return
    const uri = result.assets[0].uri
    setPreviewUri(uri)
    await processImage(uri)
  }

  const reset = () => {
    setStep('capture')
    setPreviewUri(null)
    setExtractedText('')
    setErrorMsg(null)
  }

  const tokenCount = parseInciList(extractedText).length
  const canConfirm = extractedText.trim().length >= 10 && !disabled

  // ── Capture ────────────────────────────────────────────────────────
  if (step === 'capture') {
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.illustration}>
          <Ionicons name="document-text-outline" size={48} color={colors.accent} />
        </View>
        <Text style={styles.title}>Photographie la liste INCI</Text>
        <Text style={styles.subtitle}>
          Cadre la ligne qui commence par « Ingredients: » ou « INCI: ». Plus la
          photo est nette, meilleure est la reconnaissance.
        </Text>

        <Pressable style={styles.cta} onPress={() => void takePhoto()} disabled={disabled}>
          <Ionicons name="camera" size={18} color="#FFFFFF" />
          <Text style={styles.ctaText}>Prendre une photo</Text>
        </Pressable>
        <Pressable style={styles.secondaryCta} onPress={() => void pickImage()} disabled={disabled}>
          <Ionicons name="images-outline" size={18} color={colors.ink} />
          <Text style={styles.secondaryCtaText}>Choisir dans la galerie</Text>
        </Pressable>
      </ScrollView>
    )
  }

  // ── Processing ───────────────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <View style={styles.centered}>
        {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
        <ActivityIndicator size="large" color={colors.rose} style={{ marginTop: spacing.lg }} />
        <Text style={styles.processingText}>Lecture de l’étiquette…</Text>
      </View>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.warning} />
        <Text style={styles.errorText}>{errorMsg}</Text>
        <Pressable style={styles.cta} onPress={reset}>
          <Text style={styles.ctaText}>Reprendre une photo</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={onFallbackToManual}>
          <Text style={styles.linkText}>Coller la liste INCI</Text>
        </Pressable>
      </View>
    )
  }

  // ── Review ───────────────────────────────────────────────────────────
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.reviewBadge}>
        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
        <Text style={styles.reviewBadgeText}>Texte reconnu — vérifie-le avant l’analyse</Text>
      </View>

      <View style={styles.inciWrap}>
        <TextInput
          style={styles.inciInput}
          value={extractedText}
          onChangeText={setExtractedText}
          placeholder="Texte des ingrédients…"
          placeholderTextColor={colors.inkLight}
          selectionColor={colors.textSelection}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <Text style={styles.counterOk}>
        {tokenCount} ingrédient{tokenCount > 1 ? 's' : ''} détecté{tokenCount > 1 ? 's' : ''}
      </Text>
      <Text style={styles.tip}>
        Astuce : assure-toi que les ingrédients sont bien séparés par des virgules.
      </Text>

      <Pressable
        style={[styles.cta, !canConfirm && styles.ctaDisabled]}
        disabled={!canConfirm}
        onPress={() => onInciReady(extractedText.trim())}
      >
        <Ionicons name="sparkles" size={18} color="#FFFFFF" />
        <Text style={styles.ctaText}>Analyser</Text>
      </Pressable>
      <Pressable style={styles.linkBtn} onPress={reset}>
        <Text style={styles.linkText}>Reprendre la photo</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, alignItems: 'stretch' },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  illustration: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: radius.card,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { ...typography.h4, color: colors.ink, textAlign: 'center' },
  subtitle: {
    ...typography.small,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.rose,
    borderRadius: radius.lg,
    paddingVertical: spacing.base,
    marginTop: spacing.md,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { ...typography.button, color: '#FFFFFF' },
  secondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.base,
    marginTop: spacing.md,
  },
  secondaryCtaText: { ...typography.button, color: colors.ink },
  preview: { width: 160, height: 120, borderRadius: radius.md, resizeMode: 'cover' },
  processingText: { ...typography.small, color: colors.inkMuted, marginTop: spacing.sm },
  errorText: { ...typography.small, color: colors.ink, textAlign: 'center', paddingHorizontal: spacing.lg },
  reviewBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  reviewBadgeText: { ...typography.xsSemiBold, color: colors.success },
  inciWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  inciInput: {
    ...typography.small,
    color: colors.ink,
    minHeight: 160,
    maxHeight: 300,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    lineHeight: 22,
  },
  counterOk: { ...typography.xsSemiBold, color: colors.success, marginTop: spacing.sm },
  tip: { ...typography.xs, color: colors.inkMuted, marginTop: spacing.xs },
  linkBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  linkText: { ...typography.smallSemiBold, color: colors.rose },
})
