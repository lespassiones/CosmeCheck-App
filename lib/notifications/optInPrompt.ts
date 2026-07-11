/**
 * Opt-in notifications : machine à états de sollicitation (module PUR).
 *
 * QUOI : décide si (et quand) on peut re-proposer l'activation des
 * notifications, et les transitions associées. Deux sollicitations MAX par
 * utilisateur, dans cet ordre :
 *   1. l'étape dédiée de l'onboarding (case à cocher + « C'est parti ! »,
 *      « Passer » en haut à droite) ;
 *   2. si passée : une carte sur l'écran d'analyse à partir du 2e scan.
 *
 * POURQUOI : demander la permission au bon moment (jamais au boot), sans
 * harceler. Sur Android 13+ le dialogue système ne se montre qu'une poignée de
 * fois : on ne le déclenche qu'après un « oui » explicite de l'utilisateur,
 * pour ne pas griller la cartouche.
 *
 * Arbitrage anti-collision : l'écran d'analyse porte aussi la carte « avis
 * store » ([lib/review/prompt.ts]) : jamais deux cartes en même temps, la
 * notification passe en premier (l'avis se re-propose de lui-même à J+1).
 */

export type NotifPromptStatus = 'never' | 'skipped' | 'granted'

export interface NotifPromptState {
  status: NotifPromptStatus
  /** Nombre total de sollicitations déjà montrées (onboarding inclus). */
  askCount: number
}

export const DEFAULT_NOTIF_PROMPT_STATE: NotifPromptState = {
  status: 'never',
  askCount: 0,
}

/** Plafond dur : onboarding + une seule re-demande. */
export const NOTIF_PROMPT_MAX_ASKS = 2

/** Nombre de scans requis avant la re-demande post-onboarding. */
export const NOTIF_PROMPT_MIN_SCANS = 2

/** Coercition défensive depuis AsyncStorage (forme jamais fiable). */
export function readNotifPromptState(raw: unknown): NotifPromptState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NOTIF_PROMPT_STATE }
  const r = raw as Record<string, unknown>
  const status: NotifPromptStatus =
    r.status === 'skipped' || r.status === 'granted' || r.status === 'never'
      ? r.status
      : 'never'
  const askCount =
    typeof r.askCount === 'number' && Number.isFinite(r.askCount) && r.askCount >= 0
      ? Math.floor(r.askCount)
      : 0
  return { status, askCount }
}

/**
 * La carte de re-demande (écran d'analyse) doit-elle s'afficher ?
 *   - jamais si l'utilisateur a déjà accepté (état OU préférence réelle) ;
 *   - jamais au-delà du plafond de sollicitations ;
 *   - seulement à partir du 2e scan réussi.
 */
export function shouldReaskNotifications(
  state: NotifPromptState,
  scanCount: number,
  alreadyEnabled: boolean,
): boolean {
  if (alreadyEnabled) return false
  if (state.status === 'granted') return false
  if (state.askCount >= NOTIF_PROMPT_MAX_ASKS) return false
  return scanCount >= NOTIF_PROMPT_MIN_SCANS
}

/** Transition : une sollicitation vient d'être montrée puis déclinée/ignorée. */
export function markNotifPromptSkipped(state: NotifPromptState): NotifPromptState {
  return { status: 'skipped', askCount: state.askCount + 1 }
}

/** Transition : l'utilisateur a accepté (on ne redemande plus jamais). */
export function markNotifPromptGranted(state: NotifPromptState): NotifPromptState {
  return { ...state, status: 'granted' }
}
