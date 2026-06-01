# Routine Library

Fonctions de calcul pour les métriques d'exposition de la routine beauté.

## Fichiers

### `exposure.ts`
Calcul du score d'exposition cumulée, par famille d'ingrédients, et simulation de suppression.

## Algorithme de calcul

L'exposition est calculée à partir des résultats d'analyse de chaque produit
(stockés dans `routine_items` avec jointure vers `analyses.result`).

### Score cumulé

Le score cumulé n'est pas une moyenne simple — il représente l'exposition totale
de la peau aux ingrédients problématiques sur une journée de routine:
- Chaque produit utilisé contribue selon sa fréquence (matin=0.5, soir=0.5, matin+soir=1.0)
- Le score cumulé est une moyenne pondérée des scores individuels (inversés: score bas = problème)

### Exposition par famille

Pour chaque famille d'ingrédients (Conservateurs, Parfums, Silicones...):
- On regarde combien de produits de la routine contiennent des ingrédients de cette famille
- L'exposition est le nombre moyen d'ingrédients de cette famille par produit × fréquence
