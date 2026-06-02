/**
 * PenaltySummaryStrip — bandeau « le verdict en chiffres » à 3 stats, port
 * mobile du PenaltySummaryStrip web (CosmetWiki AnalyseResultPanel.tsx).
 *
 *   - % sans pénalité  (vert / matched)   — icône bouclier
 *   - % avec pénalité  (jaune+orange+rouge / matched) — icône triangle
 *   - N à risque fort  (rouge)            — icône croix
 *
 * Ratios calculés sur `matched` (ingrédients reconnus) uniquement.
 */

import { memo, type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { spacing } from '@/constants/spacing'
import type { AnalyseCounts } from '@/lib/analysis/types'

interface Props {
  counts: AnalyseCounts
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const PenaltySummaryStripBase: FC<Props> = ({ counts }) => {
  const matched = counts.matched
  const penalised = counts.jaune + counts.orange + counts.rouge
  const pctSafe = matched > 0 ? Math.round((counts.vert / matched) * 100) : 0
  const pctPenalised = matched > 0 ? Math.round((penalised / matched) * 100) : 0
  const atRisk = counts.rouge

  const stats: {
    key: string
    icon: IoniconName
    iconColor: string
    iconBg: string
    valueColor: string
    value: string
    label: string
  }[] = [
    {
      key: 'safe',
      icon: 'shield-checkmark',
      iconColor: colors.rating.vert.text,
      iconBg: colors.rating.vert.bg,
      valueColor: colors.rating.vert.text,
      value: `${pctSafe} %`,
      label: 'sans pénalité',
    },
    {
      key: 'penalty',
      icon: 'warning',
      iconColor: colors.rating.jaune.text,
      iconBg: colors.rating.jaune.bg,
      valueColor: colors.rating.orange.text,
      value: `${pctPenalised} %`,
      label: 'avec pénalité',
    },
    {
      key: 'risk',
      icon: 'close-circle',
      iconColor: colors.rating.rouge.text,
      iconBg: colors.rating.rouge.bg,
      valueColor: colors.rating.rouge.text,
      value: `${atRisk}`,
      label: 'à risque fort',
    },
  ]

  return (
    <WhiteCard padding={spacing.md}>
      <View style={styles.row}>
        {stats.map((s) => (
          <View key={s.key} style={styles.stat}>
            <View style={[styles.iconBox, { backgroundColor: s.iconBg }]}>
              <Ionicons name={s.icon} size={16} color={s.iconColor} />
            </View>
            <View style={styles.statBody}>
              <Text style={[styles.value, { color: s.valueColor }]}>{s.value}</Text>
              <Text style={styles.label} numberOfLines={1}>
                {s.label}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </WhiteCard>
  )
}

export const PenaltySummaryStrip = memo(PenaltySummaryStripBase)

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBody: {
    minWidth: 0,
    flexShrink: 1,
  },
  value: {
    fontFamily: fontFamilies.bold,
    fontSize: 17,
    color: colors.ink,
  },
  label: {
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    color: colors.ink,
    marginTop: 2,
  },
})
