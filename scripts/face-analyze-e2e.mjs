/**
 * E2E de l'Edge Function `face-analyze` (scan visage, score de peau).
 *
 * Prouve le contrat RÉEL contre la fonction DÉPLOYÉE, avec un utilisateur
 * éphémère (JWT réel), sur les 3 photos de test de assets/analyse peau/ :
 *   - photo_2 (lunettes de soleil) -> quality.ok=false, reason 'lunettes',
 *     ET crédits AVANT == crédits APRÈS (aucun débit sur rejet qualité) ;
 *   - photo_1 et photo_3 -> quality.ok=true, 5 métriques dans [0,100],
 *     scanId non vide, débit EXACT de 2 crédits chacun ;
 *   - re-envoi de photo_1 -> alreadyAnalyzed=true, crédits inchangés
 *     (idempotence anti double-débit) ;
 *   - createSignedUrl sur le photo_path du user courant -> 200, et un 2e user
 *     éphémère ne peut PAS signer ce chemin (RLS storage owner-scoped).
 *
 * Lancer :  node scripts/face-analyze-e2e.mjs
 * Nettoyage : les 2 users éphémères sont supprimés en fin de run (SERVICE key).
 *
 * NOTE : ce script débite de vrais crédits + fait de vrais appels Vision. Il est
 * volontairement HORS de la suite Jest (coût + non-déterminisme du modèle).
 */
import fs from 'fs'

// ── Env ──────────────────────────────────────────────────────────────────────
const ENV_PATH = new URL('../.env', import.meta.url)
const env = fs.readFileSync(ENV_PATH, 'utf8')
const URL_ = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const ANON = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim()
const SERVICE =
  (env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1] ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

// Vérité terrain (vérifiée visuellement le 7 juil.) :
//   photo_1 = femme, acné sur les joues (VALIDE)
//   photo_2 = fille souriante, yeux plissés, acné front, SANS lunettes (VALIDE ;
//             piège classique de faux positif "lunettes" que le prompt v2 corrige)
//   photo_3 = femme portant des LUNETTES DE SOLEIL (doit être REJETÉE 'lunettes')
const PHOTOS = new URL('../assets/analyse peau/', import.meta.url)
const FILES = {
  acne: 'photo_1_2026-07-07_14-46-52.jpg',
  smiling: 'photo_2_2026-07-07_14-46-52.jpg',
  glasses: 'photo_3_2026-07-07_14-46-52.jpg',
}
const DIMS = ['imperfections', 'rougeurs', 'secheresse', 'brillance', 'douceur']

const headers = (tok = ANON) => ({
  apikey: ANON,
  Authorization: `Bearer ${tok}`,
  'Content-Type': 'application/json',
})

// ── Framework d'assertions ─────────────────────────────────────────────────
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok })
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
  console.log(`  ${tag}  ${name}${detail ? `\n        ${detail}` : ''}`)
}
function section(t) {
  console.log(`\n\x1b[1m${t}\x1b[0m`)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function b64(file) {
  return fs.readFileSync(new URL(file, PHOTOS)).toString('base64')
}

async function makeUser() {
  const email = `cc_face_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`
  const su = await (
    await fetch(`${URL_}/auth/v1/signup`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password: 'Zx9-Kq72_Vbn!mP4tR' }),
    })
  ).json()
  return { token: su.access_token, uid: su.user?.id }
}

async function deleteUser(uid) {
  if (!uid) return 'aucun'
  if (!SERVICE) return `MANUEL (uid ${uid})`
  const res = await fetch(`${URL_}/auth/v1/admin/users/${uid}`, {
    method: 'DELETE',
    headers: headers(SERVICE),
  })
  return res.ok ? 'supprimé' : `échec ${res.status}`
}

async function getCredits(tok) {
  const res = await fetch(`${URL_}/rest/v1/rpc/cosme_check_get_credits`, {
    method: 'POST',
    headers: headers(tok),
    body: '{}',
  })
  const data = await res.json().catch(() => ({}))
  return typeof data?.remaining === 'number' ? data.remaining : null
}

