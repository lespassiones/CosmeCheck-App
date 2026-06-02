/**
 * RoutineScreen — onglet « Ma routine quotidienne ».
 *
 * Twin mobile de app/routine/page.tsx (web). Pilote le moteur d'exposition
 * cumulée (lib/routine/engine) à partir des produits de la routine
 * (useRoutine). Sections (ordre du web) :
 *   - en-tête + « Mes restrictions » (chip) + bouton « Ajouter un produit » ;
 *   - 3 cartes stat : exposition cumulée (score /20 + label + IngredientBlob),
 *     produits actifs (count + u/jour), produits pénalisants (count score<13,
 *     tappable → détail des pires ingrédients) ;
 *   - exposition par catégorie d'ingrédients (TagExposureBar, top 8) ;
 *   - liste « Mes produits » (RoutineProductCard : swipe-to-delete + fréquence) ;
 *   - simulation (si removableCount>0) → RoutineSimulationModal ;
 *   - allergènes parfumants en doublon ;
 *   - suggestions IA (invoke('routine-suggest'), dégrade si indisponible).
 *
 * Scope : ce fichier + components/routine/*.
 */

import { type FC, useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography, fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { supabase } from '@/lib/supabase/client'
import { parseAnalyseResponse, type AnalyseResponse } from '@/lib/analysis/types'
import {
  computeRoutineMetrics,
  type RoutineProduct,
  type RoutineMetrics,
} from '@/lib/routine/engine'
import { useRoutine, type RoutineItem } from '@/hooks/useRoutine'
import { useProfile } from '@/hooks/useProfile'
import {
  readAiCache,
  routineSuggestKey,
  writeAiCache,
  TTL_ROUTINE_SUGGEST_MS,
} from '@/lib/storage/aiCache'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { WhiteCard } from '@/components/design/WhiteCard'
import { GlassCard } from '@/components/design/GlassCard'
import { Reveal } from '@/components/design/Reveal'
import { IngredientBlob, type BlobCounts } from '@/components/design/IngredientBlob'
import { ScreenHeader } from '@/components/shared/ScreenHeader'
import { TagExposureBar } from '@/components/routine/TagExposureBar'
import { RoutineProductCard } from '@/components/routine/RoutineProductCard'
import { AddProductModal } from '@/components/routine/AddProductModal'
import { RoutineSimulationModal } from '@/components/routine/RoutineSimulationModal'

type Suggestion = {
  text: string
  impact?: { from: number; to: number; delta: number; productName?: string | null }
}

/** Couleur du label/score d'exposition selon le palier. */
function exposureColor(label: RoutineMetrics['exposureLabel']): string {
  if (label === 'Faible') return colors.rating.vert.text
  if (label === 'Modérée') return colors.rating.jaune.text
  if (label === 'Élevée') return colors.rating.orange.text
  return colors.rating.rouge.text
}

function titleFor(item: RoutineItem): string {
  return item.analysis?.product_label?.trim() || item.analysis?.name?.trim() || 'Produit'
}

/** Rend un texte avec **gras** markdown léger. */
function BoldText({ text, style }: { text: string; style?: object }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <Text key={i} style={{ fontFamily: fontFamilies.semiBold }}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          <Text key={i}>{p}</Text>
        ),
      )}
    </Text>
  )
}

const RoutineScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const { items, isLoading, addToRoutine, removeFromRoutine, updateFrequency, isInRoutine } =
    useRoutine()
  const { restrictions } = useProfile()
  const restrictionsCount = restrictions.families.length + restrictions.ingredients.length

  const [addOpen, setAddOpen] = useState(false)
  const [simOpen, setSimOpen] = useState(false)
  const [penalizingOpen, setPenalizingOpen] = useState(false)

  // ── Suggestions IA (à la demande, dégradation gracieuse) ──────────────────
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [aiPending, setAiPending] = useState(false)
  const [aiUnavailable, setAiUnavailable] = useState(false)

  // ── Construction des RoutineProduct[] + métriques ─────────────────────────
  const products: RoutineProduct[] = useMemo(() => {
    return items
      .map((it) => {
        const result = parseAnalyseResponse(it.analysis?.result_json)
        if (!result || !it.analysis) return null
        return {
          id: it.analysis.id,
          name: titleFor(it),
          frequency: it.frequency,
          score: it.analysis.score,
          result,
        } satisfies RoutineProduct
      })
      .filter((p): p is RoutineProduct => p !== null)
  }, [items])

  const metrics = useMemo(() => computeRoutineMetrics(products), [products])

  /** Map analysis_id → routine_item.id (pour les mutations de suppression). */
  const itemIdByAnalysis = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of items) {
      if (it.analysis_id) m.set(it.analysis_id, it.id)
    }
    return m
  }, [items])

  const exposureFg = exposureColor(metrics.exposureLabel)
  const tagsTop = metrics.tagExposure.slice(0, 8)

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddFromHistory = useCallback(
    async (analysisId: string) => {
      try {
        await addToRoutine(analysisId, 'daily')
        setAddOpen(false)
      } catch {
        Alert.alert('Erreur', "Impossible d'ajouter ce produit à la routine.")
      }
    },
    [addToRoutine],
  )

  const confirmDelete = useCallback(
    (itemId: string, name: string) => {
      Alert.alert('Retirer de la routine', `Retirer « ${name} » de ta routine ?`, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => {
            void removeFromRoutine(itemId).catch(() =>
              Alert.alert('Erreur', 'La suppression a échoué.'),
            )
          },
        },
      ])
    },
    [removeFromRoutine],
  )

  const handleSimRemoval = useCallback(
    (analysisId: string) => {
      const itemId = itemIdByAnalysis.get(analysisId)
      if (!itemId) return
      void removeFromRoutine(itemId)
        .then(() => setSimOpen(false))
        .catch(() => Alert.alert('Erreur', 'La suppression a échoué.'))
    },
    [itemIdByAnalysis, removeFromRoutine],
  )

  const handleFrequency = useCallback(
    (itemId: string, frequency: RoutineItem['frequency']) => {
      void updateFrequency(itemId, frequency).catch(() => {})
    },
    [updateFrequency],
  )

  const loadSuggestions = useCallback(async () => {
    setAiPending(true)
    setAiUnavailable(false)
    const cacheKey = routineSuggestKey(
      products.map((p) => ({ id: p.id, frequency: p.frequency })),
    )
    try {
      // 1. Cache local (24h, clé = signature stable de la routine).
      const cached = await readAiCache<Suggestion[]>(
        'routine-suggest',
        cacheKey,
        TTL_ROUTINE_SUGGEST_MS,
      )
      if (Array.isArray(cached)) {
        setSuggestions(cached)
        return
      }

      // 2. Miss → invoke.
      const { data, error } = await supabase.functions.invoke('routine-suggest', {
        body: { products, metrics },
      })
      if (error) {
        setAiUnavailable(true)
        return
      }
      const list = (data as { suggestions?: Suggestion[] } | null)?.suggestions
      const suggestions = Array.isArray(list) ? list : []
      setSuggestions(suggestions)
      void writeAiCache('routine-suggest', cacheKey, suggestions)
    } catch {
      setAiUnavailable(true)
    } finally {
      setAiPending(false)
    }
  }, [products, metrics])

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!isLoading && products.length === 0) {
    return (
      <View style={styles.root}>
        <BackgroundGlow variant="minimal" />
        <ScreenHeader
          title="Ma routine"
          titleAdornment={<Ionicons name="leaf-outline" size={20} color={colors.success} />}
        />
        <SafeAreaView style={styles.safe} edges={[]}>
          <View style={styles.emptyChipRow}>
            <RestrictionsChip count={restrictionsCount} />
          </View>
          <View style={styles.emptyWrap}>
            <Ionicons name="sparkles-outline" size={44} color={colors.inkLight} />
            <Text style={styles.emptyTitle}>Ta routine est vide</Text>
            <Text style={styles.emptyText}>
              Ajoute des produits pour suivre ton exposition cumulée et repérer ceux à ajuster.
            </Text>
            <Pressable style={styles.emptyCta} onPress={() => setAddOpen(true)}>
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.emptyCtaText}>Ajouter un produit</Text>
            </Pressable>
          </View>
        </SafeAreaView>
        <AddProductModal
          visible={addOpen}
          onClose={() => setAddOpen(false)}
          onOpenScanner={() => router.push(ROUTES.TABS.SCAN)}
          onSelectFromHistory={handleAddFromHistory}
          isInRoutine={isInRoutine}
        />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <ScreenHeader
        title="Ma routine"
        titleAdornment={<Ionicons name="leaf-outline" size={20} color={colors.success} />}
      />
      <SafeAreaView style={styles.safe} edges={[]}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.rose} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 64 + spacing.xl },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.subtitle}>
              Suis l’exposition cumulée de ta routine et repère les produits à ajuster.
            </Text>
            <View style={styles.actionRow}>
              <View style={styles.actionSlot}>
                <Pressable
                  style={styles.addBtn}
                  onPress={() => setAddOpen(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter un produit"
                >
                  <Ionicons name="add" size={15} color="#FFFFFF" />
                  <Text
                    style={styles.addBtnText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    Ajouter un produit
                  </Text>
                </Pressable>
              </View>
              <View style={styles.actionSlot}>
                <RestrictionsChip count={restrictionsCount} fill />
              </View>
            </View>

            <Reveal stagger={70}>
              {/* ── Carte exposition cumulée ── */}
              <WhiteCard padding={spacing.lg} style={styles.statCard}>
                <View style={styles.exposureRow}>
                  <View style={styles.exposureMain}>
                    <Text style={styles.statLabel}>EXPOSITION CUMULÉE</Text>
                    <View style={styles.scoreLine}>
                      <Text style={[styles.scoreBig, { color: exposureFg }]}>
                        {metrics.exposureScore.toFixed(1)}
                      </Text>
                      <Text style={styles.scoreUnit}>/20</Text>
                    </View>
                    <Text style={[styles.exposureLabel, { color: exposureFg }]}>
                      {metrics.exposureLabel}
                    </Text>
                  </View>
                  <View style={styles.blobWrap}>
                    <IngredientBlob
                      counts={metrics.colorCounts as BlobCounts}
                      variant="md"
                      width={120}
                      neumorphic
                    />
                  </View>
                </View>
              </WhiteCard>

              {/* ── Actifs + pénalisants ── */}
              <View style={styles.statPair}>
                <WhiteCard padding={spacing.base} style={styles.statHalf}>
                  <Text style={styles.statLabel}>PRODUITS ACTIFS</Text>
                  <Text style={styles.statNum}>{products.length}</Text>
                  <Text style={styles.statSub}>{metrics.totalUseUnits.toFixed(1)} u/jour</Text>
                </WhiteCard>

                <WhiteCard
                  padding={spacing.base}
                  onPress={
                    metrics.penalizingProductsCount > 0
                      ? () => setPenalizingOpen(true)
                      : undefined
                  }
                  style={styles.statHalf}
                >
                  <Text style={styles.statLabel}>PRODUITS PÉNALISANTS</Text>
                  <View style={styles.penalizingLine}>
                    <Text
                      style={[
                        styles.statNum,
                        metrics.penalizingProductsCount > 0 && { color: colors.rating.rouge.text },
                      ]}
                    >
                      {metrics.penalizingProductsCount}
                    </Text>
                    {metrics.penalizingProductsCount > 0 && (
                      <Ionicons name="warning" size={16} color={colors.rating.rouge.text} />
                    )}
                  </View>
                  <Text style={styles.statSub}>score &lt; 13/20</Text>
                </WhiteCard>
              </View>
            </Reveal>

            {/* ── Exposition par catégorie d'ingrédients ── */}
            <WhiteCard padding={spacing.lg} style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                Exposition cumulée par catégorie d’ingrédients
              </Text>
              <Text style={styles.sectionHint}>
                Plus la barre est longue, plus la catégorie est présente dans ta routine.
              </Text>
              {tagsTop.length === 0 ? (
                <Text style={styles.mutedText}>
                  Aucune catégorie pénalisante détectée dans cette routine.
                </Text>
              ) : (
                <View style={styles.tagList}>
                  {tagsTop.map((t, i) => (
                    <TagExposureBar
                      key={t.tag}
                      label={t.label}
                      count={t.cumulativeCount}
                      max={tagsTop[0].cumulativeCount || 1}
                      colorSegments={t.colorSegments}
                      index={i}
                    />
                  ))}
                </View>
              )}
            </WhiteCard>

            {/* ── Mes produits ── */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitleStandalone}>Mes produits</Text>
              <View style={styles.productList}>
                {items
                  .filter((it) => it.analysis)
                  .map((it) => {
                    const result = parseAnalyseResponse(it.analysis?.result_json) as
                      | AnalyseResponse
                      | null
                    const c = result?.counts
                    const counts: BlobCounts | null = c
                      ? { vert: c.vert, jaune: c.jaune, orange: c.orange, rouge: c.rouge }
                      : null
                    return (
                      <RoutineProductCard
                        key={it.id}
                        itemId={it.id}
                        analysisId={it.analysis_id}
                        name={titleFor(it)}
                        counts={counts}
                        frequency={it.frequency}
                        onPress={(id) => router.push(ROUTES.ANALYSE.DETAIL(id))}
                        onDelete={confirmDelete}
                        onFrequencyChange={handleFrequency}
                      />
                    )
                  })}
              </View>
            </View>

            {/* ── Simulation ── */}
            {metrics.simulation.removableCount > 0 && (
              <WhiteCard padding={spacing.lg} style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Simulation</Text>
                <Text style={styles.sectionHint}>
                  {metrics.simulation.removableCount === 1
                    ? 'Que se passe-t-il si je retire le produit le plus pénalisant ?'
                    : 'Que se passe-t-il si je retire les 2 produits les plus pénalisants ?'}
                </Text>
                <View style={styles.simRow}>
                  <View>
                    <Text style={styles.simLabel}>Nouvelle exposition</Text>
                    <View style={styles.scoreLine}>
                      <Text style={styles.simScore}>
                        {metrics.simulation.minus2.exposureScore.toFixed(1)}
                      </Text>
                      <Text style={styles.scoreUnit}>/20</Text>
                      <Text style={styles.simDelta}>
                        ↑{' '}
                        {(
                          metrics.simulation.minus2.exposureScore - metrics.exposureScore
                        ).toFixed(1)}
                      </Text>
                    </View>
                  </View>
                  <Pressable style={styles.simBtn} onPress={() => setSimOpen(true)}>
                    <Text style={styles.simBtnText}>Simuler</Text>
                    <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
                  </Pressable>
                </View>
              </WhiteCard>
            )}

            {/* ── Allergènes en doublon ── */}
            {metrics.allergenOverlap.length > 0 && (
              <View style={[styles.sectionCard, styles.allergenCard]}>
                <Text style={styles.allergenTitle}>⚠️ Allergènes parfumants en doublon</Text>
                <Text style={styles.allergenText}>
                  Ces substances UE apparaissent dans plusieurs de tes produits :
                </Text>
                <View style={styles.allergenPills}>
                  {metrics.allergenOverlap.map((a) => (
                    <View key={a.inciName} style={styles.allergenPill}>
                      <Text style={styles.allergenPillText}>{a.label}</Text>
                      <Text style={styles.allergenPillCount}>×{a.productCount}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── Suggestions IA ── */}
            <WhiteCard padding={spacing.lg} style={styles.sectionCard}>
              <View style={styles.aiHeader}>
                <View style={styles.aiHeaderMain}>
                  <Text style={styles.sectionTitle}>✨ Suggestions intelligentes</Text>
                  <Text style={styles.sectionHint}>
                    Idées concrètes pour réduire ton exposition cumulée.
                  </Text>
                </View>
                {suggestions !== null && !aiUnavailable && (
                  <Pressable onPress={loadSuggestions} disabled={aiPending} hitSlop={6}>
                    <Text style={styles.aiRegen}>{aiPending ? '…' : 'Régénérer'}</Text>
                  </Pressable>
                )}
              </View>

              {aiUnavailable ? (
                <Text style={styles.mutedText}>Suggestions indisponibles pour le moment.</Text>
              ) : suggestions === null ? (
                <Pressable
                  style={[styles.aiBtn, aiPending && styles.aiBtnDisabled]}
                  onPress={loadSuggestions}
                  disabled={aiPending}
                >
                  {aiPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.aiBtnText}>Générer</Text>
                  )}
                </Pressable>
              ) : suggestions.length === 0 ? (
                <Text style={styles.mutedText}>
                  Aucune suggestion : ta routine semble déjà optimisée.
                </Text>
              ) : (
                <View style={styles.aiList}>
                  {suggestions.map((s, i) => (
                    <View key={i} style={styles.aiItem}>
                      <BoldText text={s.text} style={styles.aiItemText} />
                      {s.impact && (
                        <View style={styles.impactPill}>
                          <Ionicons name="arrow-up" size={12} color={colors.rating.vert.text} />
                          <Text style={styles.impactText}>
                            Note routine : {s.impact.from} → {s.impact.to} (
                            {s.impact.delta > 0 ? '+' : ''}
                            {s.impact.delta})
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </WhiteCard>
          </ScrollView>
        )}
      </SafeAreaView>

      {/* ── Modales ── */}
      <AddProductModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onOpenScanner={() => router.push(ROUTES.TABS.SCAN)}
        onSelectFromHistory={handleAddFromHistory}
        isInRoutine={isInRoutine}
      />

      <RoutineSimulationModal
        visible={simOpen}
        onClose={() => setSimOpen(false)}
        metrics={metrics}
        currentScore={metrics.exposureScore}
        onConfirmRemoval={handleSimRemoval}
      />

      <PenalizingDetailModal
        visible={penalizingOpen}
        onClose={() => setPenalizingOpen(false)}
        products={products}
      />
    </View>
  )
}

/** Chip « Mes restrictions » avec badge de compte → écran restrictions. */
function RestrictionsChip({ count, fill }: { count: number; fill?: boolean }) {
  return (
    <Pressable
      style={[styles.restrictChip, fill && styles.restrictChipFill]}
      onPress={() => router.push(ROUTES.PROFILE.RESTRICTIONS)}
      hitSlop={6}
    >
      <Ionicons name="shield-checkmark-outline" size={14} color={colors.accent} />
      <Text style={styles.restrictText}>Mes restrictions</Text>
      {count > 0 && (
        <View style={styles.restrictBadge}>
          <Text style={styles.restrictBadgeText}>{count}</Text>
        </View>
      )}
    </Pressable>
  )
}

/** Détail des produits pénalisants (remplace le tooltip web par une feuille). */
function PenalizingDetailModal({
  visible,
  onClose,
  products,
}: {
  visible: boolean
  onClose: () => void
  products: RoutineProduct[]
}) {
  const insets = useSafeAreaInsets()
  const details = useMemo(() => {
    return products
      .filter((p) => typeof p.score === 'number' && p.score < 13)
      .map((p) => {
        const worst = p.result.items
          .filter((it) => it.colorRating === 'Rouge' || it.colorRating === 'Orange')
          .sort((a, b) => {
            if (a.colorRating !== b.colorRating) return a.colorRating === 'Rouge' ? -1 : 1
            return (a.position ?? 999) - (b.position ?? 999)
          })
          .slice(0, 3)
          .map((it) => it.name ?? it.input)
        return { name: p.name, score: p.score ?? 0, worst }
      })
  }, [products])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.detailSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>Produits pénalisants</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.detailList} showsVerticalScrollIndicator={false}>
            {details.map((d, i) => (
              <View key={i} style={styles.detailItem}>
                <Text style={styles.detailItemName}>
                  {d.name} — {d.score.toFixed(1)}/20
                </Text>
                {d.worst.length > 0 && (
                  <Text style={styles.detailItemWorst}>{d.worst.join(' · ')}</Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  addBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: colors.rose,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: 8,
  },
  addBtnText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    color: '#FFFFFF',
    flexShrink: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  actionSlot: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  emptyChipRow: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    alignItems: 'flex-start',
  },
  subtitle: { ...typography.xs, color: colors.inkLight, marginBottom: spacing.md },
  center: { paddingTop: spacing['3xl'], alignItems: 'center', flex: 1 },

  // Stat cards
  statCard: { marginBottom: spacing.base },
  statPair: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.base },
  statHalf: { flex: 1 },
  exposureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  exposureMain: { flex: 1 },
  statLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.ink,
    marginBottom: 4,
  },
  scoreLine: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  scoreBig: { fontFamily: fontFamilies.bold, fontSize: 30 },
  scoreUnit: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  exposureLabel: { fontFamily: fontFamilies.semiBold, fontSize: 12, marginTop: 2 },
  blobWrap: { width: 120 },
  statNum: { fontFamily: fontFamilies.bold, fontSize: 26, color: colors.ink },
  statSub: { fontFamily: fontFamilies.regular, fontSize: 10, color: colors.inkLight, marginTop: 2 },
  penalizingLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // Sections
  sectionCard: { marginBottom: spacing.base },
  sectionTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  sectionTitleStandalone: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  sectionHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.gray700,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  mutedText: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  tagList: { marginTop: 2 },
  productList: { gap: spacing.base },

  // Simulation
  simRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  simLabel: { fontFamily: fontFamilies.regular, fontSize: 11, color: colors.inkMuted, marginBottom: 2 },
  simScore: { fontFamily: fontFamilies.bold, fontSize: 20, color: colors.ink },
  simDelta: { fontFamily: fontFamilies.semiBold, fontSize: 12, color: colors.success, marginLeft: 6 },
  simBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.rose,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  simBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: '#FFFFFF' },

  // Allergens
  allergenCard: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  allergenTitle: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.rating.jaune.ink },
  allergenText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.rating.jaune.ink,
    marginTop: 6,
    marginBottom: spacing.sm,
  },
  allergenPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  allergenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  allergenPillText: { fontFamily: fontFamilies.medium, fontSize: 12, color: colors.rating.jaune.ink },
  allergenPillCount: { fontFamily: fontFamilies.regular, fontSize: 10, color: colors.warning },

  // AI
  aiHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  aiHeaderMain: { flex: 1 },
  aiRegen: { fontFamily: fontFamilies.medium, fontSize: 11, color: colors.inkMuted },
  aiBtn: {
    backgroundColor: colors.ink,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  aiBtnDisabled: { opacity: 0.6 },
  aiBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: '#FFFFFF' },
  aiList: { gap: spacing.sm },
  aiItem: { backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md },
  aiItemText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
  },
  impactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.successSoft,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: spacing.sm,
  },
  impactText: { fontFamily: fontFamilies.medium, fontSize: 12, color: colors.rating.vert.text },

  // Restrictions chip
  restrictChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: 8,
  },
  restrictChipFill: { width: '100%', justifyContent: 'center' },
  restrictText: { fontFamily: fontFamilies.semiBold, fontSize: 12, color: colors.accent },
  restrictBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  restrictBadgeText: { fontFamily: fontFamilies.bold, fontSize: 10, color: '#FFFFFF' },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.h4, color: colors.ink, marginTop: spacing.sm, textAlign: 'center' },
  emptyText: { ...typography.small, color: colors.inkMuted, textAlign: 'center' },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.base,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.rose,
  },
  emptyCtaText: { ...typography.button, color: '#FFFFFF' },

  // Penalizing detail modal
  detailBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  detailSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    maxHeight: '70%',
    paddingTop: spacing.sm,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailTitle: { fontFamily: fontFamilies.bold, fontSize: 16, color: colors.ink },
  detailList: { padding: spacing.lg, gap: spacing.md },
  detailItem: {
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailItemName: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.ink },
  detailItemWorst: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 4,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray300,
    marginBottom: spacing.sm,
  },
})

export default RoutineScreen
