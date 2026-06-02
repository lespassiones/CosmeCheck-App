/**
 * DashboardScreen (Tab Accueil) — TWIN du web `HomeDashboard.tsx`.
 *
 * Salutation STATIQUE « Bonjour {firstName} 👋 » + filet (#c5ccd6) + sous-titre
 * « Décrypte tes cosmétiques en un clin d'œil » avec soulignement ondulé (SVG)
 * sous « en un clin d'œil ». Puis TipCarousel, la grille (dernière analyse +
 * routine) avec demi-donut IngredientBlob + PenaltyPill, et deux cartes promo
 * en dégradé (Beauty Advisor / Promesses) avec illustrations en débord.
 *
 * Données via react-query (enabled si user). ScrollView + pull-to-refresh.
 * Apparition animée via Reveal, fond via BackgroundGlow.
 */

import { type FC, useCallback, useMemo, useRef, useState } from 'react'
import {
  Image,
  type LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors } from '@/constants/colors'
import { gradients } from '@/constants/gradients'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { db } from '@/lib/supabase/client'
import type { AnalysisRow } from '@/lib/supabase/types'
import { parseAnalyseResponse } from '@/lib/analysis/types'
import { tipsForCarousel } from '@/lib/tips'
import type { BlobCounts } from '@/components/design/IngredientBlob'
import { IngredientBlob } from '@/components/design/IngredientBlob'
import { WhiteCard } from '@/components/design/WhiteCard'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { Reveal } from '@/components/design/Reveal'
import { ScreenHeader } from '@/components/shared/ScreenHeader'
import { TipCarousel } from '@/components/home/TipCarousel'
import { DailyPicksCard } from '@/components/home/DailyPicksCard'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'

const EMPTY_COUNTS: BlobCounts = { vert: 0, jaune: 0, orange: 0, rouge: 0 }

const ADVISOR_ILLUSTRATION = require('@/assets/images/advisor-illustration.webp')
const PROMESSE_ILLUSTRATION = require('@/assets/images/promesse-illustration.webp')

// ─── Types des requêtes ───────────────────────────────────────────────────────

type LastAnalysis = Pick<
  AnalysisRow,
  'id' | 'name' | 'product_label' | 'score' | 'result_json' | 'created_at'
>

interface RoutineSummary {
  count: number
  counts: BlobCounts
}

/** Extrait les `counts` (BlobCounts) du result_json d'une analyse. */
function countsFromResultJson(json: unknown): BlobCounts | null {
  const parsed = parseAnalyseResponse(json)
  if (!parsed) return null
  return {
    vert: parsed.counts.vert,
    jaune: parsed.counts.jaune,
    orange: parsed.counts.orange,
    rouge: parsed.counts.rouge,
  }
}

// ─── Soulignement ondulé (SVG) ────────────────────────────────────────────────

const WavyUnderline: FC<{ width: number }> = ({ width }) => {
  if (width <= 0) return null
  return (
    <Svg
      width={width}
      height={10}
      viewBox="0 -3 200 17"
      preserveAspectRatio="none"
      style={styles.wavy}
    >
      <Path d="M5,11 Q100,-3 195,11 Q100,7 5,11 Z" fill={colors.accent} />
    </Svg>
  )
}

// ─── Carte « Dernière analyse » ───────────────────────────────────────────────

