import { View, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import type { PurchasesPackage } from 'react-native-purchases'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { shadows } from '@/constants/shadows'
import { typography } from '@/constants/typography'
import { Text } from '@/components/design/Text'

interface PaywallCardProps {
  package: PurchasesPackage
  isRecommended?: boolean
  onPress: () => void
  isLoading?: boolean
}

export function PaywallCard({
  package: pkg,
  isRecommended = false,
  onPress,
  isLoading = false,
}: PaywallCardProps) {
  const isMonthly = pkg.product.title.toLowerCase().includes('month')
  const priceString = pkg.product.priceString

  // Calculate savings for yearly
  const savings = isRecommended ? '33% OFF' : null

  return (
    <Pressable
      style={[styles.card, isRecommended && styles.recommended]}
      onPress={onPress}
      disabled={isLoading}
    >
      {isRecommended && <View style={styles.badge}>
        <Text style={styles.badgeText}>BEST VALUE</Text>
      </View>}

      <View style={styles.titleRow}>
        <Text style={styles.title}>{isMonthly ? 'Monthly' : 'Yearly'}</Text>
        {savings && <Text style={styles.savings}>{savings}</Text>}
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.trialBadge}>3 days free</Text>
      </View>

      <View style={styles.priceSmall}>
        <Text style={styles.priceSmallText}>Then {priceString}/{isMonthly ? 'mo' : 'yr'}</Text>
      </View>

      <View style={styles.credits}>
        <Text style={styles.creditsLabel}>100 credits/month</Text>
      </View>

      <Pressable
        style={[styles.button, isRecommended && styles.buttonPrimary]}
        onPress={onPress}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={isRecommended ? colors.surface : colors.rose} />
        ) : (
          <Text
            style={[styles.buttonText, isRecommended && styles.buttonTextPrimary]}
          >
            Continue
          </Text>
        )}
      </Pressable>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  recommended: {
    borderColor: colors.rose,
    borderWidth: 2,
    backgroundColor: '#FFF9FB',
  },
  badge: {
    backgroundColor: colors.rose,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.surface,
    letterSpacing: 0.5,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.ink,
  },
  savings: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.rose,
  },
  priceRow: {
    marginBottom: spacing.sm,
  },
  trialBadge: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.rose,
  },
  priceSmall: {
    marginBottom: spacing.md,
  },
  priceSmallText: {
    fontSize: 13,
    color: colors.inkMuted,
  },
  credits: {
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  creditsLabel: {
    fontSize: 13,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rose,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.rose,
    borderColor: colors.rose,
  },
  buttonText: {
    ...typography.button,
    color: colors.rose,
    fontWeight: '600',
  },
  buttonTextPrimary: {
    color: colors.surface,
  },
})
