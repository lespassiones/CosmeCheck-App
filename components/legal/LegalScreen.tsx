/**
 * LegalScreen — layout PLEIN ÉCRAN pour les écrans légaux (CGU, confidentialité,
 * mentions, à propos). En-tête avec bouton retour + ScrollView.
 *
 * Le rendu du corps (sections) est délégué à `LegalSections`, partagé avec
 * `LegalModal` (ouverture en modal depuis l'inscription, sans navigation).
 * Ne PAS mettre de logique métier ici — c'est juste un container.
 */

import { type FC, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { LegalSections, type LegalSection } from '@/components/legal/LegalSections'
import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'

export type { LegalSection }

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
          <LegalSections subtitle={subtitle} sections={sections} footer={footer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

/** Largeur de lecture maximale, en points. Voir le style `content`. */
const READING_MAX_WIDTH = 560

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
    // Colonne de lecture bornee et centree.
    //
    // Ces quatre ecrans (CGU, confidentialite, mentions, a propos) sont les
    // seuls a enchainer de longs paragraphes. Sur la fenetre de compatibilite
    // d'un iPad, large d'environ 637 points, une ligne y depassait les
    // 90 caracteres : lisible, mais au-dela du confort. La borne ne mord sur
    // AUCUN iPhone, le plus large faisant 430 points, donc le rendu telephone
    // est inchange au pixel. Meme valeur que l'ecran de consentement, qui
    // enchaine le meme genre de texte.
    width: '100%',
    maxWidth: READING_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    gap: spacing.lg,
  },
})
