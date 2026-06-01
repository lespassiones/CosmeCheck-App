/**
 * IngredientSpectrum — « spectre » positionnel des premiers ingrédients,
 * port du web (CosmetWiki components/analyse/IngredientSpectrum.tsx).
 *
 * Deux rangées de carrés colorés :
 *  - Spectre top 5 : 5 grands carrés (les ~75-99 % de la formule) + n° de position.
 *  - Spectre top 10 : 10 petits carrés (vue élargie).
 *
 * Chaque carré est tappable et émet `onPositionClick(position)` (1-indexé) —
 * utilisé par le panneau d'analyse pour scroller jusqu'à la ligne d'ingrédient.
 * Couleurs depuis `colors.spectrum`. Purement présentationnel.
 */

import { memo } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { colors } from '@/constants/colors'
import {
  normalizeColor,
  type AnalyseItem,
  type AnalyseSpectrum,
  type ColorRating,
  type DbColorRating,
} from '@/lib/analysis/types'

const COLOR_MAP = colors.spectrum
const EMPTY_COLOR = colors.spectrum.empty

interface Props {
  spectrum: AnalyseSpectrum
  /** Pour résoudre la couleur effective + le nom (optionnel). */
  items?: AnalyseItem[]
  /** Émis au tap d'un carré (position 1-indexée). */
  onPositionClick?: (position: number) => void
  style?: StyleProp<ViewStyle>
}

function ratingColor(rating: ColorRating | null): string {
  if (!rating) return EMPTY_COLOR
  return COLOR_MAP[rating]
}

export const IngredientSpectrum = memo(function IngredientSpectrum({
  spectrum,
  items = [],
  onPositionClick,
  style,
}: Props) {
  const top5 = spectrum?.top5 ?? []
  const top10 = spectrum?.top10 ?? []

  function ingredientAt(position: number): AnalyseItem | undefined {
    return items.find((it) => it.position === position)
  }

  /**
   * Couleur effective d'un carré : le `colorRating` strict si l'analyseur l'a
   * confirmé, sinon le `dbColorRating` de l'ingrédient apparié, sinon la valeur
   * pré-calculée par le serveur (top5/top10) en dernier recours.
   */
  function effectiveRatingAt(
    position: number,
    serverFallback: DbColorRating | null,
  ): ColorRating | null {
    const it = ingredientAt(position)
    const raw = it
      ? it.colorRating ?? it.dbColorRating ?? serverFallback
      : serverFallback
    return normalizeColor(raw)
  }

  const effectiveTop5 = top5.map((r, i) => effectiveRatingAt(i + 1, r))
  const effectiveTop10 = top10.map((r, i) => effectiveRatingAt(i + 1, r))
  const nonGreenInTop5 = effectiveTop5.filter((r) => r && r !== 'vert').length

  function handlePress(position: number) {
    onPositionClick?.(position)
  }

  function nameAt(position: number): string {
    const it = ingredientAt(position)
    return it?.name ?? it?.input ?? '-'
  }

  return (
    <View style={[styles.card, style]}>
      <Text style={styles.h3}>Spectre top 5</Text>

      <View style={styles.top5Row}>
        {effectiveTop5.length === 0 ? (
          <Text style={styles.emptyHint}>Aucun ingrédient à afficher.</Text>
        ) : (
          effectiveTop5.map((rating, i) => {
            const position = i + 1
            return (
              <View key={i} style={styles.top5Item}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${nameAt(position)} - position ${position}${rating ? ` - ${rating}` : ''}`}
                  onPress={() => handlePress(position)}
                  style={({ pressed }) => [
                    styles.bigSquare,
                    { backgroundColor: ratingColor(rating) },
                    pressed && styles.pressed,
                  ]}
                />
                <Text style={styles.posLabel}>{position}</Text>
              </View>
            )
          })
        )}
      </View>

      {nonGreenInTop5 > 0 ? (
        <View style={styles.warnChip}>
          <Text style={styles.warnText}>
            <Text style={styles.warnBold}>Attention : </Text>
            {nonGreenInTop5} ingrédient{nonGreenInTop5 > 1 ? 's' : ''} non-vert
            {nonGreenInTop5 > 1 ? 's' : ''} dans le top 5 - c'est l'essentiel de la formule.
          </Text>
        </View>
      ) : effectiveTop5.length > 0 ? (
        <Text style={styles.okHint}>
          Top 5 entièrement vert - la majorité de la formule est sans risque connu.
        </Text>
      ) : null}

      <Text style={styles.h3small}>Spectre top 10</Text>

      <View style={styles.top10Row}>
        {effectiveTop10.map((rating, i) => {
          const position = i + 1
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`${nameAt(position)} - position ${position}${rating ? ` - ${rating}` : ''}`}
              onPress={() => handlePress(position)}
              style={({ pressed }) => [
                styles.smallSquare,
                { backgroundColor: ratingColor(rating) },
                pressed && styles.pressed,
              ]}
            />
          )
        })}
      </View>

      <Text style={styles.footHint}>
        Touche un carré pour aller à l'ingrédient correspondant.
      </Text>
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.glass.bg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glass.border,
    padding: 20,
  },
  h3: { fontSize: 15, fontWeight: '600', color: colors.ink, marginBottom: 12 },
  h3small: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: 8 },
  top5Row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 },
  top5Item: { alignItems: 'center', gap: 4 },
  bigSquare: { width: 36, height: 36, borderRadius: 6 },
  posLabel: { fontSize: 10, color: colors.inkLight },
  top10Row: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  smallSquare: { width: 20, height: 20, borderRadius: 4 },
  pressed: { opacity: 0.6 },
  warnChip: {
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: colors.rating.rouge.bg,
    borderWidth: 1,
    borderColor: colors.rating.rouge.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warnText: { fontSize: 11, lineHeight: 16, color: colors.rating.rouge.ink },
  warnBold: { fontWeight: '700' },
  okHint: { marginBottom: 16, fontSize: 11, color: colors.inkLight },
  emptyHint: { fontSize: 12, color: colors.inkLight },
  footHint: { fontSize: 10, color: colors.inkLight, marginTop: 8 },
})
