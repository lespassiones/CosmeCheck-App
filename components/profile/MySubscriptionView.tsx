/**
 * MySubscriptionView : page « Mon abonnement » d'un membre Premium.
 *
 * Rendue par /offre quand le profil est Premium (la ligne « Mon abonnement » du
 * profil y mène). Carte : pastille « Premium actif », puis Formule, Essai (si
 * essai en cours), Renouvellement et Crédits IA. Sous la carte : « Gérer dans
 * l'App Store / Google Play » (résiliation et changement de formule se font
 * chez le magasin) et « Restaurer mes achats ».
 *
 * Les infos d'abonnement sont relues ici auprès de RevenueCat (et relues après
 * une restauration). Les crédits viennent de `credit_tiers`, jamais du code.
 */

import { useCallback, useEffect, useState, type FC } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { CustomerInfo } from 'react-native-purchases'

import { PressableScale } from '@/components/design/motion'
import { Reveal } from '@/components/design/Reveal'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { periodLabel, useCreditTiers } from '@/hooks/useCreditTiers'
import { useRestorePurchases } from '@/hooks/useRestorePurchases'
import { getCustomerInfo, withTimeout } from '@/lib/revenucat/client'
import { summarizeSubscription, type SummaryRow } from '@/lib/paywall/subscriptionSummary'

interface Props {
  /** Infos déjà chargées par l'écran parent (affichage immédiat), sinon null. */
  initialCustomerInfo: CustomerInfo | null
  onClose: () => void
}

const CUSTOMER_TIMEOUT_MS = 8000

export const MySubscriptionView: FC<Props> = ({ initialCustomerInfo, onClose }) => {
  const [info, setInfo] = useState<CustomerInfo | null>(initialCustomerInfo)
  const [loading, setLoading] = useState(initialCustomerInfo == null)

  const refresh = useCallback(async () => {
    const next = await withTimeout(getCustomerInfo(), CUSTOMER_TIMEOUT_MS, null)
    if (next) setInfo(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const summary = summarizeSubscription(info, Platform.OS)
  const { data: tiers } = useCreditTiers()
  const premiumTier = tiers?.premium ?? null
  const creditsRow: SummaryRow | null = premiumTier
    ? { label: 'Crédits IA', value: `${premiumTier.amount} ${periodLabel(premiumTier.period)}`.trim() }
    : null
  const rows = creditsRow ? [...summary.rows, creditsRow] : summary.rows

  const { restore, restoring } = useRestorePurchases(summary.storeName)
  const handleRestore = async () => {
    const next = await restore()
    if (next) setInfo(next)
  }

  const handleManage = async () => {
    const fallback =
      summary.storeName === 'App Store'
        ? Platform.OS === 'ios'
          ? 'itms-apps://apps.apple.com/account/subscriptions'
          : 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions'
    try {
      await Linking.openURL(summary.managementUrl ?? fallback)
    } catch {
      Alert.alert(
        'Impossible d’ouvrir la page',
        `Gère ton abonnement directement dans les réglages ${summary.storeName} de ton téléphone.`,
      )
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={28} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Reveal stagger={70}>
          <Text style={styles.title} accessibilityRole="header">
            Mon abonnement
          </Text>

          <View style={styles.card}>
            <View style={styles.pillRow}>
              <View style={styles.pill}>
                <View style={styles.pillDot} />
                <Text style={styles.pillText}>Premium actif</Text>
              </View>
            </View>
            {rows.map((r) => (
              <View key={r.label} style={styles.row}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {r.value}
                </Text>
              </View>
            ))}
            {loading && summary.rows.length === 0 ? (
              <View style={[styles.row, styles.rowLoading]}>
                <ActivityIndicator size="small" color={colors.inkMuted} />
              </View>
            ) : null}
          </View>

          <PressableScale
            style={styles.manageBtn}
            onPress={() => void handleManage()}
            haptic="secondary"
            accessibilityRole="button"
            accessibilityLabel={`Gérer dans ${summary.storeName === 'App Store' ? 'l’App Store' : 'Google Play'}`}
          >
            <Ionicons name="open-outline" size={22} color={colors.ink} />
            <Text style={styles.manageText}>
              Gérer dans {summary.storeName === 'App Store' ? 'l’App Store' : 'Google Play'}
            </Text>
          </PressableScale>

          <Pressable
            onPress={() => void handleRestore()}
            disabled={restoring}
            hitSlop={8}
            style={styles.restoreBtn}
            accessibilityRole="button"
            accessibilityLabel="Restaurer mes achats"
          >
            {restoring ? (
              <ActivityIndicator size="small" color={colors.ink} />
            ) : (
              <Text style={styles.restoreText}>Restaurer mes achats</Text>
            )}
          </Pressable>
        </Reveal>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: spacing.base, paddingBottom: spacing['2xl'] },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
    color: colors.ink,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  pillRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.base },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.roseSoft,
    borderRadius: radius.full,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  pillDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.rose },
  pillText: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.roseDeep },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowLoading: { justifyContent: 'center' },
  rowLabel: { fontFamily: fontFamilies.regular, fontSize: 15.5, color: colors.inkMuted },
  rowValue: {
    flexShrink: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 15.5,
    color: colors.ink,
    textAlign: 'right',
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    height: 60,
    marginTop: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  manageText: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.ink },
  restoreBtn: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  restoreText: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
})
