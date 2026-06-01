# Analysis Components

Composants d'affichage des résultats d'analyse INCI.

## Composants

### `AnalysisResultPanel.tsx`
Orchestrateur principal affichant le résultat complet d'une analyse.

### `VerdictGauge.tsx`
Jauge arc animée 0-20 avec couleur dynamique (vert/jaune/orange/rouge).

### `IngredientSpectrum.tsx`
Barres colorées proportionnelles montrant la répartition des ingrédients par couleur.

### `ProductRow.tsx`
Ligne d'un ingrédient dans la liste: position + nom INCI + traduction + badge + fonctions.

### `RestrictionWarning.tsx`
Bandeau d'alerte si des ingrédients restreints/allergènes sont détectés.

### `EssentielView.tsx`
Vue simplifiée "L'essentiel" pour les utilisateurs non-experts.

## Mapping score → couleur

| Score | Couleur | Label |
|-------|---------|-------|
| 15-20 | Vert | Excellent |
| 10-14 | Jaune | Bon |
| 5-9 | Orange | Acceptable |
| 0-4 | Rouge | À améliorer |
