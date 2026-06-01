# Supabase — Configuration et Types

Ce dossier contient la configuration du client Supabase et les types TypeScript
correspondant au schéma de la base de données CosmetWiki.

## Fichiers

### `client.ts`
Initialisation du client Supabase avec `expo-secure-store` comme adaptateur de stockage.

### `types.ts`
Types TypeScript générés pour toutes les tables Supabase utilisées par l'app mobile.

## Configuration requise

Variables d'environnement (dans `.env.local`):
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciO...
```

## Adaptateur expo-secure-store

Supabase JS utilise `localStorage` sur le web pour persister la session.
Sur React Native, nous devons fournir un adaptateur personnalisé utilisant
`expo-secure-store` qui chiffre les tokens dans le Keychain (iOS) / Keystore (Android).

## Points d'attention

- `detectSessionInUrl: false` est CRUCIAL sur React Native
  (Supabase ne doit pas essayer de lire les URL du navigateur)
- `autoRefreshToken: true` pour rafraîchir automatiquement le token expirée
- Les deep links OAuth sont gérés manuellement via `expo-auth-session`
