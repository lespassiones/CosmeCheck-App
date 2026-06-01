# Auth Library

Utilitaires d'authentification pour CosmeCheck.

## Fichiers

### `session.ts`
Fonctions de gestion de session: getSession, signOut, getCurrentUser, onAuthStateChange.

### `google.ts`
Flux d'authentification Google OAuth via expo-auth-session + Supabase.

## Traduction des erreurs Auth

Les erreurs Supabase Auth sont en anglais. Voici la map de traduction:

| Erreur Supabase | Message FR |
|----------------|-----------|
| "Invalid login credentials" | "Email ou mot de passe incorrect" |
| "Email not confirmed" | "Veuillez confirmer votre email avant de vous connecter" |
| "User already registered" | "Un compte existe déjà avec cet email" |
| "Password should be at least 6 characters" | "Le mot de passe doit contenir au moins 6 caractères" |
| "Email rate limit exceeded" | "Trop de tentatives. Réessayez dans quelques minutes" |
| "Invalid email" | "Adresse email invalide" |
