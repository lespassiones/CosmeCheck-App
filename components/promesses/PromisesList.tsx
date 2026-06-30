/**
 * PromisesList — bloc UNIQUE « Promesses » (refonte épurée, twin du mockup).
 *
 * Fusionne l'ancien « Détail par promesse » (barre par promesse) et l'ancien
 * « Tableau de cohérence » (ingrédients trouvés) en une seule liste :
 *   - Ligne repliée : libellé + badge verdict + fine barre colorée (score).
 *   - Au tap : déplie le % de couverture, l'extrait de la promesse et les
 *     ingrédients trouvés (pastille de sécurité), contredisants, ou un message.
 *
 * Les promesses déduites (inferred) sont exclues : elles ont leur propre carte
 * (InferredPromisesCard). PRÉSENTATION UNIQUEMENT — données inchangées.
 */

import { type FC, useEffect, useState } from 'react'
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useReducedMotion } from 'react-native-reanimated'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { CoherencePromise } from '@/lib/coherence/types'
import type { AnalyseItem, DbColorRating } from '@/lib/analysis/types'
import { VERDICT_TONE, ratingDotColor } from './tone'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function buildColorMap(items: AnalyseItem[]): Map<string, DbColorRating | null> {
  const map = new Map<string, DbColorRating | null>()
  for (const it of items) {
    if (it.slug) map.set(`s:${it.slug}`, it.colorRating)
    if (it.name) map.set(`n:${normalize(it.name)}`, it.colorRating)
    if (it.input) map.set(`n:${normalize(it.input)}`, it.colorRating)
  }
  return map
}

function lookupColor(
  active: { name: string; slug: string | null },
  map: Map<string, DbColorRating | null>,
): DbColorRating | null {
  if (active.slug) {
    const r = map.get(`s:${active.slug}`)
    if (r !== undefined) return r
  }
  const n = normalize(active.name)
  if (n) {
    const r = map.get(`n:${n}`)
    if (r !== undefined) return r
  }
  return null
}

export const PromisesList: FC<{ promises: CoherencePromise[]; items?: AnalyseItem[] }> = ({
  promises,
  items = [],
}) => {
  const directPromises = promises.filter((p) => !p.inferred)
  const colorMap = buildColorMap(items)

  const reduceMotion = useReducedMotion()
  const [progress, setProgress] = useState(reduceMotion ? 1 : 0)
  useEffect(() => {
    if (reduceMotion) {
      setProgress(1)
      return
    }
    let raf: number
    const duration = 1200
    const start = Date.now()
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration)
      setProgress(1 - Math.pow(1 - t, 3))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduceMotion])

  if (directPromises.length === 0) {
    return (
      <WhiteCard padding={spacing.lg}>
        <Text style={styles.title}>Promesses</Text>
        <Text style={styles.emptySub}>
          Aucune promesse vérifiable détectée dans la description (mentions générales : composition,
          certification, sensorialité…).
        </Text>
      </WhiteCard>
    )
  }

  return (
    <WhiteCard padding={spacing.lg}>
      <Text style={styles.title}>Promesses</Text>
      <View style={styles.list}>
        {directPromises.map((p, i) => (
          <PromiseRow
            key={p.slug + p.excerpt}
            promise={p}
            colorMap={colorMap}
            progress={progress}
            first={i === 0}
          />
        ))}
      </View>
    </WhiteCard>
  )
}

