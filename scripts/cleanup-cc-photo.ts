/**
 * cleanup-cc-photo — dédoublonne les entrées catalogue synthétiques `cc-photo-*`
 * créées par l'ancien flux d'approbation photo (soumission SANS EAN d'un produit
 * DÉJÀ au catalogue → doublon orphelin).
 *
 * Pour chaque `cc-photo-*` : cherche un vrai produit (EAN réel) correspondant par
 * NOM (≥60 % des mots significatifs). Si trouvé → rattache la photo au vrai
 * produit (si celui-ci n'a pas d'image) + SUPPRIME le doublon. Sinon → LAISSE
 * (produit réellement nouveau, pas un doublon).
 *
 *   node scripts/cleanup-cc-photo.ts            # DRY-RUN
 *   node scripts/cleanup-cc-photo.ts --apply
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const APPLY = process.argv.includes('--apply')
const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Accept-Profile': 'cosme_check', 'Content-Profile': 'cosme_check' }
const G = '\x1b[32m', C = '\x1b[36m', Y = '\x1b[33m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m'

const words = (s: string | null) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3)

interface Row { ean: string; brand: string | null; name: string | null; image_url: string | null }

async function rpc(name: string, params: Record<string, unknown>) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify(params),
  })
  return r.ok ? await r.json() : []
}

;(async () => {
  console.log(`\n${B}=== Nettoyage doublons cc-photo — ${APPLY ? Y + 'APPLY' : G + 'DRY-RUN'}${X}${B} ===${X}`)
  const res = await fetch(`${URL_}/rest/v1/catalog?select=ean,brand,name,image_url&ean=like.cc-photo-*&is_active=eq.true`, { headers: H })
  const rows = (await res.json()) as Row[]
  console.log(`  ${C}·${X} ${rows.length} entrées cc-photo à examiner\n`)

  const merges: { cc: string; real: string; setImage: boolean; ccName: string; realName: string }[] = []
  const keep: Row[] = []

  for (const cc of rows) {
    const want = words(cc.name)
    const query = [cc.brand, cc.name].filter(Boolean).join(' ').trim()
    const cand = (await rpc('cosme_check_search_catalog', { p_query: query, p_limit: 3 })) as Array<{ ean: string; name: string | null; image_url: string | null }>
    let matched: { ean: string; name: string | null; image_url: string | null } | null = null
    if (want.length > 0) {
      for (const r of cand) {
        if (!r.ean || r.ean.startsWith('cc-photo-')) continue
        const got = new Set(words(r.name))
        const common = want.filter((w) => got.has(w)).length
        if (common / want.length >= 0.6) { matched = r; break }
      }
    }
    if (matched) {
      merges.push({ cc: cc.ean, real: matched.ean, setImage: !matched.image_url, ccName: cc.name ?? '', realName: matched.name ?? '' })
    } else {
      keep.push(cc)
    }
  }

  console.log(`${B}À FUSIONNER (doublons d'un produit existant) : ${merges.length}${X}`)
  for (const m of merges)
    console.log(`  ${D}«${m.ccName}»${X}\n     → ${G}${m.real}${X} «${m.realName.slice(0, 55)}»  ${m.setImage ? '(+photo)' : '(photo déjà présente, on garde)'}`)
  console.log(`\n${B}À LAISSER (produits réellement nouveaux, non doublons) : ${keep.length}${X}`)
  for (const k of keep) console.log(`  ${D}· ${k.ean.slice(0, 20)}… «${(k.name ?? '').slice(0, 55)}»${X}`)

  if (!APPLY) { console.log(`\n${G}DRY-RUN.${X} --apply pour fusionner.\n`); return }

  for (const m of merges) {
    if (m.setImage) {
      const img = rows.find((r) => r.ean === m.cc)?.image_url
      await fetch(`${URL_}/rest/v1/catalog?ean=eq.${encodeURIComponent(m.real)}`, {
        method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ image_url: img }),
      })
    }
    await fetch(`${URL_}/rest/v1/catalog?ean=eq.${encodeURIComponent(m.cc)}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } })
  }
  console.log(`\n${G}✓ ${merges.length} doublon(s) fusionné(s) + supprimé(s). ${keep.length} produit(s) nouveau(x) conservé(s).${X}\n`)
})()
