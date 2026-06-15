/**
 * Cache LOCAL persistant du deck « Suggestions intelligentes ».
 *
 * Stocké sur l'appareil (AsyncStorage), PAS de TTL : invalidé uniquement quand
 * la routine change (signature différente). Donc re-cliquer « Suggestions
 * intelligentes » sans avoir modifié sa routine = deck instantané, sans
 * re-débiter de crédit. Une seule entrée (la routine courante).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

// v2 : résolution de la catégorie manquante par EAN + plafond candidats relevé.
const KEY = 'cosmecheck:routine_deck:v2'

/** Signature stable d'une routine (ordre indépendant) : produits + fréquences. */
export function routineSignature(
  items: { analysis_id: string | null; frequency: string }[],
): string {
  return items
    .map((i) => `${i.analysis_id ?? '?'}:${i.frequency}`)
    .sort()
    .join('|')
}

/** Renvoie le deck caché si la signature correspond, sinon null. */
export async function readDeckCache<T>(signature: string): Promise<T[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { sig?: string; deck?: T[] }
    return parsed.sig === signature && Array.isArray(parsed.deck) ? parsed.deck : null
  } catch {
    return null
  }
}

export async function writeDeckCache<T>(signature: string, deck: T[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ sig: signature, deck }))
  } catch {
    // best-effort
  }
}
