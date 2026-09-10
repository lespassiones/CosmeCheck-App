/**
 * Décision d'entitlement RevenueCat, LOGIQUE PURE (testée dans
 * `lib/__tests__/revenucatWebhookDecide.test.ts`).
 *
 * QUOI : à partir d'un événement RevenueCat, dire si l'utilisateur doit passer
 * premium, repasser free, ou si son tier ne doit PAS bouger.
 *
 * POURQUOI : la première version décidait sur le seul `event.type`, et
 * rétrogradait sur `CANCELLATION`. Or chez RevenueCat `CANCELLATION` ne veut
 * PAS dire « accès terminé » : ça veut dire « renouvellement automatique
 * coupé ». Le client garde son accès jusqu'à `expiration_at_ms`. Résultat en
 * prod : un client qui payait 11 $ puis coupait le renouvellement perdait son
 * premium le lendemain (constaté sur bb740c93, premium du 28 au 31 août puis
 * 5 crédits/jour alors que son abonnement courait jusqu'au 30 septembre).
 *
 * RÈGLE : la source de vérité est `expiration_at_ms`, pas le type d'événement.
 * Tant que la date d'expiration est dans le futur, l'utilisateur est premium,
 * quel que soit l'événement reçu. Seul un accès réellement terminé (EXPIRATION,
 * ou remboursement qui ramène l'expiration à maintenant) rétrograde.
 */

/** Événements qui ouvrent ou prolongent un accès premium. */
const GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'NON_RENEWING_PURCHASE',
])

/**
 * Motif d'annulation envoyé par RevenueCat lors d'un REMBOURSEMENT. Dans ce cas
 * l'accès est révoqué immédiatement, contrairement à une résiliation normale.
 */
const REFUND_CANCEL_REASON = 'CUSTOMER_SUPPORT'

export interface RcEventInput {
  type: string
  /** 'PRODUCTION' | 'SANDBOX'. Absent sur les très vieux payloads. */
  environment?: string | null
  /** 'TRIAL' | 'NORMAL' | 'INTRO' | 'PROMOTIONAL'. */
  periodType?: string | null
  /** Fin d'accès en ms epoch. Absent pour un achat non renouvelable. */
  expirationAtMs?: number | null
  cancelReason?: string | null
}

export interface RcDecisionContext {
  /** Date courante en ms epoch (injectée pour rendre la décision testable). */
  now: number
  /** `user_profiles.current_period_end` déjà en base, si connu. */
  storedPeriodEndIso?: string | null
}

export interface RcDecision {
  /** Tier à écrire. `null` = ne pas toucher au tier de l'utilisateur. */
  tier: 'premium' | 'free' | null
  /** Colonnes d'abonnement à écrire. Objet vide = ne rien écrire. */
  patch: {
    subscription_status?: string | null
    current_period_end?: string | null
    trial_end?: string | null
  }
  /** Motif lisible, journalisé côté Edge Function. */
  reason: string
}

function toIso(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  return new Date(ms).toISOString()
}

function parseIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Traduit un événement RevenueCat en action sur le profil.
 *
 * Cas couverts :
 * - environnement SANDBOX : aucune écriture (une review Apple ou un testeur
 *   TestFlight ne doit pas ouvrir un vrai premium en prod) ;
 * - achat / renouvellement / reprise : premium, avec la date de fin de période ;
 * - CANCELLATION avec expiration future : le tier NE BOUGE PAS, on note juste
 *   « résiliation en cours » et la date d'accès ;
 * - CANCELLATION de type remboursement : rétrogradation immédiate ;
 * - EXPIRATION : rétrogradation, sauf si une période plus tardive est déjà en
 *   base (événement en retard arrivé après un nouvel achat) ;
 * - incident de paiement : le tier NE BOUGE PAS (période de grâce, RevenueCat
 *   enverra EXPIRATION si l'encaissement échoue définitivement).
 */
export function decideRevenueCatAction(
  event: RcEventInput,
  ctx: RcDecisionContext,
): RcDecision {
  const type = (event.type || '').toUpperCase()
  const env = (event.environment || '').toUpperCase()

  // Un événement bac à sable ne doit jamais modifier un profil de production.
  if (env && env !== 'PRODUCTION') {
    return { tier: null, patch: {}, reason: `ignore_environnement_${env.toLowerCase()}` }
  }

  const expiryMs = typeof event.expirationAtMs === 'number' ? event.expirationAtMs : null
  const expiryIso = toIso(expiryMs)
  const isTrial = (event.periodType || '').toUpperCase() === 'TRIAL'
  // Pas de date d'expiration = achat non renouvelable : l'accès reste ouvert.
  const stillEntitled = expiryMs === null ? true : expiryMs > ctx.now

  if (GRANT_EVENTS.has(type)) {
    // Événement d'achat déjà périmé : rejeu tardif, on ne réouvre rien.
    if (!stillEntitled) {
      return { tier: null, patch: {}, reason: 'ignore_achat_deja_expire' }
    }
    return {
      tier: 'premium',
      patch: {
        subscription_status: isTrial ? 'trialing' : 'active',
        current_period_end: expiryIso,
        trial_end: isTrial ? expiryIso : null,
      },
      reason: isTrial ? 'premium_essai' : 'premium_actif',
    }
  }

  if (type === 'CANCELLATION') {
    const isRefund = (event.cancelReason || '').toUpperCase() === REFUND_CANCEL_REASON
    // Remboursement, ou expiration déjà atteinte : l'accès s'arrête maintenant.
    if (isRefund || !stillEntitled) {
      return {
        tier: 'free',
        patch: {
          subscription_status: isRefund ? 'refunded' : 'expired',
          current_period_end: expiryIso,
          trial_end: null,
        },
        reason: isRefund ? 'rembourse' : 'annulation_apres_expiration',
      }
    }
    // Cas normal : le client a coupé le renouvellement mais a payé sa période.
    // Il garde son premium jusqu'au bout.
    return {
      tier: null,
      patch: {
        subscription_status: 'cancel_at_period_end',
        current_period_end: expiryIso,
      },
      reason: 'resiliation_effet_fin_de_periode',
    }
  }

  if (type === 'EXPIRATION') {
    // Garde anti-désordre : si la base connaît déjà une période qui court
    // encore, c'est qu'un achat plus récent a été traité entre-temps.
    const storedMs = parseIso(ctx.storedPeriodEndIso)
    if (storedMs !== null && storedMs > ctx.now && (expiryMs === null || expiryMs < storedMs)) {
      return { tier: null, patch: {}, reason: 'ignore_expiration_obsolete' }
    }
    return {
      tier: 'free',
      patch: {
        subscription_status: 'expired',
        current_period_end: expiryIso,
        trial_end: null,
      },
      reason: 'acces_termine',
    }
  }

  if (type === 'BILLING_ISSUE') {
    // Période de grâce : on n'enlève rien, on marque seulement l'incident.
    return {
      tier: null,
      patch: { subscription_status: 'past_due' },
      reason: 'incident_paiement_periode_de_grace',
    }
  }

  // SUBSCRIPTION_PAUSED, TRANSFER, TEST, et tout type futur : aucune écriture.
  // La pause Play Store et le transfert de compte sont suivis d'un EXPIRATION
  // ou d'un achat que l'on traite normalement.
  return { tier: null, patch: {}, reason: `ignore_type_${type.toLowerCase() || 'inconnu'}` }
}
