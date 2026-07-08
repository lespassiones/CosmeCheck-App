/**
 * SignUpScreen — inscription (nom + email + mot de passe).
 *
 * Le bouton Google vit désormais uniquement sur l'écran de bienvenue
 * (/(auth)/welcome). Ici on affiche directement le formulaire complet, sans
 * toggle ni doublon Google.
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
import { LogoMark } from '@/components/shared/Logo'
import { SignUpForm } from '@/components/auth/SignUpForm'
import { useAppConfig } from '@/hooks/useAppConfig'

const SignUpScreen: FC = () => {
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
                onPress={() =>
                  router.canGoBack()
                    ? router.back()
                    : router.replace(ROUTES.AUTH.WELCOME)
                }
                accessibilityLabel="Retour"
                style={styles.backBtn}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>
              <View style={styles.topLogo} pointerEvents="none">
                <LogoMark size={18} />
              </View>
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
              <SignUpForm />
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
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  },
  topBar: {
    height: 32,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  backBtn: {
    position: 'absolute',
    left: 0,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLogo: {
    alignItems: 'center',
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
