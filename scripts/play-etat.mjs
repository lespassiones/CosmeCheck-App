/**
 * Etat des pistes Google Play, en LECTURE SEULE.
 *
 * Affiche pour com.cosmecheck.app : les abonnements, les quatre pistes avec leur
 * version diffusee, les binaires deposes, et l'etat de la fiche (langues, longueurs
 * de description, nombre de visuels).
 *
 * Ne modifie rien. L'API Play impose d'ouvrir une "edition" pour lire les pistes :
 * elle est supprimee dans un `finally`, y compris en cas d'erreur. Deux editions
 * ouvertes en meme temps se marchent dessus et Google refuse la seconde validation,
 * d'ou la fermeture systematique.
 *
 * Usage :  node scripts/play-etat.mjs
 * Requiert : ./play-service-account.json (gitignore, secret)
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const PKG = 'com.cosmecheck.app'
const KEY_PATH = path.resolve(process.cwd(), 'play-service-account.json')

if (!fs.existsSync(KEY_PATH)) {
  console.error(`Cle absente : ${KEY_PATH}`)
  process.exit(1)
}
const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'))

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Jeton OAuth : une assertion JWT signee localement, aucune dependance ajoutee. */
async function accessToken() {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${header}.${claim}`)
  const assertion = `${header}.${claim}.${b64url(signer.sign(key.private_key))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`jeton refuse : ${JSON.stringify(json)}`)
  return json.access_token
}

const token = await accessToken()
const H = { authorization: `Bearer ${token}` }
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`

async function get(url) {
  const res = await fetch(url, { headers: H })
  const text = await res.text()
  try {
    return { status: res.status, body: JSON.parse(text) }
  } catch {
    return { status: res.status, body: text }
  }
}

// ── Abonnements (pas besoin d'edition) ────────────────────────────────────────
const subs = await get(`${API}/subscriptions?pageSize=50`)
console.log('\nABONNEMENTS')
for (const s of subs.body?.subscriptions ?? []) {
  const plans = (s.basePlans ?? []).map((b) => `${b.basePlanId}:${b.state}`).join(', ')
  console.log(`  ${s.productId.padEnd(20)} ${plans}`)
}
if (!subs.body?.subscriptions) console.log(' ', JSON.stringify(subs.body))

// ── Pistes, binaires, fiche (edition temporaire) ──────────────────────────────
const created = await fetch(`${API}/edits`, { method: 'POST', headers: H })
const edit = await created.json()
if (!edit.id) {
  console.error('\nOuverture d edition refusee :', JSON.stringify(edit))
  process.exit(1)
}

try {
  const tracks = await get(`${API}/edits/${edit.id}/tracks`)
  console.log('\nPISTES')
  for (const t of tracks.body?.tracks ?? []) {
    const rel = t.releases?.[0]
    console.log(
      `  ${t.track.padEnd(12)} ${rel ? `${rel.name} [${rel.status}]` : '(vide)'}`,
    )
  }

  const bundles = await get(`${API}/edits/${edit.id}/bundles`)
  const codes = (bundles.body?.bundles ?? []).map((b) => b.versionCode)
  console.log(`\nBINAIRES  ${codes.length} deposes, du ${codes[0]} au ${codes.at(-1)}`)

  const listings = await get(`${API}/edits/${edit.id}/listings`)
  console.log('\nFICHE')
  for (const l of listings.body?.listings ?? []) {
    console.log(
      `  ${l.language}  "${l.title}"  courte ${(l.shortDescription || '').length} car.  longue ${(l.fullDescription || '').length} car.`,
    )
    for (const kind of [
      'phoneScreenshots',
      'sevenInchScreenshots',
      'tenInchScreenshots',
      'featureGraphic',
      'icon',
    ]) {
      const im = await get(`${API}/edits/${edit.id}/listings/${l.language}/${kind}`)
      if (im.status === 200) console.log(`    ${kind.padEnd(22)} ${(im.body?.images ?? []).length}`)
    }
  }

  const details = await get(`${API}/edits/${edit.id}/details`)
  console.log('\nCONTACTS', JSON.stringify(details.body))
} finally {
  await fetch(`${API}/edits/${edit.id}`, { method: 'DELETE', headers: H })
  console.log('\n(edition temporaire supprimee)')
}
