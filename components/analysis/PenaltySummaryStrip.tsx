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
  /** `row` : les 3 chiffres côte à côte (défaut) ; `column` : empilés. */
  layout?: 'row' | 'column'
  /** Sans carte autour (quand il est posé dans une autre carte). */
  bare?: boolean
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const PenaltySummaryStripBase: FC<Props> = ({ counts, layout = 'row', bare = false }) => {
  const matched = counts.matched
  const penalised = counts.jaune + counts.orange + counts.rouge
  const pctSafe = matched > 0 ? Math.round((counts.vert / matched) * 100) : 0
  const pctPenalised = matched > 0 ? Math.round((penalised / matched) * 100) : 0
  const atRisk = counts.rouge

  const stats: {
    key: string
    icon: IoniconName
    iconColor: string
    valueColor: string
    value: string
    label: string
  }[] = [
    {
      key: 'safe',
      icon: 'shield-checkmark',
      iconColor: colors.rating.vert.text,
      valueColor: colors.rating.vert.text,
      value: `${pctSafe} %`,
      label: 'sans pénalité',
    },
    {
      key: 'penalty',
      icon: 'warning',
      iconColor: colors.rating.jaune.text,
      valueColor: colors.rating.orange.text,
      value: `${pctPenalised} %`,
      label: 'avec pénalité',
    },
    {
      key: 'risk',
      icon: 'close-circle',
      iconColor: colors.rating.rouge.text,
      valueColor: colors.rating.rouge.text,
      value: `${atRisk}`,
      label: 'à risque fort',
    },
  ]

  const content = (
      <View style={layout === 'column' ? styles.column : styles.row}>
        {stats.map((s) => (
          <View key={s.key} style={[styles.stat, layout === 'column' && styles.statStacked]}>
            {/* Icône seule, en couleur, sans bloc teinté autour (28/09/2026). */}
            <View style={styles.iconBox}>
              <Ionicons name={s.icon} size={22} color={s.iconColor} />
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
  )
  // `bare` : posé dans une autre carte (à droite du demi-donut), sans carte à lui.
  return bare ? content : <WhiteCard padding={spacing.md}>{content}</WhiteCard>
}

export const PenaltySummaryStrip = memo(PenaltySummaryStripBase)

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // Les 3 chiffres empilés (à droite du demi-donut).
  column: {
    gap: spacing.sm,
  },
  // Empilés : chaque ligne prend sa hauteur naturelle (pas de flex: 1 en colonne).
  statStacked: {
    flex: 0,
  },
  stat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  iconBox: {
    width: 24,
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
