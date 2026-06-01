/**
 * SignInScreen — écran de connexion.
 * Logo + titre + Google + séparateur + SignInForm + lien vers l'inscription.
 */

import { type FC } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { Logo } from '@/components/shared/Logo'
import { SignInForm } from '@/components/auth/SignInForm'
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton'

const SignInScreen: FC = () => {
  return (
    <View style={styles.root}>
      <BackgroundGlow variant="auth" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.logoWrap}>
              <Logo />
            </View>

            <View style={styles.header}>
              <Text style={styles.title}>Bon retour 👋</Text>
              <Text style={styles.subtitle}>Connecte-toi pour continuer ton suivi beauté.</Text>
            </View>

            <GoogleAuthButton />

            <View style={styles.separator}>
              <View style={styles.line} />
              <Text style={styles.separatorText}>ou</Text>
              <View style={styles.line} />
            </View>

            <SignInForm />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Pas encore de compte ?</Text>
              <Pressable hitSlop={6} onPress={() => router.replace(ROUTES.AUTH.SIGN_UP)}>
                <Text style={styles.footerLink}>S’inscrire</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing['2xl'],
    gap: spacing.xl,
  },
  logoWrap: {
    alignItems: 'center',
    marginTop: spacing.base,
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    ...typography.h1,
    color: colors.ink,
  },
  subtitle: {
    ...typography.body,
    color: colors.inkMuted,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  footerText: {
    ...typography.small,
    color: colors.inkMuted,
  },
  footerLink: {
    ...typography.smallSemiBold,
    color: colors.rose,
  },
})

export default SignInScreen
