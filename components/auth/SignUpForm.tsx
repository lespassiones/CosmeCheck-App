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
import { setNewsletterConsent } from '@/lib/newsletter/subscribe'
import { LegalModal, type LegalDoc } from '@/components/legal/LegalModal'

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
    acceptsNewsletter: z.boolean(),
    acceptedPrivacy: z.boolean().refine((v) => v === true, {
      message: 'Tu dois accepter la politique de confidentialité pour continuer.',
    }),
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
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null)
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
    defaultValues: {
      firstName: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptsNewsletter: false,
      acceptedPrivacy: false,
    },
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
    if (data.acceptsNewsletter) {
      // Best-effort : session déjà active (confirm email OFF) → l'edge lit l'email
      // du JWT. Ne bloque pas la navigation vers l'onboarding.
      void setNewsletterConsent(true, 'signup_email')
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

      {/* Newsletter — opt-in FACULTATIF (décoché par défaut = RGPD) */}
      <Controller
        control={control}
        name="acceptsNewsletter"
        render={({ field: { value, onChange } }) => (
          <Pressable
            style={styles.consentRow}
            onPress={() => onChange(!value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: value }}
            accessibilityLabel="Je veux recevoir la newsletter"
          >
            <View style={[styles.checkbox, value && styles.checkboxChecked]}>
              {value && <Ionicons name="checkmark" size={14} color={colors.surface} />}
            </View>
            <Text style={styles.legal}>
              Je veux recevoir la newsletter Cosme Check (conseils, nouveautés).
            </Text>
          </Pressable>
        )}
      />

      {/* RGPD — consentement explicite (obligatoire). La case et le libellé sont
          séparés pour qu'un tap sur un lien ouvre le modal SANS (dé)cocher la case. */}
      <Controller
        control={control}
        name="acceptedPrivacy"
        render={({ field: { value, onChange } }) => (
          <View style={styles.consentRow}>
            <Pressable
              onPress={() => onChange(!value)}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: value }}
              accessibilityLabel="J'accepte les conditions d'utilisation et la politique de confidentialité"
            >
              <View style={[styles.checkbox, value && styles.checkboxChecked]}>
                {value && <Ionicons name="checkmark" size={14} color={colors.surface} />}
              </View>
            </Pressable>
            <Text style={styles.legal}>
              J&apos;accepte les{' '}
              <Text style={styles.legalLink} onPress={() => setLegalDoc('cgu')}>
                Conditions d&apos;utilisation
              </Text>{' '}
              et la{' '}
              <Text style={styles.legalLink} onPress={() => setLegalDoc('privacy')}>
                Politique de confidentialité
              </Text>
              .
            </Text>
          </View>
        )}
      />
      {errors.acceptedPrivacy && (
        <Text style={styles.fieldError}>{errors.acceptedPrivacy.message}</Text>
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
          <Text style={styles.submitText}>Créer mon compte</Text>
        )}
      </Pressable>

      {/* CGU / Confidentialité en modal (pas de navigation → pas de rejet AuthGuard) */}
      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
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
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.rose,
    borderColor: colors.rose,
  },
  legal: {
    ...typography.xs,
    color: colors.inkLight,
    flex: 1,
    lineHeight: 17,
  },
  legalLink: {
    color: colors.rose,
    textDecorationLine: 'underline',
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
  submitPressed: {
    backgroundColor: colors.successDeep,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    ...typography.button,
    color: colors.surface,
  },
})
