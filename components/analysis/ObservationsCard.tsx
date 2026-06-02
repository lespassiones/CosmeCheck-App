/**
 * ObservationsCard — section « Observations », port mobile du ObservationsCard
 * web (CosmetWiki AnalyseResultPanel.tsx).
 *
 * Une ligne par observation : icône d'état (absent=vert / info=bleu /
 * warn=ambre / present=orange), libellé + suffixe coloré (« absents » /
 * « non détectés » / « présents »), compteur, et liste dépliable des
 * ingrédients concernés (tappables → fiche ingrédient).
 *
 * Limite à 5 observations par défaut, « Voir le détail » pour tout afficher.
 */

import { memo, useState, type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { spacing } from '@/constants/spacing'
import type { Observation, ObservationStatus } from '@/lib/analysis/types'

interface Props {
  observations: Observation[]
  /** Items résolus pour mapper un nom d'ingrédient à son slug (fiche). */
  slugByName?: Map<string, string>
  onIngredientPress: (slug: string) => void
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const STATUS_VISUAL: Record<
  ObservationStatus,
  { icon: IoniconName; iconColor: string; iconBg: string }
> = {
  absent: { icon: 'checkmark', iconColor: colors.success, iconBg: colors.successSoft },
  info: { icon: 'information', iconColor: colors.info, iconBg: colors.infoSoft },
  warn: { icon: 'warning', iconColor: colors.rating.jaune.text, iconBg: colors.rating.jaune.bg },
  present: { icon: 'warning', iconColor: colors.rating.orange.text, iconBg: colors.rating.orange.bg },
}

function suffixFor(status: ObservationStatus): { text: string; color: string } {
  if (status === 'absent') return { text: 'absents', color: colors.rating.vert.text }
  if (status === 'info') return { text: 'non détectés', color: colors.info }
  return { text: 'présents', color: colors.inkMuted }
}

function prettyName(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

const ObservationsCardBase: FC<Props> = ({ observations, slugByName, onIngredientPress }) => {
  const [expanded, setExpanded] = useState(false)
  const [openTags, setOpenTags] = useState<Set<string>>(new Set())
  const visible = expanded ? observations : observations.slice(0, 5)

  function toggleTag(tag: string) {
    setOpenTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  if (observations.length === 0) return null

  return (
    <WhiteCard padding={spacing.lg}>
      <Text style={styles.h2}>Observations</Text>

      <View style={styles.list}>
        {visible.map((o) => {
          const v = STATUS_VISUAL[o.status]
          const items = o.items ?? []
          const expandable = o.count > 0 && items.length > 0
          const isOpen = openTags.has(o.tag)
          const showCount = expandable && (o.status === 'present' || o.status === 'warn')
          const suffix = suffixFor(o.status)
          return (
            <View key={o.tag}>
              <Pressable
                onPress={expandable ? () => toggleTag(o.tag) : undefined}
                disabled={!expandable}
                accessibilityRole={expandable ? 'button' : undefined}
                accessibilityState={expandable ? { expanded: isOpen } : undefined}
                style={({ pressed }) => [styles.obsRow, pressed && expandable && styles.obsRowPressed]}
              >
                <View style={[styles.statusIcon, { backgroundColor: v.iconBg }]}>
                  <Ionicons name={v.icon} size={14} color={v.iconColor} />
                </View>
                <Text style={styles.obsLabel}>
                  {o.label}{' '}
                  {o.message ? (
                    <Text style={{ color: suffix.color }}>{o.message}</Text>
                  ) : (
                    <Text style={{ color: suffix.color }}>{suffix.text}</Text>
                  )}
                </Text>
                {showCount ? (
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{o.count}</Text>
                  </View>
                ) : null}
                {expandable ? (
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={colors.inkLight}
                  />
                ) : null}
              </Pressable>

              {expandable && isOpen ? (
                <View style={styles.subList}>
                  {items.map((name, idx) => {
                    const slug = slugByName?.get(name.toLowerCase())
                    return (
                      <Pressable
                        key={idx}
                        onPress={() => slug && onIngredientPress(slug)}
                        disabled={!slug}
                        style={({ pressed }) => [styles.subItem, pressed && slug && styles.subItemPressed]}
                      >
                        <Text style={[styles.subText, slug && styles.subTextLink]}>
                          {prettyName(name)}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              ) : null}
            </View>
          )
        })}
      </View>

      {observations.length > 5 ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.moreBtn, pressed && styles.moreBtnPressed]}
        >
          <Text style={styles.moreText}>
            {expanded ? 'Réduire' : 'Voir le détail des observations'} {'->'}
          </Text>
        </Pressable>
      ) : null}
    </WhiteCard>
  )
}

export const ObservationsCard = memo(ObservationsCardBase)

const styles = StyleSheet.create({
  h2: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    color: colors.ink,
  },
  list: {
    gap: 6,
    marginTop: spacing.md,
  },
  obsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: 12,
  },
  obsRowPressed: {
    backgroundColor: colors.gray50,
  },
  statusIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  obsLabel: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    color: colors.ink,
  },
  countBadge: {
    backgroundColor: colors.gray100,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  countText: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    color: colors.inkMuted,
  },
  subList: {
    marginLeft: 38,
    marginTop: 4,
    gap: 4,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderMuted,
    paddingLeft: 12,
  },
  subItem: {
    paddingVertical: 2,
  },
  subItemPressed: {
    opacity: 0.6,
  },
  subText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkMuted,
  },
  subTextLink: {
    color: colors.ink,
  },
  moreBtn: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
  moreBtnPressed: {
    opacity: 0.7,
  },
  moreText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.rating.rouge.DEFAULT,
  },
})
