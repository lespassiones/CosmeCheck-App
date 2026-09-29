/**
 * SignInForm (A24) : e-mail + mot de passe (react-hook-form + zod).
 *
 * Après une connexion réussie :
 *   - compte de démonstration Apple rejoué → on ouvre directement le parcours
 *     d'onboarding (il vient d'être remis à zéro) ;
 *   - réponses du parcours invité en attente d'écriture → on ne navigue pas,
 *     l'AuthGuard décide une fois le profil à jour ;
 *   - sinon → l'accueil (le guard corrige vers le paywall si besoin).
 */

import { type FC, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { signIn } from '@/lib/auth/session'
import { isDraftPendingFlush } from '@/lib/onboarding/draft'
import { AuthField } from '@/components/auth/AuthProviders'
import { PrimaryButton } from '@/components/onboarding/flow/ui'

const signInSchema = z.object({
  email: z.string().trim().min(1, "L'e-mail est requis").email('Adresse e-mail invalide'),
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
  const values = useWatch({ control })
  const ready = Boolean(values.email?.trim()) && Boolean(values.password)

  const onSubmit = handleSubmit(async (data) => {
    setGlobalError(null)
    setIsLoading(true)
    const result = await signIn(data.email.trim(), data.password)
    if (!result.ok) {
      setIsLoading(false)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      setGlobalError(result.error ?? 'Connexion impossible. Réessaie.')
      return
    }
    if (result.replayed) {
      router.replace(ROUTES.ONBOARDING.INDEX)
      return
    }
    if (isDraftPendingFlush()) return
    // dismissTo : revient aux onglets s'ils sont dans la pile, sinon les ouvre à
    // la place de l'écran de connexion (même méthode que le reste de l'app).
    router.dismissTo(ROUTES.TABS.HOME)
  })

  return (
    <View style={styles.container}>
      <View>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <AuthField
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
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              onSubmitEditing={() => void onSubmit()}
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
        {errors.password ? <Text style={styles.fieldError}>{errors.password.message}</Text> : null}
      </View>

      <Pressable
        style={styles.forgot}
        hitSlop={8}
        onPress={() => router.push(ROUTES.AUTH.FORGOT_PASSWORD)}
        accessibilityRole="link"
      >
        <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
      </Pressable>

      {globalError ? (
        <View style={styles.globalError} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={17} color={colors.error} />
          <Text style={styles.globalErrorText}>{globalError}</Text>
        </View>
      ) : null}

      <PrimaryButton label="Me connecter" onPress={() => void onSubmit()} disabled={!ready} loading={isLoading} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  fieldError: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.error, marginTop: 6, marginLeft: 18 },
  forgot: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotText: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.rose },
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
