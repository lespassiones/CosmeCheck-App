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
import { useProfile } from '@/hooks/useProfile'

/** Seuil d'alerte : moins de 10 % du quota restant. */
const LOW_RATIO = 0.1

export const CreditsPill: FC = () => {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const { credits, remaining, limit, error } = useCredits()
  const { profile } = useProfile()
  const isPremium = profile?.tier === 'premium'

  // Masqué tant que non authentifié ou que la RPC n'a rien renvoyé.
  if (!isAuthenticated || !credits) return null

  // Si la RPC retourne ok:false, masque silencieusement (indique une erreur serveur).
  if (!credits.ok) return null

  const isLow = limit > 0 ? remaining / limit < LOW_RATIO : remaining <= 0

  // Or pour les membres Premium : c'est le seul endroit de l'app où le statut
  // se voit en permanence, alors autant qu'il se voie. L'alerte de solde bas
  // reste prioritaire sur la couleur du statut, sinon on masquerait une
  // information utile derrière une décoration.
  const tint = isLow ? colors.rose : isPremium ? colors.gold : colors.accent
  const fill = isLow ? colors.roseSoft : isPremium ? colors.goldSoft : colors.accentSoft

  const goToOffre = () => {
    Haptics.selectionAsync().catch(() => {})
    router.push(ROUTES.OFFRE.INDEX)
  }

  return (
    <GlassCard
      padding={2}
      borderRadius={radius.full}
      style={[styles.card, isPremium && !isLow ? styles.cardPremium : null]}
      contentStyle={styles.content}
    >
      <Pressable
        onPress={goToOffre}
        accessibilityRole="button"
        accessibilityLabel="Voir l'offre Premium et mes crédits"
        hitSlop={6}
        style={({ pressed }) => [styles.label, pressed && styles.plusPressed]}
      >
        <Ionicons name={isPremium ? 'diamond' : 'star'} size={11} color={tint} />
        <Text style={[styles.count, { color: tint }]} allowFontScaling={false}>
          {remaining} {remaining === 1 ? 'crédit' : 'crédits'}
        </Text>
      </Pressable>

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
  cardPremium: {
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.full,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
    paddingRight: 3,
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
