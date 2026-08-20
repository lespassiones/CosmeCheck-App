/**
 * report — point d'intégration UNIQUE pour le reporting d'erreurs.
 *
 * Toutes les erreurs critiques de l'app passent par `reportError()` :
 * AppErrorBoundary, catch dans les hooks, timeouts réseau, etc.
 * Sentry est initialisé au boot dans app/_layout.tsx via `initSentry()`.
 */

import * as Sentry from '@sentry/react-native'

function isDev(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true
}

export function initSentry(): void {
  Sentry.init({
    dsn: 'https://10704bac96253f6579f7bc2459625abd@o4511507951386624.ingest.de.sentry.io/4511875471179856',
    // Désactivé en dev pour ne pas polluer le tableau de bord Sentry.
    enabled: !isDev(),
    tracesSampleRate: 0.1,
  })
}

export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (isDev()) {
    // eslint-disable-next-line no-console
    console.error('[reportError]', error, context ?? '')
    return
  }
  Sentry.captureException(error, { extra: context })
}
