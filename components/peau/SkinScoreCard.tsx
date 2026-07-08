/**
 * SkinScoreCard — carte « Score de peau » du dashboard.
 *
 * Anneau /100 + variation hebdo + date du dernier check-in ; tap -> page
 * « Ma peau » (ROUTES.PEAU.INDEX). État vide : invite au premier bilan.
 * Rendue par le dashboard uniquement si config.flag_skin_score (gate au parent).
 */

import { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { WhiteCard } from '@/components/design/WhiteCard'
import { ScoreRing } from '@/components/peau/ScoreRing'
import { DeltaChip } from '@/components/peau/DeltaChip'
import { useSkinScore } from '@/hooks/useSkinScore'

function formatFrShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export const SkinScoreCard: FC = () => {
  const router = useRouter()
  const { headline, delta, lastCheckinAt, hasData, isLoading } = useSkinScore()

  return (
    <WhiteCard padding={spacing.lg} onPress={() => router.push(ROUTES.PEAU.INDEX)}>
      <View style={styles.row}>
        <ScoreRing score={hasData ? headline : null} size={64} />
        <View style={styles.main}>
          <Text style={styles.title}>Score de peau</Text>
          {hasData ? (
            <>
              <DeltaChip delta={delta} />
              {lastCheckinAt ? (
                <Text style={styles.lastCheckin}>
                  Dernier check-in : {formatFrShortDate(lastCheckinAt)}
                </Text>
              ) : (
                <Text style={styles.lastCheckin}>Basé sur ton scan visage</Text>
              )}
            </>
          ) : (
            <Text style={styles.emptyText}>
              {isLoading ? 'Chargement…' : 'Fais ton premier bilan (45 secondes)'}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
      </View>
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  main: { flex: 1, gap: 4 },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  lastCheckin: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkLight,
  },
  emptyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
  },
})
