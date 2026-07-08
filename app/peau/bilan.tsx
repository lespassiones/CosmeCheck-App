/**
 * BilanScreen — bilan hebdo du score de peau (modal).
 *
 * Wizard 5 questions (BilanWizard) -> upsertCheckin (gratuit, 1 par semaine ISO,
 * refaire écrase) -> BilanResult (anneau animé + delta + encouragement).
 *
 * Au PREMIER bilan de la vie du compte :
 *   - émet SKIN_FIRST_BILAN_COMPLETED_EVENT (DeviceEventEmitter) ;
 *   - montre la carte « Rappels utiles » (permission notifications demandée ICI,
 *     jamais au lancement de l'app, décision produit).
 * À chaque bilan : rescheduleAfterBilan (le rappel hebdo saute la semaine faite).
 */

import { type FC, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, DeviceEventEmitter, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { useSkinScore } from '@/hooks/useSkinScore'
import { upsertCheckin } from '@/lib/skin/api'
import { SKIN_FIRST_BILAN_COMPLETED_EVENT } from '@/lib/skin/events'
import { isoWeekKey } from '@/lib/skin/week'
import { readNotificationPrefs, shouldShowEnableCard } from '@/lib/notifications/prefs'
import { getPermissionStatus } from '@/lib/notifications/scheduler'
import { showToast } from '@/components/shared/Toast'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { BilanWizard } from '@/components/peau/BilanWizard'
import { BilanResult } from '@/components/peau/BilanResult'

type Stage = 'wizard' | 'saving' | 'result'

const BilanScreen: FC = () => {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { timeline, delta, refresh } = useSkinScore()
  const qc = useQueryClient()

  const [stage, setStage] = useState<Stage>('wizard')
  const [finalScore, setFinalScore] = useState<number>(0)
  const [showNotifCard, setShowNotifCard] = useState(false)

  const prefs = readNotificationPrefs(
    ((profile?.preferences as Record<string, unknown> | null | undefined)?.notifications ??
      null) as Record<string, unknown> | null,
  )

  // Statut de permission (async) : conditionne la carte « Rappels utiles ».
  const [permStatus, setPermStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unavailable'>(
    'unavailable',
  )
  useEffect(() => {
    void getPermissionStatus()
      .then(setPermStatus)
      .catch(() => {})
  }, [])

  const handleComplete = useCallback(
    async (answers: number[]) => {
      if (!user?.id) return
      setStage('saving')
      try {
        const isFirstBilan = timeline.filter((p) => p.source === 'checkin').length === 0
        const row = await upsertCheckin(user.id, isoWeekKey(new Date()), answers)
        setFinalScore(row.score)

        // Rafraîchit le cache (le delta du résultat inclut le nouveau point).
        await qc.invalidateQueries({ queryKey: ['skinCheckins', user.id] })
        refresh()

        if (isFirstBilan) {
          DeviceEventEmitter.emit(SKIN_FIRST_BILAN_COMPLETED_EVENT)
          setShowNotifCard(shouldShowEnableCard(prefs, permStatus))
        }
        // Le rappel hebdo est DISTANT (cron serveur) : il vérifie lui-même
        // l'absence de bilan cette semaine, donc rien à replanifier ici.

        setStage('result')
      } catch {
        showToast("Impossible d'enregistrer ton bilan. Réessaie.", 'error')
        setStage('wizard')
      }
    },
    [user?.id, timeline, qc, refresh, prefs, permStatus],
  )

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.PEAU.INDEX))}
            hitSlop={12}
            style={styles.backPill}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <Ionicons name="close" size={16} color={colors.ink} />
          </Pressable>
          <Text style={styles.topTitle}>Bilan de la semaine</Text>
          <View style={styles.topSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {stage === 'wizard' && <BilanWizard onComplete={handleComplete} />}
          {stage === 'saving' && (
            <View style={styles.center}>
              <ActivityIndicator color={colors.rose} />
              <Text style={styles.savingText}>Enregistrement de ton bilan…</Text>
            </View>
          )}
          {stage === 'result' && (
            <BilanResult
              score={finalScore}
              delta={delta}
              timeline={timeline}
              showEnableNotifications={showNotifCard}
              onDone={() => router.replace(ROUTES.PEAU.INDEX)}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

export default BilanScreen

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  topTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  topSpacer: { width: 34 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  savingText: { fontFamily: fontFamilies.medium, fontSize: 13, color: colors.inkMuted },
})
