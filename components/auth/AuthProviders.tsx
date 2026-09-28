/**
 * Boutons de connexion tierce (Apple, Google) et champ de saisie des écrans de
 * compte, au style de l'onboarding « Le diagnostic de Perle ».
 *
 * Apple n'apparaît que sur iPhone : c'est là qu'il est obligatoire (règle 4.8
 * de l'App Store dès que Google est proposé), et il n'y a pas de feuille native
 * sur Android. L'annulation reste silencieuse, seules les vraies erreurs
 * s'affichent sous les boutons.
 */

import { forwardRef, useState, type FC, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Path } from 'react-native-svg'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { signInWithGoogle } from '@/lib/auth/google'
import { signInWithApple } from '@/lib/auth/apple'

/** Logo Google officiel multicolore (4 couleurs). */
export const GoogleLogo: FC<{ size?: number }> = ({ size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <Path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <Path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <Path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </Svg>
)

/** Logo Apple officiel, monochrome. */
export const AppleLogo: FC<{ size?: number; color?: string }> = ({ size = 22, color = colors.surface }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09z"
    />
    <Path fill={color} d="M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </Svg>
)

/** Bouton pilule pleine largeur avec un logo à gauche. */
export const PillButton: FC<{
  label: string
  logo: ReactNode
  onPress: () => void
  variant: 'dark' | 'light'
  loading?: boolean
  disabled?: boolean
}> = ({ label, logo, onPress, variant, loading = false, disabled = false }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled, busy: loading }}
    style={({ pressed }) => [
      styles.pill,
      variant === 'dark' ? styles.pillDark : styles.pillLight,
      pressed && !disabled && { opacity: 0.85 },
      disabled && !loading && { opacity: 0.6 },
    ]}
  >
    {loading ? (
      <ActivityIndicator color={variant === 'dark' ? colors.surface : colors.inkMuted} />
    ) : (
      <View style={styles.pillRow}>
        <View style={styles.pillLogo}>{logo}</View>
        <Text style={[styles.pillText, variant === 'dark' && styles.pillTextDark]}>{label}</Text>
      </View>
    )}
  </Pressable>
)

/** Apple (iPhone seulement) puis Google, avec gestion d'erreur commune. */
export const ProviderButtons: FC = () => {
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (
    provider: 'google' | 'apple',
    signIn: () => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>,
    fallback: string,
  ): Promise<void> => {
    Haptics.selectionAsync().catch(() => {})
    setError(null)
    setBusy(provider)
    const result = await signIn()
    setBusy(null)
    if (result.ok || result.cancelled) return
    setError(result.error ?? fallback)
  }

  return (
    <View style={styles.providers}>
      {Platform.OS === 'ios' ? (
        <PillButton
          variant="dark"
          label="Continuer avec Apple"
          logo={<AppleLogo />}
          loading={busy === 'apple'}
          disabled={busy !== null}
          onPress={() => void run('apple', signInWithApple, 'La connexion Apple a échoué. Réessaie.')}
        />
      ) : null}
      <PillButton
        variant="light"
        label="Continuer avec Google"
        logo={<GoogleLogo />}
        loading={busy === 'google'}
        disabled={busy !== null}
        onPress={() => void run('google', signInWithGoogle, 'La connexion Google a échoué. Réessaie.')}
      />
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={15} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  )
}

/** Champ texte en pilule (e-mail, mot de passe, prénom). */
export const AuthField = forwardRef<
  TextInput,
  TextInputProps & { error?: boolean; right?: ReactNode }
>(function AuthField({ error = false, right, style, onFocus, onBlur, ...rest }, ref) {
  const [focused, setFocused] = useState(false)
  return (
    <View style={[styles.field, focused && styles.fieldFocus, error && styles.fieldError]}>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.inkLight}
        selectionColor={colors.textSelection}
        style={[styles.fieldInput, style]}
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          onBlur?.(e)
        }}
        {...rest}
      />
      {right}
    </View>
  )
})

/** Case à cocher carrée avec son texte. */
export const CheckRow: FC<{
  checked: boolean
  onToggle: () => void
  label: string
  children: ReactNode
}> = ({ checked, onToggle, label, children }) => (
  <Pressable
    onPress={() => {
      Haptics.selectionAsync().catch(() => {})
      onToggle()
    }}
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    accessibilityLabel={label}
    style={styles.checkRow}
    hitSlop={4}
  >
    <View style={[styles.checkbox, checked && styles.checkboxOn]}>
      {checked ? <Ionicons name="checkmark" size={15} color={colors.surface} /> : null}
    </View>
    <View style={styles.checkBody}>{children}</View>
  </Pressable>
)

const styles = StyleSheet.create({
  providers: { gap: 12 },
  pill: {
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  pillDark: { backgroundColor: '#111111' },
  pillLight: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pillLogo: { width: 24, alignItems: 'center' },
  pillText: { fontFamily: fontFamilies.semiBold, fontSize: 17, color: colors.ink },
  pillTextDark: { color: colors.surface },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  errorText: { fontFamily: fontFamilies.regular, fontSize: 13.5, color: colors.error, flexShrink: 1 },

  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 22,
    gap: 10,
  },
  fieldFocus: { borderColor: colors.rose },
  fieldError: { borderColor: colors.error },
  fieldInput: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 17,
    color: colors.ink,
    paddingVertical: 0,
  },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.gray300,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.rose, borderColor: colors.rose },
  checkBody: { flex: 1 },
})
