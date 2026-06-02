/**
 * StatCard — petite carte glassmorphique de statistique pour la fiche
 * ingrédient (miroir mobile du <StatCard> web). Label en capitales + icône
 * "épingle", contenu libre, et CTA optionnel (ouvre une URL externe).
 */

import { type FC, type ReactNode } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'

interface Props {
  label: string
  children: ReactNode
  cta?: string
  href?: string
}

export const StatCard: FC<Props> = ({ label, children, cta, href }) => {
  const showLink = Boolean(cta && href)

  return (
    <WhiteCard style={styles.card} padding={16}>
      <View style={styles.labelRow}>
        <Ionicons name="pricetag-outline" size={11} color={colors.inkLight} />
        <Text style={styles.label}>{label.toUpperCase()}</Text>
      </View>

      <View style={styles.body}>{children}</View>

      {showLink ? (
        <Pressable
          onPress={() => {
            if (href) Linking.openURL(href).catch(() => {})
          }}
          hitSlop={8}
          accessibilityRole="link"
        >
          <Text style={styles.cta}>{cta} →</Text>
        </Pressable>
      ) : null}
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.inkLight,
  },
  body: {
    marginTop: 10,
  },
  cta: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.accentDeep,
    marginTop: 14,
  },
})
