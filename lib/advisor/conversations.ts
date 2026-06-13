/**
 * Persistance des conversations Beauty Advisor (historique).
 *
 * Tables `cosme_check.advisor_conversations` + `advisor_messages` (RLS : chaque
 * utilisateur ne voit que ses conversations). Tout est best-effort : une erreur
 * de sauvegarde ne doit JAMAIS casser le chat (on renvoie null / [] sans throw).
 *
 * Les recommandations (produits du carrousel) sont stockées telles quelles dans
 * `products` (jsonb) → au rechargement d'une conversation, le carrousel se
 * réaffiche sans nouvel appel.
 */
import { supabase, db } from '@/lib/supabase/client'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'

export interface ConversationSummary {
  id: string
  title: string | null
  updated_at: string
}

export interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  products?: AlternativeProduct[] | null
  /** Critères de reco (pour réafficher le carrousel + Voir plus depuis l'historique). */
  recoCriteria?: { ingredients: string[]; form: string | null } | null
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/** Crée une conversation et renvoie son id (ou null si échec). */
export async function createConversation(title: string): Promise<string | null> {
  const userId = await currentUserId()
  if (!userId) return null
  const { data, error } = await db()
    .from('advisor_conversations' as never)
    .insert({ user_id: userId, title: title.trim().slice(0, 80) || null } as never)
    .select('id')
    .single()
  if (error || !data) return null
  return (data as { id: string }).id
}

/** Ajoute un message à une conversation + rafraîchit sa date. Best-effort. */
export async function saveAdvisorMessage(
  conversationId: string,
  msg: StoredMessage,
): Promise<void> {
  const userId = await currentUserId()
  if (!userId) return
  try {
    await db()
      .from('advisor_messages' as never)
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: msg.role,
        content: msg.content,
        products: msg.products && msg.products.length > 0 ? msg.products : null,
        reco_criteria: msg.recoCriteria ?? null,
      } as never)
    await db()
      .from('advisor_conversations' as never)
      .update({ updated_at: new Date().toISOString() } as never)
      .eq('id', conversationId)
  } catch {
    // silencieux : la persistance ne doit pas casser le chat.
  }
}

/** Liste les conversations de l'utilisateur (récentes d'abord). */
export async function listConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await db()
    .from('advisor_conversations' as never)
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error || !data) return []
  return data as ConversationSummary[]
}

/** Charge les messages d'une conversation (ordre chronologique). */
export async function loadConversationMessages(
  conversationId: string,
): Promise<StoredMessage[]> {
  const { data, error } = await db()
    .from('advisor_messages' as never)
    .select('role, content, products, reco_criteria')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return (
    data as Array<{
      role: string
      content: string | null
      products: unknown
      reco_criteria: unknown
    }>
  ).map((r) => ({
    role: r.role === 'assistant' ? 'assistant' : 'user',
    content: r.content ?? '',
    products: (r.products as AlternativeProduct[] | null) ?? null,
    recoCriteria:
      (r.reco_criteria as { ingredients: string[]; form: string | null } | null) ?? null,
  }))
}

/** Supprime une conversation (et ses messages via cascade). */
export async function deleteConversation(conversationId: string): Promise<void> {
  try {
    await db()
      .from('advisor_conversations' as never)
      .delete()
      .eq('id', conversationId)
  } catch {
    // silencieux
  }
}
