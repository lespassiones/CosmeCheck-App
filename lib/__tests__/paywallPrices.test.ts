/**
 * Prix du paywall : on éprouve la dérivation depuis le magasin.
 *
 * Le défaut d'origine, trouvé le 20/08/2026 : l'app affichait 7,99 EUR et
 * 49,99 EUR en dur pendant que Google Play encaissait 9,49 EUR et 59,99 EUR.
 * Les valeurs des tests sont donc les VRAIES, relevées par l'API Play.
 */

import {
  annualPerMonthLabel,
  findPlanPackage,
  planPriceLabel,
  renewLine,
  savingsPercent,
  type PackageLike,
} from '@/lib/paywall/prices'

const monthly: PackageLike = {
  identifier: '$rc_monthly',
  packageType: 'MONTHLY',
  product: { price: 9.49, priceString: '9,49 €', currencyCode: 'EUR' },
}

const yearly: PackageLike = {
  identifier: '$rc_annual',
  packageType: 'ANNUAL',
  product: {
    price: 59.99,
    priceString: '59,99 €',
    pricePerMonthString: '5,00 €',
    pricePerMonth: 4.999,
    currencyCode: 'EUR',
  },
}

describe('findPlanPackage', () => {
  it('trouve par packageType', () => {
    expect(findPlanPackage([monthly, yearly], 'yearly')).toBe(yearly)
    expect(findPlanPackage([monthly, yearly], 'monthly')).toBe(monthly)
  })

  it('se rabat sur l identifiant quand le type est inconnu', () => {
    const pkgs: PackageLike[] = [
      { ...monthly, packageType: 'CUSTOM', identifier: 'premium_mensuel' },
      { ...yearly, packageType: 'CUSTOM', identifier: 'premium_annuel' },
    ]
    expect(findPlanPackage(pkgs, 'yearly')?.identifier).toBe('premium_annuel')
    expect(findPlanPackage(pkgs, 'monthly')?.identifier).toBe('premium_mensuel')
  })

  it('reconnait aussi "year" et "month" en anglais', () => {
    const pkgs: PackageLike[] = [
      { ...monthly, packageType: 'CUSTOM', identifier: 'one_month' },
      { ...yearly, packageType: 'CUSTOM', identifier: 'one_year' },
    ]
    expect(findPlanPackage(pkgs, 'yearly')?.identifier).toBe('one_year')
    expect(findPlanPackage(pkgs, 'monthly')?.identifier).toBe('one_month')
  })

  it('ne rend RIEN plutot que le premier package venu', () => {
    // Le coeur du correctif : jamais debiter pour un plan non affiche.
    const pkgs: PackageLike[] = [{ ...monthly, packageType: 'WEEKLY', identifier: 'hebdo' }]
    expect(findPlanPackage(pkgs, 'yearly')).toBeNull()
    expect(findPlanPackage([], 'monthly')).toBeNull()
  })
})

describe('planPriceLabel', () => {
  it('rend le prix formate par le magasin', () => {
    expect(planPriceLabel(yearly)).toBe('59,99 €')
    expect(planPriceLabel(monthly)).toBe('9,49 €')
  })

  it('rend null sans package, sans prix, ou sur une chaine vide', () => {
    expect(planPriceLabel(null)).toBeNull()
    expect(planPriceLabel(undefined)).toBeNull()
    expect(planPriceLabel({ ...yearly, product: { price: 0, priceString: '   ' } })).toBeNull()
  })
})

describe('annualPerMonthLabel', () => {
  it('prefere la chaine fournie par le magasin', () => {
    expect(annualPerMonthLabel(yearly)).toBe('5,00 €')
  })

  it('calcule depuis pricePerMonth quand la chaine manque', () => {
    const pkg = {
      ...yearly,
      product: { ...yearly.product, pricePerMonthString: null, pricePerMonth: 5 },
    }
    expect(annualPerMonthLabel(pkg)?.replace(/ | /g, ' ')).toBe('5,00 €')
  })

  it('divise le prix annuel par douze en dernier recours', () => {
    const pkg = {
      ...yearly,
      product: { price: 59.99, priceString: '59,99 €', currencyCode: 'EUR' },
    }
    // 59,99 / 12 = 4,999 -> arrondi a 5,00 par le formatage monetaire.
    expect(annualPerMonthLabel(pkg)?.replace(/ | /g, ' ')).toBe('5,00 €')
  })

  it('rend null sans devise, sans prix, ou sans package', () => {
    expect(annualPerMonthLabel(null)).toBeNull()
    expect(
      annualPerMonthLabel({ ...yearly, product: { price: 59.99, priceString: '59,99 €' } }),
    ).toBeNull()
    expect(
      annualPerMonthLabel({
        ...yearly,
        product: { price: 0, priceString: '0 €', currencyCode: 'EUR' },
      }),
    ).toBeNull()
  })
})

describe('savingsPercent', () => {
  it('calcule l economie reelle sur les prix du magasin', () => {
    // 1 - 59,99 / (9,49 x 12) = 47,3 %
    expect(savingsPercent(monthly, yearly)).toBe(47)
  })

  it('rendait 48 % sur les anciens prix ecrits en dur, d ou le badge jamais recalcule', () => {
    const faux = {
      m: { ...monthly, product: { ...monthly.product, price: 7.99 } },
      y: { ...yearly, product: { ...yearly.product, price: 49.99 } },
    }
    expect(savingsPercent(faux.m, faux.y)).toBe(48)
  })

  it('rend null si un plan manque', () => {
    expect(savingsPercent(null, yearly)).toBeNull()
    expect(savingsPercent(monthly, null)).toBeNull()
  })

  it('rend null si les devises diffèrent', () => {
    const usd = { ...yearly, product: { ...yearly.product, currencyCode: 'USD' } }
    expect(savingsPercent(monthly, usd)).toBeNull()
  })

  it('rend null quand l annuel n est pas avantageux', () => {
    const cher = { ...yearly, product: { ...yearly.product, price: 9.49 * 12 } }
    expect(savingsPercent(monthly, cher)).toBeNull()
    const pire = { ...yearly, product: { ...yearly.product, price: 200 } }
    expect(savingsPercent(monthly, pire)).toBeNull()
  })

  it('rend null sur des prix absurdes', () => {
    const zero = { ...monthly, product: { ...monthly.product, price: 0 } }
    expect(savingsPercent(zero, yearly)).toBeNull()
    const nan = { ...monthly, product: { ...monthly.product, price: Number.NaN } }
    expect(savingsPercent(nan, yearly)).toBeNull()
  })
})

describe('renewLine', () => {
  it('accorde la periode au plan', () => {
    expect(renewLine('yearly', yearly)).toBe('Puis 59,99 €/an.')
    expect(renewLine('monthly', monthly)).toBe('Puis 9,49 €/mois.')
  })

  it('rend null sans prix, pour ne pas afficher de phrase tronquee', () => {
    expect(renewLine('yearly', null)).toBeNull()
  })
})
