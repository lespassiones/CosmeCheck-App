/**
 * NotifPromptCard — 2e (et dernière) sollicitation d'activation des
 * notifications, affichée sur l'écran d'analyse à partir du 2e scan réussi
 * quand l'étape d'onboarding a été passée.
 *
 * Même philosophie que l'étape d'onboarding : le dialogue système n'est
 * déclenché qu'après le « oui » explicite. « Plus tard » consomme la dernière
 * sollicitation : on ne redemandera plus jamais (réactivable dans le profil).
 */

import { type FC, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'

interface Props {
  /** L'utilisateur accepte : le parent déclenche permission + enregistrement. */
  onAccept: () => void
  /** « Plus tard » : le parent consomme la sollicitation et ferme. */
  onDismiss: () => void
}

export const NotifPromptCard: FC<Props> = ({ onAccept, onDismiss }) => {
  const [busy, setBusy] = useState(false)

  const handleAccept = () => {
    if (busy) return
    setBusy(true)
    onAccept()
  }

  return (
    <WhiteCard padding={spacing.lg}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Ionicons name="notifications" size={20} color={colors.rose} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Ta peau a des choses à te dire</Text>
          <Text style={styles.sub}>
            Sois prévenu(e) quand un de tes produits mérite ton attention. Jamais de spam.
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleAccept}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Activer les notifications"
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>Oui, je veux savoir</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Plus tard"
          hitSlop={8}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>Plus tard</Text>
        </Pressable>
      </View>
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.rating.rouge.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontFamily: fontFamilies.bold, fontSize: 16, color: colors.ink, letterSpacing: -0.2 },
  sub: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
    marginTop: 3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primary: {
    flex: 1,
    backgroundColor: colors.rose,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  primaryText: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: colors.surface },
  secondary: { paddingHorizontal: spacing.md, paddingVertical: 12 },
  secondaryText: { fontFamily: fontFamilies.medium, fontSize: 14, color: colors.inkMuted },
})
