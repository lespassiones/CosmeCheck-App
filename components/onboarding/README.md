# Onboarding

## Parcours « Le diagnostic de Perle » (`flow/`, depuis le 28/09/2026)

Un seul parcours, deux modes :

- **invité** (`app/(preonboarding)/index.tsx`) : accroche, consentement,
  questions avec réactions de Perle, premier scan réel, alertes, montage, puis
  écran de compte (`app/(auth)/welcome.tsx`) et paywall (`/offre?fromOnboarding=1`) ;
- **connecté** (`app/(onboarding)/index.tsx`) : même parcours sans accroche,
  pour un compte existant sans profil (ou le compte de démonstration Apple rejoué).

| Fichier | Rôle |
|---|---|
| `flow/OnboardingFlow.tsx` | orchestrateur : étapes visibles, retour, brouillon, fin |
| `flow/steps/*` | un fichier par famille d'écrans (accroches, questions, réactions, scan, verdict, fin) |
| `flow/ui.tsx` | briques visuelles (en-tête, bulle de Perle, boutons, options, pastilles) |
| `flow/OnboardingPaywall.tsx` | paywall de fin d'onboarding (A21) |
| `flow/DraftFlusher.tsx` | écrit les réponses du parcours invité dans le profil après l'inscription |

La logique pure (ordre des étapes, textes et réactions, verdict express,
fusion dans `preferences`) vit dans `lib/onboarding/` et est testée dans
`lib/__tests__/onboardingPerle.test.ts`.

## Composants conservés pour l'édition du profil

`Step1Skin`, `Step2Concerns`, `Step3Goals`, `OnboardingControls`, `PackedChips` :
utilisés par `components/profile/BeautyProfileForm.tsx` et `app/profile/*`.
