/**
 * NouvellePromesseScreen — création d'une analyse de cohérence (twin mobile de
 * /promesses/nouvelle du web).
 *
 * Charge les analyses INCI de l'utilisateur (projection légère pour l'étape de
 * confirmation du wizard : 3 premiers ingrédients + répartition) puis rend le
 * CoherenceWizard 3 étapes.
 */

import { type FC } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'

import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { CoherenceWizard, type AnalysisOption } from '@/components/promesses/CoherenceWizard'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { db } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { parseAnalyseResponse } from '@/lib/analysis/types'

interface AnalysisRow {
  id: string
  name: string | null
  product_label: string | null
  created_at: string
  result_json: unknown
}

const NouvellePromesseScreen: FC = () => {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const { data: options = [], isLoading } = useQuery<AnalysisOption[]>({
    queryKey: ['coherence-options', userId],
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await db()
        .from('analyses')
        .select('id,name,product_label,created_at,result_json')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      const rows = (data as unknown as AnalysisRow[] | null) ?? []
      return rows
        .map((r): AnalysisOption | null => {
          const result = parseAnalyseResponse(r.result_json)
          if (!result) return null
          const items = result.items ?? []
          const top3 = items
            .slice()
            .sort((a, b) => a.position - b.position)
            .slice(0, 3)
            .map((it) => it.name ?? it.input)
          return {
            id: r.id,
            title:
              r.product_label ??
              r.name ??
              `Analyse du ${new Date(r.created_at).toLocaleDateString('fr-FR')}`,
            createdAt: r.created_at,
            totalIngredients: result.counts?.total ?? 0,
            matchedIngredients: result.counts?.matched ?? 0,
            counts: {
              vert: result.counts?.vert ?? 0,
              jaune: result.counts?.jaune ?? 0,
              orange: result.counts?.orange ?? 0,
              rouge: result.counts?.rouge ?? 0,
            },
            top3,
          }
        })
        .filter((o): o is AnalysisOption => o !== null)
    },
  })

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BackgroundGlow variant="default" />

      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          Nouvelle analyse
        </Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.intro}>
        <Text style={styles.h1}>Nouvelle analyse de cohérence</Text>
        <Text style={styles.introSub}>
          On compare ce qui est promis sur l&apos;emballage avec ce qui est vraiment dans la liste INCI.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.rose} />
        </View>
      ) : (
        <View style={styles.wizardWrap}>
          <CoherenceWizard options={options} />
        </View>
      )}
    </SafeAreaView>
  )
}

export default NouvellePromesseScreen

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backBtn: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  topTitle: { ...typography.h4, color: colors.ink },
  intro: { paddingHorizontal: spacing.base, paddingTop: spacing.xs, paddingBottom: spacing.base },
  h1: { ...typography.h2, color: colors.ink },
  introSub: { ...typography.xs, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 18 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  wizardWrap: { flex: 1, paddingHorizontal: spacing.base },
})
