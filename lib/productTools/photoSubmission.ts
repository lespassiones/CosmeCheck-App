/**
 * Envoi de photos produit par les utilisateurs (file de modération).
 *
 * Pipeline (par photo, 1 ou 2 max) :
 *   1. expo-image-manipulator → resize ≤ 1000px + compression forte → WebP base64
 *      (objectif : fichiers très légers, < 512 Ko = limite du bucket).
 *   2. base64 → ArrayBuffer (pattern Supabase + Expo officiel).
 *   3. upload dans le bucket public `cosmetwiki-products`, préfixe
 *      `submissions/{userId}/…` (policy storage : insert authenticated limité à
 *      ce préfixe).
 *   4. insertion d'une ligne `catalog_photo_submissions` (status='pending').
 *
 * Les photos NE sont PAS publiées sur le produit ici : un admin les valide
 * ensuite côté CosmeCheckAdmin (→ maj de `catalog.image_url`).
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import * as Crypto from 'expo-crypto'

import { supabase, db } from '@/lib/supabase/client'

// `atob` est fourni globalement par Hermes (RN ≥ 0.74) — non typé par défaut.
declare const atob: (data: string) => string

const BUCKET = 'cosmetwiki-products'
const MAX_WIDTH = 1000
const COMPRESS = 0.4

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** Compresse une image locale en WebP léger et renvoie son ArrayBuffer. */
async function compressToWebp(uri: string): Promise<ArrayBuffer> {
  const result = await manipulateAsync(uri, [{ resize: { width: MAX_WIDTH } }], {
    compress: COMPRESS,
    format: SaveFormat.WEBP,
    base64: true,
  })
  if (!result.base64) throw new Error('compression-failed')
  return base64ToArrayBuffer(result.base64)
}

export interface PhotoSubmissionInput {
  /** EAN si le produit est au catalogue (sinon null → clé synthétique côté admin). */
  ean: string | null
  brand: string | null
  name: string | null
  /** Slug de catégorie catalogue (ex. "coiffure/shampooing/…"), optionnel. */
  category: string | null
  /** URIs locales des photos prises (1 ou 2). */
  localUris: string[]
}

export type SubmitResult = { ok: true } | { ok: false; error: string }

export async function submitProductPhotos(
  input: PhotoSubmissionInput,
): Promise<SubmitResult> {
  const uris = input.localUris.filter(Boolean).slice(0, 2)
  if (uris.length === 0) return { ok: false, error: 'no-photo' }

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return { ok: false, error: 'not-authenticated' }

  const paths: string[] = []
  for (const uri of uris) {
    let buffer: ArrayBuffer
    try {
      buffer = await compressToWebp(uri)
    } catch {
      return { ok: false, error: 'compression-failed' }
    }
    const path = `submissions/${userId}/${Crypto.randomUUID()}.webp`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: 'image/webp', upsert: false })
    if (error) return { ok: false, error: error.message }
    paths.push(path)
  }

  const { error: insertError } = await db()
    .from('catalog_photo_submissions' as never)
    .insert({
      user_id: userId,
      ean: input.ean,
      brand: input.brand,
      name: input.name,
      category: input.category,
      photo_path_1: paths[0],
      photo_path_2: paths[1] ?? null,
    } as never)

  if (insertError) return { ok: false, error: insertError.message }
  return { ok: true }
}
