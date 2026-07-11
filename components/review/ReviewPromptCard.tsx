/**
 * ReviewPromptCard — carte "Tu aimes CosmeCheck ?" affichee au pic
 * d'engagement (juste apres l'apparition des 3 blocs IA post-scan).
 *
 * On maitrise nous-memes le timing et la frequence (cf. lib/review/prompt.ts) ;
 * le bouton d'acceptation delegue le VRAI dialogue de notation au module natif
 * (`requestStoreReview`, Google Play In-App Review), avec repli fiche store.
 */

import { type FC, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { requestStoreReview } from '@/lib/review/storeReview'

interface Props {
  /** Appele quand l'utilisateur lance la notation (-> etat 'done'). */
  onAccept: () => void
  /** Appele quand l'utilisateur repousse (-> carte fermee, re-proposable J+1). */
  onDismiss: () => void
}

export const ReviewPromptCard: FC<Props> = ({ onAccept, onDismiss }) => {
  const [busy, setBusy] = useState(false)

  const handleAccept = async () => {
    if (busy) return
    setBusy(true)
    try {
      await requestStoreReview()
    } finally {
      setBusy(false)
      onAccept()
    }
  }

  return (
    <WhiteCard padding={spacing.lg}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Ionicons name="heart" size={20} color={colors.rose} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Tu aimes CosmeCheck ?</Text>
          <Text style={styles.sub}>
            Ton avis aide d'autres personnes a decrypter leurs cosmetiques. Ca prend 10 secondes.
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleAccept}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Noter l'application"
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>Oui, je note</Text>
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
