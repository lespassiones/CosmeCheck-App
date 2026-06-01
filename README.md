# CosmeCheck — Application Mobile

> **État (cœur runnable implémenté)** : le projet Expo est initialisé et le **cœur de l'app est fonctionnel** — design system neumorphique, authentification (email + Google OAuth), onboarding 3 étapes (mêmes questions que le web), navigation par onglets + FAB, dashboard, profil, et écrans secondaires (historique/routine/promesses en lecture). `tsc --noEmit` : 0 erreur. `expo-doctor` : 18/18. Le bundle Android s'exporte sans erreur.
>
> **À venir** : scan caméra/OCR, pipeline d'analyse INCI (IA), Beauty Advisor, comparateur, détail d'analyse/promesse complets, paiement Premium.
>
> Stack : **Expo SDK 54 · expo-router v6 · React 19 · TypeScript strict · Supabase**. L'app parle **directement à Supabase** (Auth + schéma `cosme_check` via RPC/RLS).

---

## Vue d'ensemble

**CosmeCheck** est une application mobile (iOS + Android) d'analyse d'ingrédients cosmétiques. Elle est la version mobile de [CosmetWiki](https://cosmerwiki.vercel.app), construite avec **Expo + Supabase + TypeScript**.

L'application permet aux utilisateurs de :
- Scanner des produits cosmétiques (code-barres, photo OCR, saisie manuelle INCI)
- Obtenir un score de qualité 0-20 avec code couleur (Vert/Jaune/Orange/Rouge)
- Gérer leur routine beauté quotidienne
- Recevoir des conseils personnalisés via un Beauty Advisor IA
- Vérifier la cohérence des promesses marketing avec la formule réelle

---

## Stack Technique

| Couche | Technologie |
|--------|-------------|
| Framework mobile | [Expo SDK 51+](https://expo.dev) |
| Router | [Expo Router v3](https://expo.github.io/router) (file-based) |
| Langage | TypeScript strict |
| Backend/Auth | [Supabase](https://supabase.com) |
| UI Components | React Native + bibliothèque custom (NeuCard, GlassCard) |
| Animations | [react-native-reanimated v3](https://docs.swmansion.com/react-native-reanimated/) |
| Bottom Sheet | [@gorhom/bottom-sheet](https://gorhom.github.io/react-native-bottom-sheet/) |
| Formulaires | [react-hook-form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |
| Caméra | [expo-camera](https://docs.expo.dev/versions/latest/sdk/camera/) |
| Barcode | [expo-barcode-scanner](https://docs.expo.dev/versions/latest/sdk/bar-code-scanner/) |
| OAuth | [expo-auth-session](https://docs.expo.dev/versions/latest/sdk/auth-session/) |
| Stockage sécurisé | [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/) |
| Polices | [expo-font](https://docs.expo.dev/versions/latest/sdk/font/) (Inter) |
| State management | [Zustand](https://zustand-demo.pmnd.rs/) (léger, pour état global) |
| HTTP | fetch natif + [TanStack Query](https://tanstack.com/query) (cache + refetch) |

---

## Structure des dossiers

```
CosmeCheck-App/
├── app/                         # Expo Router — écrans (file-based routing)
│   ├── _layout.tsx              # Root layout + AuthGuard + fonts
│   ├── +not-found.tsx           # Écran 404
│   ├── (auth)/                  # Groupe Auth (non-authentifié)
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx
│   │   ├── sign-up.tsx
│   │   ├── forgot-password.tsx
│   │   └── reset-password.tsx
│   ├── (onboarding)/            # Groupe Onboarding (après inscription)
│   │   ├── _layout.tsx
│   │   └── index.tsx
│   ├── (tabs)/                  # Groupe Tabs (app principale)
│   │   ├── _layout.tsx          # Bottom nav + FAB central
│   │   ├── index.tsx            # Tab 1 — Dashboard
│   │   ├── routine.tsx          # Tab 2 — Routine
│   │   ├── scan.tsx             # Tab 3 — Placeholder (FAB → ScanSheet)
│   │   ├── history.tsx          # Tab 4 — Historique
│   │   └── promesses.tsx        # Tab 5 — Promesses marketing
│   ├── analyse/
│   │   └── [id].tsx             # Détail analyse complète
│   ├── promesses/
│   │   ├── nouvelle.tsx         # Saisie nouvelle analyse promesses
│   │   └── [id].tsx             # Résultat analyse promesses
│   ├── advisor/
│   │   └── index.tsx            # Beauty Advisor chat IA
│   ├── compare/
│   │   └── index.tsx            # Comparaison 2-3 produits
│   ├── profile/
│   │   ├── index.tsx            # Profil utilisateur
│   │   └── restrictions.tsx     # Allergies + restrictions
│   ├── ingredient/
│   │   └── [slug].tsx           # Détail ingrédient INCI
│   └── offre/
│       └── index.tsx            # Page abonnement Premium
│
├── components/                  # Composants réutilisables
│   ├── navigation/              # BottomTabBar, ScanFAB
│   ├── auth/                    # SignInForm, SignUpForm, GoogleAuthButton
│   ├── onboarding/              # OnboardingWizard, Step1-3
│   ├── scan/                    # ScanSheet, BarcodeScanner, PhotoOcrFlow, ManualInput
│   ├── analysis/                # VerdictGauge, IngredientSpectrum, ProductRow…
│   ├── routine/                 # RoutineProductCard, TagExposureBar…
│   ├── promesses/               # PromesseCard, PromesseFlowModal
│   ├── advisor/                 # AdvisorChat
│   ├── profile/                 # SkinProfileCard, BeautyProfileForm
│   ├── design/                  # GlassCard, NeuCard, ColorBadge, BackgroundGlow…
│   └── shared/                  # Logo, SearchBar, ConfirmDialog, ProcessingOverlay…
│
├── lib/                         # Utilitaires, clients, types
│   ├── supabase/                # Client Supabase + types DB
│   ├── analysis/                # Fonctions analyse INCI
│   ├── auth/                    # Session, Google OAuth
│   ├── routine/                 # Calcul exposition
│   └── storage/                 # AsyncStorage wrappers
│
├── hooks/                       # Hooks React personnalisés
│   ├── useAuth.ts
│   ├── useCredits.ts
│   ├── useAnalysis.ts
│   ├── useRoutine.ts
│   └── useProfile.ts
│
├── constants/                   # Valeurs de design (couleurs, ombres, typo, routes)
│   ├── colors.ts
│   ├── shadows.ts
│   ├── typography.ts
│   └── routes.ts
│
├── assets/
│   ├── fonts/                   # Inter (400/500/600/700)
│   ├── icons/                   # 13 icônes SVG custom
│   └── images/                  # Logo, illustrations, empty states
│
├── docs/                        # Documentation complémentaire
│   ├── FEATURES.md
│   ├── DESIGN_SYSTEM.md
│   ├── DATA_MODELS.md
│   ├── NAVIGATION.md
│   └── TECH_STACK.md
│
├── app.json                     # Config Expo
├── tsconfig.json                # TypeScript config (strict)
├── babel.config.js              # Babel + expo-router plugin
└── package.json                 # Dépendances
```

---

## Commandes pour démarrer

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer les variables d'environnement
cp .env.example .env.local
# Remplir EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY

# 3. Lancer en développement
npx expo start

# 4. iOS (simulateur)
npx expo run:ios

# 5. Android (émulateur)
npx expo run:android

# 6. Build production (EAS)
eas build --platform all --profile production
```

---

## Variables d'environnement requises

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciO...
EXPO_PUBLIC_API_BASE_URL=https://cosmetwiki.vercel.app
```

---

## Flux de navigation principaux

```
Démarrage
  ├── Pas de session → (auth)/sign-in
  ├── Session + pas de profil → (onboarding)/index
  └── Session + profil complet → (tabs)/index

(tabs)
  ├── Tab 1 (Accueil) → Dashboard
  ├── Tab 2 (Routine) → Liste routine
  ├── FAB central → ScanSheet (bottom sheet)
  │     ├── Photo OCR → Analyse → /analyse/[id]
  │     ├── Code-barres → Analyse → /analyse/[id]
  │     ├── Recherche → Analyse → /analyse/[id]
  │     └── Saisie INCI → Analyse → /analyse/[id]
  ├── Tab 4 (Historique) → /history
  └── Tab 5 (Promesses) → /promesses
```

---

## Liens utiles

- Web app (CosmetWiki) : [CosmetWiki sur Vercel](https://cosmetwiki.vercel.app)
- Expo documentation : https://docs.expo.dev
- Supabase documentation : https://supabase.com/docs
- Expo Router : https://expo.github.io/router/docs

---

*Ce projet est en cours de conception. Tous les fichiers `.tsx`/`.ts` sont des blueprints — l'implémentation sera ajoutée progressivement.*
