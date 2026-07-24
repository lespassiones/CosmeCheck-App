/**
 * PromessesScreen — onglet Promesses (twin mobile de /promesses du web).
 *
 * Liste les analyses de cohérence marketing/formule. Pour chaque ligne, on
 * RECALCULE les métriques sur lecture (computeMetrics) — les `metrics` stockés
 * sont un instantané du moment du calcul ; on les ignore pour que les
 * changements de formule s'appliquent rétroactivement.
 *
 * Carte = anneau circulaire de progression (verdict %) + nom produit + marque
 * + "X/X promesses soutenues" + indice marketing + date courte. Tap → détail,
 * appui long → confirmation de suppression. CTA « + Nouvelle analyse ».
 */

import { type FC, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { PressableScale, StaggerItem, useCountUp } from '@/components/design/motion'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ScreenHeader } from '@/components/shared/ScreenHeader'

interface CoherenceRow {
  id: string
  analysis_id: string | null
  description: string
  result_json: CoherenceResult
  created_at: string
  analyses?: {
    name: string | null
    product_label: string | null
    brand: string | null
  } | null
}

// ─── Anneau de progression (verdict %) ────────────────────────────────────────

const RING_SIZE = 76
const RING_STROKE = 6
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/** Couleur de l'anneau selon le verdict %. */
function ringColor(pct: number): string {
  if (pct >= 80) return '#16A34A' // vert
  if (pct >= 60) return '#FBBF24' // jaune
  if (pct >= 35) return '#F97316' // orange
  return '#F43F5E' // rouge
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const PromesseRing: FC<{ pct: number; index?: number }> = ({ pct, index = 0 }) => {
  const safePct = Math.min(100, Math.max(0, pct))
  const color = ringColor(safePct)

  // Remplissage animé de l'anneau (0 → pct) + count-up du % au centre,
  // échelonné selon la position de la carte dans la liste.
  const delay = 180 + Math.min(index, 8) * 70
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = 0
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration: 900,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    )
  }, [safePct, delay, progress])
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - (safePct / 100) * progress.value),
  }))
  const shownPct = useCountUp(safePct, index, 900, delay)

  return (
    <View style={styles.ring}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="#E5E7EB"
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={color}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.ringTextRow}>
        <Text style={styles.ringPct}>{shownPct}</Text>
        <Text style={styles.ringUnit}>%</Text>
      </View>
    </View>
  )
}

// ─── Écran ────────────────────────────────────────────────────────────────────

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
        .select(
          'id,analysis_id,description,result_json,created_at,analyses(name,product_label,brand)',
        )
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

  const renderItem = ({ item, index }: { item: CoherenceRow; index: number }) => {
    const productName =
      item.analyses?.product_label?.trim() ||
      item.analyses?.name?.trim() ||
      item.description.trim().slice(0, 48) ||
      'Analyse de cohérence'
    const brand = item.analyses?.brand?.trim() || null
    const metrics = computeMetrics(item.result_json?.promises ?? [])
    const supported = metrics.tenueCount + metrics.partielleCount

    return (
      <StaggerItem index={index}>
        <PressableScale
          onPress={() => router.push(ROUTES.PROMESSES.DETAIL(item.id))}
          onPressIn={() => {
            Haptics.selectionAsync().catch(() => {})
          }}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
            setPendingDelete(item)
          }}
          delayLongPress={350}
          scaleTo={0.98}
          style={styles.card}
        >
          <PromesseRing pct={metrics.tenuePct} index={index} />

          <View style={styles.itemMain}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {productName}
            </Text>
            {brand ? (
              <Text style={styles.itemBrand} numberOfLines={1}>
                {brand}
              </Text>
            ) : null}
            <Text
              style={[styles.itemMetaPrimary, { color: ringColor(metrics.tenuePct) }]}
              numberOfLines={1}
            >
              {supported}/{metrics.totalPromises} promesse
              {metrics.totalPromises > 1 ? 's' : ''} soutenue
              {supported > 1 ? 's' : ''}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
        </PressableScale>
      </StaggerItem>
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
        <Pressable style={styles.emptyCta} onPress={() => router.push(ROUTES.PROMESSES.CHOISIR)}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.emptyCtaText}>Lancer ma première analyse</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <ScreenHeader title="Promesses" />
      <SafeAreaView style={styles.safe} edges={[]}>
        <View style={styles.subHeader}>
          <Text style={styles.subtitle}>Promesses du produit vs formule réelle</Text>
          {/* Le bouton du haut n'apparaît qu'une fois au moins une analyse faite :
              sur un compte neuf, seul le CTA « Lancer ma première analyse » de
              l'état vide s'affiche (plus de doublon). */}
          {rows.length > 0 ? (
            <Pressable
              style={styles.addBtn}
              onPress={() => router.push(ROUTES.PROMESSES.CHOISIR)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Nouvelle analyse"
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Nouvelle analyse</Text>
            </Pressable>
          ) : null}
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
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  subtitle: { ...typography.xs, color: colors.inkMuted, flex: 1 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.success,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  addBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: '#FFFFFF' },
  listContent: { paddingHorizontal: spacing.base, paddingTop: spacing.xs },
  listContentEmpty: { flexGrow: 1 },

  // ── Carte ──
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.base,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 4,
  },
  // ── Anneau ──
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  ringPct: {
    fontFamily: fontFamilies.bold,
    fontSize: 22,
    color: colors.ink,
    lineHeight: 24,
    includeFontPadding: false,
  },
  ringUnit: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    color: colors.ink,
    marginLeft: 1,
    includeFontPadding: false,
  },

  // ── Texte ──
  itemMain: { flex: 1, minWidth: 0, gap: 1 },
  itemTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
    letterSpacing: -0.1,
  },
  itemBrand: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
  },
  itemMetaPrimary: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: '#F59E0B',
    marginTop: 4,
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
    backgroundColor: colors.success,
  },
  emptyCtaText: { ...typography.button, color: '#FFFFFF' },
})

export default PromessesScreen
