/**
 * Prix de l'annuel ramené à la journée (paywall du 10/11/2026) : calculé sur le
 * vrai prix du magasin, dans son format, jamais écrit en dur.
 */
import { annualPerDayLabel, formatLikeStorePrice, savingsPercent, type PackageLike } from '@/lib/paywall/prices'

const pkg = (price: number, priceString: string, currencyCode = 'EUR'): PackageLike => ({
  identifier: '$rc_annual',
  packageType: 'ANNUAL',
  product: { price, priceString, currencyCode },
})

describe('formatLikeStorePrice', () => {
  it('garde la devise, sa place et le séparateur du magasin', () => {
    expect(formatLikeStorePrice('59,99 €', 0.1643)).toBe('0,16 €')
    expect(formatLikeStorePrice('59,99 €', 0.1643)).toBe('0,16 €')
    expect(formatLikeStorePrice('$79.00', 79 / 365)).toBe('$0.22')
    expect(formatLikeStorePrice('CHF 59.00', 59 / 365)).toBe('CHF 0.16')
    expect(formatLikeStorePrice('1 234,56 ₽', 3.38)).toBe('3,38 ₽')
  })

  it('sans décimales au magasin, pas de décimales inventées', () => {
    expect(formatLikeStorePrice('¥9800', 9800 / 365)).toBe('¥27')
  })

  it('rend null sans nombre lisible', () => {
    expect(formatLikeStorePrice('', 1)).toBeNull()
    expect(formatLikeStorePrice('gratuit', 1)).toBeNull()
    expect(formatLikeStorePrice('9,99 €', Number.NaN)).toBeNull()
  })
})

describe('annualPerDayLabel', () => {
  it('prix annuel / 365, arrondi au centime', () => {
    expect(annualPerDayLabel(pkg(59.99, '59,99 €'))).toBe('0,16 €')
    expect(annualPerDayLabel(pkg(79, '$79.00', 'USD'))).toBe('$0.22')
  })

  it('rien sans prix', () => {
    expect(annualPerDayLabel(null)).toBeNull()
    expect(annualPerDayLabel(pkg(0, '0,00 €'))).toBeNull()
  })
})

describe('badge « Économise XX % »', () => {
  it('se calcule sur les vrais prix', () => {
    const monthly: PackageLike = { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { price: 9.99, priceString: '9,99 €', currencyCode: 'EUR' } }
    expect(savingsPercent(monthly, pkg(59.99, '59,99 €'))).toBe(50)
  })
  it("disparaît si le calcul est impossible", () => {
    expect(savingsPercent(null, pkg(59.99, '59,99 €'))).toBeNull()
  })
})
