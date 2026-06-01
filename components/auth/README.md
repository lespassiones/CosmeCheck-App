# Auth Components

Composants de formulaires d'authentification pour CosmeCheck.

## Composants

### `SignInForm.tsx`
Formulaire de connexion avec email + mot de passe. Utilise react-hook-form + Zod.

### `SignUpForm.tsx`
Formulaire d'inscription avec prénom + email + mot de passe + confirmation.
Inclut un indicateur de force du mot de passe.

### `GoogleAuthButton.tsx`
Bouton "Continuer avec Google" qui déclenche le flux OAuth via expo-auth-session.

## Dépendances
- `react-hook-form` pour la gestion des formulaires
- `zod` + `@hookform/resolvers` pour la validation
- `expo-auth-session` + `expo-web-browser` pour Google OAuth
- `@supabase/supabase-js` pour les appels auth
