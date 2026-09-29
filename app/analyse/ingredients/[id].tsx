/**
 * IngredientListScreen : page « Liste des ingrédients » d'une analyse.
 *
 * Page de la pile (et non une modale) : toucher un ingrédient pousse sa fiche
 * par-dessus, et « retour » ramène simplement ici, au même filtre et au même
 * endroit de la liste. Aucune fermeture / réouverture animée, aucune couche
 * superposée.
 *
 * Données : le résultat déposé par l'écran d'analyse dans le relais mémoire
 * (instantané), sinon relu dans le cache local puis en base.
 * Paramètre `focus` : position d'un ingrédient (tap sur le spectre) sur
 * laquelle la liste s'ouvre.
 */

import { useEffect, useMemo, useState, type FC } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { IngredientTable } from '@/components/analysis/IngredientTable'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { useIngredientFamilies } from '@/hooks/useIngredientFamilies'
import { useProfile } from '@/hooks/useProfile'
import { getAnalysisById } from '@/lib/analysis/analyser'
import { getIngredientList } from '@/lib/analysis/ingredientListHandoff'
import { parseAnalyseResponse, type AnalyseResponse } from '@/lib/analysis/types'
import { checkRestrictions } from '@/lib/restrictions/check'
import { getCachedAnalysisRow } from '@/lib/storage/session'

const IngredientListScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>()
  const focusPosition = focus != null && focus !== '' && !Number.isNaN(Number(focus)) ? Number(focus) : null

  const [result, setResult] = useState<AnalyseResponse | null>(() => (id ? getIngredientList(id) : null))
  const [failed, setFailed] = useState(false)

  // Relais vide : cache local d'abord, puis base.
  useEffect(() => {
    if (result || !id) return
    let cancelled = false
    void (async () => {
      try {
        const row = (await getCachedAnalysisRow(id).catch(() => null)) ?? (await getAnalysisById(id))
        const parsed = row ? parseAnalyseResponse(row.result_json) : null
        if (cancelled) return
        if (parsed) setResult(parsed)
        else setFailed(true)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, result])

  // Restrictions recalculées depuis le profil actuel (comme l'écran d'analyse).
  const { restrictions } = useProfile()
  const { data: families = [] } = useIngredientFamilies()
  const restrictedPositions = useMemo(
    () =>
      new Set(
        result ? checkRestrictions(result.items, restrictions, families).map((m) => m.position) : [],
      ),
    [result, restrictions, families],
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : id && router.replace(ROUTES.ANALYSE.DETAIL(id)))}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          Liste des ingrédients
        </Text>
        <View style={styles.backBtn} />
      </View>

      {result ? (
        <IngredientTable
          items={result.items}
          counts={result.counts}
          restrictedPositions={restrictedPositions}
          onIngredientPress={(slug) => router.push(ROUTES.INGREDIENT.DETAIL(slug))}
          focusPosition={focusPosition}
          bottomInset={insets.bottom}
        />
      ) : failed ? (
        <View style={styles.center}>
          <Text style={styles.message}>Impossible de charger la liste des ingrédients.</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={colors.inkMuted} />
        </View>
      )}
    </SafeAreaView>
  )
}

export default IngredientListScreen

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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { ...typography.h4, color: colors.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  message: { ...typography.small, color: colors.inkMuted, textAlign: 'center' },
})

// Erreur de rendu : seule cette page est remplacée (pas toute l'app).
export { RouteErrorBoundary as ErrorBoundary } from '@/components/shared/RouteErrorBoundary'
