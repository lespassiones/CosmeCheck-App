/**
 * InferredRestrictionsCard — récapitulatif LECTURE SEULE des « sensibilités
 * probables » déduites du profil par le worker back-end
 * (profile-restriction-inference). RIEN n'est activé : simple information (les
 * vraies restrictions restent celles cochées ci-dessous). Rendu null tant que
 * la ligne n'existe pas ou que la liste est vide → zéro bruit visuel.
 */
import { type FC, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { WhiteCard } from '@/components/design/WhiteCard'
import { db } from '@/lib/supabase/client'

type Item = { label: string; reason?: string | null }

/** Builder PostgREST minimal (table hors types générés). */
interface InferenceQuery {
  select: (cols: string) => InferenceQuery
  eq: (col: string, val: unknown) => InferenceQuery
  maybeSingle: () => PromiseLike<{ data: unknown }>
}

export const InferredRestrictionsCard: FC<{ userId: string | null }> = ({ userId }) => {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    if (!userId) return
    let alive = true
    void (async () => {
      try {
        const q = db().from('profile_restriction_inference' as never) as unknown as InferenceQuery
        const { data } = await q.select('items').eq('user_id', userId).maybeSingle()
        const raw = (data as { items?: unknown } | null)?.items
        if (!alive || !Array.isArray(raw)) return
        setItems(
          (raw as Record<string, unknown>[])
            .filter((i) => typeof i?.label === 'string' && (i.label as string).trim())
            .map((i) => ({ label: i.label as string, reason: (i.reason as string) ?? null }))
            .slice(0, 8),
        )
      } catch {
        // best-effort : la carte est purement informative
      }
    })()
    return () => {
      alive = false
    }
  }, [userId])

  if (items.length === 0) return null

  return (
    <WhiteCard padding={spacing.base} style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="sparkles" size={14} color={colors.accent} />
        <Text style={styles.title}>Suggérées selon ton profil</Text>
      </View>
      <Text style={styles.hint}>
        Déduites automatiquement de ton profil (peau, préoccupations, objectifs).
        Simple récapitulatif : rien n&apos;est activé, tes restrictions restent
        celles que tu coches ci-dessous.
      </Text>
      <View style={styles.list}>
        {items.map((it) => (
          <View key={it.label} style={styles.row}>
            <View style={styles.dot} />
            <Text style={styles.rowText} numberOfLines={2}>
              <Text style={styles.rowLabel}>{it.label}</Text>
              {it.reason ? <Text style={styles.rowReason}> : {'' + it.reason}</Text> : null}
            </Text>
          </View>
        ))}
      </View>
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { ...typography.smallSemiBold, color: colors.ink },
  hint: {
    ...typography.xs,
    color: colors.inkMuted,
    lineHeight: 16,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  list: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    flexShrink: 0,
  },
  rowText: { flex: 1, ...typography.xs, color: colors.inkMuted, lineHeight: 17 },
  rowLabel: { ...typography.xsSemiBold, color: colors.ink },
  rowReason: { color: colors.inkMuted },
})
