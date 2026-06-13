/**
 * ProductToolsSection — bloc « Outils » tout en bas de l'écran d'analyse
 * (après les alternatives). Un seul cadre (WhiteCard), lignes compactes :
 * libellé + hint à gauche, icône tout à droite, séparées par un filet.
 *
 * Outils :
 *   - Signaler une information incorrecte → ReportProductErrorSheet.
 *   - Ajouter une photo (UNIQUEMENT si le produit n'a pas d'image) →
 *     SubmitProductPhotosSheet.
 *   - Comment cette note est calculée ? → ScoreExplainerSheet.
 *
 * (« Modifier les infos » et « Créer une routine » volontairement absents.)
 */
import { useState, type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { spacing } from '@/constants/spacing'
import type { ColorRating } from '@/lib/analysis/types'
import { ReportProductErrorSheet } from './ReportProductErrorSheet'
import { SubmitProductPhotosSheet } from './SubmitProductPhotosSheet'
import { ScoreExplainerSheet } from './ScoreExplainerSheet'

interface Props {
  productEan: string | null
  brand: string | null
  productName: string | null
  category: string | null
  /** True si le produit a déjà une image → on masque l'outil photo. */
  hasImage: boolean
  /** Note /20 affichée (verdict plafonné) — pour l'explication de la note. */
  score: number | null
  /** Répartition couleur des ingrédients de ce produit. */
  counts: Record<ColorRating | 'unknown', number>
}

export const ProductToolsSection: FC<Props> = ({
  productEan,
  brand,
  productName,
  category,
  hasImage,
  score,
  counts,
}) => {
  const [errorOpen, setErrorOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [scoreOpen, setScoreOpen] = useState(false)

  // Les lignes affichées (la photo n'apparaît que sans image).
  const rows = [
    {
      key: 'report',
      icon: 'alert-circle-outline' as const,
      label: 'Signaler une information incorrecte',
      hint: 'Nom, marque ou composition',
      onPress: () => setErrorOpen(true),
    },
    ...(!hasImage
      ? [
          {
            key: 'photo',
            icon: 'camera-outline' as const,
            label: 'Ajouter une photo de ce produit',
            hint: "Aide les autres à le reconnaître",
            onPress: () => setPhotoOpen(true),
          },
        ]
      : []),
    {
      key: 'score',
      icon: 'help-circle-outline' as const,
      label: 'Comment cette note est calculée ?',
      hint: 'Comprendre le détail du score',
      onPress: () => setScoreOpen(true),
    },
  ]

  return (
    <WhiteCard padding={spacing.lg}>
      <Text style={styles.title}>Outils</Text>

      <View style={styles.rows}>
        {rows.map((r, i) => (
          <ToolRow
            key={r.key}
            icon={r.icon}
            label={r.label}
            hint={r.hint}
            onPress={r.onPress}
            showDivider={i < rows.length - 1}
          />
        ))}
      </View>

      <ReportProductErrorSheet
        visible={errorOpen}
        onClose={() => setErrorOpen(false)}
        productEan={productEan}
        productName={productName}
      />
      <SubmitProductPhotosSheet
        visible={photoOpen}
        onClose={() => setPhotoOpen(false)}
        productEan={productEan}
        brand={brand}
        productName={productName}
        category={category}
      />
      <ScoreExplainerSheet
        visible={scoreOpen}
        onClose={() => setScoreOpen(false)}
        productName={productName}
        category={category}
        score={score}
        counts={counts}
      />
    </WhiteCard>
  )
}

const ToolRow: FC<{
  icon: keyof typeof Ionicons.glyphMap
  label: string
  hint: string
  onPress: () => void
  showDivider: boolean
}> = ({ icon, label, hint, onPress, showDivider }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.row,
      showDivider && styles.rowDivider,
      pressed && styles.rowPressed,
    ]}
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    <View style={styles.rowText}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowHint}>{hint}</Text>
    </View>
    <Ionicons name={icon} size={22} color={colors.inkMuted} />
  </Pressable>
)

const styles = StyleSheet.create({
  title: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.ink },
  rows: { marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { opacity: 0.55 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontFamily: fontFamilies.medium, fontSize: 14.5, color: colors.ink },
  rowHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 2,
  },
})
