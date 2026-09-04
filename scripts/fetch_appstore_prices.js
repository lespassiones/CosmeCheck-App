#!/usr/bin/env node
/**
 * Régénère `lib/paywall/storePrices.generated.ts` depuis App Store Connect.
 *
 * À lancer après tout changement de tarif dans App Store Connect, sinon le
 * paywall affichera un ancien prix les jours où le magasin ne répond pas.
 *
 *   node scripts/fetch_appstore_prices.js
 *
 * Lit la clé API déjà présente pour `eas submit` (`AuthKey_*.p8` + les
 * identifiants de `eas.json`). Aucune écriture côté Apple : uniquement des GET.
 *
 * Ce que le script fait :
 *   1. trouve les abonnements du groupe premium de l'app ;
 *   2. lit le prix client de chaque territoire (175 au dernier relevé) ;
 *   3. réduit ça à un palier dominant par devise, plus des dérogations par
 *      région pour les devises où Apple applique plusieurs paliers (USD, EUR) ;
 *   4. écrit le module TypeScript.
 *
 * Si une nouvelle région apparaît dans une devise à plusieurs paliers, le
 * script s'arrête en demandant d'ajouter sa correspondance alpha-3 vers
 * alpha-2 dans `ALPHA2` : mieux vaut échouer que produire une table trouée.
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'lib/paywall/storePrices.generated.ts')

/** Identifiants de la clé App Store Connect, tels que `eas.json` les déclare. */
function ascCredentials() {
  const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'))
  const ios = eas.submit?.production?.ios
  if (!ios) throw new Error('eas.json : submit.production.ios introuvable')
  return {
    keyId: ios.ascApiKeyId,
    issuerId: ios.ascApiKeyIssuerId,
    appId: ios.ascAppId,
    keyPath: path.join(ROOT, ios.ascApiKeyPath),
  }
}

/** Jeton ES256, valable 15 minutes, comme l'exige l'API. */
function makeToken({ keyId, issuerId, keyPath }) {
  const pem = fs.readFileSync(keyPath, 'utf8')
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const header = b64({ alg: 'ES256', kid: keyId, typ: 'JWT' })
  const payload = b64({ iss: issuerId, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })
  const signature = crypto
    .sign('sha256', Buffer.from(`${header}.${payload}`), { key: pem, dsaEncoding: 'ieee-p1363' })
    .toString('base64url')
  return `${header}.${payload}.${signature}`
}

async function api(token, urlOrPath) {
  const url = urlOrPath.startsWith('http')
    ? urlOrPath
    : `https://api.appstoreconnect.apple.com${urlOrPath}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} sur ${url}\n${text.slice(0, 400)}`)
  return JSON.parse(text)
}

/**
 * Correspondances ISO alpha-3 vers alpha-2, limitées aux régions qui ont besoin
 * d'une dérogation. `expo-localization` rend de l'alpha-2, l'API d'Apple de
 * l'alpha-3, d'où cette table. À compléter si le script le réclame.
 */
const ALPHA2 = {
  ALB: 'AL', ARM: 'AM', AZE: 'AZ', BRB: 'BB', BEN: 'BJ', BLR: 'BY', CIV: 'CI',
  CMR: 'CM', GEO: 'GE', GHA: 'GH', ISL: 'IS', KEN: 'KE', MDA: 'MD', MUS: 'MU',
  NPL: 'NP', SEN: 'SN', UKR: 'UA', UGA: 'UG', ZMB: 'ZM', ZWE: 'ZW', BHR: 'BH',
  BHS: 'BS', KGZ: 'KG', KHM: 'KH', LAO: 'LA', SUR: 'SR', TJK: 'TJ', UZB: 'UZ',
  MNE: 'ME',
}

/** Tous les prix d'un abonnement, territoire par territoire. */
async function fetchPrices(token, subscriptionId) {
  let next = `/v1/subscriptions/${subscriptionId}/prices?include=subscriptionPricePoint,territory&limit=200`
  const rows = []
  while (next) {
    const page = await api(token, next)
    const included = new Map((page.included ?? []).map((i) => [`${i.type}:${i.id}`, i]))
    for (const item of page.data ?? []) {
      const pointId = item.relationships?.subscriptionPricePoint?.data?.id
      const territoryId = item.relationships?.territory?.data?.id
      const point = included.get(`subscriptionPricePoints:${pointId}`)
      const territory = included.get(`territories:${territoryId}`)
      rows.push({
        territory: territoryId,
        price: Number(point?.attributes?.customerPrice),
        currency: territory?.attributes?.currency,
      })
    }
    next = page.links?.next ?? null
  }
  return rows
}

