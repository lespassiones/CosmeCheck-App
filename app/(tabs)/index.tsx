/**
 * DashboardScreen (Tab Accueil) — TWIN du web `HomeDashboard.tsx`.
 *
 * Salutation STATIQUE « Bonjour {firstName} 👋 » + filet (#c5ccd6) + une BARRE
 * DE RECHERCHE à placeholder animé « machine à écrire » (noms de produits qui
 * s'écrivent/s'effacent). Puis TipCarousel, et une GRILLE 2×2 de 4 tuiles
 * (Dernière analyse · Ta routine · Beauty Advisor · Promesses vs Formule) —
 * chacune = titre + icône/illustration + chevron, sans texte de données.
 *
 * Données via react-query (enabled si user). ScrollView + pull-to-refresh.
 * Apparition animée via Reveal, fond via BackgroundGlow.
 */

import { type FC, useCallback, useMemo, useRef, useState } from 'react'
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { db } from '@/lib/supabase/client'
import type { AnalysisRow } from '@/lib/supabase/types'
import { parseAnalyseResponse } from '@/lib/analysis/types'
import { tipsForCarousel } from '@/lib/tips'
import type { BlobCounts } from '@/components/design/IngredientBlob'
import { IngredientBlob } from '@/components/design/IngredientBlob'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { PressableScale } from '@/components/design/motion'
import { Reveal } from '@/components/design/Reveal'
import { ScreenHeader } from '@/components/shared/ScreenHeader'
import { SearchPromptBar } from '@/components/home/SearchPromptBar'
import { TipCarousel } from '@/components/home/TipCarousel'
import { DailyPicksCard } from '@/components/home/DailyPicksCard'
import { WeeklyPicksCard } from '@/components/home/WeeklyPicksCard'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'

const EMPTY_COUNTS: BlobCounts = { vert: 0, jaune: 0, orange: 0, rouge: 0 }

const PROMESSE_ILLUSTRATION = require('@/assets/images/promesse-illustration.webp')
const ROUTINE_ILLUSTRATION = require('@/assets/images/routine.webp')
const ADVISOR_ILLUSTRATION = require('@/assets/images/advisor.webp')

// ─── Types des requêtes ───────────────────────────────────────────────────────

type LastAnalysis = Pick<
  AnalysisRow,
  'id' | 'name' | 'product_label' | 'score' | 'result_json' | 'created_at'
>

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

// ─── Tuile générique de la grille ─────────────────────────────────────────────

type TileTheme = {
  bg: string
  title: string
  chevronBg: string
  chevron: string
}

const THEMES: Record<'green' | 'pink' | 'purple', TileTheme> = {
  green: { bg: '#E4F3E9', title: '#15803D', chevronBg: 'rgba(255,255,255,0.75)', chevron: '#15803D' },
  pink: { bg: '#FCE3EC', title: '#E11D48', chevronBg: 'rgba(255,255,255,0.75)', chevron: '#E11D48' },
  purple: { bg: '#ECE6FA', title: '#6D28D9', chevronBg: 'rgba(255,255,255,0.75)', chevron: '#6D28D9' },
}

const DashboardTile: FC<{
  theme: 'green' | 'pink' | 'purple'
  title: string
  onPress: () => void
  children: React.ReactNode
}> = ({ theme, title, onPress, children }) => {
  const t = THEMES[theme]
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={title.replace(/\n/g, ' ')}
      style={[styles.tile, { backgroundColor: t.bg }]}
    >
      <View style={styles.tileHead}>
        <Text style={[styles.tileTitle, { color: t.title }]}>{title}</Text>
        <View style={[styles.tileChevron, { backgroundColor: t.chevronBg }]}>
          <Ionicons name="chevron-forward" size={15} color={t.chevron} />
        </View>
      </View>
      <View style={styles.tileArt}>{children}</View>
    </PressableScale>
  )
}

// ─── Écran ────────────────────────────────────────────────────────────────────

