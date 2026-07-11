/**
 * Logique de demande d'avis store (module PUR, zero dependance native).
 *
 * QUOI : la machine a etats qui decide SI et QUAND proposer a l'utilisateur de
 * noter l'app, et les transitions correspondantes. Aucun acces AsyncStorage ni
 * expo-store-review ici (ces effets vivent dans `storage.ts` et `storeReview.ts`).
 *
 * POURQUOI (produit) : on demande l'avis au PIC d'engagement, juste apres que
 * les 3 blocs IA personnalises sont apparus a la suite d'un scan reussi. Si
 * l'utilisateur ne donne pas suite, on ne re-propose qu'apres 24 h ET a
 * l'occasion d'un nouveau scan reussi (l'ecran d'analyse est le seul point
 * d'appel). On plafonne le nombre total de sollicitations pour ne jamais
 * harceler (l'API In-App Review de Google est de toute facon quota-limitee).
 *
 * Etats :
 *   - 'never'   : jamais propose.
 *   - 'pending' : propose au moins une fois, en attente (re-proposable apres le
 *                 delai).
 *   - 'done'    : l'utilisateur a lance le flux de notation -> on ARRETE
 *                 definitivement (on ne connait pas l'issue reelle : Google ne
 *                 la communique pas, on considere la mission accomplie).
 */

export type ReviewStatus = 'never' | 'pending' | 'done'

export interface ReviewState {
  status: ReviewStatus
  /** Timestamp (ms epoch) du dernier affichage de la carte, ou null. */
  lastAskedAt: number | null
  /** Nombre total d'affichages de la carte (plafonne par REVIEW_MAX_ASKS). */
  askCount: number
}

export const DEFAULT_REVIEW_STATE: ReviewState = {
  status: 'never',
  lastAskedAt: null,
  askCount: 0,
}

/** Delai minimum avant de re-proposer apres une premiere sollicitation (24 h). */
export const REVIEW_REASK_MS = 24 * 60 * 60 * 1000

/** Plafond dur de sollicitations : au-dela, on ne redemande plus jamais. */
export const REVIEW_MAX_ASKS = 4

/** Coercition defensive d'un objet arbitraire (AsyncStorage / ancienne version). */
export function readReviewState(raw: unknown): ReviewState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_REVIEW_STATE }
  const r = raw as Record<string, unknown>
  const status: ReviewStatus =
    r.status === 'pending' || r.status === 'done' || r.status === 'never'
      ? r.status
      : 'never'
  const lastAskedAt =
    typeof r.lastAskedAt === 'number' && Number.isFinite(r.lastAskedAt)
      ? r.lastAskedAt
      : null
  const askCount =
    typeof r.askCount === 'number' && Number.isFinite(r.askCount) && r.askCount >= 0
      ? Math.floor(r.askCount)
      : 0
  return { status, lastAskedAt, askCount }
}

/**
 * Faut-il proposer l'avis maintenant ?
 *   - jamais si deja 'done' (mission accomplie) ;
 *   - jamais au-dela du plafond de sollicitations ;
 *   - 'never' -> oui (premiere fois) ;
 *   - 'pending' -> oui seulement si le delai de re-sollicitation est ecoule.
 */
export function shouldAskReview(state: ReviewState, now: number): boolean {
  if (state.status === 'done') return false
  if (state.askCount >= REVIEW_MAX_ASKS) return false
  if (state.status === 'never') return true
  // pending : re-proposable seulement apres le delai.
  if (state.lastAskedAt == null) return true
  return now - state.lastAskedAt >= REVIEW_REASK_MS
}

/**
 * Transition a appeler quand la carte est REELLEMENT affichee : passe en
 * 'pending', memorise l'instant et incremente le compteur (le compteur demarre
 * le chrono de re-sollicitation meme si l'utilisateur ignore la carte).
 */
export function markShown(state: ReviewState, now: number): ReviewState {
  return { status: 'pending', lastAskedAt: now, askCount: state.askCount + 1 }
}

/**
 * Transition a appeler quand l'utilisateur a accepte (flux de notation lance) :
 * on arrete definitivement.
 */
export function markDone(state: ReviewState): ReviewState {
  return { ...state, status: 'done' }
}
