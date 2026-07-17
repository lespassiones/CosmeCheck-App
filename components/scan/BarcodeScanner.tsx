/**
 * BarcodeScanner — scan de code-barres temps réel via expo-camera (CameraView).
 *
 * Twin natif de BarcodeScannerInput (web). Détecte EAN-13/8, UPC-A/E, verrouille
 * après le 1er hit (debounce + haptique), puis invoque l'Edge Function
 * 'product-by-barcode'. Si trouvée → onInciReady(inci, productName, ean). Si la
 * fonction est indéployée / introuvable → message clair + repli Manuel
 * (degrade gracefully, ne crashe jamais).
 *
 * Permissions : useCameraPermissions ; refus → CTA Réglages (Linking.openSettings).
 */

import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useFocusEffect } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import type { BarcodeScanningResult } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { supabase } from '@/lib/supabase/client'
import { ScanPreviewCard, type ScanPreview } from './ScanPreviewCard'
import { ContributeProductSheet } from './ContributeProductSheet'

interface Props {
  /** Appelé quand l'INCI est disponible (produit trouvé). */
  onInciReady: (inci: string, productName?: string, ean?: string, brand?: string) => void
  /** Bascule vers le mode Manuel. */
  onFallbackToManual: () => void
  /** Bascule vers le mode Recherche par nom. */
  onFallbackToSearch: () => void
  /** false = onglet inactif → on suspend le scan (évite scans en arrière-plan). */
  isActive: boolean
  disabled?: boolean
}

// Même garde que le serveur : on rejette tout ce qui n'est pas un EAN/UPC.
const BARCODE_RE = /^\d{8,14}$/

type ScanState =
  | { kind: 'scanning' }
  | { kind: 'looking-up'; barcode: string }
  | { kind: 'preview'; barcode: string; inci: string; name?: string; brand?: string; preview: ScanPreview }
  | { kind: 'not-found'; barcode: string; reason: 'incomplete' | 'registered' }
  | { kind: 'unavailable'; barcode: string }
  | { kind: 'error'; message: string }

