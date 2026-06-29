/**
 * PaywallScreen — Paywall modal après onboarding.
 * Affiche les offres (monthly + yearly) + bouton skip discret.
 */

import { useEffect } from 'react'
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { shadows } from '@/constants/shadows'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { usePurchases } from '@/hooks/usePurchases'
import { useProfile } from '@/hooks/useProfile'
import { Text } from '@/components/design/Text'
import { PaywallCard } from '@/components/paywall/PaywallCard'

export default function PaywallScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { offerings, isPremium, isLoading, purchase } = usePurchases()
  const { updateProfile } = useProfile()

  useEffect(() => {
    if (isPremium) {
      // Si déjà premium, skip le paywall
      void handleSkip()
    }
  }, [isPremium])

  const handleSkip = async () => {
    // Marquer le paywall comme vu (même si skippé)
    await updateProfile({ paywall_shown: true })
    router.replace(ROUTES.TABS.HOME)
  }

  const handlePurchase = async (packageId: string) => {
    const pkg: any = offerings?.current?.availablePackages.find((p: any) => p.identifier === packageId)
    if (!pkg) return

    const success = await purchase(pkg)
    if (success) {
      // Marquer comme vu et redirect
      await updateProfile({ paywall_shown: true })
      router.replace(ROUTES.TABS.HOME)
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Close button (top-left) */}
      <Pressable style={styles.closeButton} onPress={handleSkip}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, spacing.lg) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Unlock Premium</Text>
          <Text style={styles.subtitle}>100 credits per month + advanced features</Text>
        </View>

        {/* Pricing Cards */}
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.rose} style={styles.loader} />
        ) : (
          <View style={styles.cardsContainer}>
            {/* Monthly */}
            {offerings?.current?.availablePackages
              .filter((p: any) => p.product.title.toLowerCase().includes('month'))
              .map((pkg: any) => (
                <PaywallCard
                  key={pkg.identifier}
                  package={pkg}
                  onPress={() => handlePurchase(pkg.identifier)}
                  isLoading={isLoading}
                />
              ))}

            {/* Yearly */}
            {offerings?.current?.availablePackages
              .filter((p: any) => p.product.title.toLowerCase().includes('year'))
              .map((pkg: any) => (
                <PaywallCard
                  key={pkg.identifier}
                  package={pkg}
                  isRecommended
                  onPress={() => handlePurchase(pkg.identifier)}
                  isLoading={isLoading}
                />
              ))}
          </View>
        )}

        {/* Features List */}
        <View style={styles.features}>
          <FeatureItem text="100 credits per month" />
          <FeatureItem text="Unlimited analyses" />
          <FeatureItem text="Advisor chat" />
          <FeatureItem text="Advanced routines" />
          <FeatureItem text="Priority support" />
        </View>

        {/* Skip button (subtle) */}
        <Pressable onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Maybe later</Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

function FeatureItem({ text }: { text: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureBullet}>•</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 32,
    color: colors.inkMuted,
    fontWeight: '300',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  header: {
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  title: {
    ...typography.h2,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.inkMuted,
  },
  loader: {
    marginVertical: spacing.xl,
  },
  cardsContainer: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  features: {
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  featureBullet: {
    fontSize: 16,
    color: colors.rose,
    marginRight: spacing.sm,
  },
  featureText: {
    ...typography.body,
    color: colors.ink,
    flex: 1,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  skipText: {
    ...typography.body,
    color: colors.inkMuted,
  },
})
