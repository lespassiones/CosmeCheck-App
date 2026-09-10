/**
 * decideRevenueCatAction — traduction d'un événement RevenueCat en action sur
 * le profil. Ces tests verrouillent la règle « l'accès s'arrête à la fin de la
 * période payée, pas au moment de la résiliation ».
 */
import {
  decideRevenueCatAction,
  type RcEventInput,
} from '../../supabase/functions/revenucat-webhook/decide'

const NOW = Date.parse('2026-09-06T12:00:00.000Z')
const DANS_24_JOURS = NOW + 24 * 24 * 3600 * 1000
const IL_Y_A_2_JOURS = NOW - 2 * 24 * 3600 * 1000

function evt(over: Partial<RcEventInput> & { type: string }): RcEventInput {
  return { environment: 'PRODUCTION', periodType: 'NORMAL', ...over }
}

describe('environnement', () => {
  it('un achat SANDBOX ne touche jamais un profil de production', () => {
    const d = decideRevenueCatAction(
      evt({ type: 'INITIAL_PURCHASE', environment: 'SANDBOX', expirationAtMs: DANS_24_JOURS }),
      { now: NOW },
    )
    expect(d.tier).toBeNull()
    expect(d.patch).toEqual({})
    expect(d.reason).toBe('ignore_environnement_sandbox')
  })

  it('environnement absent (vieux payload) = traité comme production', () => {
    const d = decideRevenueCatAction(
      { type: 'INITIAL_PURCHASE', environment: null, expirationAtMs: DANS_24_JOURS },
      { now: NOW },
    )
    expect(d.tier).toBe('premium')
  })
})

describe('ouverture des droits', () => {
  it('INITIAL_PURCHASE en essai → premium + trialing + date de fin d\'essai', () => {
    const d = decideRevenueCatAction(
      evt({ type: 'INITIAL_PURCHASE', periodType: 'TRIAL', expirationAtMs: DANS_24_JOURS }),
      { now: NOW },
    )
    expect(d.tier).toBe('premium')
    expect(d.patch.subscription_status).toBe('trialing')
    expect(d.patch.trial_end).toBe(new Date(DANS_24_JOURS).toISOString())
    expect(d.patch.current_period_end).toBe(new Date(DANS_24_JOURS).toISOString())
  })

  it('RENEWAL payant → premium + active, sans date d\'essai', () => {
    const d = decideRevenueCatAction(
      evt({ type: 'RENEWAL', expirationAtMs: DANS_24_JOURS }),
      { now: NOW },
    )
    expect(d.tier).toBe('premium')
    expect(d.patch.subscription_status).toBe('active')
    expect(d.patch.trial_end).toBeNull()
  })

  it.each(['UNCANCELLATION', 'PRODUCT_CHANGE', 'SUBSCRIPTION_EXTENDED'])(
    '%s rouvre ou prolonge le premium',
    (type) => {
      const d = decideRevenueCatAction(evt({ type, expirationAtMs: DANS_24_JOURS }), { now: NOW })
      expect(d.tier).toBe('premium')
    },
  )

  it('achat non renouvelable (sans date d\'expiration) → premium', () => {
    const d = decideRevenueCatAction(
      evt({ type: 'NON_RENEWING_PURCHASE', expirationAtMs: null }),
      { now: NOW },
    )
    expect(d.tier).toBe('premium')
    expect(d.patch.current_period_end).toBeNull()
  })

  it('rejeu tardif d\'un achat déjà expiré → aucune réouverture', () => {
    const d = decideRevenueCatAction(
      evt({ type: 'INITIAL_PURCHASE', expirationAtMs: IL_Y_A_2_JOURS }),
      { now: NOW },
    )
    expect(d.tier).toBeNull()
    expect(d.reason).toBe('ignore_achat_deja_expire')
  })
})

describe('résiliation', () => {
  it('RÉGRESSION : couper le renouvellement ne retire PAS le premium payé', () => {
    const d = decideRevenueCatAction(
      evt({ type: 'CANCELLATION', cancelReason: 'UNSUBSCRIBE', expirationAtMs: DANS_24_JOURS }),
      { now: NOW },
    )
    expect(d.tier).toBeNull()
    expect(d.patch.subscription_status).toBe('cancel_at_period_end')
    expect(d.patch.current_period_end).toBe(new Date(DANS_24_JOURS).toISOString())
    expect(d.reason).toBe('resiliation_effet_fin_de_periode')
  })

  it('un remboursement coupe l\'accès immédiatement', () => {
    const d = decideRevenueCatAction(
      evt({
        type: 'CANCELLATION',
        cancelReason: 'CUSTOMER_SUPPORT',
        expirationAtMs: DANS_24_JOURS,
      }),
      { now: NOW },
    )
    expect(d.tier).toBe('free')
    expect(d.patch.subscription_status).toBe('refunded')
  })

  it('annulation reçue après la fin de période → rétrogradation', () => {
    const d = decideRevenueCatAction(
      evt({ type: 'CANCELLATION', expirationAtMs: IL_Y_A_2_JOURS }),
      { now: NOW },
    )
    expect(d.tier).toBe('free')
    expect(d.reason).toBe('annulation_apres_expiration')
  })
})

