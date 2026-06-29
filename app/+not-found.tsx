/**
 * NotFound — page 404 stylée.
 *
 * Affichée quand une route Expo Router ne correspond à aucun fichier.
 * Logo + message convivial + URL tentée + bouton de retour à l'accueil.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, usePathname } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { GlassCard } from '@/components/design/GlassCard'
import { LogoMark } from '@/components/shared/Logo'
import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'

export default function NotFound() {
  const pathname = usePathname()

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <BackgroundGlow variant="auth" />

      <View style={styles.logoRow}>
        <LogoMark size={18} />
      </View>

      <View style={styles.center}>
        <GlassCard style={styles.card} padding={spacing['2xl']}>
          <View style={styles.iconCircle}>
            <Ionicons name="help-circle-outline" size={44} color={colors.rose} />
          </View>

          <Text style={styles.title}>Oups, page introuvable</Text>
          <Text style={styles.subtitle}>
            Cette page n'existe pas ou a été déplacée.
          </Text>

          {pathname ? (
            <View style={styles.urlBox}>
              <Text style={styles.urlText} numberOfLines={1}>
                {pathname}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => router.replace(ROUTES.TABS.HOME)}
            style={({ pressed }) => [styles.homeBtn, pressed && styles.homeBtnPressed]}
            accessibilityRole="button"
          >
            <Ionicons name="home" size={18} color={colors.surface} style={styles.homeBtnIcon} />
            <Text style={styles.homeBtnText}>Retour à l'accueil</Text>
          </Pressable>
        </GlassCard>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  logoRow: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  urlBox: {
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
    maxWidth: '100%',
  },
  urlText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.inkLight,
  },
  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  homeBtnPressed: {
    opacity: 0.85,
  },
  homeBtnIcon: {
    marginRight: spacing.sm,
  },
  homeBtnText: {
    ...typography.button,
    color: colors.surface,
  },
})
