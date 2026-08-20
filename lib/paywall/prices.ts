/**
 * Prix du paywall, dérivés du MAGASIN et jamais écrits en dur.
 *
 * Pourquoi ce module existe : jusqu'au 20/08/2026, `app/offre/index.tsx`
 * affichait « 7,99 € » et « 49,99 € » en constantes, pendant que Google Play
 * encaissait **9,49 €** et **59,99 €**. Quelqu'un touchait un prix et en voyait
 * un autre dans la feuille de paiement. Un prix affiché est une promesse : il
 * doit venir de la seule source qui encaisse.
 *
 * Conséquence de forme : les deux magasins n'ont pas les mêmes paliers, donc
 * plus jamais de chiffre recopié dans du JSX. Ce module ne connaît que des
 * formes structurelles, pas `react-native-purchases`, pour rester testable en
 * environnement node.
 */

export type PlanId = 'monthly' | 'yearly'

/** Sous-ensemble de `PurchasesStoreProduct` dont l'affichage a besoin. */
export interface ProductLike {
  /** Prix numérique dans la devise du magasin. */
  price: number
  /** Prix déjà formaté par le magasin (« 59,99 € »). Fait foi sur l'affichage. */
  priceString: string
  /** Prix mensualisé, formaté par le magasin. Absent sur certains produits. */
  pricePerMonthString?: string | null
  /** Prix mensualisé numérique. Repli si la chaîne manque. */
  pricePerMonth?: number | null
  currencyCode?: string
}

/** Sous-ensemble de `PurchasesPackage`. */
export interface PackageLike {
  identifier: string
  packageType: string
  product: ProductLike
}

/**
 * Retrouve le package d'un plan.
 *
 * D'abord par `packageType` (`ANNUAL` / `MONTHLY`), la voie fiable : RevenueCat
 * nomme ses packages `$rc_annual` / `$rc_monthly`, mais un catalogue monté à la
 * main peut porter n'importe quel identifiant. Repli par mots dans
 * l'identifiant, et **rien** si aucune correspondance.
 *
 * ⚠️ Pas de repli sur `packages[0]`, contrairement à l'ancien code du paywall :
 * mieux vaut afficher un état neutre et refuser l'achat que débiter quelqu'un
 * pour un plan qu'il n'a pas vu.
 */
export function findPlanPackage<T extends PackageLike>(
  packages: readonly T[],
  plan: PlanId,
): T | null {
  const wantAnnual = plan === 'yearly'
  const type = wantAnnual ? 'ANNUAL' : 'MONTHLY'

  const byType = packages.find((p) => p.packageType === type)
  if (byType) return byType

  const words = wantAnnual ? ['annual', 'year', 'annuel'] : ['month', 'mensuel']
  const byName = packages.find((p) => {
    const id = p.identifier.toLowerCase()
    return words.some((w) => id.includes(w))
  })
  return byName ?? null
}

/**
 * Prix affiché d'un plan. `null` quand le magasin n'a rien répondu : on montre
 * alors un tiret, jamais un chiffre inventé.
 */
export function planPriceLabel(pkg: PackageLike | null | undefined): string | null {
  const s = pkg?.product?.priceString?.trim()
  return s ? s : null
}

/**
 * Prix mensualisé d'un abonnement **annuel** (« ~5,00 €/mois »).
 *
 * Le magasin le fournit déjà formaté la plupart du temps. Sinon on divise par
 * douze et on formate avec `Intl`, qui existe sur Hermes ; en cas d'absence, on
 * rend `null` plutôt qu'une chaîne approximative.
 */
export function annualPerMonthLabel(
  pkg: PackageLike | null | undefined,
  locale = 'fr-FR',
): string | null {
  const product = pkg?.product
  if (!product) return null

  const given = product.pricePerMonthString?.trim()
  if (given) return given

  const value =
    typeof product.pricePerMonth === 'number' && Number.isFinite(product.pricePerMonth)
      ? product.pricePerMonth
      : typeof product.price === 'number' && Number.isFinite(product.price)
        ? product.price / 12
        : null

  if (value === null || value <= 0 || !product.currencyCode) return null

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: product.currencyCode,
    }).format(value)
  } catch {
    return null
  }
}

/**
 * Économie de l'annuel face à douze mensuels, en pourcentage entier.
 *
 * `null` si l'un des deux prix manque, si les devises diffèrent (comparer des
 * montants dans deux monnaies ne veut rien dire) ou si l'annuel n'est pas
 * avantageux : dans ce cas le badge ne doit pas s'afficher du tout.
 */
export function savingsPercent(
  monthly: PackageLike | null | undefined,
  yearly: PackageLike | null | undefined,
): number | null {
  const m = monthly?.product
  const y = yearly?.product
  if (!m || !y) return null
  if (!Number.isFinite(m.price) || !Number.isFinite(y.price)) return null
  if (m.price <= 0 || y.price <= 0) return null
  if (m.currencyCode && y.currencyCode && m.currencyCode !== y.currencyCode) return null

  const yearOfMonthly = m.price * 12
  const percent = Math.round((1 - y.price / yearOfMonthly) * 100)
  return percent > 0 ? percent : null
}

/**
 * Ligne sous le bouton : « Puis 59,99 €/an. »
 *
 * `null` quand le prix est inconnu, pour que l'appelant n'affiche rien plutôt
 * qu'une phrase tronquée.
 */
export function renewLine(plan: PlanId, pkg: PackageLike | null | undefined): string | null {
  const price = planPriceLabel(pkg)
  if (!price) return null
  return plan === 'yearly' ? `Puis ${price}/an.` : `Puis ${price}/mois.`
}
