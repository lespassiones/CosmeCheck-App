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

import { memo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

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

  // Quelle info-bulle est ouverte ('top5' | 'top10' | null). Tap pour basculer.
  const [openInfo, setOpenInfo] = useState<'top5' | 'top10' | null>(null)

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
  // Ne comptent comme « critiques » que l'orange et le rouge (le jaune et le
  // vert sont exclus des chiffres).
  const criticalInTop5 = effectiveTop5.filter(
    (r) => r === 'orange' || r === 'rouge',
  ).length
  const allGreenTop5 =
    effectiveTop5.length > 0 && effectiveTop5.every((r) => r === 'vert')

  function handlePress(position: number) {
    onPositionClick?.(position)
  }

  function nameAt(position: number): string {
    const it = ingredientAt(position)
    return it?.name ?? it?.input ?? '-'
  }

  return (
    <View style={[styles.card, style]}>
      <View style={styles.titleRow}>
        <Text style={styles.h3}>Spectre top 5</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="À quoi sert le spectre top 5 ?"
          hitSlop={8}
          onPress={() => setOpenInfo((v) => (v === 'top5' ? null : 'top5'))}
          style={({ pressed }) => [styles.infoDot, pressed && styles.pressed]}
        >
          <Ionicons name="information" size={12} color={colors.surface} />
        </Pressable>
      </View>

      {openInfo === 'top5' ? (
        <Text style={styles.infoText}>
          Les 5 premiers ingrédients représentent la plus grande partie du
          produit (souvent 75 à 99 %). Un ingrédient non vert ici est critique :
          il pèse bien plus lourd que le même ingrédient en fin de liste.
        </Text>
      ) : null}

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

      {criticalInTop5 > 0 ? (
        <View style={styles.warnChip}>
          <Text style={styles.warnText}>
            <Text style={styles.warnBold}>Attention : </Text>
            Parmi les {effectiveTop5.length} ingrédients en quantité importante,{' '}
            {criticalInTop5} {criticalInTop5 > 1 ? 'sont critiques' : 'est critique'}.
          </Text>
        </View>
      ) : allGreenTop5 ? (
        <Text style={styles.okHint}>
          Top 5 entièrement vert - la majorité de la formule est sans risque connu.
        </Text>
      ) : null}

      <View style={styles.titleRow}>
        <Text style={styles.h3small}>Spectre top 10</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="À quoi sert le spectre top 10 ?"
          hitSlop={8}
          onPress={() => setOpenInfo((v) => (v === 'top10' ? null : 'top10'))}
          style={({ pressed }) => [styles.infoDot, pressed && styles.pressed]}
        >
          <Ionicons name="information" size={12} color={colors.surface} />
        </Pressable>
      </View>

      {openInfo === 'top10' ? (
        <Text style={styles.infoText}>
          Une vue élargie sur les 10 premiers ingrédients. Plus le rang est bas
          (1, 2, 3…), plus l&apos;ingrédient est présent en quantité dans le
          produit.
        </Text>
      ) : null}

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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  h3: { fontSize: 15, fontWeight: '600', color: colors.ink },
  h3small: { fontSize: 13, fontWeight: '600', color: colors.ink },
  infoDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.inkLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.inkMuted,
    marginBottom: 12,
  },
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
