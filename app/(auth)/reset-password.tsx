/**
 * ResetPasswordScreen — saisie du nouveau mot de passe (depuis le deep link
 * `cosmecheck://reset-password`). Nécessite la session de récupération
 * (événement PASSWORD_RECOVERY) déjà établie par Supabase.
 *
 * `export const unstable_settings` marque l'écran comme dynamique (accessible
 * directement via deep link).
 */

import { type FC, useRef, useState } from 'react'
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
import { ROUTES } from '@/constants/routes'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import {
  updatePassword,
  computePasswordChecks,
  isPasswordValid,
  PASSWORD_RULES,
} from '@/lib/auth/session'

export const unstable_settings = { initialRouteName: 'reset-password' }

const ResetPasswordScreen: FC = () => {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [tokenInvalid, setTokenInvalid] = useState(false)
  const confirmRef = useRef<TextInput>(null)

  const checks = computePasswordChecks(password)
  const passwordsMatch = password.length > 0 && password === confirm

  const handleSubmit = async (): Promise<void> => {
    if (!isPasswordValid(password)) {
      setError('Le mot de passe ne respecte pas toutes les règles.')
      return
    }
    if (!passwordsMatch) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setError(null)
    setIsLoading(true)
    const result = await updatePassword(password)
    setIsLoading(false)

    if (!result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      // Session de recovery absente / expirée → on propose un nouveau lien.
      if (/invalide ou expiré|réinitialisation/i.test(result.error ?? '')) {
        setTokenInvalid(true)
      }
      setError(result.error ?? 'Impossible de mettre à jour le mot de passe.')
      return
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    setIsSuccess(true)
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
            {isSuccess ? (
              <View style={styles.centerWrap}>
                <View style={[styles.statusIcon, styles.successIcon]}>
                  <Ionicons name="checkmark" size={36} color={colors.success} />
                </View>
                <Text style={[styles.title, styles.centerText]}>Mot de passe mis à jour</Text>
                <Text style={[styles.subtitle, styles.centerText]}>
                  Tu peux maintenant te connecter avec ton nouveau mot de passe.
                </Text>
                <Pressable
                  onPress={() => router.replace(ROUTES.AUTH.SIGN_IN)}
                  style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
                >
                  <Text style={styles.submitText}>Se connecter</Text>
                </Pressable>
              </View>
            ) : tokenInvalid ? (
              <View style={styles.centerWrap}>
                <View style={[styles.statusIcon, styles.warningIcon]}>
                  <Ionicons name="alert" size={36} color={colors.warning} />
                </View>
                <Text style={[styles.title, styles.centerText]}>Lien expiré</Text>
                <Text style={[styles.subtitle, styles.centerText]}>
                  Ce lien de réinitialisation n’est plus valide. Demande-en un nouveau.
                </Text>
                <Pressable
                  onPress={() => router.replace(ROUTES.AUTH.FORGOT_PASSWORD)}
                  style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
                >
                  <Text style={styles.submitText}>Demander un nouveau lien</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.header}>
                  <Text style={styles.title}>Nouveau mot de passe</Text>
                  <Text style={styles.subtitle}>Choisis un mot de passe fort et unique.</Text>
                </View>

                <View>
                  <Text style={styles.label}>Nouveau mot de passe</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="lock-closed-outline" size={18} color={colors.inkLight} />
                    <TextInput
                      style={styles.input}
                      placeholder="••••••••"
                      placeholderTextColor={colors.inkLight}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="newPassword"
                      returnKeyType="next"
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t)
                        if (error) setError(null)
                      }}
                      onSubmitEditing={() => confirmRef.current?.focus()}
                      editable={!isLoading}
                    />
                    <Pressable
                      hitSlop={8}
                      onPress={() => setShowPassword((s) => !s)}
                      accessibilityLabel={
                        showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                      }
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={colors.inkLight}
                      />
                    </Pressable>
                  </View>
                  <View style={styles.rules}>
                    {PASSWORD_RULES.map((rule) => {
                      const ok = checks[rule.key]
                      return (
                        <View key={rule.key} style={styles.ruleRow}>
                          <Ionicons
                            name={ok ? 'checkmark-circle' : 'ellipse-outline'}
                            size={15}
                            color={ok ? colors.success : colors.inkLight}
                          />
                          <Text style={[styles.ruleText, ok && styles.ruleTextOk]}>
                            {rule.label}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                </View>

                <View>
                  <Text style={styles.label}>Confirme le mot de passe</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="lock-closed-outline" size={18} color={colors.inkLight} />
                    <TextInput
                      ref={confirmRef}
                      style={styles.input}
                      placeholder="••••••••"
                      placeholderTextColor={colors.inkLight}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="newPassword"
                      returnKeyType="go"
                      value={confirm}
                      onChangeText={(t) => {
                        setConfirm(t)
                        if (error) setError(null)
                      }}
                      onSubmitEditing={() => void handleSubmit()}
                      editable={!isLoading}
                    />
                    {passwordsMatch && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    )}
                  </View>
                </View>

                {error && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={18} color={colors.error} />
                    <Text style={styles.errorBannerText}>{error}</Text>
                  </View>
                )}

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
                    <Text style={styles.submitText}>Mettre à jour</Text>
                  )}
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
    paddingTop: spacing.xl,
    paddingBottom: spacing['2xl'],
    gap: spacing.xl,
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
  centerText: { textAlign: 'center' },
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
  input: {
    flex: 1,
    ...typography.body,
    color: colors.ink,
    paddingVertical: 0,
  },
  rules: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ruleText: {
    ...typography.xs,
    color: colors.inkLight,
  },
  ruleTextOk: { color: colors.success },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorBannerText: {
    ...typography.small,
    color: colors.roseDeep,
    flex: 1,
  },
  submit: {
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    shadowColor: colors.rose,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  submitPressed: { backgroundColor: colors.roseDeep },
  submitDisabled: { opacity: 0.6 },
  submitText: {
    ...typography.button,
    color: colors.surface,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.base,
    paddingTop: spacing['3xl'],
  },
  statusIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  successIcon: { backgroundColor: colors.successSoft },
  warningIcon: { backgroundColor: colors.warningSoft },
})

export default ResetPasswordScreen