function tsFile({ currencyLines, regionLines, territories, asof }) {
  return [
    '/**',
    " * Table de prix de repli, GÉNÉRÉE depuis l'API App Store Connect.",
    ' *',
    " * Pourquoi elle existe : le 04/09/2026, un iPhone affichait « … » à la place",
    " * des deux prix, badge d'économie et essai gratuit absents, bouton figé sur un",
    " * spinner. Le magasin n'avait pas répondu et le paywall n'avait rien à montrer.",
    " * Un écran d'abonnement sans prix ne vend rien, et un vérificateur d'Apple qui",
    ' * le voit refuse la build (règle 3.1.2 : prix lisible avant l\'achat).',
    ' *',
    " * Ce que cette table n'est PAS : une source de vérité pour encaisser. Le prix",
    ' * qui compte reste celui de la feuille de paiement, et lui vient de StoreKit.',
    ' * Ces chiffres servent UNIQUEMENT à afficher un ordre de grandeur juste quand',
    " * le magasin est muet ; l'écran doit alors le dire (« prix indicatif ») et",
    ' * proposer de réessayer, jamais faire croire à un achat possible.',
    ' *',
    ' * Source : GET /v1/subscriptions/{id}/prices sur les deux abonnements du groupe',
    ' * « Cosme Check Premium » (premium_yearly, premium_monthly), ' + territories + ' territoires.',
    ' * Relevé du ' + asof + '.',
    ' *',
    ' * À RÉGÉNÉRER à chaque changement de tarif dans App Store Connect, sinon',
    " * l'écran affichera un ancien prix les jours où le magasin ne répond pas.",
    ' * Procédure : `node scripts/fetch_appstore_prices.js`.',
    ' *',
    " * Forme : `[annuel, mensuel]` dans la devise du territoire. Apple n'applique",
    " * qu'un palier par devise, sauf USD (3 paliers) et EUR (2), d'où les",
    ' * dérogations par région plus bas.',
    ' */',
    '',
    '/** Date du relevé, vérifiable en revue. */',
    `export const FALLBACK_PRICES_ASOF = '${asof}'`,
    '',
    '/** Nombre de territoires couverts par le relevé. */',
    `export const FALLBACK_PRICES_TERRITORIES = ${territories}`,
    '',
    '/** Palier dominant de chaque devise : `[annuel, mensuel]`. */',
    'export const PRICES_BY_CURRENCY: Record<string, readonly [number, number]> = {',
    currencyLines,
    '}',
    '',
    '/**',
    ' * Dérogations par région (ISO 3166-1 alpha-2), pour les devises où Apple',
    ' * applique plusieurs paliers : `[annuel, mensuel, devise]`.',
    ' *',
    ' * Exemple : le Monténégro paie en euros, mais un palier sous la zone euro, et',
    " * l'Ukraine paie en dollars un palier au-dessus des États-Unis.",
    ' */',
    'export const PRICES_BY_REGION: Record<string, readonly [number, number, string]> = {',
    regionLines,
    '}',
    '',
    '/**',
    ' * Devise servie quand ni la région ni la devise de l\'appareil ne sont connues.',
    ' * Le dollar est le palier « reste du monde » d\'Apple, celui du plus grand',
    ' * nombre de territoires, dont les États-Unis.',
    ' */',
    "export const DEFAULT_CURRENCY = 'USD'",
    '',
  ].join('\n')
}

async function main() {
  const creds = ascCredentials()
  const token = makeToken(creds)

  // 1. Les deux abonnements du groupe premium.
  const groups = await api(token, `/v1/apps/${creds.appId}/subscriptionGroups?limit=10`)
  const subs = {}
  for (const group of groups.data ?? []) {
    const page = await api(token, `/v1/subscriptionGroups/${group.id}/subscriptions?limit=20`)
    for (const sub of page.data ?? []) {
      const productId = sub.attributes?.productId
      if (productId === 'premium_yearly') subs.yearly = sub.id
      if (productId === 'premium_monthly') subs.monthly = sub.id
    }
  }
  if (!subs.yearly || !subs.monthly) {
    throw new Error('Abonnements premium_yearly / premium_monthly introuvables')
  }

  // 2. Les prix par territoire.
  const yearly = new Map((await fetchPrices(token, subs.yearly)).map((r) => [r.territory, r]))
  const monthly = new Map((await fetchPrices(token, subs.monthly)).map((r) => [r.territory, r]))

  // 3. Regroupement par devise puis par palier.
  const byCurrency = new Map()
  for (const [territory, y] of yearly) {
    const m = monthly.get(territory)
    if (!m) throw new Error(`Pas de prix mensuel pour ${territory}`)
    const tier = `${y.price}|${m.price}`
    if (!byCurrency.has(y.currency)) byCurrency.set(y.currency, new Map())
    const tiers = byCurrency.get(y.currency)
    if (!tiers.has(tier)) tiers.set(tier, [])
    tiers.get(tier).push(territory)
  }

  const dominant = {}
  const overrides = {}
  const manquants = []
  for (const [currency, tiers] of byCurrency) {
    const sorted = [...tiers].sort((a, b) => b[1].length - a[1].length)
    dominant[currency] = sorted[0][0].split('|').map(Number)
    for (const [tier, territories] of sorted.slice(1)) {
      for (const territory of territories) {
        const alpha2 = ALPHA2[territory]
        if (!alpha2) {
          manquants.push(territory)
          continue
        }
        overrides[alpha2] = [...tier.split('|').map(Number), currency]
      }
    }
  }
  if (manquants.length > 0) {
    throw new Error(
      `Correspondance alpha-3 vers alpha-2 manquante pour : ${manquants.join(', ')}.\n` +
        'Ajoute-les dans ALPHA2 de ce script, sinon la table de repli aurait un trou.',
    )
  }

  // 4. Écriture.
  const currencyLines = Object.keys(dominant)
    .sort()
    .map((c) => `  ${c}: [${dominant[c][0]}, ${dominant[c][1]}],`)
    .join('\n')
  const regionLines = Object.keys(overrides)
    .sort()
    .map((r) => `  ${r}: [${overrides[r][0]}, ${overrides[r][1]}, '${overrides[r][2]}'],`)
    .join('\n')

  fs.writeFileSync(
    OUT,
    tsFile({
      currencyLines,
      regionLines,
      territories: yearly.size,
      asof: new Date().toISOString().slice(0, 10),
    }),
  )

  console.log(
    `${OUT} écrit : ${yearly.size} territoires, ` +
      `${Object.keys(dominant).length} devises, ${Object.keys(overrides).length} dérogations.`,
  )
  console.log('Pense à relancer : npx jest lib/__tests__/fallbackPrices.test.ts')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
