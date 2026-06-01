# Hooks — CosmeCheck

Hooks React personnalisés encapsulant la logique métier de l'application.

## Hooks disponibles

| Hook | Rôle |
|------|------|
| `useAuth` | Gestion de la session et de l'authentification |
| `useCredits` | Récupération et rafraîchissement des crédits restants |
| `useAnalysis` | Lancement et gestion d'une analyse INCI |
| `useRoutine` | Gestion de la routine beauté (CRUD + métriques) |
| `useProfile` | Profil utilisateur (fetch + update debounce) |

## Conventions

- Tous les hooks utilisent TanStack Query pour le cache serveur (sauf useAuth)
- L'état global partagé (session, scan en cours) utilise Zustand
- Les hooks exposent toujours `isLoading`, `error`, et les données

## Exemple d'utilisation

```typescript
// Dans un écran
const { user, isAuthenticated, signOut } = useAuth()
const { credits, refresh: refreshCredits } = useCredits()
const { profile, updateProfile, isProfileComplete } = useProfile()
const { runAnalysis, isAnalyzing, lastAnalysisId } = useAnalysis()
const { routineItems, metrics, addToRoutine, removeFromRoutine } = useRoutine()
```
