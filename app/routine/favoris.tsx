/**
 * FavorisScreen — page « Mes favoris ».
 *
 * Liste tous les produits marqués favori (colonne analyses.favori), quelle que
 * soit leur source (signet dans l'historique OU « Garder en favori » dans le
 * deck de suggestions). Même carte épurée que la routine (photo + nom + marque
 * + donut). Au tap : ouverture de l'analyse (/analyse/[id]) — c'est une liste
 * de produits à retrouver / acheter, pas des items de routine.
 */

import { type FC } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography, fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { useFavorites } from '@/hooks/useFavorites'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { RoutineProductCard, ROUTINE_CARD_GAP } from '@/components/routine/RoutineProductCard'

const FavorisScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const { favorites, isLoading } = useFavorites()

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.TABS.ROUTINE))}
            hitSlop={12}
            style={styles.backPill}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={16} color={colors.ink} />
            <Text style={styles.backPillText}>Retour</Text>
          </Pressable>
          <Text style={styles.topTitle}>Mes favoris</Text>
          <View style={styles.topSpacer} />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.rose} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['3xl'] }]}
            showsVerticalScrollIndicator={false}
          >
            {favorites.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="bookmark-outline" size={40} color={colors.inkLight} />
                <Text style={styles.emptyText}>
                  Aucun favori pour l'instant. Mets des produits en favori depuis l'historique
                  (icône signet) ou en gardant une alternative proposée.
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {favorites.map((fav) => (
                  <RoutineProductCard
                    key={fav.id}
                    itemId={fav.id}
                    analysisId={fav.id}
                    displayIndex={0}
                    name={fav.name}
                    brand={fav.brand}
                    ean={fav.ean}
                    fallbackImageUrl={fav.fallbackImageUrl}
                    counts={fav.counts}
                    onPress={(id) => router.push(ROUTES.ANALYSE.DETAIL(id))}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  )
}

export default FavorisScreen

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  backPillText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.ink },
  topTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  topSpacer: { width: 78 },
  content: { paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  center: { paddingTop: spacing['3xl'], alignItems: 'center', flex: 1 },
  list: { gap: ROUTINE_CARD_GAP },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    gap: spacing.sm,
  },
  emptyText: { ...typography.small, color: colors.inkMuted, textAlign: 'center' },
})
