/**
 * Logo — wordmark "Cosme Check".
 *
 * Présentatif, sans asset externe : "Cosme" en `ink` (ou `color` si fourni) et
 * "Check" en `rose`, le tout en Inter-Bold, précédé d'une petite pastille/goutte
 * dégradée rose → violet pour rappeler l'univers cosmétique.
 *
 * Interface : <Logo size? color? />
 *   - size : taille de police du wordmark (défaut 24). La pastille s'échelonne.
 *   - color : couleur du mot "Cosme" (défaut colors.ink). "Check" reste rose.
 */

import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'

interface Props {
  size?: number
  color?: string
}

/**
 * LogoMark — marque seule "trois points de couleur" (rose, vert, violet).
 *
 * Version détourée du logo (sans wordmark). À utiliser quand on veut la marque
 * graphique pure, p. ex. en en-tête des écrans d'auth.
 *
 * Interface : <LogoMark size? gap? />
 *   - size : diamètre de chaque point (défaut 16).
 *   - gap  : espace entre les points (défaut ≈ 0,42 × size, fidèle au logo).
 */
const MARK_COLORS = ['#F6099B', '#54D41D', '#5F1EE1'] as const

export const LogoMark: FC<{ size?: number; gap?: number }> = ({ size = 16, gap }) => {
  const g = gap ?? Math.round(size * 0.42)

  return (
    <View style={markStyles.row} accessibilityRole="image" accessibilityLabel="Cosme Check">
      {MARK_COLORS.map((c, i) => (
        <View
          key={c}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: c,
            marginLeft: i === 0 ? 0 : g,
          }}
        />
      ))}
    </View>
  )
}

const markStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})

export const Logo: FC<Props> = ({ size = 24, color = colors.ink }) => {
  const dot = Math.round(size * 0.62)

  return (
    <View style={styles.row} accessibilityRole="image" accessibilityLabel="Cosme Check">
      <View
        style={[
          styles.dot,
          {
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            marginRight: size * 0.32,
          },
        ]}
      >
        <View
          style={[
            styles.dotCore,
            {
              width: dot * 0.42,
              height: dot * 0.42,
              borderRadius: (dot * 0.42) / 2,
            },
          ]}
        />
      </View>

      <Text
        style={[styles.word, { fontSize: size, color }]}
        allowFontScaling={false}
        numberOfLines={1}
      >
        Cosme
        <Text style={[styles.word, { fontSize: size, color: colors.rose }]}> Check</Text>
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  dot: {
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
    // Liseré violet subtil pour l'effet bi-couleur rose/violet.
    borderWidth: 2,
    borderColor: colors.accent,
  },
  dotCore: {
    backgroundColor: colors.surface,
  },
  word: {
    fontFamily: fontFamilies.bold,
    letterSpacing: -0.5,
  },
})
