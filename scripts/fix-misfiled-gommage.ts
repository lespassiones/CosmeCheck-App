/**
 * Correction ciblée des produits MAL RANGÉS dans `…/masque-et-gommage/*` alors
 * que leur nom indique clairement un autre type (sérum, nettoyant, crème, lait…),
 * sans aucun mot exfoliant/masque — donc erreur non ambiguë de la donnée source.
 * (Bug bêta : « Mixa Sérum Anti-taches Vitamine C » affiché « Gommage Visage ».)
 *
 * Réutilise `detectMisfileLeaf` (lib/catalog/productTypeCategory.ts). Haute
 * précision : ne touche PAS les vrais gommages/masques ni les nuances internes
 * de taxonomie (anti-âge vs anti-taches). RÉVERSIBLE (backup préalable).
 *
 *   node scripts/fix-misfiled-gommage.ts            # DRY-RUN
 *   node scripts/fix-misfiled-gommage.ts --apply
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { detectMisfileLeaf } from '../lib/catalog/productTypeCategory.ts'

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

interface Row { ean: string; name: string | null; category: string | null }
const BASE = `${URL_}/rest/v1/catalog?select=ean,name,category&is_active=eq.true&count_total=gte.5&score=not.is.null&ingredients_text=not.is.null&category=like.soin-du-corps-et-visage/masque-et-gommage/*&order=ean`

async function fetchAll(): Promise<Row[]> {
  const out: Row[] = []
  for (let o = 0; ; o += 1000) {
    const r = await fetch(BASE, { headers: { ...H, Range: `${o}-${o + 999}`, 'Range-Unit': 'items' } })
    if (!r.ok) throw new Error(`fetch ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const b = (await r.json()) as Row[]
    out.push(...b)
    if (b.length < 1000) break
  }
  return out
}

async function applyUpdates(updates: { ean: string; category: string }[]) {
  const POOL = 25
  let idx = 0, done = 0, failed = 0
  async function worker() {
    while (idx < updates.length) {
      const u = updates[idx++]
      const r = await fetch(`${URL_}/rest/v1/catalog?ean=eq.${encodeURIComponent(u.ean)}`, {
        method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ category: u.category }),
      })
      if (!r.ok) { failed++; if (failed <= 5) console.error(`\n  PATCH ${u.ean} ${r.status}`) }
      done++
      if (done % 100 === 0 || done === updates.length) process.stdout.write(`\r  ${C}·${X} ${done}/${updates.length} (${failed} échecs)   `)
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker))
  process.stdout.write('\n')
}

;(async () => {
  console.log(`\n${B}=== Fix mal-rangés masque-et-gommage — ${APPLY ? Y + 'APPLY' : G + 'DRY-RUN'}${X}${B} ===${X}`)
  const rows = await fetchAll()
  console.log(`  ${C}·${X} ${rows.length} produits en masque-et-gommage\n`)

  const updates: { ean: string; category: string }[] = []
  const trans: Record<string, number> = {}
  const samples: Record<string, string[]> = {}
  for (const row of rows) {
    const r = detectMisfileLeaf(row.name, row.category)
    if (!r) continue
    updates.push({ ean: row.ean, category: r.leaf })
    const key = `→ ${r.toFamily.split('/').slice(1).join('/')}`
    trans[key] = (trans[key] ?? 0) + 1
    ;(samples[key] ??= []).push(row.name ?? '')
  }

  console.log(`${B}Mal rangés détectés : ${G}${updates.length}${X} / ${rows.length} (${((100 * updates.length) / rows.length).toFixed(1)}%)`)
  for (const [k, n] of Object.entries(trans).sort((a, b) => b[1] - a[1])) {
    console.log(`\n  ${B}${n}${X} ${k}`)
    for (const s of (samples[k] ?? []).slice(0, 6)) console.log(`    ${D}· ${s}${X}`)
  }

  if (!APPLY) { console.log(`\n${G}DRY-RUN terminé.${X} --apply pour écrire (backup requis).\n`); return }
  console.log(`\n${Y}APPLY — ${updates.length} corrections…${X}`)
  await applyUpdates(updates)
  console.log(`${G}Terminé.${X}\n`)
})()
