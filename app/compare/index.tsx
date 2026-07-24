/**
 * CompareScreen — comparaison côte à côte de deux analyses.
 *
 * Lit `?ids=a,b`, charge les deux lignes `analyses`, et rend :
 *   - une carte par produit (ExposureBar + counts + ingrédients reconnus)
 *   - le bloc narratif IA (CompareInsights, soft-fail)
 *   - « À surveiller » : ingrédients pénalisants groupés par famille
 *     (fallback v1 : primaryFunction, faute de table familles côté client)
 *   - « Bon à savoir » : faits concrets dérivés des données (allergènes parfum,
 *     chevauchement avec la routine)
 *
 * Twin mobile de CosmetWiki/app/compare/page.tsx. Jamais de crash : ids
 * invalides / analyses introuvables → écran d'erreur doux.
 */

import { Fragment, useCallback, useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CompareInsights, type CompareInsightsStatus } from '@/components/compare/CompareInsights'
import { ExposureBar, ExposureCountsRow } from '@/components/compare/ExposureBar'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { GlassCard } from '@/components/design/GlassCard'
import { Reveal } from '@/components/design/Reveal'
import { PressableScale } from '@/components/design/motion'
import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { db } from '@/lib/supabase/client'
import { resolveAndCacheProductImage } from '@/lib/storage/productImageCache'
import { useAuth } from '@/hooks/useAuth'
import { useRoutine } from '@/hooks/useRoutine'
import { parseAnalyseResponse, type AnalyseResponse } from '@/lib/analysis/types'
import { compareAnalyses, shortenProductName, type CompareSide } from '@/lib/routine/compare'
import { withTimeout } from '@/lib/utils/withTimeout'
import {
  buildCompareBonASavoir,
  routineOverlapSlugs,
} from '@/lib/routine/compareOverlap'

type Flagged = {
  name: string
  fn: string | null
  color: 'Orange' | 'Rouge'
}

type FamilyGroup = {
  label: string
  color: 'Orange' | 'Rouge'
  items: Flagged[]
}


function flaggedFor(side: CompareSide): Flagged[] {
  return side.result.items
    .filter((i) => i.colorRating === 'Orange' || i.colorRating === 'Rouge')
    .map((i) => ({
      name: i.name ?? i.input,
      fn: i.primaryFunction ?? null,
      color: i.colorRating as 'Orange' | 'Rouge',
    }))
}

/**
 * Groupe les ingrédients pénalisants par fonction principale (fallback v1 :
 * la table des familles n'est pas chargée côté client). Rouges d'abord, puis
 * par nombre décroissant.
 */
function groupByFunction(items: Flagged[]): FamilyGroup[] {
  const groups = new Map<string, FamilyGroup>()
  for (const item of items) {
    const label = item.fn ?? 'Autres'
    const existing = groups.get(label) ?? { label, color: 'Orange' as const, items: [] }
    existing.items.push(item)
    if (item.color === 'Rouge') existing.color = 'Rouge'
    groups.set(label, existing)
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.color !== b.color) return a.color === 'Rouge' ? -1 : 1
    return b.items.length - a.items.length
  })
}

/**
 * Le state stocke uniquement les analyses chargées. Les dérivés (flagged,
 * bonASavoir, sameComposition) sont recalculés en `useMemo` à partir de
 * `useRoutine()` → ils se mettent à jour automatiquement quand la routine
 * du cache react-query arrive (même après le 1er render).
 */
type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; a: CompareSide; b: CompareSide }

type AnalysisLite = {
  id: string
  name: string | null
  product_label: string | null
  score: number | null
  brand: string | null
  ean: string | null
  result_json: unknown
}