const LastAnalysisCard: FC<{ last: LastAnalysis | null; onPress: () => void }> = ({
  last,
  onPress,
}) => {
  const counts = useMemo<BlobCounts>(
    () => (last ? countsFromResultJson(last.result_json) ?? EMPTY_COUNTS : EMPTY_COUNTS),
    [last],
  )

  if (!last) {
    return (
      <WhiteCard onPress={onPress}>
        <View style={styles.cardHeadEmerald}>
          <Ionicons name="shield-checkmark" size={16} color="#16A34A" />
          <Text style={styles.kickerEmerald}>Dernière analyse</Text>
        </View>
        <Text style={styles.emptyBody}>
          Aucune analyse pour le moment. Lance ta première analyse via le bouton scan.
        </Text>
      </WhiteCard>
    )
  }

  const title = last.product_label?.trim() || last.name?.trim() || 'Analyse'
  const matched = counts.vert + counts.jaune + counts.orange + counts.rouge
  const pctSansPenalite =
    matched > 0 ? Math.round((counts.vert / matched) * 100) : null

  return (
    <WhiteCard onPress={onPress}>
      <View style={styles.cardHeadRow}>
        <View style={styles.cardHeadEmerald}>
          <Ionicons name="shield-checkmark" size={16} color="#16A34A" />
          <Text style={styles.kickerEmerald}>Dernière analyse</Text>
        </View>
        <Text style={styles.seeMore}>Voir →</Text>
      </View>

      <View style={styles.cardBodyRow}>
        <View style={styles.cardBodyText}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
          {pctSansPenalite !== null && (
            <View style={styles.penaltyInline}>
              <Ionicons name="leaf" size={12} color="#16A34A" />
              <Text style={styles.penaltyPct}>{pctSansPenalite} %</Text>
              <Text style={styles.penaltyLabel}>sans pénalité</Text>
            </View>
          )}
        </View>
        <View style={styles.blobSlot}>
          <IngredientBlob counts={counts} variant="md" neumorphic width={170} />
        </View>
      </View>
    </WhiteCard>
  )
}

// ─── Carte « Routine » ────────────────────────────────────────────────────────

