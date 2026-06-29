/**
 * OffreScreen — page Premium avec RevenueCat.
 *
 * Présente l'offre Premium de Cosme Check : hero avec Logo, deux plans
 * (mensuel 4,99 €/mois et annuel 49,99 €/an, tous deux avec essai 3 jours),
 * la liste des avantages Premium, puis un CTA principal "Débuter l'essai".
 *
 * Si utilisateur est premium: affiche "Mon abonnement" avec status + bouton annuler.
 * Intégré avec RevenueCat pour gérer les achats in-app et annulations.
 */

import { useState, type FC } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, Linking, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Purchases from 'react-native-purchases'

import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { WhiteCard } from '@/components/design/WhiteCard'
import { Logo } from '@/components/shared/Logo'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { shadows } from '@/constants/shadows'
import { usePurchases } from '@/hooks/usePurchases'
import { useProfile } from '@/hooks/useProfile'

type PlanId = 'monthly' | 'yearly'
type Tab = 'plans' | 'subscription'

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'flask', text: '100 crédits par mois' },
  { icon: 'shield-checkmark', text: 'Analyses illimitées' },
  { icon: 'git-compare', text: 'Advisor Premium' },
  { icon: 'sparkles', text: 'Comparaisons avancées' },
  { icon: 'time', text: 'Historique complet' },
  { icon: 'document-text', text: 'Priorité support' },
  { icon: 'rocket', text: 'Accès anticipé' },
]

