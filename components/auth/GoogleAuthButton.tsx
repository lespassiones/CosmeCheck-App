/**
 * GoogleAuthButton — "Continuer avec Google".
 *
 * Déclenche le flux OAuth PKCE (voir lib/auth/google.ts). En cas de succès, on
 * laisse `onAuthStateChange` (useAuth) + le guard racine gérer la redirection.
 * L'annulation par l'utilisateur n'affiche aucune erreur.
 */

import { type FC, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { AntDesign, Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { signInWithGoogle } from '@/lib/auth/google'

interface Props {
  onSuccess?: () => void
  onError?: (error: string) => void
  label?: string
}

export const GoogleAuthButton: FC<Props> = ({
  onSuccess,
  onError,
  label = 'Continuer avec Google',
}) => {
  const [isLoading, setIsLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handlePress = async (): Promise<void> => {
    Haptics.selectionAsync().catch(() => {})
    setLocalError(null)
    setIsLoading(true)

    const result = await signInWithGoogle()
    setIsLoading(false)

    if (result.ok) {
      onSuccess?.()
      return
    }
    // Annulation : on ne montre pas d'erreur.
    if (result.cancelled) return

    const message = result.error ?? 'La connexion Google a échoué. Réessaie.'
    setLocalError(message)
    onError?.(message)
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={() => void handlePress()}
        disabled={isLoading}
        style={({ pressed }) => [
          styles.button,
          pressed && !isLoading && styles.buttonPressed,
          isLoading && styles.buttonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.inkMuted} size="small" />
        ) : (
          <>
            <AntDesign name="google" size={18} color="#EA4335" />
            <Text style={styles.label}>{label}</Text>
          </>
        )}
      </Pressable>

      {localError && (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color={colors.error} />
          <Text style={styles.errorText}>{localError}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  button: {
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
  buttonPressed: {
    backgroundColor: colors.gray50,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  label: {
    ...typography.button,
    color: colors.ink,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  errorText: {
    ...typography.xs,
    color: colors.error,
    flex: 1,
  },
})
