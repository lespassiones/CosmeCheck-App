/**
 * OffreScreen : paywall Premium de Cosme Check (RevenueCat).
 *
 * Depuis le 28/09/2026, UN SEUL paywall dans l'app : celui de fin d'onboarding
 * (`OnboardingPaywall`, tableau Gratuit / Premium lu dans `credit_tiers`, prix
 * du magasin, essai seulement s'il est accordé). L'ancienne vue « Plans »
 * (jauge, 6 bénéfices, « 100 crédits/mois » devenu faux) a été retirée.
 *
 *   - `fromOnboarding=1` : fin du parcours d'un compte connecté. « Plus tard »
 *     pose `paywall_shown` pour que l'AuthGuard ne reboucle pas (Apple §3.1.1).
 *   - Ouvert ailleurs (pastille crédits, crédits épuisés, profil, menu) :
 *     « Plus tard » revient simplement en arrière.
 *   - Membre Premium : page « Mon abonnement » (`MySubscriptionView` : formule,
 *     essai, renouvellement, crédits, gestion chez le magasin, restauration).
 *     Sauf le compte de review Apple, qui doit VOIR l'offre (voir
 *     `lib/auth/reviewReplay.ts`).
 *
 * Toute la logique d'achat vit dans `usePaywallCheckout` (partagée avec le
 * paywall du parcours invité) : ne rien dupliquer ici.
 */

import { useEffect, type FC } from 'react'
import { router, useLocalSearchParams } from 'expo-router'

import { ROUTES } from '@/constants/routes'
import { usePaywallCheckout } from '@/hooks/usePaywallCheckout'
import { OnboardingPaywall } from '@/components/onboarding/flow/OnboardingPaywall'
import { MySubscriptionView } from '@/components/profile/MySubscriptionView'
import { useProfile } from '@/hooks/useProfile'
import { isReviewReplayAccount } from '@/lib/auth/reviewReplay'

const OffreScreen: FC = () => {
  const checkout = usePaywallCheckout()
  const { profile, updateProfile } = useProfile()
  const isPremium = profile?.tier === 'premium'

  // `fromOnboarding=1` : paywall post-onboarding (obligatoire mais skippable,
  // Apple §3.1.1). On marque `paywall_shown` au choix (skip ou achat) pour que
  // l'AuthGuard ne reboucle pas dessus.
  const params = useLocalSearchParams<{ fromOnboarding?: string }>()
  const fromOnboarding = params.fromOnboarding === '1'

  const dismissOnboardingPaywall = () => {
    // Le drapeau est écrit dans le cache tout de suite (updateProfile optimiste) :
    // on part sans attendre le réseau, sinon « Plus tard » paraissait mort sur
    // un réseau lent. Un échec d'écriture affiche déjà son toast.
    void updateProfile({ paywall_shown: true }, { keepOnError: true }).catch(() => {})
    // dismissTo : revient aux onglets existants (ou les ouvre s'il n'y en a pas),
    // sans en empiler une 2e copie.
    router.dismissTo(ROUTES.TABS.HOME)
  }

  // Compte de démonstration remis à Apple : il doit VOIR le paywall, sinon le
  // vérificateur ne peut pas juger de l'offre. Il est premium, donc la règle
  // ci-dessous l'aurait fait sauter. Voir `lib/auth/reviewReplay.ts`.
  const isReviewAccount = isReviewReplayAccount(
    profile?.preferences as Record<string, unknown> | null | undefined,
  )

  // Déjà premium pendant l'onboarding (edge) → on ne bloque pas sur le paywall.
  useEffect(() => {
    if (fromOnboarding && isPremium && !isReviewAccount) void dismissOnboardingPaywall()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromOnboarding, isPremium, isReviewAccount])

  const leave = () => {
    if (fromOnboarding) void dismissOnboardingPaywall()
    else if (router.canGoBack()) router.back()
    else router.dismissTo(ROUTES.TABS.HOME)
  }

  if (!isPremium || isReviewAccount) {
    return <OnboardingPaywall checkout={checkout} onLater={leave} />
  }

  return <MySubscriptionView initialCustomerInfo={checkout.customerInfo} onClose={leave} />
}

export default OffreScreen