const OffreScreen: FC = () => {
  const [selected, setSelected] = useState<PlanId>('yearly')
  const [activeTab, setActiveTab] = useState<Tab>('plans')
  const [cancelling, setCancelling] = useState(false)
  const { offerings, purchase, isLoading, customerInfo } = usePurchases()
  const { profile } = useProfile()
  const isPremium = profile?.tier === 'premium'

  const handlePurchase = async () => {
    const pkg = offerings?.current?.availablePackages.find(
      (p: any) => p.identifier === (selected === 'monthly' ? 'rc_monthly' : 'rc_yearly')
    )
    if (pkg) await purchase(pkg)
  }

  const handleCancelSubscription = () => {
    Alert.alert(
      'Annuler l\'abonnement',
      'Êtes-vous sûr? Vous perdrez accès à Premium et retournerez aux 5 crédits gratuits.',
      [
        { text: 'Garder mon abonnement', style: 'cancel' },
        {
          text: 'Annuler',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true)
            try {
              // Ouvrir le portail de gestion des abonnements
              const url = Platform.OS === 'ios'
                ? 'itms-apps://apps.apple.com/account/subscriptions'
                : 'https://play.google.com/store/account/subscriptions'
              await Linking.openURL(url)
            } catch (err) {
              Alert.alert(
                'Erreur',
                'Impossible d\'ouvrir le portail d\'annulation. Veuillez annuler directement depuis les parametres de votre telephone.'
              )
            } finally {
              setCancelling(false)
            }
          },
        },
      ]
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <BackgroundGlow variant="default" />

      {/* Header léger */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Logo size={14} />
        <View style={styles.backBtn} />
      </View>

      {/* Tabs — si premium, affiche les deux onglets (Plans à gauche) */}
      {isPremium && (
        <View style={styles.tabsContainer}>
          <Pressable
            onPress={() => setActiveTab('plans')}
            style={[styles.tab, activeTab === 'plans' && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, activeTab === 'plans' && styles.tabTextActive]}
            >
              Plans
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('subscription')}
            style={[styles.tab, activeTab === 'subscription' && styles.tabActive]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'subscription' && styles.tabTextActive,
              ]}
            >
              Mon abonnement
            </Text>
          </Pressable>
        </View>
      )}

      {/* Main content area with scroll */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Contenu conditionnel: abonnement ou plans */}
        {activeTab === 'subscription' && isPremium ? (
          // === MON ABONNEMENT ===
          <>
            <View style={styles.subscriptionHero}>
              <Ionicons name="diamond" size={48} color={colors.rose} />
              <Text style={styles.subscriptionTitle}>Vous êtes Premium! ⭐</Text>
              <Text style={styles.subscriptionSubtitle}>
                Profitez de tous les avantages de votre abonnement
              </Text>
            </View>

            {/* Status Card */}
            <WhiteCard padding={spacing.lg}>
              <View style={styles.statusRow}>
                <View style={styles.statusIcon}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                </View>
                <View style={styles.statusContent}>
                  <Text style={styles.statusLabel}>Statut</Text>
                  <Text style={styles.statusValue}>Actif</Text>
                </View>
              </View>

              {customerInfo?.latestExpirationDate && (
                <View style={[styles.statusRow, styles.statusRowBorder]}>
                  <View style={styles.statusIcon}>
                    <Ionicons name="calendar" size={24} color={colors.accent} />
                  </View>
                  <View style={styles.statusContent}>
                    <Text style={styles.statusLabel}>Renouvellement</Text>
                    <Text style={styles.statusValue}>
                      {new Date(customerInfo.latestExpirationDate).toLocaleDateString('fr-FR')}
                    </Text>
                  </View>
                </View>
              )}

              <View style={[styles.statusRow, styles.statusRowBorder]}>
                <View style={styles.statusIcon}>
                  <Ionicons name="wallet-outline" size={24} color={colors.rose} />
                </View>
                <View style={styles.statusContent}>
                  <Text style={styles.statusLabel}>Crédits mensuels</Text>
                  <Text style={styles.statusValue}>100 crédits</Text>
                </View>
              </View>
            </WhiteCard>

            {/* Info */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color={colors.accent} />
              <Text style={styles.infoText}>
                Pour gérer votre abonnement ou annuler, utilisez le bouton ci-dessous.
              </Text>
            </View>
          </>
        ) : (
          // === PLANS ===
          <>
            {/* Hero — fond crème doux, look cosmétique haut de gamme */}
            <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Ionicons name="diamond" size={14} color={colors.roseDeep} />
            <Text style={styles.heroBadgeText}>PREMIUM</Text>
          </View>
          <Text style={styles.heroTitle}>Passe à Premium</Text>
          <Text style={styles.heroTagline}>
            Analyse sans limites et débloque tout le potentiel de Cosme Check.
          </Text>
        </View>

        {/* Plans */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choisis ton plan</Text>

          {/* Yearly */}
          <Pressable
            onPress={() => setSelected('yearly')}
            style={[styles.planCard, selected === 'yearly' && styles.planCardActive]}
          >
            <WhiteCard padding={spacing.lg}>
              <View style={styles.planRow}>
                <View style={styles.planRadio}>
                  <Ionicons
                    name={selected === 'yearly' ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selected === 'yearly' ? colors.rose : colors.inkLight}
                  />
                </View>

                <View style={styles.planInfo}>
                  <View style={styles.planLabelRow}>
                    <Text style={styles.planLabel}>Annuel</Text>
                    <View style={styles.planBadge}>
                      <Text style={styles.planBadgeText}>3 jours gratuits</Text>
                    </View>
                  </View>
                  <Text style={styles.planNote}>soit ≈ 4,17 €/mois</Text>
                </View>

                <View style={styles.planPriceCol}>
                  <Text style={styles.planPrice}>49,99 €</Text>
                  <Text style={styles.planPeriod}>/ an</Text>
                </View>
              </View>
            </WhiteCard>
          </Pressable>

          {/* Monthly */}
          <Pressable
            onPress={() => setSelected('monthly')}
            style={[styles.planCard, selected === 'monthly' && styles.planCardActive]}
          >
            <WhiteCard padding={spacing.lg}>
              <View style={styles.planRow}>
                <View style={styles.planRadio}>
                  <Ionicons
                    name={selected === 'monthly' ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selected === 'monthly' ? colors.rose : colors.inkLight}
                  />
                </View>

                <View style={styles.planInfo}>
                  <View style={styles.planLabelRow}>
                    <Text style={styles.planLabel}>Mensuel</Text>
                    <View style={styles.planBadge}>
                      <Text style={styles.planBadgeText}>3 jours gratuits</Text>
                    </View>
                  </View>
                  <Text style={styles.planNote}>flexible</Text>
                </View>

                <View style={styles.planPriceCol}>
                  <Text style={styles.planPrice}>4,99 €</Text>
                  <Text style={styles.planPeriod}>/ mois</Text>
                </View>
              </View>
            </WhiteCard>
          </Pressable>
        </View>

        {/* Avantages */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tout ce que tu débloques</Text>
          <WhiteCard padding={spacing.lg}>
            {BENEFITS.map((b, i) => (
              <View
                key={b.text}
                style={[styles.benefitRow, i === BENEFITS.length - 1 && styles.benefitRowLast]}
              >
                <View style={styles.benefitIcon}>
                  <Ionicons name={b.icon} size={18} color={colors.rose} />
                </View>
                <Text style={styles.benefitText}>{b.text}</Text>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              </View>
            ))}
          </WhiteCard>
        </View>
          </>
        )}
      </ScrollView>

      {/* CTA — fixé en bas */}
      <View style={styles.ctaContainer}>
        {isPremium && activeTab === 'subscription' ? (
          // Bouton annulation
          <>
            <Pressable
              onPress={handleCancelSubscription}
              disabled={cancelling}
            >
              <LinearGradient
                colors={[colors.roseDeep, '#c41e3a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.cta, cancelling && styles.ctaDisabled]}
              >
                {cancelling ? (
                  <ActivityIndicator color={colors.surface} size="small" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color={colors.surface} />
                    <Text style={styles.ctaText}>Annuler l'abonnement</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
            <Text style={styles.ctaHint}>
              Vous pouvez annuler n'importe quand.
            </Text>
          </>
        ) : (
          // Bouton achat
          <>
            <Pressable
              onPress={handlePurchase}
              disabled={isLoading || !offerings}
            >
              <LinearGradient
                colors={[colors.rose, colors.roseDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.cta, (isLoading || !offerings) && styles.ctaDisabled]}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.surface} size="small" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={18} color={colors.surface} />
                    <Text style={styles.ctaText}>Débuter l'essai 3 jours</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
            <Text style={styles.ctaHint}>
              Accès complet. Annulez quand vous voulez.
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  )
}

export default OffreScreen

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.rose,
  },
  tabText: {
    ...typography.body,
    color: colors.inkMuted,
  },
  tabTextActive: {
    color: colors.rose,
    fontWeight: '600',
  },

  scroll: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
  },

  // Subscription Hero
  subscriptionHero: {
    alignItems: 'center',
    padding: spacing.xl,
    marginBottom: spacing.xl,
    backgroundColor: '#FDF6EC',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(190,18,60,0.10)',
  },
  subscriptionTitle: {
    ...typography.h2,
    color: colors.roseDeep,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subscriptionSubtitle: {
    ...typography.body,
    color: '#7C2D12',
    textAlign: 'center',
  },

  // Status
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statusRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  statusIcon: {
    marginRight: spacing.md,
  },
  statusContent: {
    flex: 1,
  },
  statusLabel: {
    ...typography.small,
    color: colors.inkMuted,
    marginBottom: 2,
  },
  statusValue: {
    ...typography.bodySemiBold,
    color: colors.ink,
  },

  // Info Box
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  infoText: {
    ...typography.small,
    color: colors.accent,
    flex: 1,
  },

  // Hero
  hero: {
    borderRadius: radius.card,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    overflow: 'hidden',
    backgroundColor: '#FDF6EC',
    borderWidth: 1,
    borderColor: 'rgba(190,18,60,0.10)',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(190,18,60,0.18)',
    borderRadius: radius.full,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: spacing.md,
  },
  heroBadgeText: {
    ...typography.xsSemiBold,
    color: colors.roseDeep,
    marginLeft: 4,
    letterSpacing: 1,
  },
  heroTitle: {
    ...typography.h1,
    color: colors.roseDeep,
    marginBottom: spacing.sm,
  },
  heroTagline: {
    ...typography.body,
    color: '#7C2D12',
  },

  // Sections
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.ink,
    marginBottom: spacing.md,
  },

  // Plans
  planCard: {
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: radius.card,
  },
  planCardActive: {
    borderColor: colors.rose,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planRadio: {
    marginRight: spacing.md,
  },
  planInfo: {
    flex: 1,
  },
  planLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  planLabel: {
    ...typography.bodySemiBold,
    color: colors.ink,
    marginRight: spacing.sm,
  },
  planBadge: {
    backgroundColor: colors.roseSoft,
    borderRadius: radius.full,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  planBadgeText: {
    ...typography.xsSemiBold,
    color: colors.roseDeep,
  },
  planNote: {
    ...typography.small,
    color: colors.inkMuted,
    marginTop: 2,
  },
  planPriceCol: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  planPrice: {
    ...typography.h4,
    color: colors.ink,
  },
  planPeriod: {
    ...typography.xs,
    color: colors.inkMuted,
  },

  // Avantages
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  benefitRowLast: {
    borderBottomWidth: 0,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  benefitText: {
    ...typography.body,
    color: colors.ink,
    flex: 1,
  },

  // CTA — fixé en bas
  ctaContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: radius.full,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    ...typography.button,
    color: colors.surface,
    marginLeft: spacing.sm,
  },
  ctaHint: {
    ...typography.xs,
    color: colors.inkLight,
    textAlign: 'center',
    marginTop: spacing.md,
  },
})
