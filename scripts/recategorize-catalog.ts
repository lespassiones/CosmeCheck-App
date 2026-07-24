/**
 * Re-catégorisation des produits catalogue mal rangés (~23 k) — nettoyage des
 * catégories poubelle (`gel`, `sunscreen`, labels FR, null…) qui font échouer la
 * recherche d'alternatives et la navigation par sous-catégorie.
 *
 * Réutilise EXACTEMENT la logique de l'app : `recategorizeLeaf(name, category)`
 * (lib/catalog/productTypeCategory.ts) → feuille de taxonomie 3 niveaux, via :
 *   1. nom à mot-clé fonctionnel fort   (précis)
 *   2. bucket poubelle connu → préfixe  (déterministe)
 *   3. nom fourre-tout                  (dernier recours)
 * Sinon → laissé tel quel (le garde-fou côté app protège déjà l'affichage).
 *
 * SÛR & RÉVERSIBLE : n'écrit QU'avec `--apply`. La sauvegarde des catégories
 * d'origine est faite AVANT via la migration `catalog_category_backup`
 * (reversal : UPDATE catalog c SET category=b.old_category FROM backup b …).
 *
 * Node 24 exécute ce .ts nativement. Lancer :
 *   node scripts/recategorize-catalog.ts            # DRY-RUN (rapport, 0 écriture)
 *   node scripts/recategorize-catalog.ts --apply    # applique (upsert par lots)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { recategorizeLeaf } from '../lib/catalog/productTypeCategory.ts'

const APPLY = process.argv.includes('--apply')

const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) throw new Error('.env incomplet')
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Accept-Profile': 'cosme_check', 'Content-Profile': 'cosme_check' }

const G = '\x1b[32m', C = '\x1b[36m', Y = '\x1b[33m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m'

interface Row { ean: string; name: string | null; category: string | null; old_category: string | null }

/**
 * Source pilotée par le BACKUP : on reclasse à partir de la catégorie D'ORIGINE
 * (old_category), pas de la valeur courante. Ainsi on ré-affine aussi les lignes
 * DÉJÀ déplacées (elles ne sont plus « poubelle » et échapperaient au filtre live).
 * Idempotent : on n'écrit que si la cible diffère de la catégorie courante.
 */
