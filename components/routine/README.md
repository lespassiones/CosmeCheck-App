# Routine Components

Composants de gestion de la routine beauté quotidienne.

## Composants

### `RoutineProductCard.tsx`
Carte d'un produit dans la routine avec sélecteur de fréquence et swipe-to-delete.

### `TagExposureBar.tsx`
Barre d'exposition pour une famille d'ingrédients (ex: Conservateurs: 4.2/20).

### `RoutineSimulationModal.tsx`
Modal "et si j'enlève le pire produit?" avec score simulé.

### `AddProductModal.tsx`
Modal de choix: analyser un nouveau produit ou choisir dans l'historique.

## Calcul d'exposition

L'exposition est calculée dans `lib/routine/exposure.ts`.
Les métriques sont recalculées à chaque changement de la routine.
