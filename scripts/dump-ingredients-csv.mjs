/**
 * dump-ingredients-csv.mjs — exporte les ~15 723 ingrédients de
 * cosme_check.ingredients dans un CSV pour enrichissement EXTERNE des noms
 * simplifiés (grand public).
 *
 * Colonnes : name, fonction_1 … fonction_11 (max constaté = 11), nom_simplifie (VIDE).
 * La colonne nom_simplifie est laissée vide volontairement : une autre IA la
 * remplira, puis le CSV nous est rendu pour chargement en base.
 *
 * Lecture via la clé ANON publique (ingredients est lisible par anon). Pagination
 * PostgREST par 1000. Tri alphabétique par nom.
 *
 * Lancement : node scripts/dump-ingredients-csv.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const env = readFileSync(path.resolve(process.cwd(), '.env'), 'utf8')
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim()
const URL = pick('EXPO_PUBLIC_SUPABASE_URL')
const ANON = pick('EXPO_PUBLIC_SUPABASE_ANON_KEY')
if (!URL || !ANON) {
  console.error('❌ EXPO_PUBLIC_SUPABASE_URL / ANON_KEY introuvables dans .env')
  process.exit(1)
}

const MAX_FNS = 11
const PAGE = 1000
const supabase = createClient(URL, ANON, { db: { schema: 'cosme_check' }, auth: { persistSession: false } })

const csvCell = (v) => {
  const s = (v ?? '').toString()
  return `"${s.replace(/"/g, '""')}"`
}

function functionsOf(fns) {
  if (!Array.isArray(fns)) return []
  const out = []
  const seen = new Set()
  for (const f of fns) {
    const name = typeof f === 'string' ? f : f?.name
    const t = (name ?? '').toString().trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

async function main() {
  const header = ['name', ...Array.from({ length: MAX_FNS }, (_, i) => `fonction_${i + 1}`), 'nom_simplifie']
  const lines = [header.map(csvCell).join(',')]
  let from = 0
  let totalFns = 0
  for (;;) {
    const { data, error } = await supabase
      .from('ingredients')
      .select('name,functions')
      .order('name', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('❌ Erreur PostgREST :', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    for (const row of data) {
      const fns = functionsOf(row.functions).slice(0, MAX_FNS)
      totalFns = Math.max(totalFns, fns.length)
      const cells = [row.name ?? '']
      for (let i = 0; i < MAX_FNS; i++) cells.push(fns[i] ?? '')
      cells.push('') // nom_simplifie : VIDE
      lines.push(cells.map(csvCell).join(','))
    }
    process.stdout.write(`\r… ${lines.length - 1} lignes`)
    if (data.length < PAGE) break
    from += PAGE
  }
  const outDir = path.resolve(process.cwd(), 'scripts', 'out')
  mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'ingredients_15k.csv')
  writeFileSync(outPath, lines.join('\n'), 'utf8')
  console.log(`\n✅ ${lines.length - 1} ingrédients écrits → ${outPath} (max fonctions vues : ${totalFns})`)
}

main()
