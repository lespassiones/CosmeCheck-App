# Icônes SVG — CosmeCheck

Ce dossier contient les 13 icônes SVG personnalisées de l'application.

## Liste des icônes

| Fichier | Usage | Taille recommandée |
|---------|-------|-------------------|
| `home.svg` | Tab Accueil | 24x24 |
| `layers.svg` | Tab Routine | 24x24 |
| `clock.svg` | Tab Historique | 24x24 |
| `user.svg` | Profil | 24x24 |
| `camera.svg` | FAB central Scan | 28x28 |
| `barcode.svg` | Onglet scan code-barres | 24x24 |
| `clipboard.svg` | Tab Promesses / saisie INCI | 24x24 |
| `search.svg` | SearchBar, onglet recherche | 18x18 |
| `sparkles.svg` | Beauty Advisor, synthèse IA | 24x24 |
| `promises.svg` | Tab Promesses marketing | 24x24 |
| `menu.svg` | Burger menu (si applicable) | 24x24 |
| `close.svg` | Fermeture modals/sheets | 24x24 |
| `diamond.svg` | Premium / abonnement | 20x20 |

## Spécifications de design

- Style: **linéaire/outline** (pas de remplissage plein)
- Trait: strokeWidth 1.5 à 2px
- Coins arrondis: strokeLinecap="round", strokeLinejoin="round"
- Viewbox: 0 0 24 24 (standard)
- Couleur: `currentColor` (pour hériter de la couleur parent)

## Implémentation

Utiliser `react-native-svg` pour rendre les SVG:

```typescript
import { Svg, Path, Circle } from 'react-native-svg'

interface IconProps {
  size?: number
  color?: string
  strokeWidth?: number
}

export const HomeIcon: FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 1.5 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
)
```

## Alternative rapide (développement)

Utiliser `@expo/vector-icons` pendant le développement:

```typescript
import { Ionicons, Feather } from '@expo/vector-icons'

// Équivalences:
// HomeIcon → Ionicons 'home-outline'
// LayersIcon → Feather 'layers'
// ClockIcon → Feather 'clock'
// UserIcon → Feather 'user'
// CameraIcon → Ionicons 'camera-outline'
// BarcodeIcon → Ionicons 'barcode-outline'
// ClipboardIcon → Feather 'clipboard'
// SearchIcon → Feather 'search'
// SparklesIcon → Ionicons 'sparkles-outline'
// CloseIcon → Feather 'x'
// DiamondIcon → Ionicons 'diamond-outline'
```

## Icônes prioritaires à créer en premier

1. `camera.svg` — FAB central (visible constamment)
2. `sparkles.svg` — Beauty Advisor (feature premium distinctive)
3. `diamond.svg` — Icône Premium (monétisation)
