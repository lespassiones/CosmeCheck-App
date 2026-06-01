/**
 * SynthesisCard — section « Synthèse », port mobile du SynthesisCard web
 * (CosmetWiki AnalyseResultPanel.tsx) SANS l'effet de streaming caractère par
 * caractère (le rendu mobile affiche le texte d'un bloc).
 *
 * Rend le markdown léger de `result_json.synthesis` : paragraphes + listes à
 * puces, avec mise en gras des **termes** (les noms INCI). Les noms d'actifs
 * sont teintés selon leur ColorRating via la map `colorByName` fournie.
 *
 * IMPORTANT — la génération de synthèse à la demande (Edge Function
 * /api/synthesis) N'EST PAS encore déployée. Quand `synthesis` est null on
 * affiche un état « indisponible » discret + un bouton stub qui no-op
 * gracieusement (ne plante jamais).
 */

import { memo, useMemo, type FC, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { GlassCard } from '@/components/design/GlassCard'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { spacing } from '@/constants/spacing'
import { normalizeColor, type AnalyseItem, type ColorRating } from '@/lib/analysis/types'

interface Props {
  synthesis: string | null
  items: AnalyseItem[]
  /** Appelé par le bouton stub quand la synthèse est absente. No-op gracieux
   *  tant que l'Edge Function n'est pas déployée. */
  onRequestSynthesis?: () => void
}

type SynthesisBlock = { type: 'p'; text: string } | { type: 'ul'; items: string[] }

const BULLET_RE = /^[-•*]\s+(.+)$/

function parseSynthesisBlocks(text: string): SynthesisBlock[] {
  const blocks: SynthesisBlock[] = []
  for (const chunk of text.split(/\n{2,}/)) {
    const trimmed = chunk.trim()
    if (!trimmed) continue
    const lines = trimmed.split('\n')
    let pBuffer: string[] = []
    let ulBuffer: string[] = []
    const flushP = () => {
      if (pBuffer.length === 0) return
      blocks.push({ type: 'p', text: pBuffer.join(' ') })
      pBuffer = []
    }
    const flushUl = () => {
      if (ulBuffer.length === 0) return
      blocks.push({ type: 'ul', items: ulBuffer })
      ulBuffer = []
    }
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue
      const m = BULLET_RE.exec(line)
      if (m) {
        flushP()
        ulBuffer.push(m[1]!.trim())
      } else {
        flushUl()
        pBuffer.push(line)
      }
    }
    flushP()
    flushUl()
  }
  return blocks
}

function normaliseToken(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
}

function textColorForRating(r: ColorRating): string {
  return colors.rating[r].text
}

/** Rend une string avec **gras** → <Text bold> (teinté si rating connu). */
function renderBold(s: string, colorByName: Map<string, ColorRating>, keyPrefix: string): ReactNode[] {
  const parts = s.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      const inner = p.slice(2, -2)
      const rating = colorByName.get(normaliseToken(inner))
      return (
        <Text
          key={`${keyPrefix}-${i}`}
          style={[styles.bold, rating ? { color: textColorForRating(rating) } : null]}
        >
          {inner}
        </Text>
      )
    }
    return <Text key={`${keyPrefix}-${i}`}>{p}</Text>
  })
}

const SynthesisCardBase: FC<Props> = ({ synthesis, items, onRequestSynthesis }) => {
  const colorByName = useMemo(() => {
    const m = new Map<string, ColorRating>()
    for (const it of items) {
      const rating = normalizeColor(it.colorRating ?? it.dbColorRating ?? null)
      if (!rating) continue
      if (it.name) m.set(normaliseToken(it.name), rating)
      if (it.input) m.set(normaliseToken(it.input), rating)
    }
    return m
  }, [items])

  const blocks = useMemo(() => (synthesis ? parseSynthesisBlocks(synthesis) : []), [synthesis])

  return (
    <GlassCard padding={spacing.lg}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={16} color={colors.accent} />
        <Text style={styles.h2}>Synthèse</Text>
      </View>

      {synthesis && blocks.length > 0 ? (
        <View style={styles.body}>
          {blocks.map((block, i) => {
            if (block.type === 'p') {
              return (
                <Text key={i} style={styles.paragraph}>
                  {renderBold(block.text, colorByName, `p${i}`)}
                </Text>
              )
            }
            return (
              <View key={i} style={styles.ul}>
                {block.items.map((item, j) => (
                  <View key={j} style={styles.li}>
                    <View style={styles.bullet} />
                    <Text style={styles.liText}>{renderBold(item, colorByName, `li${i}-${j}`)}</Text>
                  </View>
                ))}
              </View>
            )
          })}
        </View>
      ) : (
        <View style={styles.unavailable}>
          <Text style={styles.unavailableText}>
            Synthèse indisponible pour le moment. Consulte le détail des observations et la liste
            des ingrédients ci-dessous pour interpréter les résultats.
          </Text>
          {onRequestSynthesis ? (
            <Pressable
              onPress={() => onRequestSynthesis?.()}
              accessibilityRole="button"
              style={({ pressed }) => [styles.stubBtn, pressed && styles.stubBtnPressed]}
            >
              <Ionicons name="sparkles-outline" size={14} color={colors.accent} />
              <Text style={styles.stubText}>Générer la synthèse</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </GlassCard>
  )
}

export const SynthesisCard = memo(SynthesisCardBase)

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  h2: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    color: colors.ink,
  },
  body: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  paragraph: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  bold: {
    fontFamily: fontFamilies.semiBold,
    color: colors.ink,
  },
  ul: {
    gap: 6,
  },
  li: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.inkLight,
    marginTop: 8,
  },
  liText: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  unavailable: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  unavailableText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkMuted,
  },
  stubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  stubBtnPressed: {
    opacity: 0.8,
  },
  stubText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: colors.accent,
  },
})
