/**
 * WelcomeScreen — écran d'accueil de l'auth (point d'entrée non connecté).
 *
 * Inspiré du pattern « landing » : marque centrée dans une pastille blanche,
 * un unique bouton Google (le seul de toute l'app — plus de doublon sur les
 * écrans connexion/inscription), puis deux CTA :
 *   - « Créer un compte » (plein rose)  → /(auth)/sign-up  (nom + email + mdp)
 *   - « Connexion » (contour)           → /(auth)/sign-in  (email + mdp)
 * Le wordmark « Cosme Check » ferme l'écran en bas.
 */

import { type FC, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Path } from 'react-native-svg'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { LogoMark } from '@/components/shared/Logo'
import { fontFamilies } from '@/constants/typography'
import { signInWithGoogle } from '@/lib/auth/google'

/** Logo Google officiel multicolore (4 couleurs). */
const GoogleLogo: FC<{ size?: number }> = ({ size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <Path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <Path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <Path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </Svg>
)

/**
 * Bouton Google circulaire (icône dans une pastille blanche + label dessous),
 * façon « Continuer avec ». Déclenche le flux OAuth PKCE ; l'annulation reste
 * silencieuse, seules les vraies erreurs s'affichent.
 */
const GoogleCircleButton: FC = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePress = async (): Promise<void> => {
    Haptics.selectionAsync().catch(() => {})
    setError(null)
    setIsLoading(true)
    const result = await signInWithGoogle()
    setIsLoading(false)

    if (result.ok || result.cancelled) return
    setError(result.error ?? 'La connexion Google a échoué. Réessaie.')
  }

  return (
    <View style={styles.googleWrap}>
      <Text style={styles.googleCaption}>Continuer avec</Text>
      <Pressable
        onPress={() => void handlePress()}
        disabled={isLoading}
        style={({ pressed }) => [
          styles.googleCircle,
          pressed && !isLoading && styles.googleCirclePressed,
          isLoading && styles.googleCircleDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Continuer avec Google"
      >
        {isLoading ? (
          <ActivityIndicator color={colors.inkMuted} size="small" />
        ) : (
          <GoogleLogo size={26} />
        )}
      </Pressable>
      <Text style={styles.googleLabel}>Google</Text>

      {error && (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  )
}

const WelcomeScreen: FC = () => {
  return (
    <View style={styles.root}>
      <BackgroundGlow variant="auth" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.content}>
          {/* Marque : logo (3 points) + wordmark Cosme Check */}
          <View style={styles.brandTop}>
            <LogoMark size={20} />
            <Text style={styles.brandText}>
              Cosme<Text style={styles.brandCheck}> Check</Text>
            </Text>
          </View>

          {/* En-tête : titre + sous-titre */}
          <View style={styles.header}>
            <Text style={styles.title}>Bienvenue !</Text>
            <Text
              style={styles.subtitle}
              numberOfLines={2}
              adjustsFontSizeToFit
            >
              On te dit si un cosmétique est adapté{'\n'}à toi et à tes objectifs.
            </Text>
          </View>

          {/* Bouton Google (unique dans l'app) — rapproché du sous-titre */}
          <View style={styles.googleBlock}>
            <GoogleCircleButton />
          </View>

          {/* Séparateur */}
          <View style={styles.separator}>
            <View style={styles.line} />
            <Text style={styles.separatorText}>ou</Text>
            <View style={styles.line} />
          </View>

          {/* CTA principaux */}
          <View style={styles.ctaGroup}>
            <Pressable
              onPress={() => router.push(ROUTES.AUTH.SIGN_IN)}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.secondaryBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Connexion"
            >
              <Text style={styles.secondaryBtnText}>Connexion</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push(ROUTES.AUTH.SIGN_UP)}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.primaryBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Créer un compte"
            >
              <Text style={styles.primaryBtnText}>Créer un compte</Text>
            </Pressable>
          </View>

          {/* Espace souple bas */}
          <View style={styles.spacer} />
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  // ── Marque en haut ─────────────────────────────────────────────────
  brandTop: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing['2xl'],
  },
  brandText: {
    fontFamily: fontFamilies.bold,
    fontSize: 18,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  brandCheck: {
    color: colors.rose,
  },
  header: {
    alignItems: 'center',
    gap: spacing.md,
  },
  googleBlock: {
    marginTop: spacing['2xl'],
  },
  title: {
    ...typography.h1,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  // ── Espace souple ──────────────────────────────────────────────────
  spacer: {
    flex: 1,
  },
  // ── Google ─────────────────────────────────────────────────────────
  googleWrap: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  googleCaption: {
    ...typography.small,
    color: colors.inkMuted,
  },
  googleCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  googleCirclePressed: {
    backgroundColor: colors.gray50,
  },
  googleCircleDisabled: {
    opacity: 0.6,
  },
  googleLabel: {
    ...typography.xsMedium,
    color: colors.inkMuted,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.xs,
  },
  errorText: {
    ...typography.xs,
    color: colors.error,
  },
  // ── Séparateur ─────────────────────────────────────────────────────
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    alignSelf: 'stretch',
    marginVertical: spacing.xl,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  separatorText: {
    ...typography.small,
    color: colors.inkLight,
  },
  // ── CTA ────────────────────────────────────────────────────────────
  ctaGroup: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  primaryBtn: {
    height: 54,
    borderRadius: radius.full,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.rose,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryBtnPressed: {
    backgroundColor: colors.roseDeep,
  },
  primaryBtnText: {
    ...typography.button,
    color: colors.surface,
  },
  secondaryBtn: {
    height: 54,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.rose,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnPressed: {
    backgroundColor: colors.roseSoft,
  },
  secondaryBtnText: {
    ...typography.button,
    color: colors.rose,
  },
})

export default WelcomeScreen
