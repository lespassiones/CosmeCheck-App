/**
 * Persistance de l'etat de demande d'avis (AsyncStorage).
 *
 * QUOI : lecture/ecriture de `ReviewState` sous une cle unique versionnee. La
 * LOGIQUE de decision vit dans `prefs`... pardon, dans `prompt.ts` (pur, teste) ;
 * ce module ne fait que serialiser l'etat. Best-effort : toute erreur retombe
 * sur l'etat par defaut (jamais bloquant).
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  DEFAULT_REVIEW_STATE,
  readReviewState,
  type ReviewState,
} from '@/lib/review/prompt'

/** Cle unique versionnee (bumper si la forme de ReviewState change). */
export const REVIEW_STATE_KEY = 'cosmecheck:review:state:v1'

/** Lit l'etat persiste, ou l'etat par defaut si absent / illisible. */
export async function loadReviewState(): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(REVIEW_STATE_KEY)
    if (!raw) return { ...DEFAULT_REVIEW_STATE }
    return readReviewState(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_REVIEW_STATE }
  }
}

/** Ecrit l'etat (best-effort). */
export async function saveReviewState(state: ReviewState): Promise<void> {
  try {
    await AsyncStorage.setItem(REVIEW_STATE_KEY, JSON.stringify(state))
  } catch {
    // best-effort : au pire on re-proposera une fois de trop.
  }
}
