/**
 * SignUpForm — prénom + email + mot de passe (react-hook-form + zod).
 *
 * Affiche une checklist de règles de mot de passe en temps réel
 * (PasswordRequirements, basé sur `computePasswordChecks`). En cas de succès,
 * redirige vers l'onboarding.
 */

import { type FC, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import {
  signUp,
  computePasswordChecks,
  isPasswordValid,
  PASSWORD_RULES,
  type PasswordChecks,
} from '@/lib/auth/session'

const signUpSchema = z
  .object({
    firstName: z
      .string()
      .min(2, 'Prénom trop court')
      .max(50, 'Prénom trop long'),
    email: z.string().min(1, "L'email est requis").email('Adresse email invalide'),
    password: z
      .string()
      .refine(isPasswordValid, 'Le mot de passe ne respecte pas toutes les règles'),
    confirmPassword: z.string().min(1, 'Confirme ton mot de passe'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

type SignUpFormData = z.infer<typeof signUpSchema>

// ── Checklist des règles ────────────────────────────────────────────

const PasswordRequirements: FC<{ checks: PasswordChecks }> = ({ checks }) => (
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
          <Text style={[styles.ruleText, ok && styles.ruleTextOk]}>{rule.label}</Text>
        </View>
      )
    })}
  </View>
)

export const SignUpForm: FC = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)
  const confirmRef = useRef<TextInput>(null)

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    mode: 'onBlur',
    defaultValues: { firstName: '', email: '', password: '', confirmPassword: '' },
  })

  const passwordValue = useWatch({ control, name: 'password' })
  const confirmValue = useWatch({ control, name: 'confirmPassword' })
  const checks = computePasswordChecks(passwordValue ?? '')
  const passwordsMatch =
    !!passwordValue && passwordValue.length > 0 && passwordValue === confirmValue

  const onSubmit = handleSubmit(async (data) => {
    setGlobalError(null)
    setIsLoading(true)
    const result = await signUp(data.firstName, data.email, data.password)
    setIsLoading(false)

    if (!result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      setGlobalError(result.error ?? 'Inscription impossible. Réessaie.')
      return
    }
    router.replace(ROUTES.ONBOARDING.INDEX)
  })

  return (
    <View style={styles.container}>
      {/* Prénom */}
      <View>
        <Text style={styles.label}>Prénom</Text>
        <Controller
          control={control}
          name="firstName"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={[styles.inputWrap, errors.firstName && styles.inputWrapError]}>
              <Ionicons name="person-outline" size={18} color={colors.inkLight} />
              <TextInput
                style={styles.input}
                placeholder="Camille"
                placeholderTextColor={colors.inkLight}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                onSubmitEditing={() => emailRef.current?.focus()}
                editable={!isLoading}
              />
            </View>
          )}
        />
        {errors.firstName && (
          <Text style={styles.fieldError}>{errors.firstName.message}</Text>
        )}
      </View>

      {/* Email */}
      <View>
        <Text style={styles.label}>Email</Text>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={[styles.inputWrap, errors.email && styles.inputWrapError]}>
              <Ionicons name="mail-outline" size={18} color={colors.inkLight} />
              <TextInput
                ref={emailRef}
                style={styles.input}
                placeholder="ton@email.com"
                placeholderTextColor={colors.inkLight}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!isLoading}
              />
            </View>
          )}
        />
        {errors.email && <Text style={styles.fieldError}>{errors.email.message}</Text>}
      </View>

      {/* Mot de passe */}
      <View>
        <Text style={styles.label}>Mot de passe</Text>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={[styles.inputWrap, errors.password && styles.inputWrapError]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.inkLight} />
              <TextInput
                ref={passwordRef}
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.inkLight}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="next"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
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
          )}
        />
        <PasswordRequirements checks={checks} />
      </View>

      {/* Confirmation */}
      <View>
        <Text style={styles.label}>Confirme ton mot de passe</Text>
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, onBlur, value } }) => (
            <View
              style={[styles.inputWrap, errors.confirmPassword && styles.inputWrapError]}
            >
              <Ionicons name="lock-closed-outline" size={18} color={colors.inkLight} />
              <TextInput
                ref={confirmRef}
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.inkLight}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="go"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                onSubmitEditing={() => void onSubmit()}
                editable={!isLoading}
              />
              {passwordsMatch ? (
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              ) : (
                <Pressable
                  hitSlop={8}
                  onPress={() => setShowConfirm((s) => !s)}
                  accessibilityLabel={
                    showConfirm ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                  }
                >
                  <Ionicons
                    name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.inkLight}
                  />
                </Pressable>
              )}
            </View>
          )}
        />
        {errors.confirmPassword && (
          <Text style={styles.fieldError}>{errors.confirmPassword.message}</Text>
        )}
      </View>

      {/* Erreur globale */}
      {globalError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.errorBannerText}>{globalError}</Text>
        </View>
      )}

      {/* RGPD */}
      <Text style={styles.legal}>
        En t’inscrivant, tu acceptes nos Conditions d’utilisation et notre Politique de
        confidentialité.
      </Text>

      {/* Bouton */}
      <Pressable
        onPress={() => void onSubmit()}
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
          <Text style={styles.submitText}>Créer mon compte</Text>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.base,
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
  inputWrapError: {
    borderColor: colors.error,
  },
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
  ruleTextOk: {
    color: colors.success,
  },
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
  legal: {
    ...typography.xs,
    color: colors.inkLight,
    textAlign: 'center',
  },
  submit: {
    height: 52,
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
  submitPressed: {
    backgroundColor: colors.roseDeep,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    ...typography.button,
    color: colors.surface,
  },
})
