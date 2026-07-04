/**
 * ForgotPasswordScreen — demande de réinitialisation.
 * Champ email + bouton ; réponse neutre (anti-énumération) avec confirmation.
 */

import { type FC, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { requestPasswordReset } from '@/lib/auth/session'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ForgotPasswordScreen: FC = () => {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (): Promise<void> => {
    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setError('Saisis une adresse email valide.')
      return
    }
    setError(null)
    setIsLoading(true)
    await requestPasswordReset(trimmed)
    setIsLoading(false)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    setIsSubmitted(true)
  }

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
            <Pressable
              hitSlop={10}
              onPress={() => router.back()}
              accessibilityLabel="Retour"
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>

            {isSubmitted ? (
              <View style={styles.successWrap}>
                <View style={styles.successIcon}>
                  <Ionicons name="mail-open-outline" size={32} color={colors.accent} />
                </View>
                <Text style={[styles.title, styles.centerText]}>Vérifie ta boîte mail</Text>
                <Text style={[styles.subtitle, styles.centerText]}>
                  Si un compte est associé à {'\n'}
                  <Text style={styles.emailHighlight}>{email.trim()}</Text>, tu recevras un
                  lien pour réinitialiser ton mot de passe.
                </Text>
                <Pressable
                  onPress={() => router.back()}
                  style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
                >
                  <Text style={styles.submitText}>Retour à la connexion</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.header}>
                  <Text style={styles.title}>Mot de passe oublié ?</Text>
                  <Text style={styles.subtitle}>
                    Entre ton email : on t’envoie un lien pour réinitialiser ton mot de
                    passe.
                  </Text>
                </View>

                <View>
                  <Text style={styles.label}>Email</Text>
                  <View style={[styles.inputWrap, error && styles.inputWrapError]}>
                    <Ionicons name="mail-outline" size={18} color={colors.inkLight} />
                    <TextInput
                      style={styles.input}
                      placeholder="ton@email.com"
                      placeholderTextColor={colors.inkLight}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      returnKeyType="go"
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t)
                        if (error) setError(null)
                      }}
                      onSubmitEditing={() => void handleSubmit()}
                      editable={!isLoading}
                    />
                  </View>
                  {error && <Text style={styles.fieldError}>{error}</Text>}
                </View>

                <Pressable
                  onPress={() => void handleSubmit()}
                  disabled={isLoading}
                  style={({ pressed }) => [
                    styles.submit,
                    pressed && !isLoading && styles.submitPressed,
                    isLoading && styles.submitDisabled,
                  ]}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.surface} />
                  ) : (
                    <Text style={styles.submitText}>Envoyer le lien</Text>
                  )}
                </Pressable>

                <Pressable
                  style={styles.backLinkWrap}
                  hitSlop={6}
                  onPress={() => router.back()}
                >
                  <Text style={styles.backLink}>Retour à la connexion</Text>
                </Pressable>
              </>
            )}
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
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  header: { gap: spacing.sm },
  title: {
    ...typography.h2,
    color: colors.ink,
  },
  subtitle: {
    ...typography.body,
    color: colors.inkMuted,
  },
  emailHighlight: {
    ...typography.bodySemiBold,
    color: colors.ink,
  },
  label: {
    ...typography.smallMedium,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  inputWrapError: { borderColor: colors.error },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.ink,
    paddingVertical: 0,
  },
  fieldError: {
    ...typography.xs,
    color: colors.error,
    marginTop: spacing.xs,
  },
  submit: {
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  submitPressed: { backgroundColor: colors.successDeep },
  submitDisabled: { opacity: 0.6 },
  submitText: {
    ...typography.button,
    color: colors.surface,
  },
  backLinkWrap: { alignItems: 'center' },
  backLink: {
    ...typography.smallMedium,
    color: colors.inkMuted,
  },
  centerText: { textAlign: 'center' },
  successWrap: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.base,
    paddingTop: spacing['3xl'],
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
})

export default ForgotPasswordScreen
