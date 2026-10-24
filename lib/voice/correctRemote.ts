/**
 * Relecture IA d'une question dictée (Edge Function `voice-correct`).
 * Gratuite, best-effort : renvoie null en cas d'échec ou de réponse jugée
 * risquée, l'app garde alors la correction locale.
 */
import { supabase } from '@/lib/supabase/client'
import { acceptServerCorrection, keepQuestionMark } from '@/lib/voice/transcript'

/** Au-delà, la personne a déjà commencé à relire : on n'insiste pas. */
const VOICE_CORRECT_TIMEOUT_MS = 7_000

export async function correctTranscriptRemote(text: string): Promise<string | null> {
  const original = text.trim()
  if (original.length < 3) return null
  try {
    const { data, error } = await supabase.functions.invoke('voice-correct', {
      body: { text: original },
      timeout: VOICE_CORRECT_TIMEOUT_MS,
    })
    if (error) return null
    const corrected = (data as { text?: unknown } | null)?.text
    if (typeof corrected !== 'string') return null
    return acceptServerCorrection(original, corrected) ? keepQuestionMark(original, corrected) : null
  } catch {
    return null
  }
}