describe('fin d\'accès', () => {
  it('EXPIRATION → free', () => {
    const d = decideRevenueCatAction(
      evt({ type: 'EXPIRATION', expirationAtMs: IL_Y_A_2_JOURS }),
      { now: NOW },
    )
    expect(d.tier).toBe('free')
    expect(d.patch.subscription_status).toBe('expired')
    expect(d.patch.trial_end).toBeNull()
  })

  it('EXPIRATION en retard, alors qu\'un abonnement plus récent court → ignorée', () => {
    const d = decideRevenueCatAction(
      evt({ type: 'EXPIRATION', expirationAtMs: IL_Y_A_2_JOURS }),
      { now: NOW, storedPeriodEndIso: new Date(DANS_24_JOURS).toISOString() },
    )
    expect(d.tier).toBeNull()
    expect(d.reason).toBe('ignore_expiration_obsolete')
  })

  it('EXPIRATION cohérente avec la période stockée → rétrogradation', () => {
    const d = decideRevenueCatAction(
      evt({ type: 'EXPIRATION', expirationAtMs: IL_Y_A_2_JOURS }),
      { now: NOW, storedPeriodEndIso: new Date(IL_Y_A_2_JOURS).toISOString() },
    )
    expect(d.tier).toBe('free')
  })
})

describe('autres événements', () => {
  it('BILLING_ISSUE garde le premium (période de grâce)', () => {
    const d = decideRevenueCatAction(evt({ type: 'BILLING_ISSUE' }), { now: NOW })
    expect(d.tier).toBeNull()
    expect(d.patch.subscription_status).toBe('past_due')
  })

  it.each(['SUBSCRIPTION_PAUSED', 'TRANSFER', 'TEST', 'UN_TYPE_FUTUR'])(
    '%s ne modifie rien',
    (type) => {
      const d = decideRevenueCatAction(evt({ type }), { now: NOW })
      expect(d.tier).toBeNull()
      expect(d.patch).toEqual({})
    },
  )

  it('type en minuscules toléré', () => {
    const d = decideRevenueCatAction(
      evt({ type: 'renewal', expirationAtMs: DANS_24_JOURS }),
      { now: NOW },
    )
    expect(d.tier).toBe('premium')
  })
})

describe('scénario réel du 28 août au 30 septembre', () => {
  const debutEssai = Date.parse('2026-08-28T10:00:00.000Z')
  const finEssai = Date.parse('2026-08-31T10:00:00.000Z')
  const finPeriodePayee = Date.parse('2026-09-30T10:00:00.000Z')

  it('essai, conversion payante, puis résiliation : premium conservé jusqu\'au 30 septembre', () => {
    const essai = decideRevenueCatAction(
      evt({ type: 'INITIAL_PURCHASE', periodType: 'TRIAL', expirationAtMs: finEssai }),
      { now: debutEssai },
    )
    expect(essai.tier).toBe('premium')

    const conversion = decideRevenueCatAction(
      evt({ type: 'RENEWAL', expirationAtMs: finPeriodePayee }),
      { now: finEssai, storedPeriodEndIso: new Date(finEssai).toISOString() },
    )
    expect(conversion.tier).toBe('premium')

    // C'est ici que l'ancienne version rétrogradait à tort.
    const resiliation = decideRevenueCatAction(
      evt({ type: 'CANCELLATION', cancelReason: 'UNSUBSCRIBE', expirationAtMs: finPeriodePayee }),
      { now: finEssai + 3600 * 1000, storedPeriodEndIso: new Date(finPeriodePayee).toISOString() },
    )
    expect(resiliation.tier).toBeNull()

    // Le 30 septembre, RevenueCat envoie EXPIRATION : là seulement, free.
    const expiration = decideRevenueCatAction(
      evt({ type: 'EXPIRATION', expirationAtMs: finPeriodePayee }),
      { now: finPeriodePayee, storedPeriodEndIso: new Date(finPeriodePayee).toISOString() },
    )
    expect(expiration.tier).toBe('free')
  })
})
