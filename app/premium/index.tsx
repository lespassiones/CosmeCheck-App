/**
 * PremiumWelcomeScreen : écran de bienvenue après un abonnement réussi.
 *
 * Avant, valider son paiement renvoyait sur le paywall qu'on venait d'acheter,
 * bouton « Commencer l'essai gratuit » toujours en place. On payait, et l'app
 * redemandait de payer. Cet écran remplace ce retour en arrière par une fin de
 * parcours nette : confettis, confirmation, un seul bouton vers l'accueil.
 *
 * Le passage en Premium se joue à deux endroits, et l'écran attend les deux :
 *   - le magasin confirme l'achat au SDK RevenueCat, côté appareil ;
 *   - RevenueCat appelle notre webhook, qui bascule `user_profiles.tier`.
 * Le second est asynchrone et arrive avec quelques centaines de millisecondes
 * de retard. On redemande donc le profil pendant un court moment, pour que la
 * bascule (pastille dorée, disparition de l'upsell) soit déjà faite quand on
 * arrive sur l'accueil.
 */

import { useEffect, useState, type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useQueryClient } from '@tanstack/react-query'

import { Confetti } from '@/components/premium/Confetti'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { useProfile } from '@/hooks/useProfile'

/** Combien de fois on redemande le profil, et à quel rythme. */
const TIER_POLL_TRIES = 6
const TIER_POLL_MS = 1200

// Aucun chiffre de crédits ici, volontairement. Le paywall annonce
// « 100 crédits/mois » alors que `cosme_check.credit_tiers` en accorde 150 :
// tant que les deux ne disent pas la même chose, répéter un nombre à un
// troisième endroit ne ferait qu'ajouter une version de plus à corriger.
const PERKS = [
  { icon: 'sparkles' as const, label: 'Analyses personnalisées à ton profil' },
  { icon: 'swap-horizontal' as const, label: 'Alternatives plus propres, choisies pour toi' },
  { icon: 'chatbubble-ellipses' as const, label: 'Beauty Advisor sans compter' },
  { icon: 'star' as const, label: 'Tes crédits rechargés chaque mois' },
]

const PremiumWelcomeScreen: FC = () => {
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const isPremium = profile?.tier === 'premium'

  // `tick` compte les tentatives ET pilote la relance de l'effet : incrémenter
  // un nombre re-rend à coup sûr, contrairement à un état qu'on réécrirait avec
  // la même valeur.
  const [tick, setTick] = useState(0)

  // Le badge entre en deux temps : léger dépassement puis retour, ce qui donne
  // le petit ressort qu'on attend d'une confirmation.
  const badgeScale = useSharedValue(0.4)
  const badgeOpacity = useSharedValue(0)
  useEffect(() => {
    badgeOpacity.value = withTiming(1, { duration: 260 })
    badgeScale.value = withSequence(
      withTiming(1.12, { duration: 320, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 180, easing: Easing.out(Easing.ease) }),
    )
  }, [badgeScale, badgeOpacity])

  const textOpacity = useSharedValue(0)
  const textShift = useSharedValue(14)
  useEffect(() => {
    textOpacity.value = withDelay(240, withTiming(1, { duration: 360 }))
    textShift.value = withDelay(240, withTiming(0, { duration: 360 }))
  }, [textOpacity, textShift])

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badgeOpacity.value,
    transform: [{ scale: badgeScale.value }],
  }))
  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textShift.value }],
  }))

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  }, [])

  // On attend que le webhook ait basculé le tier, sans jamais bloquer : le
  // bouton reste actif du début à la fin, et si le webhook tarde plus que nos
  // quelques secondes, l'accueil rattrapera au prochain chargement du profil.
  const waiting = !isPremium && tick < TIER_POLL_TRIES
  useEffect(() => {
    if (!waiting) return
    const t = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
      void queryClient.invalidateQueries({ queryKey: ['credits'] })
      setTick((n) => n + 1)
    }, TIER_POLL_MS)
    return () => clearTimeout(t)
  }, [waiting, tick, queryClient])

  const goHome = () => {
    Haptics.selectionAsync().catch(() => {})
    // `replace` et pas `back` : l'écran d'achat ne doit plus être derrière.
    router.replace(ROUTES.TABS.HOME)
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Confetti />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Animated.View style={[styles.badge, badgeStyle]}>
            <Ionicons name="diamond" size={44} color={colors.surface} />
          </Animated.View>

          <Animated.View style={textStyle}>
            <Text style={styles.kicker}>C'est fait</Text>
            <Text style={styles.title}>
              Bienvenue dans{'\n'}
              <Text style={styles.titleAccent}>Cosme Check Premium</Text>
            </Text>
            <Text style={styles.subtitle}>
              Tes analyses sont maintenant taillées pour ta peau, produit par
              produit.
            </Text>

            <View style={styles.perks}>
              {PERKS.map((perk) => (
                <View key={perk.label} style={styles.perkRow}>
                  <View style={styles.perkIcon}>
                    <Ionicons name={perk.icon} size={15} color={colors.roseDeep} />
                  </View>
                  <Text style={styles.perkLabel}>{perk.label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={goHome}
            accessibilityRole="button"
            accessibilityLabel="Découvrir l'application"
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          >
            <Text style={styles.ctaText}>Découvrir mes analyses</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.surface} />
          </Pressable>
          {waiting && (
            <Text style={styles.footerHint}>Activation de ton compte en cours…</Text>
          )}
        </View>
      </SafeAreaView>
    </View>
  )
}

export default PremiumWelcomeScreen

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF6EC' },
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  badge: {
    width: 92,
    height: 92,
    borderRadius: radius.full,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    shadowColor: colors.roseDeep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 8,
  },
  kicker: {
    ...typography.xsSemiBold,
    color: colors.roseDeep,
    textAlign: 'center',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h1,
    color: colors.ink,
    textAlign: 'center',
  },
  titleAccent: {
    ...typography.h1,
    color: colors.roseDeep,
  },
  subtitle: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  perks: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  perkIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkLabel: {
    ...typography.small,
    color: colors.ink,
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.rose,
  },
  ctaPressed: { backgroundColor: colors.roseDeep },
  ctaText: { ...typography.button, color: colors.surface },
  footerHint: {
    ...typography.xs,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
})
