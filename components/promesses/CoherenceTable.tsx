/**
 * CoherenceTable — "Tableau de cohérence" (twin mobile du web).
 *
 * Sur mobile, le tableau 3 colonnes du web devient une pile de cartes
 * accordéon : en-tête (libellé + badge verdict) toujours visible, tap →
 * révèle les ingrédients trouvés (avec pastille de sécurité), les ingrédients
 * contredisants (verdict "contredite"), ou un message pour les promesses
 * "tenue" d'absence. Les promesses déduites (inferred) sont exclues — elles
 * ont leur propre carte (InferredPromisesCard).
 */

import { type FC, useState } from 'react'
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { GlassCard } from '@/components/design/GlassCard'
import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
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

export const CoherenceTable: FC<{ promises: CoherencePromise[]; items?: AnalyseItem[] }> = ({
  promises,
  items = [],
}) => {
  const directPromises = promises.filter((p) => !p.inferred)
  const colorMap = buildColorMap(items)

  if (directPromises.length === 0) {
    return (
      <GlassCard padding={spacing.lg}>
        <Text style={styles.emptyTitle}>
          Aucune promesse vérifiable n&apos;a été détectée dans la description.
        </Text>
        <Text style={styles.emptySub}>
          La description ne contient peut-être que des mentions générales (composition, certification,
          sensorialité…).
        </Text>
      </GlassCard>
    )
  }

  return (
    <GlassCard padding={spacing.lg}>
      <Text style={styles.title}>Tableau de cohérence</Text>
      <Text style={styles.subtitle}>
        Pour chaque promesse : le verdict de la formule et les ingrédients trouvés.
      </Text>
      <View style={styles.list}>
        {directPromises.map((p) => (
          <PromiseAccordion key={p.slug + p.excerpt} promise={p} colorMap={colorMap} />
        ))}
      </View>
    </GlassCard>
  )
}

const PromiseAccordion: FC<{
  promise: CoherencePromise
  colorMap: Map<string, DbColorRating | null>
}> = ({ promise, colorMap }) => {
  const [open, setOpen] = useState(false)
  const tone = VERDICT_TONE[promise.verdict]

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((v) => !v)
  }

  return (
    <View style={[styles.accordion, { borderColor: tone.ring }]}>
      <Pressable onPress={toggle} style={styles.accHeader} accessibilityRole="button">
        <View style={styles.accHeaderLeft}>
          {promise.verdict !== 'tenue' ? (
            <View style={[styles.leadDot, { backgroundColor: tone.solid }]} />
          ) : null}
          <Text style={styles.accLabel} numberOfLines={open ? undefined : 2}>
            {promise.label}
          </Text>
        </View>
        <View style={styles.accHeaderRight}>
          <View style={[styles.badge, { backgroundColor: tone.soft, borderColor: tone.ring }]}>
            <Text style={[styles.badgeText, { color: tone.text }]}>{tone.label}</Text>
          </View>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.inkLight}
          />
        </View>
      </Pressable>

      {open ? (
        <View style={[styles.accBody, { borderTopColor: tone.ring }]}>
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
  // Verdict "contredite" : on liste les ingrédients qui CONTREDISENT la promesse.
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

  // Promesse d'absence "tenue" (ex : "sans paraben" → aucun paraben trouvé).
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
  title: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.ink },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
    marginTop: 4,
    marginBottom: spacing.base,
  },
  emptyTitle: { fontFamily: fontFamilies.medium, fontSize: 14, color: colors.inkMuted, textAlign: 'center' },
  emptySub: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkLight,
    textAlign: 'center',
    marginTop: 4,
  },
  list: { gap: spacing.sm },
  accordion: {
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  accHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  accHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  leadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  accLabel: { flex: 1, fontFamily: fontFamilies.semiBold, fontSize: 14, color: colors.ink, lineHeight: 19 },
  accHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 2 },
  badgeText: { fontFamily: fontFamilies.semiBold, fontSize: 11 },
  accBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderTopWidth: 1 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md },
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
    borderWidth: 1,
    borderColor: colors.verdict.contredite.ring,
    borderRadius: 9999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  contradictName: { fontFamily: fontFamilies.medium, fontSize: 12, color: colors.verdict.contredite.text },
  contradictPos: { fontFamily: fontFamilies.regular, fontSize: 10, color: colors.verdict.contredite.text, opacity: 0.8 },
  absenceOk: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.verdict.tenue.text, marginTop: spacing.md },
  dash: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.inkLight, marginTop: spacing.md },
})
