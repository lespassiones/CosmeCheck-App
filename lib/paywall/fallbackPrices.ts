/**
 * Prix de repli : ce qu'on affiche quand le magasin ne répond pas.
 *
 * Le paywall ne lit normalement QUE le magasin (`lib/paywall/prices.ts`), et
 * c'est la bonne règle : le prix affiché doit être celui qui sera débité. Mais
 * quand StoreKit ou la configuration RevenueCat reste muette, l'écran n'avait
 * plus rien à montrer : deux « … », pas de badge d'économie, pas d'essai, et un
 * bouton figé. Personne n'achète un abonnement dont le prix est un tiret.
 *
 * Ce module comble ce trou avec les tarifs réels relevés dans App Store Connect
 * (`storePrices.generated.ts`), choisis d'après la RÉGION et la DEVISE que
 * l'appareil déclare déjà. Aucune géolocalisation, aucune permission : la
 * région du compte magasin (`Purchases.getStorefront`) puis, à défaut, les
 * réglages de langue et de devise de l'iPhone.
 *
 * ⚠️ Limite à ne jamais oublier : un prix de repli ne permet PAS d'encaisser.
 * Un achat exige un produit StoreKit, et si le magasin ne l'a pas fourni, il
 * n'y a rien à acheter. L'appelant doit donc marquer ces prix comme indicatifs
 * et proposer de réessayer, pas de payer. Voir `PriceSource` dans
 * `hooks/usePurchases.ts`.
 */

import type { PackageLike, PlanId, ProductLike } from './prices'
import {
  DEFAULT_CURRENCY,
  PRICES_BY_CURRENCY,
  PRICES_BY_REGION,
} from './storePrices.generated'

/** Ce que l'appareil sait de lui-même, sans rien demander à personne. */
export interface DeviceStoreContext {
  /** Pays du compte magasin ou de l'appareil, ISO 3166-1 alpha-2 (« FR »). */
  regionCode?: string | null
  /** Devise des réglages de l'appareil (« EUR »). */
  currencyCode?: string | null
  /** Locale d'affichage pour le formatage. L'app est en français. */
  locale?: string
}

/** D'où vient le palier retenu. Utile en debug et dans les tests. */
export type FallbackBasis = 'region' | 'currency' | 'default'

export interface FallbackTier {
  yearly: number
  monthly: number
  currency: string
  basis: FallbackBasis
}

/**
 * Choisit le palier tarifaire.
 *
 * Ordre : la région d'abord, car c'est la seule information qui tranche entre
 * les paliers d'une même devise (Apple facture l'Ukraine en dollars, mais un
 * cran au-dessus des États-Unis). Puis la devise, qui suffit pour 41 des 43
 * devises. Puis le dollar, palier « reste du monde » d'Apple.
 */
export function resolveFallbackTier(ctx: DeviceStoreContext): FallbackTier {
  const region = ctx.regionCode?.trim().toUpperCase()
  if (region) {
    const override = PRICES_BY_REGION[region]
    if (override) {
      return { yearly: override[0], monthly: override[1], currency: override[2], basis: 'region' }
    }
  }

  const currency = ctx.currencyCode?.trim().toUpperCase()
  if (currency) {
    const tier = PRICES_BY_CURRENCY[currency]
    if (tier) {
      return { yearly: tier[0], monthly: tier[1], currency, basis: 'currency' }
    }
  }

  const dflt = PRICES_BY_CURRENCY[DEFAULT_CURRENCY]
  return { yearly: dflt[0], monthly: dflt[1], currency: DEFAULT_CURRENCY, basis: 'default' }
}

/**
 * Formate un montant comme le magasin le ferait.
 *
 * `Intl` existe sur Hermes, mais on ne parie pas dessus : sans lui on rend
 * « 59.99 EUR », moins joli qu'un prix du magasin et parfaitement lisible. Rien
 * ne justifie de retomber sur un tiret alors qu'on connaît le montant.
 */
export function formatFallbackPrice(value: number, currency: string, locale = 'fr-FR'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
  } catch {
    return `${value} ${currency}`
  }
}

/**
 * Fabrique un package de la même forme que celui du magasin, pour que
 * l'affichage (`planPriceLabel`, `annualPerMonthLabel`, `savingsPercent`) ne
 * connaisse qu'un seul chemin de code.
 *
 * `introPrice` reste à `null` VOLONTAIREMENT : l'essai gratuit de 3 jours existe
 * bien sur les 175 territoires, mais son éligibilité dépend de la personne, et
 * seul le magasin la connaît. Un ancien abonné n'y a pas droit. Promettre un
 * essai qu'on ne peut pas vérifier serait un mensonge, et exactement le genre
 * de détail qu'un vérificateur d'Apple teste avec un compte déjà abonné.
 */
export function buildFallbackPackage(plan: PlanId, ctx: DeviceStoreContext = {}): PackageLike {
  const tier = resolveFallbackTier(ctx)
  const locale = ctx.locale ?? 'fr-FR'
  const price = plan === 'yearly' ? tier.yearly : tier.monthly

  const product: ProductLike = {
    price,
    priceString: formatFallbackPrice(price, tier.currency, locale),
    currencyCode: tier.currency,
    pricePerMonth: plan === 'yearly' ? price / 12 : price,
    pricePerMonthString:
      plan === 'yearly' ? formatFallbackPrice(price / 12, tier.currency, locale) : null,
    introPrice: null,
  }

  return {
    identifier: plan === 'yearly' ? 'fallback_annual' : 'fallback_monthly',
    packageType: plan === 'yearly' ? 'ANNUAL' : 'MONTHLY',
    product,
  }
}

/** Les deux plans d'un coup, dans la même devise donc comparables. */
export function buildFallbackPlans(ctx: DeviceStoreContext = {}): {
  monthly: PackageLike
  yearly: PackageLike
  tier: FallbackTier
} {
  return {
    monthly: buildFallbackPackage('monthly', ctx),
    yearly: buildFallbackPackage('yearly', ctx),
    tier: resolveFallbackTier(ctx),
  }
}