const PromiseRow: FC<{
  promise: CoherencePromise
  colorMap: Map<string, DbColorRating | null>
  progress: number
  first: boolean
}> = ({ promise, colorMap, progress, first }) => {
  const [open, setOpen] = useState(false)
  const tone = VERDICT_TONE[promise.verdict]
  const target = Math.max(4, promise.score)
  const animatedWidth = Math.max(progress > 0 ? 4 : 0, target * progress)

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((v) => !v)
  }

  return (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <Pressable onPress={toggle} style={styles.header} accessibilityRole="button">
        <View style={styles.headerTop}>
          <Text style={styles.label} numberOfLines={open ? undefined : 2}>
            {promise.label}
          </Text>
          <View style={styles.headerRight}>
            <View style={[styles.badge, { backgroundColor: tone.soft }]}>
              <Text style={[styles.badgeText, { color: tone.text }]}>{tone.badge}</Text>
            </View>
            <Ionicons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={colors.inkLight}
            />
          </View>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${animatedWidth}%`, backgroundColor: tone.solid }]} />
        </View>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <Text style={styles.coverage}>
            Couverture par la formule : <Text style={[styles.coverageStrong, { color: tone.text }]}>{promise.score} %</Text>
          </Text>
          {promise.excerpt ? <Text style={styles.excerpt}>« {promise.excerpt} »</Text> : null}
          <FoundList promise={promise} colorMap={colorMap} />
        </View>
      ) : null}
    </View>
  )
}

const FoundList: FC<{
  promise: CoherencePromise
  colorMap: Map<string, DbColorRating | null>
}> = ({ promise, colorMap }) => {
  if (
    promise.verdict === 'contredite' &&
    promise.contradictingActives &&
    promise.contradictingActives.length > 0
  ) {
    return (
      <View style={styles.chipsWrap}>
        {promise.contradictingActives.map((c, i) => (
          <View key={`${c.slug ?? c.name}-${i}`} style={styles.contradictChip}>
            <Ionicons name="warning" size={11} color={colors.verdict.contredite.text} />
            <Text style={styles.contradictName}>{c.name}</Text>
            <Text style={styles.contradictPos}>pos. {c.position}</Text>
          </View>
        ))}
      </View>
    )
  }

  if (
    promise.verdict === 'tenue' &&
    promise.foundActives.length === 0 &&
    promise.cosmeticActives.length === 0
  ) {
    return <Text style={styles.absenceOk}>Aucun ingrédient de ce type détecté.</Text>
  }

  const entries = [
    ...promise.foundActives.map((f) => ({ name: f.name, slug: f.slug })),
    ...promise.cosmeticActives.map((c) => ({ name: c.name, slug: c.slug })),
  ]

  if (entries.length === 0) {
    return <Text style={styles.dash}>Aucun ingrédient identifié pour cette promesse.</Text>
  }

  return (
    <View style={styles.chipsWrap}>
      {entries.map((e, i) => (
        <View key={`${e.slug ?? e.name}-${i}`} style={styles.foundChip}>
          <View style={[styles.foundDot, { backgroundColor: ratingDotColor(lookupColor(e, colorMap)) }]} />
          <Text style={styles.foundName}>{e.name}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.ink, marginBottom: spacing.sm },
  emptySub: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
    marginTop: 2,
  },
  list: {},
  row: { paddingVertical: spacing.base },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#F1F3F5' },
  header: { gap: spacing.md },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { flex: 1, fontFamily: fontFamilies.medium, fontSize: 15, color: colors.ink, lineHeight: 20 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: { borderRadius: 9999, paddingHorizontal: 11, paddingVertical: 4 },
  badgeText: { fontFamily: fontFamilies.semiBold, fontSize: 12 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.gray100, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  body: { marginTop: spacing.md, gap: spacing.sm },
  coverage: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  coverageStrong: { fontFamily: fontFamilies.semiBold },
  excerpt: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 19, color: colors.inkMuted, fontStyle: 'italic' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  foundChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.gray50,
    borderRadius: 9999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  foundDot: { width: 8, height: 8, borderRadius: 4 },
  foundName: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.ink },
  contradictChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.verdict.contredite.soft,
    borderRadius: 9999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  contradictName: { fontFamily: fontFamilies.medium, fontSize: 12, color: colors.verdict.contredite.text },
  contradictPos: { fontFamily: fontFamilies.regular, fontSize: 10, color: colors.verdict.contredite.text, opacity: 0.8 },
  absenceOk: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.verdict.tenue.text },
  dash: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkLight },
})
