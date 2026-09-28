/**
 * SignUpForm (A23) : e-mail + mot de passe, prénom seulement s'il est inconnu.
 *
 * Le prénom vient normalement du parcours « Le diagnostic de Perle » (A4) : on
 * ne le redemande pas. Sans parcours (arrivée directe), le champ réapparaît.
 *
 * Deux consentements bien séparés : la newsletter (facultative, jamais cochée
 * d'office) et les conditions (obligatoires). Après l'inscription on ne
 * navigue pas : les réponses du parcours s'écrivent dans le profil
 * (`OnboardingDraftFlusher`) et l'AuthGuard enchaîne vers le paywall, ou vers
 * le questionnaire s'il n'a pas été fait. Le bouton reste en chargement
 * jusque-là.
 *
 * La checklist affiche les VRAIES règles du mot de passe (`PASSWORD_RULES`),
 * pas seulement « 8 caractères » : promettre une règle et en appliquer une
 * autre ferait échouer l'inscription sans explication.
 */

import { type FC, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import {
  signUp,
  computePasswordChecks,
  isPasswordValid,
  PASSWORD_RULES,
} from '@/lib/auth/session'
import { setNewsletterConsent } from '@/lib/newsletter/subscribe'
import { LegalModal, type LegalDoc } from '@/components/legal/LegalModal'
import { AuthField, CheckRow } from '@/components/auth/AuthProviders'
import { PrimaryButton } from '@/components/onboarding/flow/ui'

function buildSchema(needsName: boolean) {
  return z.object({
    firstName: needsName
      ? z.string().trim().min(1, 'Ton prénom est requis').max(50, 'Prénom trop long')
      : z.string(),
    email: z.string().trim().min(1, "L'e-mail est requis").email('Adresse e-mail invalide'),
    password: z.string().refine(isPasswordValid, 'Le mot de passe ne respecte pas toutes les règles'),
    acceptsNewsletter: z.boolean(),
    acceptedPrivacy: z.boolean().refine((v) => v === true, {
      message: 'Accepte les conditions pour créer ton compte.',
    }),
  })
}

type SignUpFormData = z.infer<ReturnType<typeof buildSchema>>

export const SignUpForm: FC<{ knownFirstName?: string }> = ({ knownFirstName }) => {
  const needsName = !knownFirstName?.trim()
  const [isLoading, setIsLoading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null)
  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(buildSchema(needsName)),
    mode: 'onBlur',
    defaultValues: {
      firstName: '',
      email: '',
      password: '',
      acceptsNewsletter: false,
      acceptedPrivacy: false,
    },
  })

  const values = useWatch({ control })
  const checks = computePasswordChecks(values.password ?? '')
  const ready =
    (!needsName || Boolean(values.firstName?.trim())) &&
    Boolean(values.email?.trim()) &&
    isPasswordValid(values.password ?? '') &&
    values.acceptedPrivacy === true

  const onSubmit = handleSubmit(async (data) => {
    setGlobalError(null)
    setIsLoading(true)
    const name = needsName ? data.firstName.trim() : (knownFirstName ?? '').trim()
    const result = await signUp(name, data.email.trim(), data.password)
    if (!result.ok) {
      setIsLoading(false)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      setGlobalError(result.error ?? 'Inscription impossible. Réessaie.')
      return
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    if (data.acceptsNewsletter) {
      // Best-effort : la session est déjà active (confirmation d'e-mail
      // désactivée), l'Edge Function lit l'adresse dans le jeton.
      void setNewsletterConsent(true, 'signup_email')
    }
    // Pas de navigation ici : voir l'en-tête du fichier.
  })

  return (
    <View style={styles.container}>
      {needsName ? (
        <View>
          <Controller
            control={control}
            name="firstName"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                placeholder="Ton prénom"
                autoCapitalize="words"
                autoComplete="given-name"
                textContentType="givenName"
                returnKeyType="next"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                onSubmitEditing={() => emailRef.current?.focus()}
                editable={!isLoading}
                error={Boolean(errors.firstName)}
                accessibilityLabel="Ton prénom"
              />
            )}
          />
          {errors.firstName ? <Text style={styles.fieldError}>{errors.firstName.message}</Text> : null}
        </View>
      ) : null}

      <View>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <AuthField
              ref={emailRef}
              placeholder="Adresse e-mail"
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
              error={Boolean(errors.email)}
              accessibilityLabel="Adresse e-mail"
            />
          )}
        />
        {errors.email ? <Text style={styles.fieldError}>{errors.email.message}</Text> : null}
      </View>

      <View>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <AuthField
              ref={passwordRef}
              placeholder="Mot de passe"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              editable={!isLoading}
              error={Boolean(errors.password)}
              accessibilityLabel="Mot de passe"
              right={
                <Pressable
                  hitSlop={10}
                  onPress={() => setShowPassword((s) => !s)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.inkLight} />
                </Pressable>
              }
            />
          )}
        />
        <View style={styles.rules}>
          {PASSWORD_RULES.map((rule) => {
            const ok = checks[rule.key]
            return (
              <View key={rule.key} style={styles.rule}>
                <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={ok ? colors.success : colors.inkLight} />
                <Text style={[styles.ruleText, ok && styles.ruleOk]}>{rule.label}</Text>
              </View>
            )
          })}
        </View>
      </View>

      <View style={styles.checks}>
        <Controller
          control={control}
          name="acceptsNewsletter"
          render={({ field: { onChange, value } }) => (
            <CheckRow
              checked={value}
              onToggle={() => onChange(!value)}
              label="Je veux recevoir les conseils CosmeCheck par e-mail"
            >
              <Text style={styles.checkText}>Je veux recevoir les conseils CosmeCheck par e-mail</Text>
            </CheckRow>
          )}
        />
        <Controller
          control={control}
          name="acceptedPrivacy"
          render={({ field: { onChange, value } }) => (
            <CheckRow
              checked={value}
              onToggle={() => onChange(!value)}
              label="J'accepte les conditions d'utilisation et la politique de confidentialité"
            >
              <Text style={styles.checkText}>
                J'accepte les{' '}
                <Text style={styles.link} onPress={() => setLegalDoc('cgu')}>
                  Conditions d'utilisation
                </Text>{' '}
                et la{' '}
                <Text style={styles.link} onPress={() => setLegalDoc('privacy')}>
                  Politique de confidentialité
                </Text>
              </Text>
            </CheckRow>
          )}
        />
        {errors.acceptedPrivacy ? <Text style={styles.fieldError}>{errors.acceptedPrivacy.message}</Text> : null}
      </View>

      {globalError ? (
        <View style={styles.globalError} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={17} color={colors.error} />
          <Text style={styles.globalErrorText}>{globalError}</Text>
        </View>
      ) : null}

      <PrimaryButton label="Créer mon compte" onPress={() => void onSubmit()} disabled={!ready} loading={isLoading} />
      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  fieldError: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.error, marginTop: 6, marginLeft: 18 },
  rules: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 10, marginLeft: 18 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ruleText: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkLight },
  ruleOk: { color: colors.success },
  checks: { gap: 14, marginTop: 4 },
  checkText: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 21, color: colors.ink },
  link: { color: colors.rose, textDecorationLine: 'underline' },
  globalError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.errorSoft,
  },
  globalErrorText: { flex: 1, fontFamily: fontFamilies.regular, fontSize: 14, color: colors.error },
})
