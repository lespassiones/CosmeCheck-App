#!/usr/bin/env node
/**
 * verify-android-assets — contrôle qu'un AAB / APK Android n'a AUCUNE image,
 * icône ou police manquante avant de l'envoyer sur le Play Store.
 *
 * POURQUOI : en release, expo-updates ne retrouve les fichiers du code (images,
 * icônes, polices) que par la table `assets/app.manifest`. Le 29/09/2026, la
 * version Play (versionCode 30) embarquait une table du 22 juillet : 35 fichiers
 * introuvables (images du parcours d'accueil, 12 icônes de catégories, police
 * manuscrite Caveat, icône de l'app), alors qu'ils étaient bien dans l'AAB.
 * Cause et correctif : plugins/withFreshUpdatesResources.js.
 *
 * Trois contrôles, tous bloquants :
 *   1. chaque entrée de la table correspond à ce que le code attend (empreinte
 *      présente dans le bundle JS), sinon la table est périmée ;
 *   2. chaque fichier du code livré dans l'archive (res/drawable-*, res/raw)
 *      figure dans la table ;
 *   3. chaque entrée de la table a bien son fichier dans l'archive.
 *
 * Usage : node scripts/verify-android-assets.mjs [chemin.aab|chemin.apk]
 * (défaut : android/app/build/outputs/bundle/release/app-release.aab).
 * Lancé aussi automatiquement après bundleRelease / assembleRelease par Gradle.
 * Sortie 0 = tout est là, 1 = fichier manquant, 2 = archive illisible.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(process.argv[2] ?? join(ROOT, 'android/app/build/outputs/bundle/release/app-release.aab'))

function fail(code, message) {
  console.error(`[verify-android-assets] ${message}`)
  process.exit(code)
}

// ── Lecture ZIP minimale (AAB et APK sont des ZIP) ──────────────────────────

function readZip(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('fin de répertoire ZIP introuvable')
  let count = buf.readUInt16LE(eocd + 10)
  let cdOffset = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20
    if (loc < 0 || buf.readUInt32LE(loc) !== 0x07064b50) throw new Error('ZIP64 sans localisateur')
    const z64 = Number(buf.readBigUInt64LE(loc + 8))
    count = Number(buf.readBigUInt64LE(z64 + 32))
    cdOffset = Number(buf.readBigUInt64LE(z64 + 48))
  }
  const entries = new Map()
  let p = cdOffset
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('répertoire ZIP corrompu')
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    entries.set(name, { method, compSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  const read = (name) => {
    const e = entries.get(name)
    if (!e) return null
    const lh = e.localOffset
    const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28)
    const raw = buf.subarray(start, start + e.compSize)
    if (e.method === 0) return raw
    if (e.method === 8) return inflateRawSync(raw)
    throw new Error(`compression ${e.method} non gérée (${name})`)
  }
  return { names: [...entries.keys()], read }
}

// ── Contrôles ────────────────────────────────────────────────────────────────

if (!existsSync(target)) fail(2, `archive introuvable : ${target}`)

let zip
try {
  zip = readZip(readFileSync(target))
} catch (e) {
  fail(2, `archive illisible (${target}) : ${e.message}`)
}

// AAB : tout est sous base/ ; APK : à la racine, avec des noms de ressources
// raccourcis par aapt2 (res/Ab.png) : les contrôles 2 et 3 n'y sont pas possibles.
const isBundle = zip.names.some((n) => n.startsWith('base/'))
const base = isBundle ? 'base/' : ''
const manifestBuf = zip.read(`${base}assets/app.manifest`)
const bundle = zip.read(`${base}assets/index.android.bundle`)
if (!manifestBuf) fail(1, 'assets/app.manifest absent : expo-updates ne trouvera AUCUNE image.')
if (!bundle) fail(1, 'assets/index.android.bundle absent.')

const table = JSON.parse(manifestBuf.toString('utf8')).assets ?? []

// Fichiers livrés dans l'archive : nom de ressource -> dossiers (drawable-mdpi, raw…).
const shipped = new Map()
for (const n of zip.names) {
  const m = n.slice(base.length).match(/^res\/((?:drawable|raw)[^/]*)\/([^/]+)\.[^./]+$/)
  if (!m) continue
  if (!shipped.has(m[2])) shipped.set(m[2], new Set())
  shipped.get(m[2]).add(m[1])
}

// Ressources venues du code (Metro les nomme d'après leur chemin : assets_…,
// node_modules_…, components_…) et non de la couche native Android.
const codePrefixes = readdirSync(ROOT)
  .filter((d) => !d.startsWith('.') && statSync(join(ROOT, d)).isDirectory())
  .map((d) => `${d.toLowerCase().replace(/[^a-z0-9_]/g, '')}_`)
const fromCode = (name) => codePrefixes.some((p) => name.startsWith(p))

const problems = []
const inTable = new Set()
for (const a of table) {
  const file = a.resourcesFilename
  inTable.add(file)
  const label = `${file}.${a.type}`
  if (!a.packagerHash || !bundle.includes(Buffer.from(a.packagerHash))) {
    problems.push(`table périmée : ${label} ne correspond plus au code (fichier modifié depuis la table)`)
  }
  if (!isBundle) continue
  const folders = shipped.get(file)
  if (!folders || ![...folders].some((f) => f.startsWith(a.resourcesFolder ?? ''))) {
    problems.push(`fichier absent de l'archive : ${label} (${a.resourcesFolder ?? '?'})`)
  }
}
for (const [file, folders] of shipped) {
  if (fromCode(file) && !inTable.has(file)) {
    problems.push(`absent de la table (ne s'affichera pas) : ${file} (${[...folders].join(', ')})`)
  }
}
if (!isBundle) console.warn('[verify-android-assets] APK : seul le contrôle 1 (table à jour) est possible, vérifier l\'AAB pour le reste.')

const rel = target.startsWith(ROOT) ? target.slice(ROOT.length + 1) : target
if (problems.length) {
  console.error(`[verify-android-assets] ${rel} : ${problems.length} problème(s), NE PAS PUBLIER.`)
  for (const p of problems.sort()) console.error(`  - ${p}`)
  console.error('  Reconstruire : la tâche create<Variant>UpdatesResources doit s\'exécuter (plugins/withFreshUpdatesResources.js).')
  process.exit(1)
}
const fonts = table.filter((a) => a.type === 'ttf' || a.type === 'otf').length
console.log(`[verify-android-assets] ${rel} : OK, ${table.length} fichiers du code tous présents et à jour (${table.length - fonts} images, ${fonts} polices d'icônes et de texte).`)
