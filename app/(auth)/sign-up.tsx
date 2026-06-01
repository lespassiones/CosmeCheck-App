/**
 * SignUpScreen — écran d'inscription.
 * Logo + titre + Google + séparateur + SignUpForm + lien vers la connexion.
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
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { Logo } from '@/components/shared/Logo'
import { SignUpForm } from '@/components/auth/SignUpForm'
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton'

const SignUpScreen: FC = () => {
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
            <View style={styles.topBar}>
              <Pressable
                hitSlop={10}
                onPress={() => router.replace(ROUTES.AUTH.SIGN_IN)}
                accessibilityLabel="Retour"
                style={styles.backBtn}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>
              <Logo />
              <View style={styles.backBtn} />
            </View>

            <View style={styles.header}>
              <Text style={styles.title}>Crée ton compte</Text>
              <Text style={styles.subtitle}>Rejoins Cosme Check gratuitement.</Text>
            </View>

            <GoogleAuthButton />

            <View style={styles.separator}>
              <View style={styles.line} />
              <Text style={styles.separatorText}>ou</Text>
              <View style={styles.line} />
            </View>

            <SignUpForm />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Déjà un compte ?</Text>
              <Pressable hitSlop={6} onPress={() => router.replace(ROUTES.AUTH.SIGN_IN)}>
                <Text style={styles.footerLink}>Se connecter</Text>
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
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    gap: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
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

export default SignUpScreen
