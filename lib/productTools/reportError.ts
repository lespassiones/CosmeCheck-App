/**
 * Signalement d'une anomalie sur un produit analysé.
 *
 * Insère une ligne dans `cosme_check.user_feedback` avec `kind='product_error'`
 * (le même tableau que les avis / messages contact, lu par l'admin web sous
 * « Retours »). La référence produit est stockée dans les colonnes dédiées
 * `product_ean` / `product_name` (migration product_tools_*).
 *
 * RLS : un utilisateur connecté ne peut insérer que SON propre feedback
 * (auth.uid() = user_id), donc on renseigne explicitement `user_id`.
 */
import { supabase, db } from '@/lib/supabase/client'

export interface ProductErrorReportInput {
  /** EAN du produit si retrouvé au catalogue (sinon null). */
  ean: string | null
  /** Nom affiché du produit (pour que l'admin identifie le produit concerné). */
  productName: string | null
  /** Message libre saisi par l'utilisateur. */
  message: string
}

export type SubmitResult = { ok: true } | { ok: false; error: string }

export async function submitProductErrorReport(
  input: ProductErrorReportInput,
): Promise<SubmitResult> {
  const trimmed = input.message.trim()
  if (trimmed.length < 3) return { ok: false, error: 'empty-message' }

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return { ok: false, error: 'not-authenticated' }

  const { error } = await db()
    .from('user_feedback')
    .insert({
      user_id: userId,
      kind: 'product_error',
      trigger_source: 'analysis',
      product_ean: input.ean,
      product_name: input.productName,
      message: trimmed,
    } as never)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
