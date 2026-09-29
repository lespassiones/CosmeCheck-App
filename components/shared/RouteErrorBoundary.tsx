/**
 * RouteErrorBoundary : repli d'erreur PROPRE À UNE PAGE (export `ErrorBoundary`
 * d'une route expo-router).
 *
 * Sans lui, une erreur de rendu sur une fiche (analyse ancienne ou réponse d'IA
 * hors format) remontait jusqu'à `AppErrorBoundary`, qui remplace TOUTE l'app
 * par « Oups ». Ici seule la page concernée est remplacée, avec « Réessayer »
 * et « Retour » : le reste de l'app (onglets, pile) reste intact.
 *
 * Usage dans une route : `export { RouteErrorBoundary as ErrorBoundary } from
 * '@/components/shared/RouteErrorBoundary'`.
 */

import { useEffect, type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { router, type ErrorBoundaryProps } from 'expo-router'

import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { reportError } from '@/lib/reporting/report'

export const RouteErrorBoundary: FC<ErrorBoundaryProps> = ({ error, retry }) => {
  useEffect(() => {
    reportError(error, { scope: 'route' })
  }, [error])

  const goBack = () => {
    if (router.canGoBack()) router.back()
    else router.dismissTo(ROUTES.TABS.HOME)
  }

  return (
    <View style={styles.root}>
      <Text style={styles.emoji}>🤍</Text>
      <Text style={styles.title}>Cette page n&apos;a pas pu s&apos;afficher</Text>
      <Text style={styles.body}>Réessaie, ou reviens en arrière : le reste de l&apos;app fonctionne.</Text>
      <Pressable
        onPress={() => void retry()}
        haptic="primary"
        accessibilityRole="button"
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      >
        <Text style={styles.btnText}>Réessayer</Text>
      </Pressable>
      <Pressable onPress={goBack} accessibilityRole="button" hitSlop={8} style={styles.link}>
        <Text style={styles.linkText}>Retour</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  emoji: { fontSize: 40 },
  title: { ...typography.h3, color: colors.ink, textAlign: 'center' },
  body: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  btn: {
    minHeight: 50,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  btnText: { ...typography.button, color: colors.surface },
  link: { paddingVertical: spacing.sm },
  linkText: { ...typography.button, color: colors.ink },
})
