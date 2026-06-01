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
import { CameraView, useCameraPermissions } from 'expo-camera'
import type { BarcodeScanningResult } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { supabase } from '@/lib/supabase/client'

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
  | { kind: 'not-found'; barcode: string }
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
  // Verrou : empêche les détections multiples d'un même cadre.
  const lockedRef = useRef(false)
  const onInciReadyRef = useRef(onInciReady)
  useEffect(() => {
    onInciReadyRef.current = onInciReady
  }, [onInciReady])

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
        | { found?: boolean; ingredientsText?: string; brand?: string | null; productName?: string | null }
        | null
      if (!hit?.found) {
        setState({ kind: 'not-found', barcode })
        return
      }
      const inci = hit.ingredientsText?.trim()
      if (!inci || inci.length < 10) {
        setState({ kind: 'not-found', barcode })
        return
      }
      onInciReadyRef.current(
        inci,
        hit.productName ?? undefined,
        barcode,
        hit.brand ?? undefined,
      )
    } catch {
      setState({ kind: 'unavailable', barcode })
    }
  }, [])

  const handleScan = useCallback(
    (result: BarcodeScanningResult) => {
      if (lockedRef.current || disabled || !isActive) return
      const value = result.data?.trim() ?? ''
      if (!BARCODE_RE.test(value)) return // ignore QR/URL/IMEI, continue à scanner
      lockedRef.current = true
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      void lookup(value)
    },
    [disabled, isActive, lookup],
  )

  const resume = useCallback(() => {
    lockedRef.current = false
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

  const showCamera = state.kind === 'scanning' || state.kind === 'looking-up'

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
            onBarcodeScanned={state.kind === 'scanning' ? handleScan : undefined}
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

      {/* Produit introuvable au catalogue OBF */}
      {state.kind === 'not-found' && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>
            Code-barres {state.barcode} non référencé.
          </Text>
          <Text style={styles.resultSub}>
            Cherche le produit par son nom, ou colle la liste INCI.
          </Text>
          <View style={styles.btnRow}>
            <Pressable style={styles.primaryBtn} onPress={onFallbackToSearch}>
              <Text style={styles.primaryBtnText}>Chercher par nom</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={onFallbackToManual}>
              <Text style={styles.secondaryBtnText}>Coller l’INCI</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={resume}>
              <Text style={styles.secondaryBtnText}>Rescanner</Text>
            </Pressable>
          </View>
        </View>
      )}

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
  root: { flex: 1 },
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
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  primaryBtn: {
    backgroundColor: colors.rose,
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
  permWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing['2xl'], gap: spacing.md },
  permTitle: { ...typography.h4, color: colors.ink },
  permText: { ...typography.small, color: colors.inkMuted, textAlign: 'center', paddingHorizontal: spacing.lg },
  permCta: {
    backgroundColor: colors.rose,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  permCtaText: { ...typography.button, color: '#FFFFFF' },
  linkBtn: { paddingVertical: spacing.sm },
  linkText: { ...typography.smallSemiBold, color: colors.rose },
})
