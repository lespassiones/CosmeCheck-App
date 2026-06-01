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