const DashboardScreen: FC = () => {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { firstName } = useProfile()
  const { config } = useAppConfig()
  const userId = user?.id ?? null

  const [refreshing, setRefreshing] = useState(false)

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

  const onRefresh = useCallback(async () => {
    if (!userId) return
    setRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['routine', userId] }),
        queryClient.invalidateQueries({ queryKey: ['credits', userId] }),
      ])
    } finally {
      setRefreshing(false)
    }
  }, [queryClient, userId])

  const scrollRef = useRef<ScrollView>(null)
  const lastAnalysis = lastAnalysisQuery.data ?? null
  const lastCounts = useMemo<BlobCounts>(
    () => (lastAnalysis ? countsFromResultJson(lastAnalysis.result_json) ?? EMPTY_COUNTS : EMPTY_COUNTS),
    [lastAnalysis],
  )
  const greetingName = firstName?.trim()

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="dashboard" />

      {/* En-tête commun : titre + CreditsPill + filet. */}
      <ScreenHeader
        title={greetingName ? `Bonjour ${greetingName} 👋` : 'Bienvenue 👋'}
      />

      <ScrollView
        ref={scrollRef}
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
          {/* Barre de recherche à placeholder animé (noms de produits qui
              s'écrivent/s'effacent). Au tap → recherche produit dédiée. */}
          <SearchPromptBar
            onPress={() =>
              router.push({ pathname: ROUTES.TABS.SCAN, params: { mode: 'search' } })
            }
          />

          {/* Astuce du jour (carrousel) */}
          <TipCarousel tips={tips} />

          {/* Grille 2×2 — 4 tuiles simples (titre + icône + chevron). */}
          <View style={styles.tilesGrid}>
            <DashboardTile
              theme="green"
              title={'Dernière\nanalyse'}
              onPress={
                lastAnalysis
                  ? () => router.push(ROUTES.ANALYSE.DETAIL(lastAnalysis.id))
                  : () => router.push(ROUTES.TABS.SCAN)
              }
            >
              {lastAnalysis ? (
                <View style={styles.blobSlot}>
                  <IngredientBlob counts={lastCounts} variant="md" neumorphic width={132} />
                </View>
              ) : (
                <Ionicons name="leaf" size={52} color="#86C99A" />
              )}
            </DashboardTile>

            <DashboardTile
              theme="pink"
              title={'Ma\nroutine'}
              onPress={() => router.push(ROUTES.TABS.ROUTINE)}
            >
              <Image
                source={ROUTINE_ILLUSTRATION}
                style={styles.routineArt}
                resizeMode="contain"
              />
            </DashboardTile>

            <DashboardTile
              theme="purple"
              title={'Beauty\nAdvisor'}
              onPress={() => router.push(ROUTES.ADVISOR.INDEX)}
            >
              <Image
                source={ADVISOR_ILLUSTRATION}
                style={styles.advisorArt}
                resizeMode="contain"
              />
            </DashboardTile>

            <DashboardTile
              theme="green"
              title={'Promesses\nvs Formule'}
              onPress={() => router.push(ROUTES.PROMESSES.CHOISIR)}
            >
              <Image
                source={PROMESSE_ILLUSTRATION}
                style={styles.promesseArt}
                resizeMode="contain"
              />
            </DashboardTile>
          </View>

          {/* Pépites de la semaine (produits sélectionnés pour le profil) */}
          {config.flag_weekly_picks && (
            <View style={styles.weeklyPicksWrap}>
              <WeeklyPicksCard />
            </View>
          )}

          {/* Quizz & idées reçues du jour */}
          <View style={styles.dailyPicksWrap}>
            <DailyPicksCard
              onReveal={() => scrollRef.current?.scrollToEnd({ animated: true })}
            />
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
  dailyPicksWrap: {
    marginTop: spacing.base,
  },
  weeklyPicksWrap: {
    marginTop: spacing.base,
  },
  // Grille 2×2
  tilesGrid: {
    marginTop: spacing.base,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tile: {
    width: '48%',
    minHeight: 158,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  tileTitle: {
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  tileChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileArt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
    minHeight: 76,
  },
  blobSlot: {
    width: 132,
    alignItems: 'center',
  },
  routineArt: {
    width: 128,
    height: 82,
  },
  advisorArt: {
    width: 112,
    height: 83,
  },
  promesseArt: {
    width: 92,
    height: 82,
  },
})
