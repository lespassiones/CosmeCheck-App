/**
 * Signalement générique depuis le profil (« Signaler un problème »).
 *
 * L'utilisateur choisit un OBJET (l'assistant IA, une promesse, autre) puis
 * décrit le problème. On insère une ligne dans `cosme_check.user_feedback` avec
 * kind='contact' : l'objet part dans `contact_subject` (colonne « Note / Sujet »
 * affichée côté admin sous « Retours ») et le texte dans `message`. On renseigne
 * aussi contact_first_name / contact_email pour que l'admin identifie l'auteur.
 * `trigger_source='report'` distingue ces lignes du formulaire de contact public.
 *
 * Les analyses ont déjà leur propre signalement (submitProductErrorReport,
 * kind='product_error') : ce module couvre TOUT le reste (assistant, promesses…).
 *
 * RLS : un utilisateur connecté ne peut insérer que SON propre feedback
 * (auth.uid() = user_id), d'où le user_id explicite.
 */
import { supabase, db } from '@/lib/supabase/client'

/** Objets signalables (hors analyses, qui ont déjà leur bouton dédié). */
export const REPORT_OBJECTS = [
  { key: 'advisor', label: "L'assistant IA (Beauty Advisor)" },
  { key: 'promesse', label: 'Une analyse de promesse' },
  { key: 'other', label: 'Un autre problème ou une suggestion' },
] as const

export type ReportObjectKey = (typeof REPORT_OBJECTS)[number]['key']

export interface ReportInput {
  /** Objet sélectionné par l'utilisateur. */
  objectKey: ReportObjectKey
  /** Message libre. */
  message: string
  /** Prénom (pour l'affichage admin) ; optionnel. */
  firstName?: string | null
}

export type SubmitResult = { ok: true } | { ok: false; error: string }

function labelFor(key: ReportObjectKey): string {
  return REPORT_OBJECTS.find((o) => o.key === key)?.label ?? 'Autre'
}

export async function submitReport(input: ReportInput): Promise<SubmitResult> {
  const trimmed = input.message.trim()
  if (trimmed.length < 3) return { ok: false, error: 'empty-message' }

  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return { ok: false, error: 'not-authenticated' }

  const { error } = await db()
    .from('user_feedback')
    .insert({
      user_id: user.id,
      kind: 'contact',
      trigger_source: 'report',
      contact_subject: labelFor(input.objectKey),
      contact_first_name: input.firstName ?? null,
      contact_email: user.email ?? null,
      message: trimmed,
    } as never)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
