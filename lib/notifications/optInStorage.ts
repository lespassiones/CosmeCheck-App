/**
 * Persistance AsyncStorage de l'opt-in notifications (état de sollicitation +
 * compteur de scans réussis). La logique de décision vit dans optInPrompt.ts
 * (pur, testé) ; ici on ne fait que sérialiser. Best-effort partout.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  DEFAULT_NOTIF_PROMPT_STATE,
  readNotifPromptState,
  type NotifPromptState,
} from '@/lib/notifications/optInPrompt'

/** Clés versionnées (bumper si la forme change). */
export const NOTIF_PROMPT_STATE_KEY = 'cosmecheck:notifPrompt:v1'
export const SCAN_COUNT_KEY = 'cosmecheck:scanCount:v1'

export async function loadNotifPromptState(): Promise<NotifPromptState> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_PROMPT_STATE_KEY)
    if (!raw) return { ...DEFAULT_NOTIF_PROMPT_STATE }
    return readNotifPromptState(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_NOTIF_PROMPT_STATE }
  }
}

export async function saveNotifPromptState(state: NotifPromptState): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIF_PROMPT_STATE_KEY, JSON.stringify(state))
  } catch {
    // best-effort : au pire une sollicitation de trop.
  }
}

/** Incrémente le compteur de scans réussis (appelé par runAnalysis). */
export async function bumpScanCount(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SCAN_COUNT_KEY)
    const n = raw ? Number.parseInt(raw, 10) : 0
    await AsyncStorage.setItem(SCAN_COUNT_KEY, String((Number.isFinite(n) ? n : 0) + 1))
  } catch {
    // best-effort
  }
}

/** Nombre de scans réussis enregistrés sur cet appareil. */
export async function readScanCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SCAN_COUNT_KEY)
    const n = raw ? Number.parseInt(raw, 10) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}
