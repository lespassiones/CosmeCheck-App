/**
 * AppErrorBoundary — capture les erreurs de rendu React pour éviter l'écran
 * blanc (ex. crash type ObservationsCard). Affiche un repli avec « Réessayer »
 * et remonte l'erreur via `reportError` (point d'intégration Sentry futur).
 *
 * Doit être une classe : `getDerivedStateFromError` / `componentDidCatch`
 * n'existent pas en hooks.
 */

import { Component, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { reportError } from '@/lib/reporting/report'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    reportError(error, { componentStack: info.componentStack })
  }

  private reset = (): void => {
    this.setState({ hasError: false })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <View style={styles.root}>
        <Text style={styles.emoji}>🤍</Text>
        <Text style={styles.title}>Oups, une erreur est survenue</Text>
        <Text style={styles.body}>
          Réessaie. Si le problème persiste, redémarre l&apos;application.
        </Text>
        <Pressable
          onPress={this.reset}
          accessibilityRole="button"
          accessibilityLabel="Réessayer"
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnText}>Réessayer</Text>
        </Pressable>
      </View>
    )
  }
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
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { opacity: 0.85 },
  btnText: { ...typography.button, color: colors.surface },
})
