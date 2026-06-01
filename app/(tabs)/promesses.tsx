/**
 * PromessesScreen — onglet Promesses (twin mobile de /promesses du web).
 *
 * Liste les analyses de cohérence marketing/formule. Pour chaque ligne, on
 * RECALCULE les métriques sur lecture (computeMetrics) — les `metrics` stockés
 * sont un instantané du moment du calcul ; on les ignore pour que les
 * changements de formule s'appliquent rétroactivement. Affiche un badge %
 * (verdict global) façon web. Tap → détail. Appui long / bouton menu →
 * feuille d'action (supprimer). CTA « + Nouvelle analyse ».
 */

import { type FC, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography, fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { db } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { computeMetrics } from '@/lib/coherence/engine'
import type { CoherenceResult } from '@/lib/coherence/types'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { NeuCard } from '@/components/design/NeuCard'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

interface CoherenceRow {
  id: string
  analysis_id: string | null
  description: string
  result_json: CoherenceResult
  created_at: string
  analyses?: { name: string | null; product_label: string | null } | null
}

/** Couleur du badge % selon le verdict global (vert → rose). */
function badgeTone(pct: number): { bg: string; text: string } {
  if (pct >= 67) return { bg: colors.verdict.tenue.soft, text: colors.verdict.tenue.text }
  if (pct >= 34) return { bg: colors.verdict.partielle.soft, text: colors.verdict.partielle.text }
  return { bg: colors.verdict.non_demontree.soft, text: colors.verdict.non_demontree.text }
}

const PromessesScreen: FC = () => {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [pendingDelete, setPendingDelete] = useState<CoherenceRow | null>(null)

  const {
    data: rows = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<CoherenceRow[]>({
    queryKey: ['coherence', userId],
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await db()
        .from('coherence_analyses')
        .select('id,analysis_id,description,result_json,created_at,analyses(name,product_label)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data as unknown as CoherenceRow[] | null) ?? []
    },
  })

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await db().from('coherence_analyses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      void queryClient.invalidateQueries({ queryKey: ['coherence', userId] })
    },
  })

  const renderItem = ({ item }: { item: CoherenceRow }) => {
    const relative = formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: fr })
    const productName =
      item.analyses?.product_label ??
      item.analyses?.name ??
      (item.description.trim().slice(0, 48) || 'Analyse de cohérence')
    const metrics = computeMetrics(item.result_json?.promises ?? [])
    const supported = metrics.tenueCount + metrics.partielleCount
    const tone = badgeTone(metrics.tenuePct)

    return (
      <NeuCard
        onPress={() => router.push(ROUTES.PROMESSES.DETAIL(item.id))}
        padding={spacing.base}
        style={styles.itemCard}
      >
        <View style={styles.itemRow}>
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgePct, { color: tone.text }]}>{metrics.tenuePct}</Text>
            <Text style={[styles.badgeUnit, { color: tone.text }]}>%</Text>
          </View>
          <View style={styles.itemMain}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {productName}
            </Text>
            <Text style={styles.itemMeta} numberOfLines={2}>
              {supported} / {metrics.totalPromises} promesse{metrics.totalPromises > 1 ? 's' : ''}{' '}
              soutenue{supported > 1 ? 's' : ''} · indice marketing {metrics.marketingIndex} % · {relative}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {})
              setPendingDelete(item)
            }}
            hitSlop={10}
            style={styles.menuBtn}
            accessibilityRole="button"
            accessibilityLabel="Supprimer cette analyse"
          >
            <Ionicons name="trash-outline" size={18} color={colors.inkLight} />
          </Pressable>
        </View>
      </NeuCard>
    )
  }

  const listEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.rose} />
        </View>
      )
    }
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="shield-checkmark-outline" size={44} color={colors.inkLight} />
        <Text style={styles.emptyTitle}>Aucune analyse de cohérence</Text>
        <Text style={styles.emptyText}>
          Compare les promesses marketing d&apos;un produit avec sa formule réelle. On te dit ce qui est
          tenu et ce qui relève du marketing.
        </Text>
        <Pressable style={styles.emptyCta} onPress={() => router.push(ROUTES.PROMESSES.NOUVELLE)}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.emptyCtaText}>Lancer ma première analyse</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Promesses</Text>
            <Text style={styles.subtitle}>Promesses du produit vs formule réelle</Text>
          </View>
          <Pressable
            style={styles.addBtn}
            onPress={() => router.push(ROUTES.PROMESSES.NOUVELLE)}
            hitSlop={8}
            accessibilityLabel="Nouvelle analyse"
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 64 + spacing.xl },
            rows.length === 0 && styles.listContentEmpty,
          ]}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          showsVerticalScrollIndicator={false}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
        />
      </SafeAreaView>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Supprimer cette analyse ?"
        message="Cette analyse de cohérence sera définitivement supprimée."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        destructive
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id)
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    paddingBottom: spacing.md,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.xs, color: colors.inkMuted, marginTop: 2 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs },
  listContentEmpty: { flexGrow: 1 },
  itemCard: { borderRadius: radius.lg },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  badgePct: { fontFamily: fontFamilies.bold, fontSize: 16 },
  badgeUnit: { fontFamily: fontFamilies.medium, fontSize: 10 },
  itemMain: { flex: 1, minWidth: 0 },
  itemTitle: { ...typography.bodyMedium, color: colors.ink },
  itemMeta: { ...typography.xs, color: colors.inkMuted, marginTop: 2 },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { paddingTop: spacing['3xl'], alignItems: 'center' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.h4, color: colors.ink, marginTop: spacing.sm, textAlign: 'center' },
  emptyText: { ...typography.small, color: colors.inkMuted, textAlign: 'center' },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.base,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.rose,
  },
  emptyCtaText: { ...typography.button, color: '#FFFFFF' },
})

export default PromessesScreen
