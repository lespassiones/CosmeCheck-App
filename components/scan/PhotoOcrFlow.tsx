/**
 * PhotoOcrFlow — analyse par photo de l'étiquette (OCR).
 *
 * Twin natif de app/scan/photo (web). Flux mobile :
 *   1. capture : 2 emplacements côte à côte — « Devant » (optionnel, marque +
 *                nom du produit) et « Dos » (obligatoire, liste INCI).
 *   2. process : pour chaque photo : expo-image-manipulator → JPEG max 1600px,
 *                compress 0.85, base64.
 *   3. ocr     : supabase.functions.invoke('ocr-scan', { image_back,
 *                image_front?, mimeType }). L'Edge Function renvoie le texte
 *                de la composition + les métadonnées détectées sur la photo
 *                front (marque, nom produit, type) pour pré-remplir l'analyse.
 *                → onInciReady appelé directement après OCR réussi (pas de step review).
 *
 * Thème sombre (`theme="dark"`) utilisé sur mobile par défaut quand le flow est
 * monté dans le ScanFrame dark.
 *
 * Degrade gracefully si ocr-scan est indéployée / erreur : message clair + repli
 * Manuel, jamais de crash.
 */

import { type FC, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography, fontFamilies } from '@/constants/typography'

interface Props {
  /** Le 3e paramètre brand vient de la détection de la photo "front" (option). */
  onInciReady: (inci: string, productName?: string, brand?: string) => void
  onFallbackToManual: () => void
  disabled?: boolean
  theme?: 'light' | 'dark'
}

type Step = 'capture' | 'processing' | 'error'
type Side = 'front' | 'back'

const MAX_WIDTH = 1600

async function imageToBase64(uri: string): Promise<string | null> {
  const manipulated = await manipulateAsync(
    uri,
    [{ resize: { width: MAX_WIDTH } }],
    { compress: 0.85, format: SaveFormat.JPEG, base64: true },
  )
  return manipulated.base64 ?? null
}

// ─── Palettes ────────────────────────────────────────────────────────────────

interface Palette {
  bg: string
  fg: string
  fgMuted: string
  fgLight: string
  zoneBorder: string
  zoneBg: string
  zoneLabel: string
  zoneHint: string
  ctaBg: string
  ctaText: string
  linkText: string
}

const LIGHT_PALETTE: Palette = {
  bg: 'transparent',
  fg: colors.ink,
  fgMuted: colors.inkMuted,
  fgLight: colors.inkLight,
  zoneBorder: colors.border,
  zoneBg: colors.gray50,
  zoneLabel: colors.ink,
  zoneHint: colors.inkLight,
  ctaBg: colors.rose,
  ctaText: '#FFFFFF',
  linkText: colors.rose,
}

const DARK_PALETTE: Palette = {
  bg: 'transparent',
  fg: '#FFFFFF',
  fgMuted: 'rgba(255,255,255,0.70)',
  fgLight: 'rgba(255,255,255,0.40)',
  zoneBorder: 'rgba(255,255,255,0.30)',
  zoneBg: 'rgba(255,255,255,0.04)',
  zoneLabel: '#FFFFFF',
  zoneHint: 'rgba(255,255,255,0.50)',
  ctaBg: '#FFFFFF',
  ctaText: '#0B0B0F',
  linkText: '#F87171', // rose-400 plus lumineux sur fond sombre
}

