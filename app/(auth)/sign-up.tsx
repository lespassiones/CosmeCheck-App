/**
 * SignUpScreen — inscription : Google OAuth ou email/mot de passe.
 *
 * Le formulaire email est caché par défaut derrière un bouton "Continuer avec
 * email" (même style que le bouton Google). Un tap le déplie, un second le
 * replie. Le chevron indique l'état ouvert/fermé.
 */

import { type FC, useState } from 'react'
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
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { LogoMark } from '@/components/shared/Logo'
import { SignUpForm } from '@/components/auth/SignUpForm'
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton'
import { useAppConfig } from '@/hooks/useAppConfig'

const SignUpScreen: FC = () => {
  const [emailOpen, setEmailOpen] = useState(false)
  const { config: appConfig } = useAppConfig()

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
            </View>

            <View style={styles.logoWrap}>
              <LogoMark size={18} />
            </View>

            <View style={styles.header}>
              <Text style={styles.title}>Crée ton compte</Text>
              <Text style={styles.subtitle}>
                {appConfig.signups_open
                  ? 'Rejoins Cosme Check gratuitement.'
                  : 'Les inscriptions sont temporairement fermées.'}
              </Text>
            </View>

            {!appConfig.signups_open ? (
              <Text style={styles.closedText}>
                La création de compte est momentanément désactivée. Reviens un peu plus tard,
                ou connecte-toi si tu as déjà un compte.
              </Text>
            ) : (
              <>
                {/* Bouton Google */}
                <GoogleAuthButton />

                {/* Séparateur */}
                <View style={styles.separator}>
                  <View style={styles.line} />
                  <Text style={styles.separatorText}>ou</Text>
                  <View style={styles.line} />
                </View>

                {/* Bouton email — déplie le formulaire */}
                <Pressable
                  onPress={() => setEmailOpen((o) => !o)}
                  style={({ pressed }) => [
                    styles.emailBtn,
                    pressed && styles.emailBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Continuer avec email et mot de passe"
                  accessibilityState={{ expanded: emailOpen }}
                >
                  <Ionicons name="mail-outline" size={18} color={colors.ink} />
                  <Text style={styles.emailBtnLabel}>Continuer avec email</Text>
                </Pressable>

                {/* Formulaire déroulé */}
                {emailOpen && (
                  <View style={styles.formWrap}>
                    <SignUpForm />
                  </View>
                )}
              </>
            )}

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
    marginTop: spacing.sm,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: -spacing.sm,
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
  emailBtn: {
    height: 52,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  emailBtnPressed: {
    backgroundColor: colors.gray50,
  },
  emailBtnLabel: {
    ...typography.button,
    color: colors.ink,
  },
  formWrap: {
    gap: spacing.base,
  },
  closedText: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
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