const RoutineCard: FC<{ summary: RoutineSummary | undefined; onPress: () => void }> = ({
  summary,
  onPress,
}) => {
  const count = summary?.count ?? 0
  const counts = summary?.counts ?? EMPTY_COUNTS

  if (count === 0) {
    return (
      <WhiteCard onPress={onPress}>
        <View style={styles.cardHeadRose}>
          <Ionicons name="heart" size={16} color={colors.rose} />
          <Text style={styles.kickerRose}>Ta routine</Text>
        </View>
        <Text style={styles.emptyBody}>
          Crée ta routine pour suivre ton exposition cumulée.
        </Text>
        <Text style={styles.seeMoreStart}>Commencer →</Text>
      </WhiteCard>
    )
  }

  const total = counts.vert + counts.jaune + counts.orange + counts.rouge
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  const breakdown = (
    [
      { pct: pct(counts.vert), label: 'sans pénalité', dot: '#22C55E' },
      { pct: pct(counts.jaune), label: 'pén. faible', dot: '#FACC15' },
      { pct: pct(counts.orange), label: 'pén. moyenne', dot: '#F97316' },
      { pct: pct(counts.rouge), label: 'pén. forte', dot: '#EF4444' },
    ] as const
  ).filter((b) => b.pct > 0)

  return (
    <WhiteCard onPress={onPress}>
      <View style={styles.cardHeadRow}>
        <View style={styles.cardHeadRose}>
          <Ionicons name="heart" size={16} color={colors.rose} />
          <Text style={styles.kickerRose}>Ta routine</Text>
        </View>
        <Text style={styles.seeMore}>Voir →</Text>
      </View>

      <View style={styles.cardBodyRowEnd}>
        <View style={styles.cardBodyText}>
          <Text style={styles.cardTitle}>
            {count} produit{count > 1 ? 's' : ''} actif{count > 1 ? 's' : ''}
          </Text>
          {breakdown.length > 0 && (
            <View style={styles.breakdownList}>
              {breakdown.map((b, i) => (
                <View key={b.label}>
                  {i > 0 && <View style={styles.breakdownSep} />}
                  <View style={styles.breakdownRow}>
                    <View style={[styles.breakdownDot, { backgroundColor: b.dot }]} />
                    <Text style={styles.breakdownPct}>{b.pct} %</Text>
                    <Text style={styles.breakdownLabel}>{b.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
        <View style={styles.blobSlot}>
          <IngredientBlob counts={counts} variant="md" neumorphic width={170} />
        </View>
      </View>
    </WhiteCard>
  )
}

// ─── Écran ────────────────────────────────────────────────────────────────────

const DashboardScreen: FC = () => {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { firstName } = useProfile()
  const userId = user?.id ?? null

  const [refreshing, setRefreshing] = useState(false)
  const [underlineWidth, setUnderlineWidth] = useState(0)
  const underlineMeasured = useRef(false)

  const tips = useMemo(() => tipsForCarousel(12), [])

  const lastAnalysisQuery = useQuery<LastAnalysis | null>({
    queryKey: ['dashboard', 'last-analysis', userId],
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!userId) return null
      const { data, error } = await db()
        .from('analyses')
        .select('id,name,product_label,score,result_json,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return (data?.[0] as LastAnalysis | undefined) ?? null
    },
  })

  const routineQuery = useQuery<RoutineSummary>({
    queryKey: ['dashboard', 'routine-summary', userId],
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!userId) return { count: 0, counts: { ...EMPTY_COUNTS } }
      const { data, error } = await db()
        .from('routine_items')
        .select('analysis_id, analyses(result_json)')
        .eq('user_id', userId)
      if (error) throw error
      // L'embed `analyses(result_json)` peut être inféré comme objet ou tableau
      // selon la relation : on normalise défensivement, puis on cumule les
      // `counts` de chaque produit de la routine (même définition que le web).
      const rows = (data ?? []) as {
        analyses:
          | { result_json: unknown }
          | { result_json: unknown }[]
          | null
      }[]
      const counts: BlobCounts = { ...EMPTY_COUNTS }
      for (const row of rows) {
        const a = Array.isArray(row.analyses) ? row.analyses[0] : row.analyses
        const c = countsFromResultJson(a?.result_json)
        if (c) {
          counts.vert += c.vert
          counts.jaune += c.jaune
          counts.orange += c.orange
          counts.rouge += c.rouge
        }
      }
      return { count: rows.length, counts }
    },
  })

  const onRefresh = useCallback(async () => {
    if (!userId) return
    setRefreshing(true)
    try {
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      await queryClient.invalidateQueries({ queryKey: ['credits', userId] })
    } finally {
      setRefreshing(false)
    }
  }, [queryClient, userId])

  const onUnderlineLayout = useCallback((e: LayoutChangeEvent) => {
    if (underlineMeasured.current) return
    underlineMeasured.current = true
    setUnderlineWidth(e.nativeEvent.layout.width)
  }, [])

  const lastAnalysis = lastAnalysisQuery.data ?? null
  const greetingName = firstName?.trim()

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="dashboard" />

      {/* En-tête commun : titre + CreditsPill + filet. */}
      <ScreenHeader
        title={greetingName ? `Bonjour ${greetingName} 👋` : 'Bienvenue 👋'}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: spacing.md, paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.rose} />
        }
      >
        <Reveal stagger={70}>
          {/* Sous-titre + soulignement ondulé */}
          <Text style={styles.subtitle}>
            Décrypte tes cosmétiques{' '}
            <Text style={styles.subtitleStrong} onLayout={onUnderlineLayout}>
              en un clin d&apos;œil
            </Text>
            .
          </Text>
          {/* Le SVG ondulé est posé en absolu sous le mot mesuré. */}
          {underlineWidth > 0 && (
            <View style={styles.wavyAnchor} pointerEvents="none">
              <WavyUnderline width={underlineWidth} />
            </View>
          )}

          {/* Astuce du jour (carrousel) */}
          <TipCarousel tips={tips} />

          {/* Grille : dernière analyse + routine */}
          <View style={styles.grid}>
            <LastAnalysisCard
              last={lastAnalysis}
              onPress={
                lastAnalysis
                  ? () => router.push(ROUTES.ANALYSE.DETAIL(lastAnalysis.id))
                  : () => router.push(ROUTES.TABS.SCAN)
              }
            />
            <RoutineCard
              summary={routineQuery.data}
              onPress={() => router.push(ROUTES.TABS.ROUTINE)}
            />
          </View>

          {/* Cartes promo en dégradé */}
          <Pressable
            onPress={() => router.push(ROUTES.ADVISOR.INDEX)}
            style={styles.promoCard}
          >
            <LinearGradient
              colors={gradients.advisorCard.colors}
              locations={gradients.advisorCard.locations}
              start={gradients.advisorCard.start}
              end={gradients.advisorCard.end}
              style={styles.promoGradient}
            >
              <View style={styles.advisorImageSlot}>
                <Image
                  source={ADVISOR_ILLUSTRATION}
                  style={styles.advisorImage}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.promoTextSlot}>
                <Text style={styles.advisorTitle}>Beauty Advisor ✨</Text>
                <Text style={styles.advisorDesc}>
                  Pose tes questions sur ta routine. L&apos;assistant s&apos;appuie sur ton
                  profil et tes analyses.
                </Text>
                <View style={styles.advisorChip}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color="#FFFFFF" />
                  <Text style={styles.advisorChipText}>Poser une question</Text>
                </View>
              </View>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => router.push(ROUTES.PROMESSES.NOUVELLE)}
            style={styles.promoCard}
          >
            <LinearGradient
              colors={gradients.promessesCard.colors}
              locations={gradients.promessesCard.locations}
              start={gradients.promessesCard.start}
              end={gradients.promessesCard.end}
              style={styles.promoGradient}
            >
              <View style={styles.promesseImageSlot}>
                <Image
                  source={PROMESSE_ILLUSTRATION}
                  style={styles.promesseImage}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.promesseTextSlot}>
                <View style={styles.promesseChip}>
                  <Text style={styles.promesseChipText}>Promesses vs Formule</Text>
                </View>
                <Text style={styles.promesseDesc}>
                  Vérifie si la description marketing d&apos;un produit correspond vraiment à
                  sa composition INCI.
                </Text>
              </View>
              <View style={styles.promesseArrow}>
                <View style={styles.promesseArrowBtn}>
                  <Ionicons name="chevron-forward" size={14} color="#15803D" />
                </View>
              </View>
            </LinearGradient>
          </Pressable>

          {/* Quizz & idées reçues du jour */}
          <View style={styles.dailyPicksWrap}>
            <DailyPicksCard />
          </View>
        </Reveal>
      </ScrollView>
    </View>
  )
}

