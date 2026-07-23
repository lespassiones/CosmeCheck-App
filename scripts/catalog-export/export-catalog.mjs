/**
 * Export catalogue complet → CSV (méthode portable, sans psql).
 *
 * Lit la vue `cosme_check.catalog_export` par pages de 1000 (pagination KEYSET
 * sur le code-barre → index PK, charge DB faible et étalée) et écrit un CSV
 * UTF-8 AVEC BOM (accents OK dans Excel). Ne télécharge AUCUNE image : la colonne
 * `image_url` + `nom_fichier_image` suffisent.
 *
 * Prérequis : variables d'env
 *   SUPABASE_URL                = https://rogesnduejmqpxolhbif.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   = clé service_role (Dashboard → Settings → API)
 *
 * Lancement :
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/catalog-export/export-catalog.mjs
 *   → génère catalog.csv à la racine (~300 Mo, ~491k lignes).
 */
import { createClient } from '@supabase/supabase-js'
import { createWriteStream } from 'node:fs'

const URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('❌ Définis SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans l’environnement.')
  process.exit(1)
}

const PAGE = 1000 // max PostgREST par requête
const DELAY_MS = 40 // petite pause entre pages → base ménagée
const OUT = process.env.OUT_FILE || 'catalog.csv'

const supabase = createClient(URL, KEY, { auth: { persistSession: false } })
const sb = supabase.schema('cosme_check')

/** Échappe une valeur pour le CSV (RFC 4180). */
function csvCell(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const out = createWriteStream(OUT, { encoding: 'utf8' })
  out.write('﻿') // BOM UTF-8 pour Excel

  let cursor = '' // dernier code_barre traité (keyset)
  let total = 0
  let header = null

  for (;;) {
    const { data, error } = await sb
      .from('catalog_export')
      .select('*')
      .order('code_barre', { ascending: true })
      .gt('code_barre', cursor)
      .limit(PAGE)

    if (error) {
      console.error('❌ Erreur Supabase :', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break

    if (!header) {
      header = Object.keys(data[0])
      out.write(header.map(csvCell).join(',') + '\n')
    }
    for (const row of data) {
      out.write(header.map((k) => csvCell(row[k])).join(',') + '\n')
    }

    total += data.length
    cursor = data[data.length - 1].code_barre
    if (total % 20000 < PAGE) console.log(`… ${total} produits exportés`)

    if (data.length < PAGE) break
    await sleep(DELAY_MS)
  }

  await new Promise((res) => out.end(res))
  console.log(`✅ Terminé : ${total} produits → ${OUT}`)
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})
