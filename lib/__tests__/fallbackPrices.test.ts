/**
 * Prix de repli du paywall.
 *
 * Ce que ces tests protègent : le jour où le magasin ne répond pas, l'écran
 * doit montrer un tarif JUSTE pour la région de la personne. Se tromper de
 * palier revient à annoncer un prix que personne ne paiera, ce qui est le bug
 * même qu'on cherchait à supprimer en retirant les prix en dur du JSX.
 */

import {
  buildFallbackPackage,
  buildFallbackPlans,
  formatFallbackPrice,
  resolveFallbackTier,
} from '@/lib/paywall/fallbackPrices'
import {
  FALLBACK_PRICES_TERRITORIES,
  PRICES_BY_CURRENCY,
  PRICES_BY_REGION,
} from '@/lib/paywall/storePrices.generated'
import { annualPerMonthLabel, planPriceLabel, savingsPercent, trialLabel } from '@/lib/paywall/prices'

describe('table générée', () => {
  it('couvre les 43 devises et les 29 dérogations du relevé', () => {
    expect(Object.keys(PRICES_BY_CURRENCY)).toHaveLength(43)
    expect(Object.keys(PRICES_BY_REGION)).toHaveLength(29)
    expect(FALLBACK_PRICES_TERRITORIES).toBe(175)
  })

  it('annonce toujours un annuel moins cher que douze mensuels', () => {
    // Sinon le badge « ÉCONOMISE » afficherait une économie négative, ou
    // disparaîtrait alors que le plan annuel est mis en avant.
    for (const [currency, [yearly, monthly]] of Object.entries(PRICES_BY_CURRENCY)) {
      expect(yearly).toBeLessThan(monthly * 12)
      expect(currency).toMatch(/^[A-Z]{3}$/)
    }
    for (const [region, [yearly, monthly, currency]] of Object.entries(PRICES_BY_REGION)) {
      expect(yearly).toBeLessThan(monthly * 12)
      expect(region).toMatch(/^[A-Z]{2}$/)
      expect(currency).toMatch(/^[A-Z]{3}$/)
    }
  })
})

describe('resolveFallbackTier', () => {
  it('sert le palier de la zone euro à un iPhone français', () => {
    const tier = resolveFallbackTier({ regionCode: 'FR', currencyCode: 'EUR' })
    expect(tier).toEqual({ yearly: 59.99, monthly: 9.99, currency: 'EUR', basis: 'currency' })
  })

  it('fait gagner la région quand elle contredit le palier de la devise', () => {
    // L'Ukraine paie en dollars, mais un cran AU-DESSUS des États-Unis. C'est
    // tout l'intérêt des dérogations : la devise seule donnerait 49,99 $.
    expect(resolveFallbackTier({ regionCode: 'UA', currencyCode: 'USD' })).toEqual({
      yearly: 59.99,
      monthly: 9.99,
      currency: 'USD',
      basis: 'region',
    })
    // Le Monténégro paie en euros, un palier SOUS la zone euro.
    expect(resolveFallbackTier({ regionCode: 'ME', currencyCode: 'EUR' })).toEqual({
      yearly: 49.99,
      monthly: 7.99,
      currency: 'EUR',
      basis: 'region',
    })
  })

  it('sert le palier dollar aux États-Unis, pas celui de la zone euro', () => {
    expect(resolveFallbackTier({ regionCode: 'US', currencyCode: 'USD' })).toEqual({
      yearly: 49.99,
      monthly: 8.99,
      currency: 'USD',
      basis: 'currency',
    })
  })

  it('tolère une casse et des espaces inattendus', () => {
    // `regionCode` vient des réglages système : on ne parie pas sur sa forme.
    expect(resolveFallbackTier({ regionCode: ' ua ', currencyCode: 'usd' }).basis).toBe('region')
    expect(resolveFallbackTier({ currencyCode: ' jpy ' })).toEqual({
      yearly: 8000,
      monthly: 1500,
      currency: 'JPY',
      basis: 'currency',
    })
  })

  it('retombe sur le dollar quand l appareil ne dit rien', () => {
    // Le pire cas doit rester un prix, jamais un tiret : c'est la raison d'être
    // du module.
    expect(resolveFallbackTier({})).toEqual({
      yearly: 49.99,
      monthly: 8.99,
      currency: 'USD',
      basis: 'default',
    })
    expect(resolveFallbackTier({ regionCode: null, currencyCode: null }).basis).toBe('default')
  })

  it('ignore une devise inconnue de la table plutôt que de deviner', () => {
    // Une devise qu'Apple ne facture pas (crypto, devise obsolète) ne doit pas
    // produire un prix au hasard : on sert le palier « reste du monde ».
    expect(resolveFallbackTier({ currencyCode: 'XBT' }).basis).toBe('default')
  })
})

describe('formatFallbackPrice', () => {
  it('formate à la française', () => {
    const s = formatFallbackPrice(59.99, 'EUR', 'fr-FR')
    expect(s).toContain('59,99')
    expect(s).toContain('€')
  })

  it('rend un montant lisible même si Intl explose', () => {
    // Sans ce garde-fou, un environnement sans Intl ramènerait le tiret que
    // tout ce module existe pour éviter.
    const intl = global.Intl
    // @ts-expect-error on retire volontairement Intl pour le test
    global.Intl = undefined
    try {
      expect(formatFallbackPrice(59.99, 'EUR')).toBe('59.99 EUR')
    } finally {
      global.Intl = intl
    }
  })
})

describe('buildFallbackPackage', () => {
  it('produit la forme attendue par l affichage du paywall', () => {
    // L'intérêt est là : les helpers d'affichage ne connaissent qu'un chemin de
    // code, qu'ils lisent un package du magasin ou un package de repli.
    const yearly = buildFallbackPackage('yearly', { regionCode: 'FR', currencyCode: 'EUR' })
    expect(yearly.packageType).toBe('ANNUAL')
    expect(planPriceLabel(yearly)).toContain('59,99')
    expect(annualPerMonthLabel(yearly)).toContain('5,00')
  })

  it('ne promet JAMAIS d essai gratuit', () => {
    // L'essai de 3 jours existe bien sur les 175 territoires, mais son
    // éligibilité est propre à chaque compte et seul le magasin la connaît. Un
    // ancien abonné n'y a pas droit, et Apple teste ce cas.
    const monthly = buildFallbackPackage('monthly', { regionCode: 'FR' })
    expect(monthly.product.introPrice).toBeNull()
    expect(trialLabel(monthly)).toBeNull()
  })

  it('mensualise l annuel sans jamais le confondre avec le mensuel', () => {
    const monthly = buildFallbackPackage('monthly', { currencyCode: 'EUR' })
    expect(monthly.product.price).toBe(9.99)
    expect(monthly.product.pricePerMonth).toBe(9.99)
  })
})

describe('buildFallbackPlans', () => {
  it('donne deux plans comparables, donc un badge d économie calculable', () => {
    const plans = buildFallbackPlans({ regionCode: 'FR', currencyCode: 'EUR' })
    expect(plans.monthly.product.currencyCode).toBe(plans.yearly.product.currencyCode)
    // 59,99 contre 119,88 : la moitié, exactement ce que montrait l'écran qui
    // fonctionnait.
    expect(savingsPercent(plans.monthly, plans.yearly)).toBe(50)
  })

  it('reste cohérent dans une devise sans décimales', () => {
    const plans = buildFallbackPlans({ regionCode: 'JP', currencyCode: 'JPY' })
    expect(plans.yearly.product.price).toBe(8000)
    expect(savingsPercent(plans.monthly, plans.yearly)).toBe(56)
  })
})
