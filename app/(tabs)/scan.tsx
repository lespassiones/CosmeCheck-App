/**
 * ScanScreen — onglet « Décode un produit ».
 *
 * Plus de barre de tabs : le `mode` reçu en query route DIRECTEMENT vers la
 * bonne UI plein écran (modal-like). Le picker `ScanMethodSheet` (ouvert par
 * le FAB Décode) navigue ici avec `?mode=barcode|photo|link|manual|search`.
 *
 *   - barcode → BarcodeScanner (caméra full screen avec visu cadrage)
 *   - photo   → PhotoOcrFlow (thème sombre, ScanFrame dark)
 *   - link    → PasteLinkFlow dans ScanFrame light
 *   - manual  → ManualInciInput dans ScanFrame light
 *   - search  → ProductSearchMode dans ScanFrame light (catégories + recherche)
 *
 * Sans `mode` → écran de landing minimal qui invite à ouvrir le picker.
 *
 * L'analyse (Edge Function `analyser`) est lancée depuis ici via le hook
 * `useAnalysis`, puis `router.replace(/analyse/[id])` envoie l'utilisateur sur
 * la fiche. ProcessingOverlay est rendu globalement pendant l'analyse.
 */

import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { useAnalysis } from '@/hooks/useAnalysis'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import type { RunAnalysisParams } from '@/lib/analysis/analyser'
import { cacheProductImage } from '@/lib/storage/productImageCache'
import { clearPendingInci, getPendingInci } from '@/lib/storage/session'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { ProcessingOverlay } from '@/components/shared/ProcessingOverlay'
import { ScanFrame } from '@/components/scan/ScanFrame'
import { BarcodeScanner } from '@/components/scan/BarcodeScanner'
import { ManualInciInput } from '@/components/scan/ManualInciInput'
import { PasteLinkFlow } from '@/components/scan/PasteLinkFlow'
import { PhotoOcrFlow } from '@/components/scan/PhotoOcrFlow'
import { ProductSearchMode } from '@/components/scan/ProductSearchMode'

type Mode = 'barcode' | 'photo' | 'link' | 'manual' | 'search' | null

function normalizeMode(raw: string | undefined | null): Mode {
  switch (raw) {
    case 'barcode':
    case 'photo':
    case 'link':
    case 'manual':
    case 'search':
      return raw
    default:
      return null
  }
}