export default DashboardScreen

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.base,
  },
  subtitle: {
    ...typography.small,
    color: colors.inkMuted,
    marginTop: spacing.md,
  },
  dailyPicksWrap: {
    marginTop: spacing.base,
  },
  subtitleStrong: {
    fontFamily: fontFamilies.medium,
    color: '#111111',
  },
  wavyAnchor: {
    height: 0,
  },
  wavy: {
    marginTop: -2,
  },
  // Grille
  grid: {
    marginTop: spacing.base,
    gap: spacing.md,
  },
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeadEmerald: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardHeadRose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kickerEmerald: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: '#16A34A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kickerRose: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: colors.rose,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  seeMore: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: '#F43F5E',
  },
  seeMoreStart: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: '#F43F5E',
    marginTop: spacing.xs,
  },
  cardBodyRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  cardBodyRowEnd: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.base,
  },
  cardBodyText: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    color: '#111111',
  },
  penaltyInline: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  penaltyPct: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    color: '#16A34A',
  },
  penaltyLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: '#16A34A',
    fontStyle: 'italic',
  },
  breakdownList: {
    marginTop: spacing.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  breakdownSep: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  breakdownPct: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    color: '#374151',
  },
  breakdownLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  blobSlot: {
    width: 170,
    flexShrink: 0,
    // Annule le padding droit de la carte pour aligner le donut sur le bord
    // (comme le `-mr-5` du web).
    marginRight: -spacing.lg,
  },
  emptyBody: {
    ...typography.small,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  // Cartes promo — même drop shadow que WhiteCard pour rester homogène.
  promoCard: {
    marginTop: spacing.base,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  promoGradient: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  // Advisor
  advisorImageSlot: {
    width: 100,
    flexShrink: 0,
    justifyContent: 'flex-end',
  },
  advisorImage: {
    position: 'absolute',
    bottom: 0,
    left: 4,
    height: '108%',
    width: 100,
  },
  promoTextSlot: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  advisorTitle: {
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  advisorDesc: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  advisorChip: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  advisorChipText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    color: '#FFFFFF',
  },
  // Promesses
  promesseImageSlot: {
    width: 110,
    flexShrink: 0,
    justifyContent: 'center',
  },
  promesseImage: {
    position: 'absolute',
    top: '5%',
    left: 8,
    height: '90%',
    width: 100,
  },
  promesseTextSlot: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.base,
    paddingLeft: spacing.lg,
    paddingRight: spacing.base,
  },
  promesseChip: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    backgroundColor: 'rgba(22,163,74,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginBottom: spacing.sm,
  },
  promesseChipText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    color: '#15803D',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  promesseDesc: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(58,90,58,0.8)',
  },
  promesseArrow: {
    justifyContent: 'center',
    paddingRight: spacing.base,
    flexShrink: 0,
  },
  promesseArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DFF5DF',
    shadowColor: '#7DAD7D',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 3,
  },
})