export const PhotoOcrFlow: FC<Props> = ({
  onInciReady,
  onFallbackToManual,
  disabled = false,
  theme = 'light',
}) => {
  const palette = theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE
  const styles = useMemo(() => buildStyles(palette), [palette])

  const [step, setStep] = useState<Step>('capture')
  const [frontUri, setFrontUri] = useState<string | null>(null)
  const [backUri, setBackUri] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  /** Envoie les 2 photos (back obligatoire, front optionnelle) à l'Edge Function. */
  const processImages = async () => {
    if (!backUri) {
      setErrorMsg('La photo des ingrédients (au dos) est obligatoire.')
      setStep('error')
      return
    }
    setStep('processing')
    setErrorMsg(null)
    try {
      const [backB64, frontB64] = await Promise.all([
        imageToBase64(backUri),
        frontUri ? imageToBase64(frontUri) : Promise.resolve<string | null>(null),
      ])
      if (!backB64) {
        setErrorMsg('Impossible de préparer l’image. Réessaie.')
        setStep('error')
        return
      }

      const { supabase } = await import('@/lib/supabase/client')
      const { data, error } = await supabase.functions.invoke('ocr-scan', {
        body: {
          image_back: backB64,
          ...(frontB64 ? { image_front: frontB64 } : {}),
          mimeType: 'image/jpeg',
        },
      })
      if (error) {
        setErrorMsg(
          'Reconnaissance de texte indisponible pour le moment. Tu peux coller la liste INCI manuellement.',
        )
        setStep('error')
        return
      }
      const res = data as {
        found?: boolean
        text?: string
        front?: {
          found?: boolean
          productName?: string | null
          brand?: string | null
        } | null
      } | null
      const text = res?.text?.trim() ?? ''
      if (!res?.found || text.length === 0) {
        setErrorMsg(
          'Aucun texte d’ingrédients reconnu. Reprends une photo nette de la liste INCI, ou colle-la manuellement.',
        )
        setStep('error')
        return
      }
      const productName = res.front?.found ? res.front.productName?.trim() || undefined : undefined
      const brand = res.front?.found ? res.front.brand?.trim() || undefined : undefined
      onInciReady(text, productName, brand)
    } catch {
      setErrorMsg('Une erreur est survenue pendant le traitement. Réessaie.')
      setStep('error')
    }
  }

  const captureSide = async (side: Side) => {
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
    if (side === 'front') setFrontUri(uri)
    else setBackUri(uri)
  }

  const pickSide = async (side: Side) => {
    if (disabled) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    })
    if (result.canceled || !result.assets?.[0]) return
    const uri = result.assets[0].uri
    if (side === 'front') setFrontUri(uri)
    else setBackUri(uri)
  }

  const reset = () => {
    setStep('capture')
    setFrontUri(null)
    setBackUri(null)
    setErrorMsg(null)
  }

  // ── Capture (2 emplacements côte à côte) ─────────────────────────────
  if (step === 'capture') {
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Prends <Text style={styles.subtitleStrong}>deux photos</Text> : le
          devant pour identifier le produit, le dos pour lire les ingrédients.
          Les photos ne sont pas stockées.
        </Text>

        <View style={styles.zonesRow}>
          <UploadZone
            label="Devant"
            hint="Nom & marque"
            optional
            uri={frontUri}
            onTake={() => void captureSide('front')}
            onPick={() => void pickSide('front')}
            disabled={disabled}
            palette={palette}
          />
          <UploadZone
            label="Dos"
            hint="Liste INCI"
            uri={backUri}
            onTake={() => void captureSide('back')}
            onPick={() => void pickSide('back')}
            disabled={disabled}
            palette={palette}
          />
        </View>

        <Text style={styles.hint}>
          Le dos est obligatoire. Sans le devant, l'analyse reste possible mais
          on ne pourra pas pré-remplir le nom et la marque automatiquement.
        </Text>

        <Pressable
          style={[styles.cta, !backUri && styles.ctaDisabled]}
          onPress={() => void processImages()}
          disabled={!backUri || disabled}
        >
          <Ionicons name="sparkles" size={18} color={palette.ctaText} />
          <Text style={styles.ctaText}>
            {backUri && frontUri
              ? 'Analyser les deux photos'
              : backUri
                ? 'Analyser (sans la photo de devant)'
                : 'Ajoute au moins la photo du dos'}
          </Text>
        </Pressable>
      </ScrollView>
    )
  }

  // ── Processing ───────────────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <View style={styles.centered}>
        {backUri && <Image source={{ uri: backUri }} style={styles.preview} />}
        <ActivityIndicator size="large" color={palette.linkText} style={{ marginTop: spacing.lg }} />
        <Text style={styles.processingText}>
          {frontUri ? 'Lecture du produit et de la composition…' : 'Lecture de la composition…'}
        </Text>
      </View>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────
  return (
    <View style={styles.centered}>
      <Ionicons name="alert-circle-outline" size={40} color={colors.warning} />
      <Text style={styles.errorText}>{errorMsg}</Text>
      <Pressable style={styles.cta} onPress={reset}>
        <Text style={styles.ctaText}>Reprendre les photos</Text>
      </Pressable>
      <Pressable style={styles.linkBtn} onPress={onFallbackToManual}>
        <Text style={styles.linkText}>Coller la liste INCI</Text>
      </Pressable>
    </View>
  )
}

