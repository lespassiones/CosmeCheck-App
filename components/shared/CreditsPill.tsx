/**
 * CreditsPill : pastille compacte du solde de crédits quotidiens.
 *
 * - Lit le solde via useCredits().
 * - Se masque tant que l'utilisateur n'est pas authentifié (ou pas de données).
 * - Style unique partout (28/09/2026, demande user) : pilule blanche bordée de
 *   gris, icône « base de données » (pile de jetons) + « 12 crédits » en encre.
 *   Seule exception : sous 10 % du quota, icône et texte passent en rose, pour
 *   que l'alerte de solde bas reste visible.
 * - Toute la pastille mène à l'offre (ROUTES.OFFRE.INDEX).
 */

import type { FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'

import { colors } from '@/constants/colors'
import { radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
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

  // Si la RPC retourne ok:false, masque silencieusement (indique une erreur serveur).
  if (!credits.ok) return null

  const isLow = limit > 0 ? remaining / limit < LOW_RATIO : remaining <= 0
  const tint = isLow ? colors.rose : colors.ink

  const goToOffre = () => {
    Haptics.selectionAsync().catch(() => {})
    router.push(ROUTES.OFFRE.INDEX)
  }

  return (
    <Pressable
      onPress={goToOffre}
      accessibilityRole="button"
      accessibilityLabel={`${remaining} ${remaining === 1 ? 'crédit' : 'crédits'}, voir l'offre et mes crédits`}
      hitSlop={6}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <Feather name="database" size={14} color={tint} />
      <Text style={[styles.count, { color: tint }]} allowFontScaling={false}>
        {remaining} {remaining === 1 ? 'crédit' : 'crédits'}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  count: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    letterSpacing: -0.1,
  },
  pressed: {
    opacity: 0.7,
  },
})
