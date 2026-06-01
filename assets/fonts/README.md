# Polices — Inter

Ce dossier contient les fichiers de polices Inter utilisés dans CosmeCheck.

## Fichiers requis

Placer les fichiers suivants dans ce dossier:

```
assets/fonts/
├── Inter-Regular.ttf      (poids 400)
├── Inter-Medium.ttf       (poids 500)
├── Inter-SemiBold.ttf     (poids 600)
└── Inter-Bold.ttf         (poids 700)
```

## Comment obtenir les fichiers

### Option 1 — Package npm (recommandé pour Expo)

```bash
npx expo install @expo-google-fonts/inter
```

Puis dans `app/_layout.tsx`:
```typescript
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter'

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  })
  // ...
}
```

### Option 2 — Fichiers locaux

Télécharger Inter depuis https://fonts.google.com/specimen/Inter
ou depuis le dépôt officiel https://github.com/rsms/inter

Extraire les variantes statiques:
- Inter-Regular.ttf (Regular 400)
- Inter-Medium.ttf (Medium 500)
- Inter-SemiBold.ttf (SemiBold 600)
- Inter-Bold.ttf (Bold 700)

Puis configurer dans `_layout.tsx`:
```typescript
import { useFonts } from 'expo-font'

const [fontsLoaded] = useFonts({
  'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'),
  'Inter-Medium': require('./assets/fonts/Inter-Medium.ttf'),
  'Inter-SemiBold': require('./assets/fonts/Inter-SemiBold.ttf'),
  'Inter-Bold': require('./assets/fonts/Inter-Bold.ttf'),
})
```

## Notes

- Ne pas inclure les fichiers .ttf dans git si la taille dépasse 1 MB
  (utiliser git-lfs ou charger depuis un CDN)
- Inter Variable (inter.ttf) est une alternative moderne qui inclut tous les
  poids dans un seul fichier, mais la performance sur mobile peut varier
- Utiliser `SplashScreen.preventAutoHideAsync()` + cacher le splash screen
  seulement quand `fontsLoaded === true`
