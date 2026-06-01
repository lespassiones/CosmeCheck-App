# Navigation Components

Ce dossier contient les composants de navigation de l'application CosmeCheck.

## Composants

### `BottomTabBar.tsx`
La barre de navigation inférieure personnalisée avec 5 onglets et le FAB central rose.
Remplace la tabBar par défaut d'Expo Router via la prop `tabBar` du composant `<Tabs>`.

### `ScanFAB.tsx`
Le bouton d'action flottant central (64px, rose gradient) qui ouvre le ScanSheet.
Intégré dans BottomTabBar à la position centrale (index 2).

## Usage

```typescript
// Dans (tabs)/_layout.tsx
import { BottomTabBar } from '@/components/navigation/BottomTabBar'

<Tabs tabBar={(props) => <BottomTabBar {...props} />}>
  ...
</Tabs>
```

## Design

- Barre: fond blanc/90 avec backdrop blur, position absolute bottom 0
- Hauteur: 72px + SafeAreaInsets.bottom
- 5 onglets: Accueil | Routine | [FAB] | Historique | Promesses
- FAB: 64px, cercle rose gradient, ombre heavy, translateY -16 (surélevé)
- Indicateur onglet actif: point violet 4px sous l'icône
- Labels: fontSize 10, fontWeight 500/700 selon état
