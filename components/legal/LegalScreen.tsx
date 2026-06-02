/**
 * LegalScreen — layout partagé pour les écrans légaux (CGU, confidentialité,
 * mentions, à propos). Rend un en-tête simple + une ScrollView texte avec
 * mise en page hiérarchisée (titres / paragraphes / listes).
 *
 * Ne PAS mettre la logique métier ici — c'est juste un container réutilisé
 * par les 4 écrans de `app/legal/`.
 */

import { type FC, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'

export interface LegalSection {
  title?: string
  paragraphs?: (string | { strong: string })[]
  bullets?: string[]
}

interface Props {
  title: string
  /** Phrase courte sous le titre (ex: "Dernière mise à jour : 2 juin 2026"). */
  subtitle?: string
  sections: LegalSection[]
  /** Bloc additionnel rendu en bas (ex: bouton de contact, version app). */
  footer?: ReactNode
}

export const LegalScreen: FC<Props> = ({ title, subtitle, sections, footer }) => {
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
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing['2xl'] },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          {sections.map((s, i) => (
            <View key={i} style={styles.section}>
              {s.title ? <Text style={styles.sectionTitle}>{s.title}</Text> : null}
              {s.paragraphs?.map((p, j) =>
                typeof p === 'string' ? (
                  <Text key={j} style={styles.paragraph}>
                    {p}
                  </Text>
                ) : (
                  <Text key={j} style={styles.paragraphStrong}>
                    {p.strong}
                  </Text>
                ),
              )}
              {s.bullets?.map((b, j) => (
                <View key={j} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          ))}

          {footer}
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
  headerTitle: { ...typography.h4, color: colors.ink, flex: 1, textAlign: 'center' },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    gap: spacing.lg,
  },
  subtitle: {
    ...typography.small,
    color: colors.inkMuted,
    fontStyle: 'italic',
  },
  section: { gap: spacing.sm },
  sectionTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  paragraph: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  paragraphStrong: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: spacing.xs },
  bulletDot: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
  },
  bulletText: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
})
