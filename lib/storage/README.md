# Storage Library

Wrappers AsyncStorage pour la persistance locale non-sensible.

## Fichiers

### `session.ts`
Gestion du cache local: INCI en attente, source du scan, dernière analyse, cache d'analyses.

## Distinction sécurisé vs non-sécurisé

| Donnée | Stockage | Raison |
|--------|----------|--------|
| Tokens auth Supabase | expo-secure-store (chiffré) | Données sensibles |
| INCI en attente de scan | AsyncStorage | Non-sensible, temporaire |
| Cache analyses | AsyncStorage | Non-sensible, peut expirer |
| Préférences UI | AsyncStorage | Non-sensible |
| user_id, email | Non stocké localement | Depuis la session Supabase |