async function fetchBackup(): Promise<{ ean: string; old_category: string | null }[]> {
  const out: { ean: string; old_category: string | null }[] = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const r = await fetch(`${URL_}/rest/v1/catalog_category_backup?select=ean,old_category&order=ean`, {
      headers: { ...H, Range: `${offset}-${offset + PAGE - 1}`, 'Range-Unit': 'items' },
    })
    if (!r.ok) throw new Error(`backup ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const batch = (await r.json()) as { ean: string; old_category: string | null }[]
    out.push(...batch)
    if (batch.length < PAGE) break
  }
  return out
}

/** Nom + catégorie COURANTE pour un lot d'EAN (chunks `in.()`). */
async function fetchInfo(eans: string[]): Promise<Map<string, { name: string | null; category: string | null }>> {
  const map = new Map<string, { name: string | null; category: string | null }>()
  const CH = 150
  for (let i = 0; i < eans.length; i += CH) {
    const list = eans.slice(i, i + CH).map((e) => `"${e}"`).join(',')
    const r = await fetch(`${URL_}/rest/v1/catalog?select=ean,name,category&ean=in.(${list})`, { headers: H })
    if (!r.ok) throw new Error(`info ${r.status}: ${(await r.text()).slice(0, 200)}`)
    for (const row of (await r.json()) as { ean: string; name: string | null; category: string | null }[])
      map.set(row.ean, { name: row.name, category: row.category })
    if (i % 3000 === 0) process.stdout.write(`\r  ${C}·${X} chargement noms ${i}/${eans.length}   `)
  }
  process.stdout.write('\n')
  return map
}

async function fetchAllJunk(): Promise<Row[]> {
  const backup = await fetchBackup()
  const info = await fetchInfo(backup.map((b) => b.ean))
  return backup.map((b) => {
    const i = info.get(b.ean)
    return { ean: b.ean, name: i?.name ?? null, category: i?.category ?? null, old_category: b.old_category }
  })
}

/** UPDATE par ligne (PATCH filtré) — un upsert partiel violerait le NOT NULL sur
 *  `name`. Pool de concurrence pour rester rapide (~25 requêtes en vol). */
async function applyUpdates(updates: { ean: string; category: string }[]) {
  const POOL = 25
  let done = 0
  let failed = 0
  let idx = 0
  async function worker() {
    while (idx < updates.length) {
      const u = updates[idx++]
      const r = await fetch(`${URL_}/rest/v1/catalog?ean=eq.${encodeURIComponent(u.ean)}`, {
        method: 'PATCH',
        headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ category: u.category }),
      })
      if (!r.ok) { failed++; if (failed <= 5) console.error(`\n  PATCH ${u.ean} ${r.status}: ${(await r.text()).slice(0, 160)}`) }
      done++
      if (done % 200 === 0 || done === updates.length) process.stdout.write(`\r  ${C}·${X} update ${done}/${updates.length} (${failed} échecs)   `)
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker))
  process.stdout.write('\n')
  if (failed) console.log(`  ${Y}${failed} échec(s) d'écriture${X}`)
}

;(async () => {
  console.log(`\n${B}=== Re-catégorisation catalogue — ${APPLY ? Y + 'APPLY' : G + 'DRY-RUN'}${X}${B} ===${X}`)
  const rows = await fetchAllJunk()
  console.log(`  ${C}·${X} ${rows.length} produits « poubelle » (backup) récupérés\n`)

  const updates: { ean: string; category: string }[] = []
  const viaCount: Record<string, number> = { 'name-strong': 0, bucket: 0, 'name-catchall': 0 }
  const leafCount: Record<string, number> = {}
  const unclassified: Row[] = []
  let alreadyOk = 0

  for (const row of rows) {
    // Classer depuis la catégorie D'ORIGINE (old_category) → ré-affine aussi les déjà-déplacés.
    const res = recategorizeLeaf(row.name, row.old_category)
    if (!res) { unclassified.push(row); continue }
    if (row.category === res.leaf) { alreadyOk++; continue } // déjà à la bonne feuille → skip
    updates.push({ ean: row.ean, category: res.leaf })
    viaCount[res.via]++
    leafCount[res.leaf] = (leafCount[res.leaf] ?? 0) + 1
  }
  console.log(`  ${D}déjà à la feuille correcte (aucune écriture) : ${alreadyOk}${X}`)

  const pct = (n: number) => `${((100 * n) / rows.length).toFixed(1)}%`
  console.log(`${B}Couverture${X}`)
  console.log(`  reclassés : ${G}${updates.length}${X} (${pct(updates.length)})`)
  console.log(`    · via nom (mot-clé fort) : ${viaCount['name-strong']}`)
  console.log(`    · via bucket connu       : ${viaCount['bucket']}`)
  console.log(`    · via nom (fourre-tout)  : ${viaCount['name-catchall']}`)
  console.log(`  laissés tels quels (abstention) : ${Y}${unclassified.length}${X} (${pct(unclassified.length)})`)

  console.log(`\n${B}Répartition par feuille cible${X}`)
  for (const [leaf, n] of Object.entries(leafCount).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(6)}  ${leaf}`)

  const uncatByCat: Record<string, number> = {}
  for (const r of unclassified) uncatByCat[r.category ?? '<NULL>'] = (uncatByCat[r.category ?? '<NULL>'] ?? 0) + 1
  console.log(`\n${B}Top catégories non reclassées (laissées telles quelles)${X}`)
  for (const [cat, n] of Object.entries(uncatByCat).sort((a, b) => b[1] - a[1]).slice(0, 15))
    console.log(`  ${String(n).padStart(6)}  ${cat}`)
  console.log(`\n  ${D}échantillon non classé :${X}`)
  for (const r of unclassified.slice(0, 8)) console.log(`  ${D}· [${r.category}] ${r.name}${X}`)

  if (!APPLY) {
    console.log(`\n${G}DRY-RUN terminé.${X} Relancer avec ${B}--apply${X} pour écrire (backup requis au préalable).\n`)
    return
  }

  console.log(`\n${Y}APPLY — écriture de ${updates.length} catégories…${X}`)
  await applyUpdates(updates)
  console.log(`${G}Terminé.${X}\n`)
})()
