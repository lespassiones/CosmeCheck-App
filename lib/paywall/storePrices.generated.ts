/**
 * Table de prix de repli, GÉNÉRÉE depuis l'API App Store Connect.
 *
 * Pourquoi elle existe : le 04/09/2026, un iPhone affichait « … » à la place
 * des deux prix, badge d'économie et essai gratuit absents, bouton figé sur un
 * spinner. Le magasin n'avait pas répondu et le paywall n'avait rien à montrer.
 * Un écran d'abonnement sans prix ne vend rien, et un vérificateur d'Apple qui
 * le voit refuse la build (règle 3.1.2 : prix lisible avant l'achat).
 *
 * Ce que cette table n'est PAS : une source de vérité pour encaisser. Le prix
 * qui compte reste celui de la feuille de paiement, et lui vient de StoreKit.
 * Ces chiffres servent UNIQUEMENT à afficher un ordre de grandeur juste quand
 * le magasin est muet ; l'écran doit alors le dire (« prix indicatif ») et
 * proposer de réessayer, jamais faire croire à un achat possible.
 *
 * Source : GET /v1/subscriptions/{id}/prices sur les deux abonnements du groupe
 * « Cosme Check Premium » (premium_yearly, premium_monthly), 175 territoires.
 * Relevé du 2026-09-04.
 *
 * À RÉGÉNÉRER à chaque changement de tarif dans App Store Connect, sinon
 * l'écran affichera un ancien prix les jours où le magasin ne répond pas.
 * Procédure : `node scripts/fetch_appstore_prices.js`.
 *
 * Forme : `[annuel, mensuel]` dans la devise du territoire. Apple n'applique
 * qu'un palier par devise, sauf USD (3 paliers) et EUR (2), d'où les
 * dérogations par région plus bas.
 */

/** Date du relevé, vérifiable en revue. */
export const FALLBACK_PRICES_ASOF = '2026-09-04'

/** Nombre de territoires couverts par le relevé. */
export const FALLBACK_PRICES_TERRITORIES = 175

/** Palier dominant de chaque devise : `[annuel, mensuel]`. */
export const PRICES_BY_CURRENCY: Record<string, readonly [number, number]> = {
  AED: [199.99, 34.99],
  AUD: [79.99, 14.99],
  BRL: [299.9, 59.9],
  CAD: [69.99, 11.99],
  CHF: [40, 8],
  CLP: [59990, 9990],
  CNY: [328, 58],
  COP: [229900, 39900],
  CZK: [1290, 249],
  DKK: [399, 79],
  EGP: [2499.99, 499.99],
  EUR: [59.99, 9.99],
  GBP: [49.99, 8.99],
  HKD: [388, 68],
  HUF: [22990, 3990],
  IDR: [799000, 149000],
  ILS: [179.9, 29.9],
  INR: [4999, 999],
  JPY: [8000, 1500],
  KRW: [77000, 15000],
  KZT: [29990, 4990],
  MXN: [999, 199],
  MYR: [229.9, 39.9],
  NGN: [79900, 14900],
  NOK: [599, 99],
  NZD: [99.99, 14.99],
  PEN: [229.9, 39.9],
  PHP: [2990, 599],
  PKR: [12900, 2500],
  PLN: [229.99, 39.99],
  QAR: [199.99, 29.99],
  RON: [299.99, 49.99],
  RUB: [4490, 799],
  SAR: [199.99, 39.99],
  SEK: [599, 119],
  SGD: [69.98, 12.98],
  THB: [1990, 299],
  TRY: [2499.99, 499.99],
  TWD: [1490, 290],
  TZS: [149900, 24900],
  USD: [49.99, 8.99],
  VND: [1499000, 299000],
  ZAR: [999.99, 199.99],
}

/**
 * Dérogations par région (ISO 3166-1 alpha-2), pour les devises où Apple
 * applique plusieurs paliers : `[annuel, mensuel, devise]`.
 *
 * Exemple : le Monténégro paie en euros, mais un palier sous la zone euro, et
 * l'Ukraine paie en dollars un palier au-dessus des États-Unis.
 */
export const PRICES_BY_REGION: Record<string, readonly [number, number, string]> = {
  AL: [59.99, 9.99, 'USD'],
  AM: [59.99, 9.99, 'USD'],
  AZ: [59.99, 9.99, 'USD'],
  BB: [59.99, 9.99, 'USD'],
  BH: [49.99, 9.99, 'USD'],
  BJ: [59.99, 9.99, 'USD'],
  BS: [49.99, 9.99, 'USD'],
  BY: [59.99, 9.99, 'USD'],
  CI: [59.99, 9.99, 'USD'],
  CM: [59.99, 9.99, 'USD'],
  GE: [59.99, 9.99, 'USD'],
  GH: [59.99, 9.99, 'USD'],
  IS: [59.99, 9.99, 'USD'],
  KE: [59.99, 9.99, 'USD'],
  KG: [49.99, 9.99, 'USD'],
  KH: [49.99, 9.99, 'USD'],
  LA: [49.99, 9.99, 'USD'],
  MD: [59.99, 9.99, 'USD'],
  ME: [49.99, 7.99, 'EUR'],
  MU: [59.99, 9.99, 'USD'],
  NP: [59.99, 9.99, 'USD'],
  SN: [59.99, 9.99, 'USD'],
  SR: [49.99, 9.99, 'USD'],
  TJ: [49.99, 9.99, 'USD'],
  UA: [59.99, 9.99, 'USD'],
  UG: [59.99, 9.99, 'USD'],
  UZ: [49.99, 9.99, 'USD'],
  ZM: [59.99, 9.99, 'USD'],
  ZW: [59.99, 9.99, 'USD'],
}

/**
 * Devise servie quand ni la région ni la devise de l'appareil ne sont connues.
 * Le dollar est le palier « reste du monde » d'Apple, celui du plus grand
 * nombre de territoires, dont les États-Unis.
 */
export const DEFAULT_CURRENCY = 'USD'
