/**
 * QuizQuestionScreen — la question de la notification « Quiz du jour ».
 *
 * Ouverte au tap de la notification (planner serveur, deeplink
 * `/quiz/<id>`). L'accueil ne montrait pas forcément cette question : l'app
 * tire sa série du jour dans les questions serveur ET les 1000 embarquées,
 * le serveur dans les seules questions serveur. On affiche donc LA question
 * annoncée, puis, une fois répondue, la série du jour (`DailyPicksCard`, même
 * progression que sur l'accueil).
 *
 * Question introuvable (supprimée, catalogue hors ligne) : la série du jour
 * directement.
 */

import { type FC, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { WhiteCard } from '@/components/design/WhiteCard'
import {
  DAILY_PICKS_QUERY_KEY,
  DailyPicksCard,
  fetchDailyPicksCatalog,
} from '@/components/home/DailyPicksCard'
import { PickQuestion } from '@/components/home/PickQuestion'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import type { DailyPickItem } from '@/lib/dailyPicks/select'

const QuizQuestionScreen: FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [picked, setPicked] = useState<number | null>(null)
  const scrollRef = useRef<ScrollView>(null)

  // Même requête (clé + fonction) que la série de l'accueil : catalogue en
  // cache partagé, aucun appel de plus si l'accueil l'a déjà chargé.
  const { data, isLoading } = useQuery<DailyPickItem[], Error>({
    queryKey: DAILY_PICKS_QUERY_KEY,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: fetchDailyPicksCatalog,
  })
  const item = useMemo(() => data?.find((it) => it.id === id) ?? null, [data, id])
  const showSeries = !isLoading && (!item || picked !== null)

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.dismissTo(ROUTES.TABS.HOME))}
            hitSlop={12}
            style={styles.backPill}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={16} color={colors.ink} />
            <Text style={styles.backPillText}>Retour</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Quiz du jour</Text>
          <Text style={styles.subtitle}>Teste tes connaissances en cosmétique.</Text>

          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.rose} />
            </View>
          ) : item ? (
            <WhiteCard padding={spacing.lg}>
              <Text style={styles.kicker}>
                {item.kind === 'quiz' ? 'La question du jour' : 'Idée reçue du jour'}
              </Text>
              <PickQuestion
                item={item}
                picked={picked}
                onPick={(i) => {
                  setPicked(i)
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80)
                }}
              />
            </WhiteCard>
          ) : null}

          {showSeries ? (
            <View style={item ? styles.series : undefined}>
              {item ? <Text style={styles.seriesTitle}>Envie d’en faire d’autres ?</Text> : null}
              <DailyPicksCard onReveal={() => scrollRef.current?.scrollToEnd({ animated: true })} />
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

export default QuizQuestionScreen

export { RouteErrorBoundary as ErrorBoundary } from '@/components/shared/RouteErrorBoundary'

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  backPillText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.ink },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  title: { ...typography.h3, color: colors.ink },
  subtitle: {
    ...typography.small,
    color: colors.inkMuted,
    marginTop: 4,
    marginBottom: spacing.base,
  },
  center: { paddingTop: spacing['3xl'], alignItems: 'center' },
  kicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.inkLight,
    marginBottom: spacing.md,
  },
  series: { marginTop: spacing.xl },
  seriesTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: spacing.md,
  },
})