// ─── Upload zone ────────────────────────────────────────────────────────────

interface ZoneProps {
  label: string
  hint: string
  uri: string | null
  optional?: boolean
  disabled?: boolean
  palette: Palette
  onTake: () => void
  onPick: () => void
}

const UploadZone: FC<ZoneProps> = ({
  label,
  hint,
  uri,
  optional = false,
  disabled = false,
  palette,
  onTake,
  onPick,
}) => {
  const styles = useMemo(() => buildZoneStyles(palette), [palette])
  return (
    <View style={styles.zone}>
      <Pressable
        onPress={onTake}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Prendre la photo ${label}`}
        style={({ pressed }) => [styles.zoneBox, pressed && styles.zonePressed]}
      >
        {uri ? (
          <>
            <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={styles.zoneEditBadge}>
              <Ionicons name="camera" size={11} color="#FFFFFF" />
              <Text style={styles.zoneEditText}>Modifier</Text>
            </View>
          </>
        ) : (
          <>
            <Ionicons name="camera-outline" size={28} color={palette.zoneHint} />
            <Text style={styles.zoneLabel}>{label}</Text>
            <Text style={styles.zoneHint}>{hint}</Text>
            {optional && (
              <View style={styles.zoneOptional}>
                <Text style={styles.zoneOptionalText}>OPTION</Text>
              </View>
            )}
          </>
        )}
      </Pressable>
      <Pressable
        onPress={onPick}
        disabled={disabled}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`Choisir la photo ${label} dans la galerie`}
      >
        <Text style={styles.zonePickText}>
          <Ionicons name="images-outline" size={11} color={palette.fgMuted} /> Galerie
        </Text>
      </Pressable>
    </View>
  )
}

// ─── Styles (palette-aware) ─────────────────────────────────────────────────

function buildStyles(p: Palette) {
  return StyleSheet.create({
    content: { paddingBottom: spacing.xl, alignItems: 'stretch' },
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xl,
      gap: spacing.md,
    },
    subtitle: {
      ...typography.small,
      color: p.fgMuted,
      textAlign: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    subtitleStrong: {
      color: p.fg,
      fontFamily: typography.smallSemiBold.fontFamily,
    },
    zonesRow: { flexDirection: 'row', gap: spacing.md },
    hint: {
      ...typography.xs,
      color: p.fgLight,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: p.ctaBg,
      borderRadius: radius.lg,
      paddingVertical: spacing.base,
      marginTop: spacing.lg,
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: { ...typography.button, color: p.ctaText },
    preview: { width: 160, height: 120, borderRadius: radius.md, resizeMode: 'cover' },
    processingText: { ...typography.small, color: p.fgMuted, marginTop: spacing.sm },
    errorText: {
      ...typography.small,
      color: p.fg,
      textAlign: 'center',
      paddingHorizontal: spacing.lg,
    },
    linkBtn: { paddingVertical: spacing.md, alignItems: 'center' },
    linkText: { ...typography.smallSemiBold, color: p.linkText },
  })
}

function buildZoneStyles(p: Palette) {
  return StyleSheet.create({
    zone: { flex: 1, alignItems: 'center', gap: 4 },
    zoneBox: {
      width: '100%',
      aspectRatio: 3 / 4,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: p.zoneBorder,
      backgroundColor: p.zoneBg,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    zonePressed: { opacity: 0.85 },
    zoneLabel: {
      fontFamily: fontFamilies.semiBold,
      fontSize: 14,
      color: p.zoneLabel,
      marginTop: 6,
    },
    zoneHint: {
      ...typography.caption,
      color: p.zoneHint,
      marginTop: 2,
    },
    zoneOptional: {
      position: 'absolute',
      top: 6,
      right: 6,
      backgroundColor: 'rgba(255,255,255,0.10)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 9999,
    },
    zoneOptionalText: {
      fontSize: 9,
      fontWeight: '700',
      color: p.zoneHint,
      letterSpacing: 0.6,
    },
    zoneEditBadge: {
      position: 'absolute',
      bottom: 6,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(0,0,0,0.65)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 9999,
    },
    zoneEditText: { fontSize: 10, fontWeight: '600', color: '#FFFFFF' },
    zonePickText: { ...typography.caption, color: p.fgMuted, marginTop: 4 },
  })
}
