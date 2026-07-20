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

import { type FC, type ReactNode, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
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
import { signInWithApple } from '@/lib/auth/apple'

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

/** Logo Apple (silhouette noire). */
const AppleLogo: FC<{ size?: number }> = ({ size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill="#000000"
      d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
    />
  </Svg>
)

/** Bouton provider circulaire générique (icône dans une pastille + label dessous). */
const ProviderCircle: FC<{
  label: string
  a11y: string
  loading: boolean
  onPress: () => void
  children: ReactNode
}> = ({ label, a11y, loading, onPress, children }) => (
  <View style={styles.providerItem}>
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.googleCircle,
        pressed && !loading && styles.googleCirclePressed,
        loading && styles.googleCircleDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      {loading ? <ActivityIndicator color={colors.inkMuted} size="small" /> : children}
    </Pressable>
    <Text style={styles.googleLabel}>{label}</Text>
  </View>
)

/**
 * Boutons sociaux « Continuer avec » : Google (toutes plateformes) + Apple
 * (iOS uniquement — feuille système native, exigé par Apple dès qu'il y a Google).
 * L'annulation reste silencieuse ; seules les vraies erreurs s'affichent.
 */
const SocialButtons: FC = () => {
  const [loading, setLoading] = useState<null | 'google' | 'apple'>(null)
  const [error, setError] = useState<string | null>(null)
  const appleAvailable = Platform.OS === 'ios'

  const runGoogle = async (): Promise<void> => {
    Haptics.selectionAsync().catch(() => {})
    setError(null)
    setLoading('google')
    const result = await signInWithGoogle()
    setLoading(null)
    if (result.ok || result.cancelled) return
    setError(result.error ?? 'La connexion Google a échoué. Réessaie.')
  }

  const runApple = async (): Promise<void> => {
    Haptics.selectionAsync().catch(() => {})
    setError(null)
    setLoading('apple')
    const result = await signInWithApple()
    setLoading(null)
    if (result.ok || result.cancelled) return
    setError(result.error ?? 'La connexion Apple a échoué. Réessaie.')
  }

  return (
    <View style={styles.googleWrap}>
      <Text style={styles.googleCaption}>Continuer avec</Text>
      <View style={styles.providerRow}>
        <ProviderCircle
          label="Google"
          a11y="Continuer avec Google"
          loading={loading === 'google'}
          onPress={() => void runGoogle()}
        >
          <GoogleLogo size={26} />
        </ProviderCircle>

        {appleAvailable && (
          <ProviderCircle
            label="Apple"
            a11y="Continuer avec Apple"
            loading={loading === 'apple'}
            onPress={() => void runApple()}
          >
            <AppleLogo size={28} />
          </ProviderCircle>
        )}
      </View>

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

          {/* Boutons sociaux (Google + Apple sur iOS) — rapprochés du sous-titre */}
          <View style={styles.googleBlock}>
            <SocialButtons />
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
  providerRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    alignItems: 'flex-start',
  },
  providerItem: {
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
