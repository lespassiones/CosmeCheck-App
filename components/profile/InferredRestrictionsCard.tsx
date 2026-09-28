/**
 * InferredRestrictionsCard — récapitulatif LECTURE SEULE des « sensibilités
 * probables » déduites du profil par le worker back-end
 * (profile-restriction-inference). RIEN n'est activé : simple information (les
 * vraies restrictions restent celles cochées ci-dessous). Rendu null tant que
 * la ligne n'existe pas ou que la liste est vide → zéro bruit visuel.
 *
 * 28/09/2026 : repliée par défaut, une seule ligne « Suggestions selon ton
 * profil » avec une ampoule ; le détail s'ouvre au toucher.
 */
import { type FC, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
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
  const [open, setOpen] = useState(false)

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
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.titleRow}
      >
        <Ionicons name="bulb-outline" size={20} color={colors.ink} />
        <Text style={styles.title}>Suggestions selon ton profil</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted} />
      </Pressable>
      {open ? (
      <View style={styles.body}>
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
      </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // Même cadre que le champ de recherche et la liste : fond blanc, filet, sans ombre.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
  },
  title: { ...typography.bodyMedium, fontWeight: '700', color: colors.ink, flex: 1 },
  body: { paddingHorizontal: spacing.base, paddingBottom: spacing.base },
  hint: {
    ...typography.xs,
    color: colors.inkMuted,
    lineHeight: 16,
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
