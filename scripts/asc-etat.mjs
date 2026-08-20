/**
 * Etat de la fiche App Store, en LECTURE SEULE.
 *
 * Affiche la fiche, ses versions, ses abonnements et l'etat de la soumission,
 * sans ouvrir App Store Connect. Le pendant de scripts/play-etat.mjs.
 *
 * Ne modifie rien : uniquement des GET sur l'API App Store Connect.
 *
 * Usage :  node scripts/asc-etat.mjs
 *
 * Requiert la cle d'API App Store Connect (.p8). Elle est cherchee, dans
 * l'ordre, a la racine du depot puis dans la sauvegarde hors poste. Le KEY_ID
 * et l'ISSUER_ID ne sont pas des secrets : seuls, ils n'ouvrent rien. Le .p8,
 * lui, ne se retelecharge JAMAIS.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'

const KEY_ID = 'V8UJ847B48'
const ISSUER_ID = '7ff0f8c5-16e0-4ba8-8dad-76b2a629c4e3'
const BUNDLE = 'com.cosmecheck.app'

const CANDIDATS = [
  `c:/Projet/CosmeCheck-App/AuthKey_${KEY_ID}.p8`,
  `D:/MesApps/Origma/CosmeCheck/cle-ASC-API-cosmecheck-${KEY_ID}.p8`,
]
const keyPath = CANDIDATS.find((p) => fs.existsSync(p))
if (!keyPath) {
  console.error(`Cle introuvable. Cherchee ici :\n  ${CANDIDATS.join('\n  ')}`)
  process.exit(1)
}

const b64url = (b) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Jeton ES256, valide 10 minutes (Apple plafonne a 20). */
function bearer() {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }),
  )
  // Apple exige une signature au format JOSE (r||s) et non DER.
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), {
    key: fs.readFileSync(keyPath, 'utf8'),
    dsaEncoding: 'ieee-p1363',
  })
  return `${header}.${payload}.${b64url(sig)}`
}

const H = { authorization: `Bearer ${bearer()}` }
const API = 'https://api.appstoreconnect.apple.com/v1'

async function get(path) {
  const res = await fetch(`${API}/${path}`, { headers: H })
  const body = await res.json().catch(() => ({}))
  if (body.errors) {
    console.error(`\n${path} -> ${res.status}`, JSON.stringify(body.errors, null, 2))
    return null
  }
  return body
}

const apps = await get('apps?limit=50')
if (!apps) process.exit(1)

const app = (apps.data ?? []).find((a) => a.attributes.bundleId === BUNDLE)
if (!app) {
  console.error(`${BUNDLE} introuvable. Fiches visibles :`)
  for (const a of apps.data ?? []) console.error(`  ${a.attributes.bundleId}`)
  process.exit(1)
}

console.log('\nFICHE')
console.log(`  id       ${app.id}          (ascAppId, pour eas.json)`)
console.log(`  nom      "${app.attributes.name}"`)
console.log(`  bundle   ${app.attributes.bundleId}`)
console.log(`  ugs      ${app.attributes.sku}`)
console.log(`  langue   ${app.attributes.primaryLocale}`)

const versions = await get(`apps/${app.id}/appStoreVersions?limit=10`)
console.log('\nVERSIONS')
for (const v of versions?.data ?? []) {
  const a = v.attributes
  console.log(`  ${a.versionString.padEnd(8)} etat=${a.appStoreState ?? a.state}  sortie=${a.releaseType}`)
}

const builds = await get(`apps/${app.id}/builds?limit=5`)
console.log('\nBUILDS DEPOSES')
if (!builds?.data?.length) console.log('  aucun')
for (const b of builds?.data ?? []) {
  console.log(`  build ${b.attributes.version}  etat=${b.attributes.processingState}  expire=${b.attributes.expired}`)
}

const groups = await get(`apps/${app.id}/subscriptionGroups?limit=10`)
console.log('\nABONNEMENTS')
if (!groups?.data?.length) console.log('  aucun groupe (les 2 abonnements restent a creer)')
for (const g of groups?.data ?? []) {
  console.log(`  groupe "${g.attributes.referenceName}"`)
  const subs = await get(`subscriptionGroups/${g.id}/subscriptions?limit=20`)
  for (const s of subs?.data ?? []) {
    const a = s.attributes
    console.log(`    ${a.productId.padEnd(20)} etat=${a.state}  duree=${a.subscriptionPeriod}`)
  }
}