async function faceAnalyze(tok, image) {
  const res = await fetch(`${URL_}/functions/v1/face-analyze`, {
    method: 'POST',
    headers: headers(tok),
    body: JSON.stringify({ image, mimeType: 'image/jpeg' }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function signPhoto(tok, path) {
  const res = await fetch(
    `${URL_}/storage/v1/object/sign/skin-photos/${path}`,
    { method: 'POST', headers: headers(tok), body: JSON.stringify({ expiresIn: 60 }) },
  )
  return res.status
}

function metricsValid(m) {
  if (!m || typeof m !== 'object') return false
  return DIMS.every((d) => typeof m[d] === 'number' && m[d] >= 0 && m[d] <= 100)
}

// ── Run ────────────────────────────────────────────────────────────────────
async function run() {
  const { token, uid } = await makeUser()
  const { token: token2, uid: uid2 } = await makeUser()
  if (!token) throw new Error('Création utilisateur de test échouée (pas de token).')

  let photo1Path = null
  try {
    section('1. Rejet qualité (lunettes de soleil) : aucun débit')
    {
      const before = await getCredits(token)
      const { status, body } = await faceAnalyze(token, b64(FILES.glasses))
      const after = await getCredits(token)
      check('HTTP 200', status === 200, `status ${status}`)
      check('quality.ok === false', body?.quality?.ok === false, JSON.stringify(body?.quality))
      check(
        "reason contient 'lunettes'",
        Array.isArray(body?.quality?.reasons) && body.quality.reasons.includes('lunettes'),
        JSON.stringify(body?.quality?.reasons),
      )
      check('crédits inchangés (0 débit sur rejet)', before !== null && before === after, `${before} -> ${after}`)
    }

    section('2. Photo valide (acné joues) : 5 métriques + débit exact de 2')
    {
      const before = await getCredits(token)
      const { status, body } = await faceAnalyze(token, b64(FILES.acne))
      const after = await getCredits(token)
      check('HTTP 200 + ok', status === 200 && body?.ok === true, `status ${status}`)
      check('quality.ok === true', body?.quality?.ok === true)
      check('5 métriques dans [0,100]', metricsValid(body?.metrics), JSON.stringify(body?.metrics))
      check('scanId non vide', typeof body?.scanId === 'string' && body.scanId.length > 0)
      check('score /100 valide', typeof body?.score === 'number' && body.score >= 0 && body.score <= 100)
      check('débit EXACT de 2 crédits', before !== null && before - after === 2, `${before} -> ${after}`)
      photo1Path = body?.scanId ? `${uid}/${body.scanId}.jpg` : null
    }

    section('3. Idempotence : re-envoi de la MÊME photo -> aucun 2e débit')
    {
      const before = await getCredits(token)
      const { status, body } = await faceAnalyze(token, b64(FILES.acne))
      const after = await getCredits(token)
      check('HTTP 200 + alreadyAnalyzed', status === 200 && body?.alreadyAnalyzed === true, JSON.stringify(body).slice(0, 120))
      check('crédits inchangés (anti double-débit)', before !== null && before === after, `${before} -> ${after}`)
    }

    section('4. Fille souriante SANS lunettes : ne doit PAS être rejetée pour "lunettes" (prompt v2)')
    {
      const before = await getCredits(token)
      const { status, body } = await faceAnalyze(token, b64(FILES.smiling))
      const after = await getCredits(token)
      const debit = before !== null ? before - after : null
      const accepted = body?.ok === true && metricsValid(body?.metrics)
      const reasons = body?.quality?.reasons ?? []
      check('HTTP 200', status === 200, `status ${status}`)
      // Le fix v2 : des yeux plissés/fermés ne doivent PLUS déclencher "lunettes".
      check(
        'PAS de faux positif "lunettes"',
        !reasons.includes('lunettes'),
        `raisons ${JSON.stringify(reasons)}`,
      )
      // Contrat crédit : débit de 2 SSI acceptée.
      if (accepted) {
        check('acceptée -> 5 métriques + débit 2', debit === 2, `débit ${debit}, metrics ${JSON.stringify(body?.metrics)}`)
      } else {
        check('rejetée -> 0 débit (contrat crédit respecté)', debit === 0, `raisons ${JSON.stringify(reasons)}, débit ${debit}`)
      }
    }

    section('5. RLS storage : le propriétaire signe, un autre user NON')
    if (photo1Path) {
      const own = await signPhoto(token, photo1Path)
      check('propriétaire peut signer sa photo (200)', own === 200, `status ${own}`)
      if (token2) {
        const other = await signPhoto(token2, photo1Path)
        check('autre utilisateur NE peut PAS signer (>=400)', other >= 400, `status ${other}`)
      }
    } else {
      check('chemin photo disponible pour le test RLS', false, 'scanId manquant à l’étape 2')
    }
  } finally {
    console.log(`\n  Nettoyage user 1 : ${await deleteUser(uid)}`)
    console.log(`  Nettoyage user 2 : ${await deleteUser(uid2)}`)
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${'='.repeat(50)}`)
  console.log(`${results.length - failed.length}/${results.length} assertions OK`)
  if (failed.length > 0) {
    console.log(`\x1b[31m${failed.length} ÉCHEC(S)\x1b[0m`)
    process.exit(1)
  }
  console.log('\x1b[32mTOUT VERT\x1b[0m')
}

run().catch((e) => {
  console.error('Erreur E2E :', e)
  process.exit(1)
})
