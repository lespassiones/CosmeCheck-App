/**
 * PromesseDetailScreen — détail "Promesses vs Formule" (twin mobile du web).
 *
 * Charge la ligne coherence_analyses + le result_json de l'analyse parente
 * (pour colorer les ingrédients par rating sécurité). RECALCULE les métriques
 * sur lecture (computeMetrics) — les `metrics` stockés sont ignorés. Rend la
 * cascade de cartes (Reveal) :
 *   1. VerdictGlobalCard (donut animé)   2. PromisesBarChart
 *   3. CoherenceTable (accordéons)       4. ConclusionCard
 *   5. InferredPromisesCard              6. OutOfScopePromisesCard
 *   7. IngredientsPositionChart          8. DescriptionKeywordsCard
 *   9. MarketingIndexCard
 *
 * États : chargement · erreur (carte + accueil) · prêt.
 */

import { type FC, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { GlassCard } from '@/components/design/GlassCard'
import { Reveal } from '@/components/design/Reveal'
import { VerdictGlobalCard } from '@/components/promesses/VerdictGlobalCard'
import { PromisesBarChart } from '@/components/promesses/PromisesBarChart'
import { CoherenceTable } from '@/components/promesses/CoherenceTable'
import { ConclusionCard } from '@/components/promesses/ConclusionCard'
import { InferredPromisesCard } from '@/components/promesses/InferredPromisesCard'
import { OutOfScopePromisesCard } from '@/components/promesses/OutOfScopePromisesCard'
import { IngredientsPositionChart } from '@/components/promesses/IngredientsPositionChart'
import { DescriptionKeywordsCard } from '@/components/promesses/DescriptionKeywordsCard'
import { MarketingIndexCard } from '@/components/promesses/MarketingIndexCard'
import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { db } from '@/lib/supabase/client'
import { computeMetrics } from '@/lib/coherence/engine'
import type { CoherenceResult } from '@/lib/coherence/types'
import { parseAnalyseResponse, type AnalyseItem } from '@/lib/analysis/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      result: CoherenceResult
      parentItems: AnalyseItem[]
      productName: string
    }

interface DetailRow {
  id: string
  analysis_id: string | null
  description: string
  result_json: CoherenceResult
  created_at: string
  analyses: {
    name: string | null
    product_label: string | null
    result_json: unknown
  } | null
}

