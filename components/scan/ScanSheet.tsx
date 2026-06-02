/**
 * ScanSheet — contrôle segmenté à 4 modes de décodage, rendu DIRECTEMENT dans
 * l'onglet Scan (le FAB « Décode » ouvre déjà la route /(tabs)/scan, donc pas
 * besoin d'un bottom-sheet @gorhom ici).
 *
 * Modes : Photo (OCR) · Code-barres · Recherche · Manuel.
 *
 * Chaque mode produit une liste INCI via onInciReady → ce composant lance
 * runAnalysis (hook useAnalysis) avec la `source` correspondante, affiche le
 * ProcessingOverlay pendant l'appel, puis :
 *   - succès           → onAnalysisComplete(analysisId) (le parent navigue).
 *   - CreditExhausted  → useAnalysis émet déjà l'événement global (modale gérée
 *                        par WORKSTREAM 3) ; on n'affiche pas d'erreur ici.
 *   - NetworkError/autre → bandeau d'erreur + bouton Réessayer (relance le
 *                        dernier INCI).
 */

import { type FC, useCallback, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { useAnalysis } from '@/hooks/useAnalysis'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import type { RunAnalysisParams } from '@/lib/analysis/analyser'
import { ProcessingOverlay } from '@/components/shared/ProcessingOverlay'
import { BarcodeScanner } from './BarcodeScanner'
import { ManualInciInput } from './ManualInciInput'
import { PhotoOcrFlow } from './PhotoOcrFlow'
import { ProductSearchMode } from './ProductSearchMode'

export type ScanMode = 'photo' | 'barcode' | 'search' | 'manual'

type IoniconName = keyof typeof Ionicons.glyphMap

const TABS: { mode: ScanMode; label: string; icon: IoniconName }[] = [
  { mode: 'photo', label: 'Photo', icon: 'camera-outline' },
  { mode: 'barcode', label: 'Code-barres', icon: 'barcode-outline' },
  { mode: 'search', label: 'Recherche', icon: 'search-outline' },
  { mode: 'manual', label: 'Manuel', icon: 'create-outline' },
]

interface Props {
  /** Appelé après une analyse réussie (le parent navigue vers /analyse/[id]). */
  onAnalysisComplete: (analysisId: string) => void
  /** Mode initial sélectionné (par défaut 'photo'). */
  initialMode?: ScanMode
}

export const ScanSheet: FC<Props> = ({ onAnalysisComplete, initialMode = 'photo' }) => {
  const [mode, setMode] = useState<ScanMode>(initialMode)
  const { user } = useAuth()
  const { restrictions } = useProfile()
  const { runAnalysis, isAnalyzing, error } = useAnalysis()

  // Dernier appel pour le bouton « Réessayer » (NetworkError).
  const lastParamsRef = useRef<RunAnalysisParams | null>(null)
  const [failed, setFailed] = useState(false)

  const launch = useCallback(
    async (
      source: RunAnalysisParams['source'],
      inci: string,
      extra?: { productName?: string; brand?: string; barcode?: string },
    ) => {
      const userId = user?.id
      if (!userId) {
        setFailed(true)
        return
      }
      const params: RunAnalysisParams = {
        inciInput: inci,
        source,
        userId,
        userRestrictions: restrictions,
        productName: extra?.productName,
        brand: extra?.brand,
        barcode: extra?.barcode,
      }
      lastParamsRef.current = params
      setFailed(false)

      const result = await runAnalysis(params)
      if (result) {
        onAnalysisComplete(result.analysisId)
      } else {
        // L'erreur est exposée par le hook. Sur crédits épuisés, l'événement
        // global est déjà émis (modale d'upsell) → pas de bandeau ici.
        setFailed(true)
      }
    },
    [user?.id, restrictions, runAnalysis, onAnalysisComplete],
  )

  const retry = useCallback(() => {
    const last = lastParamsRef.current
    if (!last) return
    setFailed(false)
    void (async () => {
      const result = await runAnalysis(last)
      if (result) onAnalysisComplete(result.analysisId)
      else setFailed(true)
    })()
  }, [runAnalysis, onAnalysisComplete])

  // Crédits épuisés → la modale globale gère l'upsell, on masque le bandeau.
  const isCreditError = error?.toLowerCase().includes('crédit') ?? false
  const showErrorBanner = failed && !!error && !isCreditError && !isAnalyzing

  return (
    <View style={styles.root}>
      {/* Contrôle segmenté */}
      <View style={styles.segmented}>
        {TABS.map((tab) => {
          const active = tab.mode === mode
          return (
            <Pressable
              key={tab.mode}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => setMode(tab.mode)}
            >
              <Ionicons
                name={tab.icon}
                size={18}
                color={active ? colors.rose : colors.inkMuted}
              />
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {showErrorBanner && (
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
      )}

      {/* Contenu du mode actif */}
      <View style={styles.body}>
        {mode === 'photo' && (
          <PhotoOcrFlow
            disabled={isAnalyzing}
            onInciReady={(inci, productName) =>
              void launch('ocr', inci, { productName })
            }
            onFallbackToManual={() => setMode('manual')}
          />
        )}
        {mode === 'barcode' && (
          <BarcodeScanner
            isActive={mode === 'barcode' && !isAnalyzing}
            disabled={isAnalyzing}
            onInciReady={(inci, productName, ean, brand) =>
              void launch('barcode', inci, { productName, barcode: ean, brand })
            }
            onFallbackToManual={() => setMode('manual')}
            onFallbackToSearch={() => setMode('search')}
          />
        )}
        {mode === 'search' && (
          <ProductSearchMode
            disabled={isAnalyzing}
            onInciReady={(inci, productName, brand, ean) =>
              void launch('search', inci, { productName, brand, barcode: ean })
            }
            onFallbackToManual={() => setMode('manual')}
          />
        )}
        {mode === 'manual' && (
          <ManualInciInput
            disabled={isAnalyzing}
            onInciReady={(inci, productName) =>
              void launch('manual', inci, { productName })
            }
          />
        )}
      </View>

      <ProcessingOverlay
        visible={isAnalyzing}
        message="On décode la composition…"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 40,
    borderRadius: radius.sm,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentLabel: { ...typography.caption, color: colors.inkMuted },
  segmentLabelActive: { ...typography.xsSemiBold, color: colors.rose },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.roseSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  errorBannerText: { ...typography.xs, color: colors.roseDeep, flex: 1 },
  errorRetry: { ...typography.xsSemiBold, color: colors.roseDeep },
  body: { flex: 1, marginTop: spacing.lg },
})
