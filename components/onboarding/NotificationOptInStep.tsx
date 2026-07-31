/**
 * NotificationOptInStep — dernière micro-étape de l'onboarding (bloc 4).
 *
 * Case NON cochée par défaut : l'utilisateur doit cocher « Oui, je veux
 * savoir » pour que le bouton final du wizard s'active. Le « Passer » global
 * (haut droite) saute sans activer ; la re-demande éventuelle a lieu plus tard
 * (2e scan, cf. lib/notifications/optInPrompt.ts). Le dialogue système de
 * permission n'est déclenché QU'APRÈS ce oui explicite, par le wizard.
 */

import { type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'

interface Props {
  checked: boolean
  onToggle: (next: boolean) => void
}

export const NotificationOptInStep: FC<Props> = ({ checked, onToggle }) => {
  const toggle = () => {
    Haptics.selectionAsync().catch(() => {})
    onToggle(!checked)
  }

  return (
    <View>
      {/* Illustration cloche */}
      <View style={styles.heroWrap}>
        <View style={styles.heroRing}>
          <View style={styles.heroInner}>
            <Ionicons name="notifications" size={34} color={colors.accent} />
          </View>
        </View>
      </View>

      <Text style={styles.body}>
        Sois prévenu(e) quand un de tes produits mérite ton attention.
      </Text>
      <Text style={styles.sub}>
        Tu recevras aussi nos meilleurs conseils par email. Jamais de spam.
      </Text>

      {/* Case à cocher (non cochée par défaut) */}
      <Pressable
        onPress={toggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="Oui, je veux savoir"
        style={({ pressed }) => [
          styles.checkRow,
          checked && styles.checkRowOn,
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
          {checked ? <Ionicons name="checkmark" size={16} color={colors.surface} /> : null}
        </View>
        <Text style={[styles.checkLabel, checked && styles.checkLabelOn]}>
          Oui, je veux savoir
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  heroWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  heroRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.accentSoft,
    opacity: 0.9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  body: {
    ...typography.body,
    color: colors.ink,
    textAlign: 'center',
  },
  sub: {
    ...typography.small,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.gray300,
    backgroundColor: colors.surface,
  },
  checkRowOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.inkMuted,
  },
  checkLabelOn: {
    color: colors.accentDeep,
  },
})