const ScanScreen: FC = () => {
  const router = useRouter()
  const params = useLocalSearchParams<{ mode?: string }>()
  const mode = useMemo(() => normalizeMode(params.mode), [params.mode])

  const { user } = useAuth()
  const { restrictions } = useProfile()
  const { runAnalysis, isAnalyzing, error } = useAnalysis()

  const lastParamsRef = useRef<RunAnalysisParams | null>(null)
  const [failed, setFailed] = useState(false)

  /** Lance l'analyse Edge Function puis navigue vers /analyse/[id]. */
  const launch = useCallback(
    async (
      source: RunAnalysisParams['source'],
      inci: string,
      extra?: {
        productName?: string
        brand?: string
        barcode?: string
        sourceUrl?: string
        /** URL d'image produit (catalogue/OBF/web). Cachée client-side car le
         *  schéma `analyses` n'a pas de colonne dédiée. */
        imageUrl?: string
      },
    ) => {
      const userId = user?.id
      if (!userId) {
        setFailed(true)
        return
      }
      const p: RunAnalysisParams = {
        inciInput: inci,
        source,
        userId,
        userRestrictions: restrictions,
        productName: extra?.productName,
        brand: extra?.brand,
        barcode: extra?.barcode,
        sourceUrl: extra?.sourceUrl,
      }
      lastParamsRef.current = p
      setFailed(false)
      const result = await runAnalysis(p)
      if (result) {
        // Cache l'URL image keyed par l'analysisId (best-effort, async).
        if (extra?.imageUrl) {
          void cacheProductImage(result.analysisId, extra.imageUrl).catch(() => {})
        }
        router.push(ROUTES.ANALYSE.DETAIL(result.analysisId))
      } else {
        setFailed(true)
      }
    },
    [user?.id, restrictions, runAnalysis, router],
  )

  // ── Reprise d'une analyse interrompue (crash / échec réseau) ────────────
  // Le pending est posé avant chaque analyse et purgé au succès ; s'il subsiste
  // sur le landing, c'est qu'une analyse a échoué → on propose de la relancer.
  const [pending, setPending] = useState<{
    inci: string
    source: RunAnalysisParams['source']
    productName: string | null
  } | null>(null)

  useEffect(() => {
    if (mode) return
    let cancelled = false
    void getPendingInci().then((p) => {
      if (cancelled) return
      if (p.inci && p.inci.trim().length >= 10 && p.source) {
        setPending({ inci: p.inci, source: p.source, productName: p.productName })
      } else {
        setPending(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [mode])

  const resumePending = useCallback(() => {
    if (!pending) return
    void launch(pending.source, pending.inci, {
      productName: pending.productName ?? undefined,
    })
  }, [pending, launch])

  const dismissPending = useCallback(() => {
    setPending(null)
    void clearPendingInci().catch(() => {})
  }, [])

  const retry = useCallback(() => {
    const last = lastParamsRef.current
    if (!last) return
    setFailed(false)
    void (async () => {
      const result = await runAnalysis(last)
      if (result) router.replace(ROUTES.ANALYSE.DETAIL(result.analysisId))
      else setFailed(true)
    })()
  }, [runAnalysis, router])

  const close = useCallback(() => {
    // Si l'utilisateur peut revenir en arrière dans le stack, on revient ;
    // sinon on retombe sur l'accueil (FAB scan ouvre une nouvelle page).
    if (router.canGoBack()) router.back()
    else router.replace(ROUTES.TABS.HOME)
  }, [router])

  // Crédits épuisés → modale globale gère l'upsell, on masque la bannière.
  const isCreditError = error?.toLowerCase().includes('crédit') ?? false
  const showErrorBanner = failed && !!error && !isCreditError && !isAnalyzing

  const errorBanner = showErrorBanner ? (
    <View style={styles.errorBanner}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.roseDeep} />
      <Text style={styles.errorBannerText} numberOfLines={2}>
        {error}
      </Text>
      {lastParamsRef.current && (
        <Pressable onPress={retry} hitSlop={8}>
          <Text style={styles.errorRetry}>Réessayer</Text>
        </Pressable>
      )}
    </View>
  ) : null

  // ─── Routing direct par mode ───────────────────────────────────────────

  // Barcode : caméra plein écran — UI native gère son propre header.
  if (mode === 'barcode') {
    return (
      <View style={styles.barcodeRoot}>
        <BarcodeScanner
          isActive={!isAnalyzing}
          disabled={isAnalyzing}
          onInciReady={(inci, productName, ean, brand) =>
            void launch('barcode', inci, { productName, barcode: ean, brand })
          }
          onFallbackToManual={() =>
            router.replace({ pathname: ROUTES.TABS.SCAN, params: { mode: 'manual' } })
          }
          onFallbackToSearch={() =>
            router.replace({ pathname: ROUTES.TABS.SCAN, params: { mode: 'search' } })
          }
        />
        {/* Close button overlay (au-dessus de la caméra) */}
        <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.barcodeCloseLayer}>
          <Pressable
            onPress={close}
            hitSlop={10}
            style={styles.barcodeCloseBtn}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </Pressable>
        </SafeAreaView>
        <ProcessingOverlay visible={isAnalyzing} message="On décode la composition…" />
      </View>
    )
  }

  // Photo OCR : ScanFrame dark
  if (mode === 'photo') {
    return (
      <View style={styles.root}>
        <ScanFrame title="Photos du produit" theme="dark" onClose={close}>
          {errorBanner}
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <PhotoOcrFlow
              disabled={isAnalyzing}
              theme="dark"
              onInciReady={(inci, productName, brand) =>
                void launch('ocr', inci, { productName, brand })
              }
              onFallbackToManual={() =>
                router.replace({ pathname: ROUTES.TABS.SCAN, params: { mode: 'manual' } })
              }
            />
          </KeyboardAvoidingView>
        </ScanFrame>
        <ProcessingOverlay visible={isAnalyzing} message="On décode la composition…" />
      </View>
    )
  }

  // Lien : ScanFrame light (modal-like)
  if (mode === 'link') {
    return (
      <View style={styles.root}>
        <BackgroundGlow variant="minimal" />
        <ScanFrame title="Coller le lien" onClose={close}>
          {errorBanner}
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <PasteLinkFlow
              disabled={isAnalyzing}
              onInciReady={(inci, extra) =>
                void launch('link', inci, {
                  productName: extra.productName,
                  brand: extra.brand,
                  sourceUrl: extra.sourceUrl,
                  imageUrl: extra.imageUrl,
                })
              }
              onFallbackToManual={() =>
                router.replace({ pathname: ROUTES.TABS.SCAN, params: { mode: 'manual' } })
              }
            />
          </KeyboardAvoidingView>
        </ScanFrame>
        <ProcessingOverlay visible={isAnalyzing} message="On décode la composition…" />
      </View>
    )
  }

  // Manuel : ScanFrame light (modal-like)
  if (mode === 'manual') {
    return (
      <View style={styles.root}>
        <BackgroundGlow variant="minimal" />
        <ScanFrame title="Coller la liste INCI" onClose={close}>
          {errorBanner}
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ManualInciInput
              disabled={isAnalyzing}
              onInciReady={(inci, productName) =>
                void launch('manual', inci, { productName })
              }
            />
          </KeyboardAvoidingView>
        </ScanFrame>
        <ProcessingOverlay visible={isAnalyzing} message="On décode la composition…" />
      </View>
    )
  }

  // Recherche : ScanFrame light, full screen (search bar + catégories)
  if (mode === 'search') {
    return (
      <View style={styles.root}>
        <BackgroundGlow variant="minimal" />
        <ScanFrame title="Rechercher un produit" onClose={close}>
          {errorBanner}
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ProductSearchMode
              disabled={isAnalyzing}
              onInciReady={(inci, productName, brand, ean, imageUrl) =>
                void launch('search', inci, {
                  productName,
                  brand,
                  barcode: ean,
                  imageUrl,
                })
              }
              onFallbackToManual={() =>
                router.replace({ pathname: ROUTES.TABS.SCAN, params: { mode: 'manual' } })
              }
            />
          </KeyboardAvoidingView>
        </ScanFrame>
        <ProcessingOverlay visible={isAnalyzing} message="On décode la composition…" />
      </View>
    )
  }

  // ─── Landing par défaut (pas de mode) ──────────────────────────────────
  return (
    <View style={styles.root}>
      <BackgroundGlow variant="default" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.landing}>
          <View style={styles.landingIcon}>
            <Ionicons name="camera-outline" size={36} color={colors.rose} />
          </View>
          <Text style={styles.landingTitle}>Décode un produit</Text>
          <Text style={styles.landingSubtitle}>
            Appuie sur le bouton Décode en bas pour choisir une méthode :
            code-barres, photo, lien e-commerce, recherche ou saisie manuelle.
          </Text>

          {pending ? (
            <View style={styles.resumeCard}>
              <Text style={styles.resumeTitle}>Reprendre la dernière analyse ?</Text>
              <Text style={styles.resumeSub} numberOfLines={2}>
                {pending.productName?.trim()
                  ? pending.productName
                  : 'Une analyse n’a pas pu se terminer.'}
              </Text>
              <View style={styles.resumeBtns}>
                <Pressable
                  onPress={dismissPending}
                  style={({ pressed }) => [styles.resumeGhost, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Ignorer l'analyse en attente"
                >
                  <Text style={styles.resumeGhostText}>Ignorer</Text>
                </Pressable>
                <Pressable
                  onPress={resumePending}
                  disabled={isAnalyzing}
                  style={({ pressed }) => [styles.resumePrimary, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Reprendre l'analyse"
                >
                  <Text style={styles.resumePrimaryText}>Reprendre</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
      <ProcessingOverlay visible={isAnalyzing} message="On décode la composition…" />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  barcodeRoot: { flex: 1, backgroundColor: '#000000' },
  barcodeCloseLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  barcodeCloseBtn: {
    marginTop: spacing.sm,
    marginLeft: spacing.base,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.roseSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  errorBannerText: { ...typography.xs, color: colors.roseDeep, flex: 1 },
  errorRetry: { ...typography.xsSemiBold, color: colors.roseDeep },
  landing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  landingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  landingTitle: { ...typography.h2, color: colors.ink, textAlign: 'center' },
  landingSubtitle: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  resumeCard: {
    width: '100%',
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.base,
    gap: spacing.xs,
  },
  resumeTitle: { ...typography.smallSemiBold, color: colors.ink },
  resumeSub: { ...typography.xs, color: colors.inkMuted },
  resumeBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  resumeGhost: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  resumeGhostText: { ...typography.smallMedium, color: colors.inkMuted },
  resumePrimary: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.success,
  },
  resumePrimaryText: { ...typography.smallSemiBold, color: colors.surface },
})

export default ScanScreen