const CompareScreen: FC = () => {
  const params = useLocalSearchParams<{ ids?: string }>()
  const { user } = useAuth()
  const { items: routineItems } = useRoutine()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // URLs image produit (keyées par id d'analyse), résolues via EAN (source de
  // vérité) après le chargement. Non bloquant : le hero s'affiche sans image.
  const [images, setImages] = useState<Record<string, string>>({})
  // Statut + produit conseillé remontés par CompareInsights (badge + bouton).
  const [insights, setInsights] = useState<{ status: CompareInsightsStatus; winner?: 'A' | 'B' }>({
    status: 'loading',
  })
  // Comparaison simplifiée : par défaut seul « Comment choisir » est visible.
  const [showFull, setShowFull] = useState(false)

  const ids = useMemo(
    () =>
      (params.ids ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [params.ids],
  )

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    setImages({})
    setShowFull(false)
    setInsights({ status: 'loading' })

    if (ids.length !== 2) {
      setState({ status: 'error', message: 'Sélectionne exactement deux analyses à comparer.' })
      return
    }

    try {
      const { data, error } = await withTimeout(
        Promise.resolve(
          db()
            .from('analyses')
            .select('id, name, product_label, score, brand, ean, result_json')
            .in('id', ids),
        ),
        12000,
        'Le chargement a pris trop de temps. Vérifie ta connexion et réessaie.',
      )
      if (error) throw error

      const rows = (data ?? []) as AnalysisLite[]
      if (rows.length !== 2) {
        setState({ status: 'error', message: 'Une des analyses est introuvable.' })
        return
      }

      // Préserve l'ordre de l'URL (A/B comme choisi par l'utilisateur).
      const ordered = ids
        .map((id) => rows.find((r) => r.id === id))
        .filter((r): r is AnalysisLite => Boolean(r))

      const sides = ordered.map((r): CompareSide | null => {
        const result = parseAnalyseResponse(r.result_json)
        if (!result) return null
        return {
          id: r.id,
          name: r.product_label?.trim() || r.name?.trim() || 'Analyse',
          score: r.score,
          result,
        }
      })

      if (sides.length !== 2 || !sides[0] || !sides[1]) {
        setState({ status: 'error', message: 'Le résultat de ces analyses est illisible.' })
        return
      }

      const [a, b] = sides as [CompareSide, CompareSide]
      setState({ status: 'ready', a, b })

      // Résolution image (EAN = source de vérité), non bloquante.
      void Promise.all(
        ordered.map(async (r) => {
          const url = await resolveAndCacheProductImage(
            r.id,
            r.ean,
            r.brand,
            r.product_label ?? r.name,
          )
          if (url) setImages((prev) => ({ ...prev, [r.id]: url }))
        }),
      )
    } catch (e) {
      setState({
        status: 'error',
        message: e instanceof Error ? e.message : 'Impossible de charger la comparaison.',
      })
    }
  }, [ids])

  // Dérivés routine-dépendants : recalculés quand `useRoutine()` arrive (ou
  // change). Tant que la routine n'est pas chargée, on rend avec un overlap
  // vide — ça n'altère QUE l'insight « bon à savoir », pas la comparaison.
  const routineSlugs = useMemo(() => {
    if (state.status !== 'ready') return new Set<string>()
    return routineOverlapSlugs(
      routineItems.map((it) => ({ analysis: it.analysis })),
      [state.a.id, state.b.id],
    )
  }, [state, routineItems])

  const derived = useMemo(() => {
    if (state.status !== 'ready') return null
    const { a, b } = state
    const diff = compareAnalyses(a, b, { routineIngredientSlugs: routineSlugs })
    return {
      flaggedA: flaggedFor(a),
      flaggedB: flaggedFor(b),
      bonASavoir: buildCompareBonASavoir({ a, b, routineSlugs }),
      sameComposition: diff.uniqueToA.length + diff.uniqueToB.length === 0,
    }
  }, [state, routineSlugs])

  // Produit conseillé (badge vert) : reco IA « comment choisir » quand
  // disponible, sinon repli sur le meilleur score (le badge reste affiché même
  // si l'IA est indisponible). Aucun badge si scores égaux/absents sans IA.
  const winnerId = useMemo<string | null>(() => {
    if (state.status !== 'ready') return null
    const { a, b } = state
    if (insights.winner === 'A') return a.id
    if (insights.winner === 'B') return b.id
    const sa = a.score ?? -1
    const sb = b.score ?? -1
    if (sa === sb) return null
    return sa > sb ? a.id : b.id
  }, [state, insights.winner])

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
          Comparer
        </Text>
        <View style={styles.backBtn} />
      </View>

      {state.status === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {state.status === 'error' && (
        <View style={styles.center}>
          <GlassCard style={styles.errorCard} padding={spacing['2xl']}>
            <Ionicons name="git-compare-outline" size={36} color={colors.inkLight} />
            <Text style={styles.errorTitle}>Comparaison indisponible</Text>
            <Text style={styles.errorMsg}>{state.message}</Text>
            <Pressable
              onPress={() => router.replace(ROUTES.TABS.HISTORY)}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>Mon historique</Text>
            </Pressable>
          </GlassCard>
        </View>
      )}

      {state.status === 'ready' && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Entrée de page : titre, héros et insights apparaissent en cascade. */}
          <Reveal stagger={80}>
          <Text style={styles.h1}>Comparer 2 produits</Text>

          {/* Hero — une carte par produit : infos à gauche, image à droite,
              badge vert sur le produit conseillé. */}
          <View style={styles.heroStack}>
            {[state.a, state.b].map((side) => {
              const isWinner = winnerId === side.id
              const img = images[side.id]
              return (
                <GlassCard key={side.id} style={styles.heroCard} padding={spacing.base}>
                  {isWinner && (
                    <View style={styles.winnerBadge}>
                      <Ionicons name="checkmark" size={16} color={colors.surface} />
                    </View>
                  )}
                  <View style={styles.heroRow}>
                    <View style={styles.heroMain}>
                      <Text style={styles.heroName} numberOfLines={2}>
                        {side.name}
                      </Text>
                      <View style={styles.heroBar}>
                        <ExposureBar
                          counts={{
                            vert: side.result.counts.vert,
                            jaune: side.result.counts.jaune,
                            orange: side.result.counts.orange,
                            rouge: side.result.counts.rouge,
                          }}
                        />
                      </View>
                      <View style={styles.heroFooter}>
                        <Text style={styles.heroMatched}>
                          {side.result.counts.matched} ingrédients reconnus
                        </Text>
                      </View>
                      <ExposureCountsRow
                        counts={{
                          vert: side.result.counts.vert,
                          jaune: side.result.counts.jaune,
                          orange: side.result.counts.orange,
                          rouge: side.result.counts.rouge,
                        }}
                      />
                    </View>
                    {img ? (
                      <Image
                        source={{ uri: img }}
                        style={styles.heroImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={150}
                        accessibilityIgnoresInvertColors
                      />
                    ) : null}
                  </View>
                </GlassCard>
              )
            })}
          </View>

          {/* « Comment choisir » (toujours) + portraits/commun (repliés). */}
          <CompareInsights
            aId={state.a.id}
            bId={state.b.id}
            nameA={state.a.name}
            nameB={state.b.name}
            shortNameA={shortenProductName(state.a.name)}
            shortNameB={shortenProductName(state.b.name)}
            showFull={showFull}
            onResult={setInsights}
          />
          </Reveal>

          {/* Bouton « Voir l'analyse complète » (uniquement si l'IA a répondu). */}
          {insights.status === 'ready' && !showFull && (
            <PressableScale
              onPress={() => setShowFull(true)}
              style={styles.expandBtn}
              accessibilityRole="button"
              accessibilityLabel="Voir l'analyse complète"
            >
              <Text style={styles.expandBtnText}>Voir l'analyse complète</Text>
              <Ionicons name="chevron-down" size={18} color={colors.surface} />
            </PressableScale>
          )}

          {/* Détail : révélé par le bouton, OU affiché directement si l'IA est
              indisponible (le reste de la page garde sa valeur). Les blocs
              apparaissent en cascade à l'ouverture. */}
          {(showFull || insights.status === 'error') && (
            <Reveal stagger={70}>
              {/* À surveiller — une carte par produit, groupé par fonction. */}
              {derived && (derived.flaggedA.length > 0 || derived.flaggedB.length > 0) && (
                <View style={styles.attentionStack}>
                  {derived.flaggedA.length > 0 && (
                    <AttentionCard name={state.a.name} groups={groupByFunction(derived.flaggedA)} />
                  )}
                  {derived.flaggedB.length > 0 && (
                    <AttentionCard name={state.b.name} groups={groupByFunction(derived.flaggedB)} />
                  )}
                </View>
              )}

              {/* Bon à savoir */}
              {derived && derived.bonASavoir.length > 0 && (
                <GlassCard style={styles.block} padding={spacing.lg}>
                  <Text style={styles.blockLabel}>BON À SAVOIR</Text>
                  <View style={styles.bonList}>
                    {derived.bonASavoir.map((t, i) => (
                      <View key={i} style={styles.bonRow}>
                        <View style={styles.bonDot} />
                        <Text style={styles.bonText}>{renderBold(t)}</Text>
                      </View>
                    ))}
                  </View>
                </GlassCard>
              )}

              {derived?.sameComposition && (
                <Text style={styles.sameComp}>
                  Les deux compositions ne diffèrent pas sur les ingrédients pénalisants.
                </Text>
              )}
            </Reveal>
          )}

          {/* Replier */}
          {insights.status === 'ready' && showFull && (
            <PressableScale
              onPress={() => setShowFull(false)}
              style={styles.collapseBtn}
              accessibilityRole="button"
              accessibilityLabel="Réduire l'analyse"
            >
              <Text style={styles.collapseBtnText}>Voir moins</Text>
              <Ionicons name="chevron-up" size={18} color={colors.inkMuted} />
            </PressableScale>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

export default CompareScreen

// ─── Cartes / helpers de rendu ───────────────────────────────────────────────

const AttentionCard: FC<{ name: string; groups: FamilyGroup[] }> = ({ name, groups }) => (
  <GlassCard style={styles.attentionCard} padding={spacing.base} opacity={0.82}>
    <View style={styles.attentionHeader}>
      <Ionicons name="warning-outline" size={18} color={colors.rose} style={styles.attentionIcon} />
      <View style={styles.attentionHeaderText}>
        <Text style={styles.attentionKicker}>À SURVEILLER</Text>
        <Text style={styles.attentionName} numberOfLines={1}>
          {name}
        </Text>
      </View>
    </View>
    <View style={styles.attentionList}>
      {groups.map((g) => (
        <Text key={g.label} style={styles.attentionLine}>
          <Text style={{ color: g.color === 'Rouge' ? colors.rose : colors.rating.orange.DEFAULT }}>
            {'● '}
          </Text>
          <Text style={styles.attentionGroup}>{g.label}</Text>
          <Text style={styles.attentionDim}> ({g.items.length})</Text>
        </Text>
      ))}
    </View>
  </GlassCard>
)

function renderBold(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <Text key={i} style={styles.bonBold}>
        {p.slice(2, -2)}
      </Text>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    ...typography.h4,
    color: colors.ink,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorCard: {
    alignItems: 'center',
    width: '100%',
  },
  errorTitle: {
    ...typography.h4,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  errorMsg: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  cta: {
    backgroundColor: colors.ink,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    ...typography.button,
    color: colors.surface,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  h1: {
    ...typography.h2,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  heroStack: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  heroCard: {
    position: 'relative',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.base,
  },
  heroMain: {
    flex: 1,
    minWidth: 0,
  },
  heroImage: {
    width: 68,
    // Hauteur pilotée par la carte : l'image s'étire sur toute la hauteur du
    // contenu (plus haute) sans élargir la zone ni agrandir la carte.
    alignSelf: 'stretch',
    minHeight: 68,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  winnerBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.rating.vert.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  heroName: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  heroBar: {
    marginBottom: spacing.md,
  },
  heroFooter: {
    marginBottom: spacing.sm,
  },
  heroMatched: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
  },
  attentionStack: {
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  attentionCard: {},
  attentionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  attentionIcon: {
    marginTop: 1,
  },
  attentionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  attentionKicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.roseDeep,
  },
  attentionName: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: '#7F1D1D',
  },
  attentionList: {
    gap: 6,
  },
  attentionLine: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  attentionGroup: {
    fontFamily: fontFamilies.semiBold,
    color: '#7F1D1D',
  },
  attentionDim: {
    color: colors.roseDeep,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.rating.vert.DEFAULT,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.base,
  },
  expandBtnText: {
    ...typography.button,
    color: colors.surface,
  },
  collapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 12,
    marginBottom: spacing.base,
  },
  collapseBtnText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.inkMuted,
  },
  block: {
    marginBottom: spacing.base,
  },
  blockLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.inkMuted,
    marginBottom: spacing.sm,
  },
  bonList: {
    gap: spacing.sm,
  },
  bonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.info,
    marginTop: 7,
  },
  bonText: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.ink,
  },
  bonBold: {
    fontFamily: fontFamilies.semiBold,
    color: colors.ink,
  },
  sameComp: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.base,
  },
})
