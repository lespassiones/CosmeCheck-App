/**
 * ExposureBar — barre horizontale empilée vert/jaune/orange/rouge représentant
 * la proportion d'ingrédients par niveau de pénalité. Port mobile de
 * CosmetWiki/components/compare/ExposureBar.tsx.
 *
 * `ExposureCountsRow` rend la ligne compacte de pastilles « 7 · 5 · 1 · 0 »
 * sous la barre, chaque point reprenant la couleur de son segment.
 */

import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'

export type ExposureCounts = {
  vert: number
  jaune: number
  orange: number
  rouge: number
}

// Palette « hard » des proportions (= web emerald/yellow/orange/rose).
const SEG = {
  vert: '#10B981',
  jaune: '#FACC15',
  orange: '#F97316',
  rouge: '#F43F5E',
} as const

export const ExposureBar: FC<{ counts: ExposureCounts }> = ({ counts }) => {
  const total = counts.vert + counts.jaune + counts.orange + counts.rouge
  if (total === 0) {
    return <View style={styles.empty} accessible accessibilityLabel="Aucun ingrédient reconnu" />
  }
  const pct = (n: number) => (n / total) * 100

  return (
    <View
      style={styles.bar}
      accessibilityRole="image"
      accessibilityLabel={`Répartition des ingrédients : ${counts.vert} sans pénalité, ${counts.jaune} pénalité faible, ${counts.orange} pénalité moyenne, ${counts.rouge} pénalité forte.`}
    >
      {counts.vert > 0 && <View style={{ width: `${pct(counts.vert)}%`, backgroundColor: SEG.vert }} />}
      {counts.jaune > 0 && <View style={{ width: `${pct(counts.jaune)}%`, backgroundColor: SEG.jaune }} />}
      {counts.orange > 0 && <View style={{ width: `${pct(counts.orange)}%`, backgroundColor: SEG.orange }} />}
      {counts.rouge > 0 && <View style={{ width: `${pct(counts.rouge)}%`, backgroundColor: SEG.rouge }} />}
    </View>
  )
}

export const ExposureCountsRow: FC<{ counts: ExposureCounts }> = ({ counts }) => (
  <View style={styles.row}>
    <CountChip color={SEG.vert} value={counts.vert} label="sans pénalité" />
    <CountChip color={SEG.jaune} value={counts.jaune} label="pénalité faible" />
    <CountChip color={SEG.orange} value={counts.orange} label="pénalité moyenne" />
    <CountChip color={SEG.rouge} value={counts.rouge} label="pénalité forte" />
  </View>
)

const CountChip: FC<{ color: string; value: number; label: string }> = ({ color, value, label }) => (
  <View style={[styles.chip, value === 0 && styles.chipDim]} accessible accessibilityLabel={`${value} ${label}`}>
    <View style={[styles.dot, { backgroundColor: color }]} />
    <Text style={styles.chipValue}>{value}</Text>
  </View>
)

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 12,
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: colors.gray100,
  },
  empty: {
    height: 12,
    width: '100%',
    borderRadius: 999,
    backgroundColor: colors.gray100,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 12,
    rowGap: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chipDim: {
    opacity: 0.45,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipValue: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
})