const PromesseDetailScreen: FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const load = useCallback(async () => {
    if (!id) {
      setState({ status: 'error', message: "Identifiant d'analyse manquant." })
      return
    }
    setState({ status: 'loading' })
    try {
      const { data, error } = await db()
        .from('coherence_analyses')
        .select(
          'id,analysis_id,description,result_json,created_at,analyses(name,product_label,result_json)',
        )
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        setState({ status: 'error', message: 'Cette analyse est introuvable.' })
        return
      }
      const row = data as unknown as DetailRow
      const stored = row.result_json
      if (!stored || !Array.isArray(stored.promises)) {
        setState({ status: 'error', message: 'Le résultat de cette analyse est illisible.' })
        return
      }
      const parent = parseAnalyseResponse(row.analyses?.result_json)
      const parentItems = parent?.items ?? []
      // Recalcul des métriques sur lecture (cf. web) — instantané ignoré.
      const result: CoherenceResult = { ...stored, metrics: computeMetrics(stored.promises) }
      const productName =
        row.analyses?.product_label ??
        row.analyses?.name ??
        `Analyse du ${new Date(row.created_at).toLocaleDateString('fr-FR')}`
      setState({ status: 'ready', result, parentItems, productName })
    } catch (e) {
      setState({
        status: 'error',
        message: e instanceof Error ? e.message : "Impossible de charger l'analyse.",
      })
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BackgroundGlow variant="default" />

      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          Cohérence
        </Text>
        <View style={styles.backBtn} />
      </View>

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Chargement de l&apos;analyse…</Text>
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.center}>
          <GlassCard style={styles.errorCard} padding={spacing['2xl']}>
            <View style={styles.errorIcon}>
              <Ionicons name="alert-circle-outline" size={32} color={colors.rating.rouge.text} />
            </View>
            <Text style={styles.errorTitle}>Oups</Text>
            <Text style={styles.errorMsg}>{state.message}</Text>
            <View style={styles.errorActions}>
              <Pressable onPress={() => void load()} style={({ pressed }) => [styles.retryBtn, pressed && styles.btnPressed]}>
                <Text style={styles.retryText}>Réessayer</Text>
              </Pressable>
              <Pressable
                onPress={() => router.replace(ROUTES.TABS.PROMESSES)}
                style={({ pressed }) => [styles.homeBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.homeText}>Promesses</Text>
              </Pressable>
            </View>
          </GlassCard>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={styles.h1}>Promesses du produit vs Formule réelle</Text>
            <Text style={styles.introSub}>
              On compare ce qui est promis sur l&apos;emballage avec ce qui est vraiment dans la liste INCI
              de <Text style={styles.introStrong}>{state.productName}</Text>.
            </Text>
          </View>

          <Reveal stagger={70} duration={400} style={styles.cards}>
            {[
              <VerdictGlobalCard key="verdict" metrics={state.result.metrics} />,
              <PromisesBarChart key="bars" promises={state.result.promises} />,
              <CoherenceTable key="table" promises={state.result.promises} items={state.parentItems} />,
              state.result.conclusion ? (
                <ConclusionCard key="conclusion" conclusion={state.result.conclusion} />
              ) : null,
              state.result.promises.some((p) => p.inferred) ? (
                <InferredPromisesCard key="inferred" promises={state.result.promises} />
              ) : null,
              state.result.outOfScope && state.result.outOfScope.length > 0 ? (
                <OutOfScopePromisesCard
                  key="oos"
                  items={state.result.outOfScope}
                  productType={state.result.productType}
                />
              ) : null,
              state.result.positionSnapshot.thresholdPos !== null &&
              state.result.positionSnapshot.totalPositions > 0 ? (
                <IngredientsPositionChart key="position" snapshot={state.result.positionSnapshot} />
              ) : null,
              state.result.promises.length > 0 || state.result.unverifiable.length > 0 ? (
                <DescriptionKeywordsCard
                  key="keywords"
                  promises={state.result.promises}
                  unverifiable={state.result.unverifiable}
                />
              ) : null,
              <MarketingIndexCard key="marketing" metrics={state.result.metrics} />,
            ].filter(Boolean)}
          </Reveal>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

export default PromesseDetailScreen

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backBtn: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  topTitle: { ...typography.h4, color: colors.ink },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.base },
  loadingText: { ...typography.smallMedium, color: colors.inkMuted },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.base, paddingBottom: spacing['4xl'], gap: spacing.base },
  cards: { gap: spacing.base },
  intro: { paddingTop: spacing.xs },
  h1: { ...typography.h2, color: colors.ink },
  introSub: { ...typography.xs, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 18 },
  introStrong: { fontFamily: typography.bodyMedium.fontFamily, color: colors.ink },
  errorCard: { alignItems: 'center', width: '100%' },
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.rating.rouge.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  errorTitle: { ...typography.h3, color: colors.ink, marginBottom: spacing.xs },
  errorMsg: { ...typography.body, color: colors.inkMuted, textAlign: 'center', marginBottom: spacing.xl },
  errorActions: { flexDirection: 'row', gap: spacing.md },
  retryBtn: { backgroundColor: colors.accent, borderRadius: radius.full, paddingVertical: 12, paddingHorizontal: 24 },
  retryText: { ...typography.button, color: colors.surface },
  homeBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  homeText: { ...typography.button, color: colors.ink },
  btnPressed: { opacity: 0.85 },
})
