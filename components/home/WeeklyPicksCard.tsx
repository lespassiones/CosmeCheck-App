/**
 * WeeklyPicksCard — « Pépites du jour » sur le dashboard (rotation quotidienne).
 *
 * PAS de bloc/carte englobante : un simple en-tête + un carrousel horizontal
 * PLEINE LARGEUR (les cartes débordent jusqu'aux bords de l'écran et défilent
 * librement, façon Uber Eats). Sélection déterministe personnalisée
 * (useWeeklyPicks), 0 crédit. Tap -> lance/ouvre l'analyse du produit.
 * Pastille only, jamais de note chiffrée.
 *
 * Full-bleed : le composant compense le padding horizontal du parent via une
 * marge négative (EDGE) et re-applique ce padding dans le contentContainer, pour
 * que la 1re carte s'aligne sur le contenu tout en laissant le carrousel filer
 * jusqu'aux bords.
 */

import { type FC } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { ProductMiniCard } from '@/components/shared/ProductMiniCard'
import { useWeeklyPicks } from '@/hooks/useWeeklyPicks'
import { useLaunchAlternative } from '@/hooks/useLaunchAlternative'

const CARD_W = 150
/** Padding horizontal du dashboard à compenser pour le full-bleed. */
const EDGE = spacing.base

export const WeeklyPicksCard: FC = () => {
  const router = useRouter()
  const { picks, isLoading, isEmptyProfile } = useWeeklyPicks(true)
  const { analyze, isAnalyzing } = useLaunchAlternative()

  return (
    <View>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={18} color={colors.accent} />
        <Text style={styles.kicker}>PÉPITES DU JOUR</Text>
      </View>
      <Text style={styles.subtitle}>Sélectionnées pour toi</Text>

      {isLoading ? (
        <View style={[styles.row, styles.bleed]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeleton} />
          ))}
        </View>
      ) : isEmptyProfile ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            Complète ton profil beauté pour découvrir tes pépites personnalisées.
          </Text>
          <Pressable
            style={styles.cta}
            onPress={() => router.push(ROUTES.PROFILE.INDEX)}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>Compléter mon profil</Text>
            <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : picks.length === 0 ? (
        <Text style={styles.emptyText}>
          Pas de pépites compatibles avec tes restrictions aujourd'hui. Reviens demain.
        </Text>
      ) : (
        <FlatList
          horizontal
          data={picks}
          keyExtractor={(p) => p.ean}
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ProductMiniCard
              product={item}
              disabled={isAnalyzing}
              onPress={() => void analyze(item)}
              width={CARD_W}
            />
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: {
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.accent,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkMuted,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  // Full-bleed : déborde le padding horizontal du dashboard.
  bleed: { marginHorizontal: -EDGE },
  listContent: { gap: spacing.md, paddingHorizontal: EDGE, paddingVertical: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: EDGE },
  skeleton: {
    width: CARD_W,
    height: 190,
    borderRadius: radius.lg,
    backgroundColor: colors.gray100,
  },
  emptyWrap: { gap: spacing.md, alignItems: 'flex-start' },
  emptyText: {
    ...typography.small,
    color: colors.inkMuted,
    lineHeight: 20,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  ctaText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: '#FFFFFF' },
})
