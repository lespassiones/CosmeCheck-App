/**
 * OffreScreen — page Premium complète (statique).
 *
 * Présente l'offre Premium de Cosme Check : hero avec Logo, deux plans
 * (mensuel 2,99 €/mois et annuel 24,99 €/an avec "2 mois offerts"),
 * la liste des avantages Premium, puis un CTA principal DÉSACTIVÉ
 * "Bientôt disponible" (le paiement n'est pas encore en ligne).
 *
 * Page produit standalone — aucune logique d'achat, aucun appel réseau.
 */

import { useState, type FC } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { NeuCard } from '@/components/design/NeuCard'
import { Logo } from '@/components/shared/Logo'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'

type PlanId = 'monthly' | 'annual'

interface Plan {
  id: PlanId
  label: string
  price: string
  period: string
  badge?: string
  note?: string
}

const PLANS: Plan[] = [
  {
    id: 'annual',
    label: 'Annuel',
    price: '24,99 €',
    period: '/ an',
    badge: '2 mois offerts',
    note: 'soit ≈ 2,08 €/mois',
  },
  {
    id: 'monthly',
    label: 'Mensuel',
    price: '2,99 €',
    period: '/ mois',
    note: 'sans engagement',
  },
]

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'flask', text: 'Analyses INCI illimitées' },
  { icon: 'shield-checkmark', text: 'Analyses de promesses illimitées' },
  { icon: 'git-compare', text: 'Comparaisons de produits illimitées' },
  { icon: 'sparkles', text: 'Beauty Advisor avancé' },
  { icon: 'time', text: 'Historique étendu' },
  { icon: 'document-text', text: 'Export PDF des analyses' },
  { icon: 'rocket', text: 'Accès anticipé aux nouveautés' },
]

const OffreScreen: FC = () => {
  const [selected, setSelected] = useState<PlanId>('annual')

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
        <Logo size={22} />
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — fond crème doux, look « cosmétique haut de gamme ». */}
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
          {PLANS.map((plan) => {
            const active = selected === plan.id
            return (
              <NeuCard
                key={plan.id}
                onPress={() => setSelected(plan.id)}
                variant={active ? 'pressed' : 'raised'}
                style={[styles.planCard, active && styles.planCardActive]}
                padding={spacing.lg}
              >
                <View style={styles.planRow}>
                  <View style={styles.planRadio}>
                    <Ionicons
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={active ? colors.rose : colors.inkLight}
                    />
                  </View>

                  <View style={styles.planInfo}>
                    <View style={styles.planLabelRow}>
                      <Text style={styles.planLabel}>{plan.label}</Text>
                      {plan.badge ? (
                        <View style={styles.planBadge}>
                          <Text style={styles.planBadgeText}>{plan.badge}</Text>
                        </View>
                      ) : null}
                    </View>
                    {plan.note ? (
                      <Text style={styles.planNote}>{plan.note}</Text>
                    ) : null}
                  </View>

                  <View style={styles.planPriceCol}>
                    <Text style={styles.planPrice}>{plan.price}</Text>
                    <Text style={styles.planPeriod}>{plan.period}</Text>
                  </View>
                </View>
              </NeuCard>
            )
          })}
        </View>

        {/* Avantages */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tout ce que tu débloques</Text>
          <NeuCard variant="raised" padding={spacing.lg} interactive={false}>
            {BENEFITS.map((b, i) => (
              <View
                key={b.text}
                style={[styles.benefitRow, i === BENEFITS.length - 1 && styles.benefitRowLast]}
              >
                <View style={styles.benefitIcon}>
                  <Ionicons name={b.icon} size={18} color={colors.accent} />
                </View>
                <Text style={styles.benefitText}>{b.text}</Text>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              </View>
            ))}
          </NeuCard>
        </View>

        {/* CTA désactivé */}
        <View style={styles.ctaSection}>
          <View
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityLabel="Bientôt disponible"
          >
            <LinearGradient
              colors={[colors.rose, colors.roseDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cta}
            >
              <Ionicons name="lock-closed" size={18} color={colors.surface} />
              <Text style={styles.ctaText}>Bientôt disponible</Text>
            </LinearGradient>
          </View>
          <Text style={styles.ctaHint}>
            Le paiement n'est pas encore disponible.
          </Text>
        </View>
      </ScrollView>
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
  scroll: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
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
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  benefitText: {
    ...typography.body,
    color: colors.ink,
    flex: 1,
  },

  // CTA
  ctaSection: {
    marginTop: spacing.sm,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: radius.full,
    opacity: 0.55,
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