export const BarcodeScanner: FC<Props> = ({
  onInciReady,
  onFallbackToManual,
  onFallbackToSearch,
  isActive,
  disabled = false,
}) => {
  const [permission, requestPermission] = useCameraPermissions()
  const [state, setState] = useState<ScanState>({ kind: 'scanning' })
  // EAN pour lequel la modale « Ajouter ce produit » est ouverte (contribution).
  const [contributeEan, setContributeEan] = useState<string | null>(null)
  // Verrou : empêche les détections multiples d'un même cadre.
  const lockedRef = useRef(false)
  // Dernier code scanné + timestamp : évite de re-scanner le MÊME code en boucle
  // juste après le réarmement (le produit est encore dans le cadre).
  const recentRef = useRef<{ code: string; ts: number } | null>(null)
  // Produit actuellement affiché en aperçu : ignoré tant que sa carte est ouverte
  // (mais un AUTRE code-barres est scanné → scan continu, sans relancer).
  const previewedRef = useRef<string | null>(null)
  const onInciReadyRef = useRef(onInciReady)
  useEffect(() => {
    onInciReadyRef.current = onInciReady
  }, [onInciReady])

  // Réarme le scanner à CHAQUE fois que l'écran scan (re)prend le focus.
  // Cas clé : après un scan réussi on navigue vers l'analyse (push). Au retour,
  // le composant est resté monté en état 'looking-up' + verrouillé → sans ça,
  // la caméra reste figée sur « Recherche du produit… ». Le focus le débloque.
  useFocusEffect(
    useCallback(() => {
      lockedRef.current = false
      recentRef.current = null
      previewedRef.current = null
      setState({ kind: 'scanning' })
    }, []),
  )

  // Demande la permission au montage si encore indéterminée.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted])

  const lookup = useCallback(async (barcode: string) => {
    setState({ kind: 'looking-up', barcode })
    try {
      const { data, error } = await supabase.functions.invoke('product-by-barcode', {
        body: { barcode },
      })
      if (error) {
        // Fonction non déployée / erreur réseau → indisponible (degrade).
        setState({ kind: 'unavailable', barcode })
        return
      }
      const hit = data as
        | { found?: boolean; reason?: string; ingredientsText?: string; brand?: string | null; productName?: string | null; preview?: ScanPreview }
        | null
      if (!hit?.found) {
        const reason = hit?.reason === 'incomplete' ? 'incomplete' : 'registered'
        setState({ kind: 'not-found', barcode, reason })
        return
      }
      const inci = hit.ingredientsText?.trim()
      if (!inci || inci.length < 10) {
        setState({ kind: 'not-found', barcode, reason: 'incomplete' })
        return
      }
      // APERÇU INSTANTANÉ : on affiche la carte (haut d'analyse) SANS lancer
      // l'analyse. Le tap « Voir le produit » lancera l'analyse complète.
      const preview: ScanPreview = hit.preview ?? {
        ean: barcode, brand: hit.brand ?? null, name: hit.productName ?? null,
        category: null, score: null, scoreTone: null, scoreLabel: null,
        countOrange: 0, countRouge: 0, imageUrl: null,
      }
      previewedRef.current = barcode
      lockedRef.current = false // scan continu : réarmé pour un AUTRE code-barres
      setState({ kind: 'preview', barcode, inci, name: hit.productName ?? undefined, brand: hit.brand ?? undefined, preview })
    } catch {
      setState({ kind: 'unavailable', barcode })
    }
  }, [])

  const handleScan = useCallback(
    (result: BarcodeScanningResult) => {
      if (lockedRef.current || disabled || !isActive) return
      const value = result.data?.trim() ?? ''
      if (!BARCODE_RE.test(value)) return // ignore QR/URL/IMEI, continue à scanner
      // Scan continu : ignore le produit déjà affiché en aperçu (anti-spam),
      // mais laisse passer un AUTRE code-barres.
      if (previewedRef.current === value) return
      // Anti-doublon : ignore le même code re-détecté dans les 3 s (produit
      // encore dans le cadre juste après un scan).
      const now = Date.now()
      if (recentRef.current && recentRef.current.code === value && now - recentRef.current.ts < 3000) {
        return
      }
      recentRef.current = { code: value, ts: now }
      lockedRef.current = true
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      void lookup(value)
    },
    [disabled, isActive, lookup],
  )

  const resume = useCallback(() => {
    lockedRef.current = false
    previewedRef.current = null
    setState({ kind: 'scanning' })
  }, [])

  // ── Permission refusée → CTA Réglages ──────────────────────────────
  if (permission && !permission.granted && !permission.canAskAgain) {
    return (
      <View style={styles.permWrap}>
        <Ionicons name="camera-outline" size={40} color={colors.inkMuted} />
        <Text style={styles.permTitle}>Accès caméra requis</Text>
        <Text style={styles.permText}>
          Autorise la caméra dans les réglages pour scanner un code-barres.
        </Text>
        <Pressable style={styles.permCta} onPress={() => void Linking.openSettings()}>
          <Text style={styles.permCtaText}>Ouvrir les réglages</Text>
        </Pressable>
        <Pressable onPress={onFallbackToManual} style={styles.linkBtn}>
          <Text style={styles.linkText}>Coller la liste INCI</Text>
        </Pressable>
      </View>
    )
  }

  // Permission non encore résolue.
  if (!permission || (!permission.granted && permission.canAskAgain)) {
    return (
      <View style={styles.permWrap}>
        <ActivityIndicator color={colors.rose} />
        <Text style={styles.permText}>Activation de la caméra…</Text>
        {permission && !permission.granted && (
          <Pressable style={styles.permCta} onPress={() => void requestPermission()}>
            <Text style={styles.permCtaText}>Autoriser la caméra</Text>
          </Pressable>
        )}
      </View>
    )
  }

  // Caméra ON aussi pendant l'aperçu → scan CONTINU (comme INCI Beauty) :
  // la fiche s'affiche par-dessus la caméra, un autre code est scanné direct.
  const showCamera = state.kind === 'scanning' || state.kind === 'looking-up' || state.kind === 'preview'

  return (
    <View style={styles.root}>
      <View style={styles.cameraBox}>
        {isActive && showCamera ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
            }}
            onBarcodeScanned={handleScan}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.cameraOff]} />
        )}

        {/* Viseur */}
        <View style={styles.viewfinder} pointerEvents="none">
          <View style={styles.frame}>
            {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
              <View key={c} style={[styles.corner, styles[`corner_${c}`]]} />
            ))}
          </View>
        </View>

        {/* Overlay lookup */}
        {state.kind === 'looking-up' && (
          <View style={styles.centerPanel}>
            <View style={styles.panelCard}>
              <Text style={styles.panelTitle}>Code détecté</Text>
              <Text style={styles.panelMono}>{state.barcode}</Text>
              <View style={styles.panelRow}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.panelSub}>Recherche du produit…</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      <Text style={styles.hint}>
        Place le code-barres dans le cadre. La caméra scanne en continu.
      </Text>

      {/* Produit non analysable maintenant (inconnu OU connu sans INCI) :
          même message vert + animation rejouée à chaque scan. */}
      {state.kind === 'preview' && (
        <ScanPreviewCard
          preview={state.preview}
          onSeeProduct={() => onInciReadyRef.current(state.inci, state.name, state.barcode, state.brand)}
          onClose={resume}
        />
      )}

      {state.kind === 'not-found' && (
        <Animated.View
          key={state.barcode}
          entering={FadeInDown.duration(400).springify().damping(16)}
          style={styles.registeredBox}
        >
          <View style={styles.registeredHeader}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.registeredText}>
              Ce produit n'est pas encore chez nous. Aide-nous à l'ajouter en 2 photos, on le
              décrypte pour toi et toute la communauté.
            </Text>
          </View>
          <Pressable
            style={[styles.contributeBtn, { marginTop: spacing.md }]}
            onPress={() => setContributeEan(state.barcode)}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
            <Text style={styles.contributeBtnText}>Ajouter ce produit</Text>
          </Pressable>
          <View style={[styles.btnRow, { marginTop: spacing.sm }]}>
            <Pressable style={styles.secondaryBtn} onPress={onFallbackToSearch} hitSlop={8}>
              <Text style={styles.secondaryBtnText}>Rechercher</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={resume} hitSlop={8}>
              <Text style={styles.secondaryBtnText}>Scanner un autre</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      <ContributeProductSheet
        visible={contributeEan !== null}
        ean={contributeEan ?? ''}
        onClose={() => {
          setContributeEan(null)
          resume()
        }}
      />

      {/* Edge Function indisponible (non déployée / erreur) */}
      {state.kind === 'unavailable' && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>Recherche produit indisponible.</Text>
          <Text style={styles.resultSub}>
            Le service de recherche par code-barres n’est pas accessible pour le
            moment. Tu peux coller la liste INCI manuellement.
          </Text>
          <View style={styles.btnRow}>
            <Pressable style={styles.primaryBtn} onPress={onFallbackToManual}>
              <Text style={styles.primaryBtnText}>Coller l’INCI</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={resume}>
              <Text style={styles.secondaryBtnText}>Rescanner</Text>
            </Pressable>
          </View>
        </View>
      )}

      {state.kind === 'error' && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>{state.message}</Text>
          <Pressable style={styles.secondaryBtn} onPress={resume}>
            <Text style={styles.secondaryBtnText}>Réessayer</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Centré verticalement : la caméra est au milieu de l'écran, pas collée en haut.
  root: { flex: 1, justifyContent: 'center' },
  cameraBox: {
    aspectRatio: 4 / 3,
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0A0A0A',
  },
  cameraOff: { backgroundColor: '#0A0A0A' },
  viewfinder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '78%', height: '64%' },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#FDA4AF',
  },
  corner_tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: radius.md },
  corner_tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: radius.md },
  corner_bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: radius.md },
  corner_br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: radius.md },
  centerPanel: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  panelCard: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  panelTitle: { ...typography.smallSemiBold, color: '#FFFFFF' },
  panelMono: { ...typography.xs, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  panelSub: { ...typography.xs, color: 'rgba(255,255,255,0.85)' },
  hint: {
    ...typography.xs,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  resultBox: {
    marginTop: spacing.base,
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
  },
  resultText: { ...typography.smallSemiBold, color: colors.ink },
  resultSub: { ...typography.xs, color: colors.inkMuted, marginTop: spacing.xs },
  registeredBox: {
    marginTop: spacing.base,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.success,
    padding: spacing.base,
  },
  registeredHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  registeredText: { ...typography.smallSemiBold, color: colors.success, flex: 1 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  primaryBtn: {
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  primaryBtnText: { ...typography.buttonSmall, color: '#FFFFFF' },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  secondaryBtnText: { ...typography.buttonSmall, color: colors.ink },
  contributeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.rose,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
  },
  contributeBtnText: { ...typography.buttonSmall, color: '#FFFFFF' },
  permWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing['2xl'], gap: spacing.md },
  permTitle: { ...typography.h4, color: colors.ink },
  permText: { ...typography.small, color: colors.inkMuted, textAlign: 'center', paddingHorizontal: spacing.lg },
  permCta: {
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  permCtaText: { ...typography.button, color: '#FFFFFF' },
  linkBtn: { paddingVertical: spacing.sm },
  linkText: { ...typography.smallSemiBold, color: colors.rose },
})
