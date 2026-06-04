/**
 * report — point d'intégration UNIQUE pour le reporting d'erreurs.
 *
 * Aujourd'hui : log en dev, no-op en prod. Quand un SDK de crash reporting
 * (Sentry) sera branché, on l'appelle ICI uniquement — le reste de l'app passe
 * déjà par `reportError()` (Error Boundary, catch critiques).
 */

function isDev(): boolean {
  // __DEV__ est un global RN/Expo ; protégé pour l'env de test node.
  return typeof __DEV__ !== 'undefined' && __DEV__ === true
}

export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (isDev()) {
    // eslint-disable-next-line no-console
    console.error('[reportError]', error, context ?? '')
  }
  // TODO Sentry: Sentry.captureException(error, { extra: context })
}
