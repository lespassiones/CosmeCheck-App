/**
 * OffreScreen — paywall Premium de Cosme Check (RevenueCat).
 *
 * Vue PLANS (mockup validé) : jauge de notation en hero, titre « Débloque ton
 * analyse personnalisée », 5 bénéfices tous personnalisés « pour toi », bandeau
 * de réassurance, deux plans côte à côte (Annuel 49,99 € mis en avant /
 * Mensuel 9,99 €), CTA rose « Commencer l'essai gratuit », mentions légales.
 *
 * S'affiche : après onboarding (paywall skippable, Apple §3.1.1), quand les
 * crédits sont épuisés, depuis la sidebar et depuis le profil.
 *
 * Si l'utilisateur est premium : onglet « Mon abonnement » (statut + gestion).
 * Achats via RevenueCat (mobile) ; le web branchera Stripe plus tard.
 */

import { useEffect, useState, type FC, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Purchases, { PACKAGE_TYPE, type PurchasesPackage } from 'react-native-purchases'

import { WhiteCard } from '@/components/design/WhiteCard'
import { LogoMark } from '@/components/shared/Logo'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { usePurchases } from '@/hooks/usePurchases'
import { useProfile } from '@/hooks/useProfile'

type PlanId = 'monthly' | 'yearly'
type Tab = 'plans' | 'subscription'

const GAUGE = require('@/assets/images/paywall-gauge.webp')

const OffreScreen: FC = () => {
  const [selected, setSelected] = useState<PlanId>('yearly')
  const [activeTab, setActiveTab] = useState<Tab>('plans')
  const [cancelling, setCancelling] = useState(false)
  const { offerings, purchase, isLoading, customerInfo } = usePurchases()
  const { profile, updateProfile } = useProfile()
  const isPremium = profile?.tier === 'premium'

  // `fromOnboarding=1` : paywall post-onboarding (obligatoire mais skippable,
  // Apple §3.1.1). On affiche « Plus tard » et on marque `paywall_shown` au
  // choix (skip ou achat) pour que l'AuthGuard ne reboucle pas dessus.
  const params = useLocalSearchParams<{ fromOnboarding?: string }>()
  const fromOnboarding = params.fromOnboarding === '1'

  const dismissOnboardingPaywall = async () => {
    try {
      await updateProfile({ paywall_shown: true })
    } finally {
      router.replace(ROUTES.TABS.HOME)
    }
  }

  // Déjà premium pendant l'onboarding (edge) → on ne bloque pas sur le paywall.
  useEffect(() => {
    if (fromOnboarding && isPremium) void dismissOnboardingPaywall()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromOnboarding, isPremium])

  const handleClose = () => {
    if (fromOnboarding) void dismissOnboardingPaywall()
    else router.back()
  }

  const handlePurchase = async () => {
    const current = offerings?.current
    const pkgs: PurchasesPackage[] = current?.availablePackages ?? []
    if (!current || pkgs.length === 0) {
      Alert.alert(
        'Offre indisponible',
        "Les abonnements ne se chargent pas pour le moment. Vérifie ta connexion et réessaie.",
      )
      return
    }

    // Sélection ROBUSTE par type de package (ANNUAL / MONTHLY). RevenueCat les
    // nomme `$rc_annual` / `$rc_monthly` : on ne se fie PAS à l'identifiant exact.
    const wantAnnual = selected === 'yearly'
    const pkg =
      pkgs.find((p) => p.packageType === (wantAnnual ? PACKAGE_TYPE.ANNUAL : PACKAGE_TYPE.MONTHLY)) ??
      pkgs.find((p) =>
        p.identifier.toLowerCase().includes(wantAnnual ? 'annual' : 'month') ||
        p.identifier.toLowerCase().includes(wantAnnual ? 'year' : 'month'),
      ) ??
      pkgs[0]

    if (!pkg) {
      Alert.alert('Plan introuvable', "Ce plan n'est pas configuré dans la boutique pour le moment.")
      return
    }

    try {
      const ok = await purchase(pkg)
      if (ok && fromOnboarding) await dismissOnboardingPaywall()
    } catch {
      Alert.alert(
        'Achat impossible',
        "L'achat n'a pas pu aboutir. Les achats in-app nécessitent un build signé publié en test (Play Store / App Store) ; ils ne fonctionnent pas dans l'émulateur de développement.",
      )
    }
  }

  const handleRestore = async () => {
    try {
      await Purchases.restorePurchases()
      Alert.alert('Achats restaurés', 'Tes achats ont bien été restaurés.')
    } catch {
      Alert.alert('Restauration impossible', "Impossible de restaurer tes achats pour le moment.")
    }
  }

  const handleCancelSubscription = () => {
    Alert.alert(
      "Annuler l'abonnement",
      'Êtes-vous sûr ? Vous perdrez accès à Premium et retournerez aux crédits gratuits.',
      [
        { text: 'Garder mon abonnement', style: 'cancel' },
        {
          text: 'Annuler',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true)
            try {
              const url =
                Platform.OS === 'ios'
                  ? 'itms-apps://apps.apple.com/account/subscriptions'
                  : 'https://play.google.com/store/account/subscriptions'
              await Linking.openURL(url)
            } catch {
              Alert.alert(
                'Erreur',
                "Impossible d'ouvrir le portail d'annulation. Annulez directement depuis les paramètres de votre téléphone.",
              )
            } finally {
              setCancelling(false)
            }
          },
        },
      ],
    )
  }

  const priceLine = selected === 'yearly' ? 'Puis 49,99 €/an.' : 'Puis 7,99 €/mois.'

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header — croix de fermeture (gauche) + logo (centré). */}
      <View style={styles.header}>
        <Pressable
          onPress={handleClose}
          hitSlop={12}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        >
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>
        <LogoMark size={16} />
        <View style={styles.closeBtn} />
      </View>

      {/* Onglets si premium (Plans / Mon abonnement). */}
      {isPremium && (
        <View style={styles.tabsContainer}>
          <Pressable onPress={() => setActiveTab('plans')} style={[styles.tab, activeTab === 'plans' && styles.tabActive]}>
            <Text style={[styles.tabText, activeTab === 'plans' && styles.tabTextActive]}>Plans</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('subscription')}
            style={[styles.tab, activeTab === 'subscription' && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === 'subscription' && styles.tabTextActive]}>Mon abonnement</Text>
          </Pressable>
        </View>
      )}

      <ScrollView style={styles.flex1} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {activeTab === 'subscription' && isPremium ? (
          // ═══ MON ABONNEMENT ═══
          <>
            <View style={styles.subscriptionHero}>
              <Ionicons name="diamond" size={44} color={colors.rose} />
              <Text style={styles.subscriptionTitle}>Tu es Premium ⭐</Text>
              <Text style={styles.subscriptionSubtitle}>Profite de tous les avantages de ton abonnement.</Text>
            </View>

            <WhiteCard padding={spacing.lg}>
              <View style={styles.statusRow}>
                <Ionicons name="checkmark-circle" size={24} color="#16A34A" style={styles.statusIcon} />
                <View style={styles.statusContent}>
                  <Text style={styles.statusLabel}>Statut</Text>
                  <Text style={styles.statusValue}>Actif</Text>
                </View>
              </View>
              {customerInfo?.latestExpirationDate && (
                <View style={[styles.statusRow, styles.statusRowBorder]}>
                  <Ionicons name="calendar" size={24} color={colors.rose} style={styles.statusIcon} />
                  <View style={styles.statusContent}>
                    <Text style={styles.statusLabel}>Renouvellement</Text>
                    <Text style={styles.statusValue}>
                      {new Date(customerInfo.latestExpirationDate).toLocaleDateString('fr-FR')}
                    </Text>
                  </View>
                </View>
              )}
            </WhiteCard>

          </>
        ) : (
          // ═══ PLANS (paywall) ═══
          <>
            {/* Hero — jauge de notation (aiguille vers le vert). */}
            <Image source={GAUGE} style={styles.gauge} resizeMode="contain" />

            <Text style={styles.title}>
              Débloque ton analyse{'\n'}
              <Text style={styles.titleAccent}>personnalisée</Text>
            </Text>
            <Text style={styles.subtitle}>
              Chaque produit, chaque conseil, chaque alternative : pensés pour toi, ta peau et ton profil.
            </Text>

            {/* Bénéfices — tous personnalisés « pour toi » — juste après l'accroche. */}
            <WhiteCard padding={spacing.lg}>
              <BenefitRow>
                Analyse de chaque produit <Text style={styles.benefitBold}>personnalisée</Text> à ton profil
              </BenefitRow>
              <BenefitRow>
                <Text style={styles.benefitBold}>Alternatives</Text> plus propres choisies pour toi
              </BenefitRow>
              <BenefitRow>
                Suggestions et <Text style={styles.benefitBold}>conseils adaptés</Text> à ta peau
              </BenefitRow>
              <BenefitRow>
                Analyse des <Text style={styles.benefitBold}>promesses produit</Text> selon ton profil
              </BenefitRow>
              <BenefitRow>
                Amélioration de ta routine, <Text style={styles.benefitBold}>sur-mesure</Text>
              </BenefitRow>
              <BenefitRow last>
                <Text style={styles.benefitBold}>100 crédits/mois</Text> pour trouver les produits faits pour toi
              </BenefitRow>
            </WhiteCard>

            {/* Plans côte à côte — en bas, juste avant la réassurance. */}
            <View style={[styles.plansRow, styles.plansRowBelow]}>
              <Pressable
                onPress={() => setSelected('yearly')}
                style={[styles.planCol, selected === 'yearly' && styles.planColActive]}
              >
                <View style={styles.saveBadge}>
                  <Text style={styles.saveBadgeText}>ÉCONOMISE 48%</Text>
                </View>
                <Text style={styles.planName}>Annuel</Text>
                <Text style={[styles.planBigPrice, selected === 'yearly' && styles.planBigPriceActive]}>49,99 €</Text>
                <Text style={styles.planSub}>~4,17 €/mois</Text>
                <Ionicons
                  name={selected === 'yearly' ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={selected === 'yearly' ? colors.success : colors.inkLight}
                  style={styles.planRadio}
                />
              </Pressable>

              <Pressable
                onPress={() => setSelected('monthly')}
                style={[styles.planCol, selected === 'monthly' && styles.planColActive]}
              >
                <Text style={styles.planName}>Mensuel</Text>
                <Text style={[styles.planBigPrice, selected === 'monthly' && styles.planBigPriceActive]}>7,99 €</Text>
                <Text style={styles.planSub}>/mois</Text>
                <Ionicons
                  name={selected === 'monthly' ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={selected === 'monthly' ? colors.success : colors.inkLight}
                  style={styles.planRadio}
                />
              </Pressable>
            </View>

            {/* Réassurance */}
            <View style={styles.reassure}>
              <Ionicons name="lock-closed" size={14} color={colors.inkMuted} />
              <Text style={styles.reassureText}>Sans engagement · Annulable en 1 tap · Essai gratuit 3 jours</Text>
              <Ionicons name="shield-checkmark" size={16} color="#16A34A" />
            </View>

            {/* Légal */}
            <Text style={styles.legal}>
              Renouvellement automatique via Google Play / App Store sauf annulation 24 h avant la fin de période.
              Gérable dans les réglages du compte.
            </Text>

            {/* Liens */}
            <View style={styles.linksRow}>
              <Pressable onPress={() => router.push(ROUTES.LEGAL.CGU)} hitSlop={8}>
                <Text style={styles.link}>Conditions d'utilisation</Text>
              </Pressable>
              <Text style={styles.linkDot}>·</Text>
              <Pressable onPress={handleRestore} hitSlop={8}>
                <Text style={styles.link}>Restaurer mes achats</Text>
              </Pressable>
              <Text style={styles.linkDot}>·</Text>
              <Pressable onPress={() => router.push(ROUTES.LEGAL.PRIVACY)} hitSlop={8}>
                <Text style={styles.link}>Politique de confidentialité</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      {/* Footer CTA — toujours visible, ne scrolle pas. */}
      <View style={styles.footer}>
        {isPremium && activeTab === 'subscription' ? (
          <>
            <Pressable onPress={handleCancelSubscription} disabled={cancelling}>
              <LinearGradient
                colors={[colors.roseDeep, '#c41e3a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.cta, cancelling && styles.ctaDisabled]}
              >
                {cancelling ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.ctaText}>Annuler l'abonnement</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
            <Text style={styles.ctaHint}>Tu peux annuler quand tu veux.</Text>
          </>
        ) : (
          <>
            <Pressable onPress={handlePurchase} disabled={isLoading || !offerings}>
              <View style={[styles.cta, styles.ctaGreen, (isLoading || !offerings) && styles.ctaDisabled]}>
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.ctaText}>Commencer l'essai gratuit</Text>
                )}
              </View>
            </Pressable>
            <Text style={styles.ctaHint}>{priceLine} Annule quand tu veux.</Text>
            {fromOnboarding && (
              <Pressable onPress={() => void dismissOnboardingPaywall()} hitSlop={8} style={styles.laterBtn}>
                <Text style={styles.laterText}>Plus tard</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  )
}

/** Une ligne de bénéfice : coche ronde verte + texte (mots-clés en gras). */
const BenefitRow: FC<{ children: ReactNode; last?: boolean }> = ({ children, last }) => (
  <View style={[styles.benefitRow, last && styles.benefitRowLast]}>
    <View style={styles.benefitCheck}>
      <Ionicons name="checkmark" size={15} color="#FFFFFF" />
    </View>
    <Text style={styles.benefitText}>{children}</Text>
  </View>
)

export default OffreScreen

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FBF6EF',
  },
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: '#FBF6EF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },

  // Onglets (premium)
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.rose },
  tabText: { ...typography.body, color: colors.inkMuted },
  tabTextActive: { color: colors.rose, fontWeight: '600' },

  scroll: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
  },

  // Hero jauge
  gauge: {
    width: 224,
    height: 154,
    alignSelf: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h1,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  titleAccent: {
    ...typography.h1,
    color: colors.rose,
  },
  subtitle: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },

  // Bénéfices
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
  },
  benefitRowLast: {},
  benefitCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  benefitText: {
    ...typography.body,
    color: colors.ink,
    flex: 1,
  },
  benefitBold: {
    ...typography.bodySemiBold,
    color: colors.ink,
  },

  // Réassurance
  reassure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    backgroundColor: '#F7F1E8',
    borderRadius: radius.md,
  },
  reassureText: {
    ...typography.xs,
    color: colors.inkMuted,
    flexShrink: 1,
  },

  // Plans côte à côte
  plansRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  plansRowBelow: {
    marginTop: spacing.lg,
  },
  planCol: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: '#ECECEC',
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  planColActive: {
    borderColor: colors.success,
  },
  saveBadge: {
    position: 'absolute',
    top: -11,
    alignSelf: 'center',
    backgroundColor: colors.success,
    borderRadius: radius.full,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  saveBadgeText: {
    ...typography.xsSemiBold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  planName: {
    ...typography.bodySemiBold,
    color: colors.ink,
    marginBottom: 6,
  },
  planBigPrice: {
    ...typography.h2,
    color: colors.success,
  },
  planBigPriceActive: {
    color: colors.successDeep,
  },
  planSub: {
    ...typography.small,
    color: colors.inkMuted,
    marginTop: 2,
  },
  planRadio: {
    marginTop: spacing.sm,
  },

  // CTA
  ctaWrap: {
    marginTop: spacing.xs,
  },
  cancelWrap: {
    marginTop: spacing.lg,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: radius.full,
  },
  ctaGreen: {
    backgroundColor: colors.success,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    ...typography.button,
    color: '#FFFFFF',
  },
  ctaHint: {
    ...typography.small,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },

  // Légal + liens
  legal: {
    ...typography.xs,
    color: colors.inkLight,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 16,
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  link: {
    ...typography.xs,
    color: colors.inkMuted,
    textDecorationLine: 'underline',
  },
  linkDot: {
    ...typography.xs,
    color: colors.inkLight,
  },
  laterBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  laterText: {
    ...typography.body,
    color: colors.inkMuted,
    textDecorationLine: 'underline',
  },

  // Abonnement (premium)
  subscriptionHero: {
    alignItems: 'center',
    padding: spacing.xl,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statusRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  statusIcon: { marginRight: spacing.md },
  statusContent: { flex: 1 },
  statusLabel: { ...typography.small, color: colors.inkMuted, marginBottom: 2 },
  statusValue: { ...typography.bodySemiBold, color: colors.ink },
})
