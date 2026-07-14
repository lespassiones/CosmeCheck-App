/**
 * LegalSections — rendu partagé du CORPS d'un document légal (sous-titre +
 * sections titres/paragraphes/listes). Sans chrome ni ScrollView : le parent
 * fournit le container (écran plein via LegalScreen, ou modal via LegalModal).
 *
 * Ne PAS mettre de logique métier ici — c'est purement présentationnel.
 */

import { type FC, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'

export interface LegalSection {
  title?: string
  paragraphs?: (string | { strong: string })[]
  bullets?: string[]
}

interface Props {
  /** Phrase courte sous le titre (ex: "Dernière mise à jour : 2 juin 2026"). */
  subtitle?: string
  sections: LegalSection[]
  /** Bloc additionnel rendu en bas (ex: bouton de contact, version app). */
  footer?: ReactNode
}

export const LegalSections: FC<Props> = ({ subtitle, sections, footer }) => (
  <>
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
  </>
)

const styles = StyleSheet.create({
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
