/**
 * Application du rejeu : lecture du profil, remise à zéro, nettoyage local.
 *
 * Séparé de `reviewReplay.ts` à dessein. Ce fichier touche Supabase et
 * AsyncStorage, donc il ne peut pas être importé dans l'environnement node des
 * tests ; la décision, elle, est pure et testée sans le moindre bouchon.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

import { db } from '@/lib/supabase/client'
import {
  NOTIF_PROMPT_STATE_KEY,
  SCAN_COUNT_KEY,
} from '@/lib/notifications/optInStorage'
import { isReviewReplayAccount, stripForReplay } from '@/lib/auth/reviewReplay'
import { queryClient } from '@/lib/storage/queryClient'

/**
 * Remet le compte à zéro s'il porte le drapeau. Rend `true` si un rejeu a eu
 * lieu, pour que l'appelant puisse tracer.
 *
 * Best-effort de bout en bout : une panne réseau ici ne doit jamais empêcher
 * quelqu'un de se connecter. Dans le pire des cas le vérificateur voit l'app
 * telle qu'elle était, ce qui reste préférable à une connexion qui échoue.
 */
export async function replayOnboardingIfReviewAccount(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false

  try {
    const { data, error } = await db()
      .from('user_profiles')
      .select('preferences')
      .eq('id', userId)
      .maybeSingle()
    if (error || !data) return false

    const prefs = (data as { preferences?: Record<string, unknown> }).preferences
    if (!isReviewReplayAccount(prefs)) return false

    const { error: writeError } = await db()
      .from('user_profiles')
      .update({ preferences: stripForReplay(prefs) })
      .eq('id', userId)
    if (writeError) return false

    // L'étape notifications lit aussi un état LOCAL : sans ce nettoyage, une
    // sollicitation déjà consommée sur cet appareil resterait comptée et
    // l'étape ne se présenterait pas de la même façon.
    await AsyncStorage.multiRemove([NOTIF_PROMPT_STATE_KEY, SCAN_COUNT_KEY]).catch(
      () => {},
    )

    // ⚠️ Sans cette purge, la remise à zéro reste invisible.
    //
    // `signInWithPassword` déclenche `onAuthStateChange`, ce qui active aussitôt
    // la requête de profil. Elle part donc EN MÊME TEMPS que notre écriture et
    // ramène l'ancien profil, `onboardingShown: true` compris. L'AuthGuard lit
    // ce cache périmé et route vers l'accueil : la base est bien remise à zéro,
    // mais personne ne le voit. Constaté sur émulateur le 28/08/2026.
    //
    // `cancelQueries` coupe la requête en vol pour qu'elle ne réécrive pas
    // par-dessus, `removeQueries` jette ce qui a pu être mis en cache. Le
    // prochain rendu repart sur un chargement propre.
    await queryClient.cancelQueries({ queryKey: ['profile'] }).catch(() => {})
    queryClient.removeQueries({ queryKey: ['profile'] })

    return true
  } catch {
    return false
  }
}
