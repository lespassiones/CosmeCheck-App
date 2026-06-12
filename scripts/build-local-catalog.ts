/**
 * build-local-catalog.ts — Génère le catalogue LOCAL normalisé (Phase 5 / Tier 3).
 *
 * Produit un fichier SQLite (~50 Mo) + sa version gzippée (~25-30 Mo) à embarquer
 * /télécharger côté app, pour des analyses HORS-LIGNE strictement identiques au
 * serveur (on COPIE le `result_json` précalculé, jamais on ne recalcule).
 *
 * Pipeline :
 *   1. Lit en streaming `catalog` ⨝ `product_analyses` (par ean) depuis Postgres.
 *   2. Construit un dictionnaire d'ingrédients (slug → champs stables) — 15 723 entrées.
 *   3. Encode les `result_json.items` de chaque produit via le MÊME codec que
 *      l'app (`lib/catalog/localCatalogCodec.ts`) → garantie "pareil".
 *   4. Écrit SQLite : `ingredients_dict`, `products` (items encodés en JSON),
 *      `products_fts` (recherche nom/marque), `meta` (version).
 *   5. gzip → `catalog.db.gz` + `catalog-version.json`.
 *
 * PRÉREQUIS :
 *   npm i -D better-sqlite3 pg tsx
 *   $env:SUPABASE_DB_URL = "postgresql://postgres:<pwd>@db.rogesnduejmqpxolhbif.supabase.co:5432/postgres"
 *   npx tsx scripts/build-local-catalog.ts
 *
 * (La connection string se trouve dans Supabase → Project Settings → Database.)
 */
import { createWriteStream } from 'node:fs'
import { writeFileSync, readFileSync, statSync } from 'node:fs'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import Database from 'better-sqlite3'
import pg from 'pg'
import {
  type AnalysisItem,
  type DictEntry,
  dictEntryFromItem,
  encodeItems,
} from '../lib/catalog/localCatalogCodec'

const DB_URL = process.env.SUPABASE_DB_URL
if (!DB_URL) {
  console.error('❌ SUPABASE_DB_URL manquant (postgresql://…). Voir l’en-tête du script.')
  process.exit(1)
}

const OUT_DIR = path.resolve(process.cwd(), 'scripts', 'out')
const DB_PATH = path.join(OUT_DIR, 'catalog.db')
const GZ_PATH = path.join(OUT_DIR, 'catalog.db.gz')
const VERSION_PATH = path.join(OUT_DIR, 'catalog-version.json')
const BATCH = 5000
// Version du schéma local — à bumper si la forme change (force re-téléchargement).
const SCHEMA_VERSION = 1

interface Row {
  ean: string
  brand: string | null
  name: string | null
  score: number | null
  score_label: string | null
  score_tone: string | null
  count_total: number | null
  items: AnalysisItem[] | null
}

