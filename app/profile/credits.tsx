/**
 * CreditsInfoScreen — « Crédits & fonctionnalités ».
 *
 * Explique simplement et visuellement combien de crédits coûte chaque
 * fonctionnalité. Purement informatif (aucun appel réseau). Les coûts reflètent
 * les débits réels côté serveur (gate/consumeCredit) :
 *   - scan + lecture = gratuit
 *   - fonctions IA = 1 crédit
 *   - couverture des objectifs = 3 crédits
 * Accessible depuis Profil → « Crédits & fonctionnalités ».
 */

import { type FC } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { Reveal } from '@/components/design/Reveal'
import { WhiteCard } from '@/components/design/WhiteCard'

type IoniconName = keyof typeof Ionicons.glyphMap

interface Feature {
  icon: IoniconName
  label: string
  desc: string
}

interface Section {
  cost: 0 | 1 | 3
  title: string
  items: Feature[]
}

const SECTIONS: Section[] = [
  {
    cost: 0,
    title: 'Toujours gratuit',
    items: [
      {
        icon: 'barcode-outline',
        label: 'Scanner et analyser un produit',
        desc: 'Analyse de la composition et note de qualité de la formule.',
      },
      {
        icon: 'albums-outline',
        label: 'Routine, historique et fiches',
        desc: 'Consulter tes analyses, ta routine et les ingrédients.',
      },
    ],
  },
  {
    cost: 1,
    title: 'Fonctions IA personnalisées',
    items: [
      {
        icon: 'sparkles-outline',
        label: 'Analyse complète « pour toi »',
        desc: 'Ton score de compatibilité et les 3 conseils personnalisés.',
      },
      {
        icon: 'shield-checkmark-outline',
        label: "Analyse d'une promesse",
        desc: 'Vérifier si un produit tient ce qu’il annonce.',
      },
      {
        icon: 'chatbubbles-outline',
        label: 'Message au conseiller beauté',
        desc: 'Une réponse personnalisée, par message envoyé.',
      },
      {
        icon: 'bulb-outline',
        label: 'Suggestion intelligente',
        desc: 'Un meilleur produit proposé, par produit.',
      },
      {
        icon: 'swap-horizontal-outline',
        label: 'Alternatives & comparaison',
        desc: 'Comparer deux produits ou trouver mieux.',
      },
      {
        icon: 'git-compare-outline',
        label: 'Conflits de routine',
        desc: 'Analyse des incompatibilités entre tes produits.',
      },
      {
        icon: 'globe-outline',
        label: 'Recherche approfondie internet',
        desc: 'Retrouver un produit absent du catalogue.',
      },
    ],
  },
  {
    cost: 3,
    title: 'Analyse avancée',
    items: [
      {
        icon: 'flag-outline',
        label: 'Couverture de tes objectifs',
        desc: 'Mesure à quel point ta routine atteint chaque objectif.',
      },
    ],
  },
]

/** Pastille de coût : verte « Gratuit » ou rose « N crédit(s) ». */
const CostBadge: FC<{ cost: 0 | 1 | 3 }> = ({ cost }) => {
  if (cost === 0) {
    return (
      <View style={[styles.badge, styles.badgeFree]}>
        <Text style={[styles.badgeText, styles.badgeTextFree]}>Gratuit</Text>
      </View>
    )
  }
  return (
    <View style={[styles.badge, styles.badgePaid]}>
      <Ionicons name="star" size={11} color={colors.accent} />
      <Text style={[styles.badgeText, styles.badgeTextPaid]}>
        {cost} {cost > 1 ? 'crédits' : 'crédit'}
      </Text>
    </View>
  )
}

const CreditsInfoScreen: FC = () => {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Crédits & fonctionnalités</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['2xl'] }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Entrée douce : intro, sections et note apparaissent en fondu échelonné. */}
          <Reveal stagger={70} style={styles.revealStack}>
            {/* Intro */}
            <WhiteCard padding={spacing.lg}>
              <View style={styles.introRow}>
                <Ionicons name="star" size={18} color={colors.accent} />
                <Text style={styles.introTitle}>Comment marchent les crédits ?</Text>
              </View>
              <Text style={styles.introText}>
                Chaque jour, tu reçois des crédits gratuits qui se rechargent
                automatiquement. Scanner un produit et consulter tes analyses reste
                toujours gratuit. Seules les fonctions IA en consomment.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.premiumCta, pressed && styles.premiumCtaPressed]}
                onPress={() => router.push(ROUTES.OFFRE.INDEX)}
                accessibilityRole="button"
              >
                <Ionicons name="diamond-outline" size={15} color="#FFFFFF" />
                <Text style={styles.premiumCtaText}>{"Passe Premium pour l'illimité"}</Text>
              </Pressable>
            </WhiteCard>

            {/* Sections de coût */}
            {SECTIONS.map((section) => (
              <View key={section.title} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <CostBadge cost={section.cost} />
                </View>
                <WhiteCard padding={0}>
                  {section.items.map((item, i) => (
                    <View
                      key={item.label}
                      style={[styles.featureRow, i > 0 && styles.featureRowBorder]}
                    >
                      <View style={styles.featureIcon}>
                        <Ionicons
                          name={item.icon}
                          size={20}
                          color={section.cost === 0 ? colors.rating.vert.DEFAULT : colors.accent}
                        />
                      </View>
                      <View style={styles.featureTexts}>
                        <Text style={styles.featureLabel}>{item.label}</Text>
                        <Text style={styles.featureDesc}>{item.desc}</Text>
                      </View>
                    </View>
                  ))}
                </WhiteCard>
              </View>
            ))}

            <Text style={styles.footnote}>
              {"Les crédits déjà dépensés pour un contenu ne sont jamais redébités si nous l'améliorons ou si tu le rouvres."}
            </Text>
          </Reveal>
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.h4, color: colors.ink },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.base, gap: spacing.lg },
  // Reveal devient l'unique enfant du ScrollView : on y reporte le gap.
  revealStack: { gap: spacing.lg },

  // Intro
  introRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  introTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink, flex: 1 },
  introText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
  },
  premiumCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingVertical: 11,
    marginTop: spacing.md,
  },
  premiumCtaPressed: { backgroundColor: colors.accentDeep },
  premiumCtaText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: '#FFFFFF' },

  // Sections
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: {
    ...typography.xsSemiBold,
    color: colors.inkLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },

  // Feature rows
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  featureRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  featureIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTexts: { flex: 1, gap: 2 },
  featureLabel: { fontFamily: fontFamilies.semiBold, fontSize: 13.5, color: colors.ink },
  featureDesc: {
    fontFamily: fontFamilies.regular,
    fontSize: 11.5,
    lineHeight: 15,
    color: colors.inkMuted,
  },

  // Badges
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeFree: { backgroundColor: colors.rating.vert.bg },
  badgePaid: { backgroundColor: colors.accentSoft },
  badgeText: { fontFamily: fontFamilies.semiBold, fontSize: 11 },
  badgeTextFree: { color: colors.rating.vert.DEFAULT },
  badgeTextPaid: { color: colors.accent },

  footnote: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.inkLight,
    fontStyle: 'italic',
    paddingHorizontal: spacing.xs,
  },
})

export default CreditsInfoScreen
