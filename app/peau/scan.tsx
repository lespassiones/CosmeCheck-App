/**
 * FaceScanScreen — scan visage guidé (chantier « Ma peau »).
 *
 * Écran sombre plein écran. Machine à états :
 *   capture   : CameraView caméra frontale + FaceOverlay + chips conseils +
 *               bouton de capture (takePictureAsync).
 *   review    : aperçu de la photo, « Reprendre » ou « Analyser (2 crédits) ».
 *               Pré-check crédits : remaining < 2 -> /offre.
 *   analyzing : redimensionne à 1600px @0.85 JPEG base64 (comme PhotoOcrFlow)
 *               puis invokeFaceAnalyze.
 *   rejected  : gate qualité échoué -> conseils FR + « Aucun crédit utilisé ».
 *   error     : erreur technique -> réessayer.
 *   result    : ScoreRing + 5 mini-jauges par dimension + « Voir ma peau ».
 *
 * Permissions : pattern de components/scan/BarcodeScanner.tsx (useCameraPermissions).
 * Le score de PEAU /100 est autorisé à l'affichage ; aucun tiret cadratin.
 */

import { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { Ionicons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { useCredits } from '@/hooks/useCredits'
import { FaceOverlay } from '@/components/peau/FaceOverlay'
import { ScoreRing } from '@/components/peau/ScoreRing'
import { invokeFaceAnalyze } from '@/lib/skin/api'
import {
  SKIN_DIMENSIONS,
  type DimScores,
  type SkinDimension,
} from '@/lib/skin/score'

const DARK_BG = '#0B0B0F'
const MAX_WIDTH = 1600
const SCAN_COST = 2

/** Libellés FR courts par dimension (jamais de chiffre dans le libellé). */
const DIM_LABELS: Record<SkinDimension, string> = {
  imperfections: 'Imperfections',
  rougeurs: 'Rougeurs',
  secheresse: 'Sécheresse',
  brillance: 'Brillance',
  douceur: 'Douceur',
}

/** Conseils FR par raison de rejet du gate qualité. */
const REASON_ADVICE: Record<string, string> = {
  lunettes: 'Retire tes lunettes',
  trop_sombre: 'Trouve une lumière plus forte',
  flou: 'Stabilise ton téléphone',
  visage_absent: 'Place ton visage dans le cercle',
  cadrage: 'Place ton visage dans le cercle',
  visage_trop_loin: 'Rapproche-toi un peu',
}

type ScanState =
  | { kind: 'capture' }
  | { kind: 'review'; uri: string }
  | { kind: 'analyzing'; uri: string }
  | { kind: 'rejected'; reasons: string[] }
  | { kind: 'error'; message: string }
  | { kind: 'result'; metrics: DimScores; score: number }

/** Redimensionne + encode en JPEG base64 (identique à PhotoOcrFlow.imageToBase64). */
async function imageToBase64(uri: string): Promise<string | null> {
  const manipulated = await manipulateAsync(
    uri,
    [{ resize: { width: MAX_WIDTH } }],
    { compress: 0.85, format: SaveFormat.JPEG, base64: true },
  )
  return manipulated.base64 ?? null
}

/** Ton (couleur) d'une dimension : plus haut = mieux (100 = idéal). */
function toneFor(value: number): string {
  if (value >= 67) return colors.rating.vert.DEFAULT
  if (value >= 34) return colors.rating.jaune.DEFAULT
  return colors.rating.rouge.DEFAULT
}

export default function FaceScanScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { remaining } = useCredits()
  const [permission, requestPermission] = useCameraPermissions()
  const [state, setState] = useState<ScanState>({ kind: 'capture' })
  const cameraRef = useRef<CameraView>(null)
  const capturingRef = useRef(false)

  const close = useCallback(() => router.back(), [router])

  const takePhoto = useCallback(async () => {
    if (capturingRef.current) return
    capturingRef.current = true
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 1, skipProcessing: false })
      if (photo?.uri) setState({ kind: 'review', uri: photo.uri })
    } catch {
      setState({ kind: 'error', message: 'Impossible de prendre la photo. Réessaie.' })
    } finally {
      capturingRef.current = false
    }
  }, [])

  const analyze = useCallback(
    async (uri: string) => {
      // Pré-check crédits côté client : évite un appel voué à un 429.
      if (remaining < SCAN_COST) {
        router.push(ROUTES.OFFRE.INDEX)
        return
      }
      setState({ kind: 'analyzing', uri })
      try {
        const base64 = await imageToBase64(uri)
        if (!base64) {
          setState({ kind: 'error', message: 'Impossible de préparer la photo. Réessaie.' })
          return
        }
        const res = await invokeFaceAnalyze(base64)
        if (!res.quality.ok) {
          setState({ kind: 'rejected', reasons: res.quality.reasons ?? [] })
          return
        }
        if (res.ok && res.metrics) {
          setState({ kind: 'result', metrics: res.metrics, score: res.score ?? 0 })
          return
        }
        setState({ kind: 'error', message: "L'analyse a échoué. Réessaie." })
      } catch {
        setState({ kind: 'error', message: "L'analyse est indisponible pour le moment. Réessaie." })
      }
    },
    [remaining, router],
  )

  const seeMySkin = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['faceScans'] })
    void queryClient.invalidateQueries({ queryKey: ['credits'] })
    router.replace(ROUTES.PEAU.INDEX)
  }, [queryClient, router])

  // ── Header commun (X close) ───────────────────────────────────────────────
  const header = (
    <View style={styles.header}>
      <Pressable onPress={close} hitSlop={12} style={styles.closeBtn} accessibilityRole="button">
        <Ionicons name="close" size={26} color="#FFFFFF" />
      </Pressable>
      <Text style={styles.headerTitle}>Scan visage</Text>
      <View style={styles.closeBtn} />
    </View>
  )

  // ── Permission caméra ─────────────────────────────────────────────────────
  if (permission && !permission.granted && !permission.canAskAgain) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {header}
        <View style={styles.centered}>
          <Ionicons name="camera-outline" size={44} color="rgba(255,255,255,0.6)" />
          <Text style={styles.permTitle}>Accès caméra requis</Text>
          <Text style={styles.permText}>
            Autorise la caméra dans les réglages pour scanner ton visage.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => void Linking.openSettings()}>
            <Text style={styles.primaryBtnText}>Ouvrir les réglages</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  if (!permission || (!permission.granted && permission.canAskAgain)) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.permText}>Activation de la caméra…</Text>
          {permission && !permission.granted && (
            <Pressable style={styles.primaryBtn} onPress={() => void requestPermission()}>
              <Text style={styles.primaryBtnText}>Autoriser la caméra</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {header}

      {/* ── Capture ──────────────────────────────────────────────────────── */}
      {state.kind === 'capture' && (
        <View style={styles.flex}>
          <View style={styles.cameraWrap}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
            <FaceOverlay />
          </View>
          <View style={styles.chipsRow}>
            {['Retire tes lunettes', 'Cheveux en arrière', 'Bonne lumière'].map((c) => (
              <View key={c} style={styles.chip}>
                <Text style={styles.chipText}>{c}</Text>
              </View>
            ))}
          </View>
          <View style={styles.captureBar}>
            <Pressable
              onPress={() => void takePhoto()}
              style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}
              accessibilityRole="button"
              accessibilityLabel="Prendre la photo"
            >
              <View style={styles.shutterInner} />
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Review ───────────────────────────────────────────────────────── */}
      {state.kind === 'review' && (
        <View style={styles.flex}>
          <View style={styles.cameraWrap}>
            <Image source={{ uri: state.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </View>
          <View style={styles.actions}>
            <Pressable
              style={[styles.primaryBtn, styles.fullBtn]}
              onPress={() => void analyze(state.uri)}
            >
              <Ionicons name="sparkles" size={18} color={DARK_BG} />
              <Text style={styles.primaryBtnText}>Analyser ({SCAN_COST} crédits)</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => setState({ kind: 'capture' })}>
              <Text style={styles.ghostBtnText}>Reprendre</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Analyzing ────────────────────────────────────────────────────── */}
      {state.kind === 'analyzing' && (
        <View style={styles.flex}>
          <View style={styles.cameraWrap}>
            <Image source={{ uri: state.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={[StyleSheet.absoluteFill, styles.dim]} />
          </View>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.analyzingText}>Analyse en cours…</Text>
          </View>
        </View>
      )}

      {/* ── Rejected ─────────────────────────────────────────────────────── */}
      {state.kind === 'rejected' && (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.warning} />
          <Text style={styles.resultTitle}>Photo à reprendre</Text>
          <View style={styles.adviceList}>
            {(state.reasons.length > 0 ? state.reasons : ['cadrage']).map((r) => (
              <View key={r} style={styles.adviceRow}>
                <Ionicons name="ellipse" size={6} color="rgba(255,255,255,0.6)" />
                <Text style={styles.adviceText}>{REASON_ADVICE[r] ?? 'Place ton visage dans le cercle'}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.noChargeText}>Aucun crédit utilisé.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => setState({ kind: 'capture' })}>
            <Text style={styles.primaryBtnText}>Réessayer</Text>
          </Pressable>
        </View>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {state.kind === 'error' && (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.warning} />
          <Text style={styles.resultTitle}>Oups</Text>
          <Text style={styles.adviceText}>{state.message}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => setState({ kind: 'capture' })}>
            <Text style={styles.primaryBtnText}>Réessayer</Text>
          </Pressable>
        </View>
      )}

      {/* ── Result ───────────────────────────────────────────────────────── */}
      {state.kind === 'result' && (
        <View style={styles.resultWrap}>
          <View style={styles.ringWrap}>
            <ScoreRing score={state.score} size={140} animated />
          </View>
          <Text style={styles.resultTitle}>Ton score de peau</Text>
          <View style={styles.gauges}>
            {SKIN_DIMENSIONS.map((dim) => {
              const value = state.metrics[dim]
              return (
                <View key={dim} style={styles.gaugeRow}>
                  <Text style={styles.gaugeLabel}>{DIM_LABELS[dim]}</Text>
                  <View style={styles.gaugeTrack}>
                    <View
                      style={[
                        styles.gaugeFill,
                        { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: toneFor(value) },
                      ]}
                    />
                  </View>
                  <Text style={styles.gaugeValue}>{value}</Text>
                </View>
              )
            })}
          </View>
          <Pressable style={[styles.primaryBtn, styles.fullBtn]} onPress={seeMySkin}>
            <Text style={styles.primaryBtnText}>Voir ma peau</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK_BG },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.bodySemiBold, color: '#FFFFFF' },
  cameraWrap: {
    flex: 1,
    margin: spacing.base,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  dim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: { ...typography.xs, color: '#FFFFFF' },
  captureBar: { alignItems: 'center', paddingBottom: spacing.xl, paddingTop: spacing.sm },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: radius.full,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: { opacity: 0.7 },
  shutterInner: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: '#FFFFFF' },
  actions: { paddingHorizontal: spacing.base, paddingBottom: spacing.xl, gap: spacing.md },
  fullBtn: { alignSelf: 'stretch' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.xl,
  },
  primaryBtnText: { ...typography.button, color: DARK_BG },
  ghostBtn: { alignItems: 'center', paddingVertical: spacing.md },
  ghostBtnText: { ...typography.smallSemiBold, color: 'rgba(255,255,255,0.8)' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  analyzingText: { ...typography.small, color: 'rgba(255,255,255,0.85)', marginTop: spacing.sm },
  permTitle: { ...typography.h4, color: '#FFFFFF' },
  permText: { ...typography.small, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  resultTitle: { ...typography.h4, color: '#FFFFFF', textAlign: 'center' },
  adviceList: { gap: spacing.sm, marginVertical: spacing.sm },
  adviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  adviceText: { ...typography.small, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  noChargeText: { ...typography.xsSemiBold, color: colors.rating.vert.DEFAULT, marginTop: spacing.xs },
  resultWrap: { flex: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, justifyContent: 'center', gap: spacing.lg },
  ringWrap: { alignItems: 'center' },
  gauges: { gap: spacing.md },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gaugeLabel: { ...typography.xs, color: 'rgba(255,255,255,0.85)', width: 96 },
  gaugeTrack: {
    flex: 1,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  gaugeFill: { height: '100%', borderRadius: radius.full },
  gaugeValue: { ...typography.xsSemiBold, color: '#FFFFFF', width: 28, textAlign: 'right' },
})
