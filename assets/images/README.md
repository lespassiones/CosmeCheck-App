# Images statiques — CosmeCheck

Ce dossier contient les images statiques de l'application.

## Fichiers requis

### App icons & splash
```
assets/images/
├── icon.png              # Icône app (1024x1024) — requis par EAS Build
├── icon-ios.png          # Icône iOS avec fond (1024x1024)
├── icon-android.png      # Icône Android adaptive (1024x1024)
├── splash.png            # Splash screen (2048x2048, fond #FAFAFA)
└── adaptive-icon.png     # Android adaptive icon foreground
```

### Logo
```
├── logo-full.png         # Logo complet "Cosme Check" avec icône (horizontal)
├── logo-icon.png         # Icône seule (flacon cosmétique stylisé) (256x256)
└── logo-dark.png         # Version fond sombre (pour splash screen)
```

### Illustrations Empty States
```
├── empty-history.png     # Illustration historique vide (400x300)
├── empty-routine.png     # Illustration routine vide
├── empty-analysis.png    # Illustration pas encore d'analyse
└── empty-advisor.png     # Illustration advisor si pas de profil
```

### Illustrations Onboarding
```
├── onboarding-skin.png   # Étape 1 — Type de peau
├── onboarding-concerns.png # Étape 2 — Préoccupations
└── onboarding-goals.png  # Étape 3 — Objectifs
```

## Spécifications de design

### Icône app
- Fond: rose gradient (#F43F5E → #E11D48) ou fond blanc avec icône rose
- Icône: flacon de sérum stylisé + lettre "C" ou initiales "CC"
- Style: minimaliste, moderne, conforme aux guidelines iOS/Android

### Splash Screen
- Fond: #FAFAFA (même que l'app pour une transition fluide)
- Logo centré: logo-full.png, 240px de large
- resizeMode: "contain" dans app.json

### Illustrations
- Style: flat design, couleurs douces (rose, violet, bleu pâle)
- Palette: cohérente avec le design system
- Format: PNG avec fond transparent
- Taille: 400x300 ou 300x300 pour les empty states

## Configuration app.json

```json
{
  "expo": {
    "icon": "./assets/images/icon.png",
    "splash": {
      "image": "./assets/images/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#FAFAFA"
    },
    "ios": {
      "icon": "./assets/images/icon-ios.png"
    },
    "android": {
      "icon": "./assets/images/icon-android.png",
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#FAFAFA"
      }
    }
  }
}
```

## Outils recommandés

- **Figma**: design des assets
- **Expo Image Optimization**: `npx expo-optimize` pour compresser les images
- **app-icon-generator.com**: générer toutes les tailles d'icônes depuis une seule source
