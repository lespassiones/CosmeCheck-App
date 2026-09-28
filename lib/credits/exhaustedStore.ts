/**
 * exhaustedStore — petit store zustand (niveau module) pour la modale
 * « Crédits épuisés ».
 *
 * Réplique le mécanisme du web (CreditsExhaustedModal.tsx) : au lieu d'un
 * `window.dispatchEvent('cosmecheck:credits-exhausted')`, on écoute ici un
 * `DeviceEventEmitter` du même nom. N'importe quel code (ex. le hook
 * d'analyse de WS2) peut émettre l'évènement après un 429 sans avoir à
 * importer ce module en dur :
 *
 *   import { DeviceEventEmitter } from 'react-native'
 *   DeviceEventEmitter.emit('cosmecheck:credits-exhausted', { used, limit })
 *
 * Le payload reprend la forme du `credits` renvoyé par les Edge Functions
 * en 429 : { used, limit } (remaining toujours 0 dans ce cas).
 */

import { DeviceEventEmitter } from 'react-native'
import { create } from 'zustand'

import { creditsFromBody, isNoCreditsRefusal } from '@/lib/credits/noCreditsCore'

/** Évènement global qui déclenche l'ouverture de la modale. */
export const CREDITS_EXHAUSTED_EVENT = 'cosmecheck:credits-exhausted'

export interface CreditsExhaustedPayload {
  used?: number
  limit?: number
}

interface ExhaustedState {
  open: boolean
  payload: CreditsExhaustedPayload
  show: (payload?: CreditsExhaustedPayload) => void
  hide: () => void
}

export const useExhaustedStore = create<ExhaustedState>((set) => ({
  open: false,
  payload: {},
  show: (payload = {}) => set({ open: true, payload }),
  hide: () => set({ open: false }),
}))

// ── Abonnement global au DeviceEventEmitter ─────────────────────────────
// Créé une seule fois à l'init du module : tout `emit` de l'évènement ouvre
// la modale via le store. Pas de cleanup nécessaire (durée de vie = app).
DeviceEventEmitter.addListener(
  CREDITS_EXHAUSTED_EVENT,
  (payload?: CreditsExhaustedPayload) => {
    useExhaustedStore.getState().show(payload ?? {})
  },
)

/** Ouvre la feuille « Plus de crédits » (même effet que l'évènement). */
export function showCreditsExhausted(payload?: CreditsExhaustedPayload): void {
  useExhaustedStore.getState().show(payload ?? {})
}

/**
 * Après l'échec d'un `supabase.functions.invoke` : si c'est un refus faute de
 * crédits (et pas un simple rate-limit, voir `noCreditsCore`), ouvre la feuille
 * et rend `true`. L'appelant garde la main sur le reste (message, état local).
 */
export async function handleNoCreditsResponse(
  error: unknown,
  response?: Response,
): Promise<boolean> {
  const res: Response | undefined =
    response ?? ((error as { context?: Response } | null)?.context as Response | undefined)
  if (res?.status !== 429) return false
  let body: unknown = null
  try {
    // clone() : le corps d'une Response ne se lit qu'une fois.
    body = await res.clone().json()
  } catch {
    /* corps illisible : on ne peut pas affirmer que ce sont les crédits */
  }
  if (!isNoCreditsRefusal(res.status, body)) return false
  showCreditsExhausted(creditsFromBody(body))
  return true
}
