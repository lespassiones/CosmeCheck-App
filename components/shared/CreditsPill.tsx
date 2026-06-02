/**
 * CreditsPill — pastille compacte du solde de crédits quotidiens.
 *
 * - Lit le solde via useCredits().
 * - Se masque tant que l'utilisateur n'est pas authentifié (ou pas de données).
 * - Teinte d'alerte (roseSoft) quand remaining/limit < 10 %.
 * - Le bouton "+" navigue vers l'offre (ROUTES.OFFRE.INDEX).
 *
 * Forme pill (radius.full) posée sur une GlassCard compacte.
 */

import type { FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { GlassCard } from '@/components/design/GlassCard'
import { useAuth } from '@/hooks/useAuth'
import { useCredits } from '@/hooks/useCredits'

/** Seuil d'alerte : moins de 10 % du quota restant. */
const LOW_RATIO = 0.1

export const CreditsPill: FC = () => {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const { credits, remaining, limit } = useCredits()

  // Masqué tant que non authentifié ou que la RPC n'a rien renvoyé.
  if (!isAuthenticated || !credits) return null

  const isLow = limit > 0 ? remaining / limit < LOW_RATIO : remaining <= 0

  const tint = isLow ? colors.rose : colors.accent
  const fill = isLow ? colors.roseSoft : colors.accentSoft

  const goToOffre = () => {
    Haptics.selectionAsync().catch(() => {})
    router.push(ROUTES.OFFRE.INDEX)
  }

  return (
    <GlassCard
      padding={2}
      borderRadius={radius.full}
      style={styles.card}
      contentStyle={styles.content}
    >
      <Ionicons name="star" size={11} color={tint} />
      <Text style={[styles.count, { color: tint }]} allowFontScaling={false}>
        {remaining} {remaining === 1 ? 'crédit' : 'crédits'}
      </Text>

      <Pressable
        onPress={goToOffre}
        accessibilityRole="button"
        accessibilityLabel="Obtenir plus de crédits"
        hitSlop={6}
        style={({ pressed }) => [
          styles.plus,
          { backgroundColor: fill },
          pressed && styles.plusPressed,
        ]}
      >
        <Ionicons name="add" size={12} color={tint} />
      </Pressable>
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
    paddingRight: 3,
  },
  count: {
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    letterSpacing: -0.2,
  },
  plus: {
    width: 17,
    height: 17,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusPressed: {
    opacity: 0.7,
  },
})
