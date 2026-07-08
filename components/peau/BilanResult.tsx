/**
 * BilanResult — écran de fin du bilan hebdo : anneau animé /100, variation
 * hebdo, phrase d'encouragement déterministe (insightLine sur la dimension la
 * plus améliorée, sinon global), carte « Rappels utiles » après le PREMIER
 * bilan (permission notifications demandée ici, JAMAIS au lancement de l'app).
 */

import { type FC, useMemo } from 'react'
import { StyleSheet, Text, View, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { SKIN_DIMENSIONS, insightLine, type SkinPoint } from '@/lib/skin/score'
import { ScoreRing } from '@/components/peau/ScoreRing'
import { DeltaChip } from '@/components/peau/DeltaChip'
import { EnableNotificationsCard } from '@/components/notifications/EnableNotificationsCard'

interface Props {
  score: number
  delta: number | null
  /** Timeline complète (check-ins + scans) pour la phrase d'encouragement. */
  timeline: SkinPoint[]
  /** Affiche la carte d'activation des notifications (1er bilan + pas déjà vue). */
  showEnableNotifications: boolean
  onDone: () => void
}

/** Dimension la plus améliorée entre les 2 derniers points (sinon 'global'). */
function bestImprovedDim(timeline: SkinPoint[]): 'global' | (typeof SKIN_DIMENSIONS)[number] {
  if (timeline.length < 2) return 'global'
  const sorted = [...timeline].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const last = sorted[sorted.length - 1]
  const prev = sorted[sorted.length - 2]
  let best: 'global' | (typeof SKIN_DIMENSIONS)[number] = 'global'
  let bestDelta = -Infinity
  for (const dim of SKIN_DIMENSIONS) {
    const d = last.dims[dim] - prev.dims[dim]
    if (d > bestDelta) {
      bestDelta = d
      best = dim
    }
  }
  return bestDelta > 0 ? best : 'global'
}

export const BilanResult: FC<Props> = ({
  score,
  delta,
  timeline,
  showEnableNotifications,
  onDone,
}) => {
  const encouragement = useMemo(() => {
    const dim = bestImprovedDim(timeline)
    return insightLine(timeline, dim) ?? 'Bilan enregistré. Reviens la semaine prochaine pour suivre ta progression.'
  }, [timeline])

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <ScoreRing score={score} size={150} animated />
        <View style={styles.deltaWrap}>
          <DeltaChip delta={delta} />
        </View>
        <View style={styles.checkRow}>
          <Ionicons name="checkmark-circle" size={20} color={colors.rating.vert.text} />
          <Text style={styles.checkText}>Bilan de la semaine terminé</Text>
        </View>
        <Text style={styles.encouragement}>{encouragement}</Text>
      </View>

      {showEnableNotifications && (
        <View style={styles.notifWrap}>
          <EnableNotificationsCard />
        </View>
      )}

      <Pressable style={styles.doneBtn} onPress={onDone} accessibilityRole="button">
        <Text style={styles.doneText}>Voir ma peau</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  hero: { alignItems: 'center' },
  deltaWrap: { marginTop: spacing.md },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
  checkText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  encouragement: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  notifWrap: { marginTop: spacing.xl },
  doneBtn: {
    backgroundColor: colors.rose,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  doneText: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: '#FFFFFF' },
})
