/**
 * SignInForm — formulaire email + mot de passe (react-hook-form + zod).
 *
 * Gère sa propre logique : valide, appelle `session.signIn`, et en cas de succès
 * redirige vers les tabs (le guard racine renverra vers l'onboarding si besoin).
 * Affiche les erreurs en français (inline + bandeau global).
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
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { signIn } from '@/lib/auth/session'

const signInSchema = z.object({
  email: z
    .string()
    .min(1, "L'email est requis")
    .email('Adresse email invalide'),
  password: z.string().min(1, 'Le mot de passe est requis'),
})

type SignInFormData = z.infer<typeof signInSchema>

export const SignInForm: FC = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const passwordRef = useRef<TextInput>(null)

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit(async (data) => {
    setGlobalError(null)
    setIsLoading(true)
    const result = await signIn(data.email, data.password)
    setIsLoading(false)

    if (!result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      setGlobalError(result.error ?? 'Connexion impossible. Réessaie.')
      return
    }
    router.replace(ROUTES.TABS.HOME)
  })

  return (
    <View style={styles.container}>
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
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                onSubmitEditing={() => void onSubmit()}
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
        {errors.password && (
          <Text style={styles.fieldError}>{errors.password.message}</Text>
        )}
      </View>

      {/* Mot de passe oublié */}
      <Pressable
        style={styles.forgotWrap}
        hitSlop={6}
        onPress={() => router.push(ROUTES.AUTH.FORGOT_PASSWORD)}
      >
        <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
      </Pressable>

      {/* Erreur globale */}
      {globalError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.errorBannerText}>{globalError}</Text>
        </View>
      )}

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
          <Text style={styles.submitText}>Se connecter</Text>
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
  forgotWrap: {
    alignSelf: 'flex-end',
    marginTop: -spacing.sm,
  },
  forgotText: {
    ...typography.smallMedium,
    color: colors.rose,
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
  submit: {
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
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