function initDb(): Database.Database {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS ingredients_dict;
    DROP TABLE IF EXISTS meta;
    DROP TABLE IF EXISTS products_fts;

    CREATE TABLE ingredients_dict (
      id              INTEGER PRIMARY KEY,
      slug            TEXT NOT NULL,
      name            TEXT NOT NULL,
      color_rating    TEXT,
      db_color_rating TEXT,
      tags            TEXT,   -- JSON array
      all_functions   TEXT,   -- JSON array
      primary_function TEXT,
      translation_fr  TEXT,
      cas_number      TEXT
    );

    CREATE TABLE products (
      ean         TEXT PRIMARY KEY,
      brand       TEXT,
      name        TEXT,
      score       REAL,
      score_label TEXT,
      score_tone  TEXT,
      count_total INTEGER,
      items_json  TEXT   -- EncodedItem[] (null si pas d'analyse précalculée)
    );

    -- Recherche plein-texte nom + marque (équivalent trigram serveur côté local).
    CREATE VIRTUAL TABLE products_fts USING fts5(
      ean UNINDEXED, brand, name, tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  return db
}

async function main() {
  const { Client } = pg
  const client = new Client({ connectionString: DB_URL })
  await client.connect()

  // mkdir out/
  try { statSync(OUT_DIR) } catch { (await import('node:fs')).mkdirSync(OUT_DIR, { recursive: true }) }

  const db = initDb()
  const dict: DictEntry[] = []
  const slugToIndex = new Map<string, number>()

  const insertProduct = db.prepare(
    `INSERT OR REPLACE INTO products
       (ean, brand, name, score, score_label, score_tone, count_total, items_json)
     VALUES (@ean, @brand, @name, @score, @score_label, @score_tone, @count_total, @items_json)`,
  )
  const insertFts = db.prepare(
    `INSERT INTO products_fts (ean, brand, name) VALUES (@ean, @brand, @name)`,
  )

  let offset = 0
  let total = 0
  const t0 = Date.now()

  // Streaming par batch (catalog ⨝ analyses). LEFT JOIN : on garde les produits
  // sans analyse précalculée (score présent, items chargés au tap côté app).
  for (;;) {
    const { rows } = await client.query<Row>(
      `SELECT c.ean, c.brand, c.name, c.score, c.score_label, c.score_tone, c.count_total,
              pa.result_json->'items' AS items
       FROM cosme_check.catalog c
       LEFT JOIN cosme_check.product_analyses pa ON pa.ean = c.ean
       WHERE c.count_total >= 3
       ORDER BY c.ean
       LIMIT $1 OFFSET $2`,
      [BATCH, offset],
    )
    if (rows.length === 0) break

    const tx = db.transaction((batch: Row[]) => {
      for (const r of batch) {
        let itemsJson: string | null = null
        if (Array.isArray(r.items)) {
          // Alimente le dictionnaire avec les nouveaux slugs rencontrés.
          for (const it of r.items) {
            if (it.slug != null && !slugToIndex.has(it.slug)) {
              slugToIndex.set(it.slug, dict.length)
              dict.push(dictEntryFromItem(it))
            }
          }
          itemsJson = JSON.stringify(encodeItems(r.items, slugToIndex))
        }
        insertProduct.run({
          ean: r.ean,
          brand: r.brand,
          name: r.name,
          score: r.score,
          score_label: r.score_label,
          score_tone: r.score_tone,
          count_total: r.count_total,
          items_json: itemsJson,
        })
        insertFts.run({ ean: r.ean, brand: r.brand ?? '', name: r.name ?? '' })
      }
    })
    tx(rows)

    total += rows.length
    offset += BATCH
    if (total % 50000 === 0) console.log(`  …${total} produits, ${dict.length} ingrédients`)
  }

  // Écrit le dictionnaire.
  const insertDict = db.prepare(
    `INSERT INTO ingredients_dict
       (id, slug, name, color_rating, db_color_rating, tags, all_functions, primary_function, translation_fr, cas_number)
     VALUES (@id, @slug, @name, @color_rating, @db_color_rating, @tags, @all_functions, @primary_function, @translation_fr, @cas_number)`,
  )
  const txDict = db.transaction((entries: DictEntry[]) => {
    entries.forEach((e, id) => {
      insertDict.run({
        id,
        slug: e.slug,
        name: e.name,
        color_rating: e.colorRating,
        db_color_rating: e.dbColorRating,
        tags: JSON.stringify(e.tags ?? []),
        all_functions: JSON.stringify(e.allFunctions ?? []),
        primary_function: e.primaryFunction,
        translation_fr: e.translationFr,
        cas_number: e.casNumber,
      })
    })
  })
  txDict(dict)

  const version = `${SCHEMA_VERSION}.${Math.floor(t0 / 1000)}`
  db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run('version', version)
  db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run('product_count', String(total))
  db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run('ingredient_count', String(dict.length))

  db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;')
  db.close()
  await client.end()

  // gzip + version.json
  await pipeline(
    Readable.from(readFileSync(DB_PATH)),
    createGzip({ level: 9 }),
    createWriteStream(GZ_PATH),
  )
  writeFileSync(VERSION_PATH, JSON.stringify({ version, product_count: total, ingredient_count: dict.length }, null, 2))

  const mb = (p: string) => (statSync(p).size / 1024 / 1024).toFixed(1)
  console.log(`\n✅ Terminé en ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  console.log(`   Produits      : ${total}`)
  console.log(`   Ingrédients   : ${dict.length}`)
  console.log(`   ${DB_PATH}  → ${mb(DB_PATH)} Mo (sur disque, interrogeable)`)
  console.log(`   ${GZ_PATH}   → ${mb(GZ_PATH)} Mo (téléchargement)`)
  console.log(`   version       : ${version}`)
  console.log(`\n→ Héberge catalog.db.gz + catalog-version.json sur Supabase Storage (bucket public).`)
}

main().catch((e) => {
  console.error('❌ Échec génération :', e)
  process.exit(1)
})
