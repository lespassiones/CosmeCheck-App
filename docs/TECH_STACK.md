# TECH STACK — CosmeCheck Mobile

> Stack technique complète et packages recommandés pour l'application CosmeCheck.

---

## 1. Core

| Package | Version cible | Rôle |
|---------|--------------|------|
| `expo` | ~51.x | SDK Expo (build, runtime) |
| `expo-router` | ~3.x | Routing file-based |
| `react` | 18.x | Framework UI |
| `react-native` | 0.74.x | Rendu natif iOS/Android |
| `typescript` | ~5.x | Types statiques |

---

## 2. Navigation

| Package | Rôle |
|---------|------|
| `@react-navigation/native` | Core navigation (requis par expo-router) |
| `@react-navigation/bottom-tabs` | Bottom tabs (utilisé par Tabs d'expo-router) |
| `@react-navigation/stack` | Stack navigator (push screens) |
| `@gorhom/bottom-sheet` | Bottom sheet pour ScanSheet |
| `react-native-safe-area-context` | Gestion safe areas iOS/Android |
| `react-native-screens` | Optimisation des écrans natifs |

---

## 3. Supabase & Auth

| Package | Rôle |
|---------|------|
| `@supabase/supabase-js` | Client Supabase (DB + Auth + Realtime) |
| `expo-secure-store` | Stockage sécurisé des tokens auth (iOS Keychain / Android Keystore) |
| `expo-auth-session` | OAuth flows (Google) |
| `expo-web-browser` | Ouvre le navigateur pour OAuth |
| `expo-crypto` | Génération code_verifier PKCE |

**Configuration Supabase pour Expo :**
```typescript
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
```

---

## 4. UI & Animations

| Package | Rôle |
|---------|------|
| `react-native-reanimated` | Animations 60fps sur thread UI (jauge, reveals) |
| `react-native-gesture-handler` | Gestes (swipe, pinch) |
| `expo-blur` | BlurView pour glassmorphisme |
| `expo-linear-gradient` | Gradients (FAB rose, backgrounds) |
| `react-native-svg` | Rendu SVG (icônes, jauge arc) |
| `@expo/vector-icons` | Icônes Ionicons/Feather (fallback rapide) |

---

## 5. Formulaires & Validation

| Package | Rôle |
|---------|------|
| `react-hook-form` | Gestion formulaires performante |
| `zod` | Schémas de validation TypeScript-first |
| `@hookform/resolvers` | Intégration Zod + react-hook-form |

**Exemple de schéma Zod pour sign-in :**
```typescript
const signInSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(6, 'Mot de passe trop court (min 6 caractères)'),
})
```

---

## 6. Caméra & Scan

| Package | Rôle |
|---------|------|
| `expo-camera` | Accès caméra (photo + vidéo) |
| `expo-barcode-scanner` | Scan codes-barres EAN/QR |
| `expo-haptics` | Vibration retour haptique au scan |
| `expo-av` | Son court au scan réussi (optionnel) |
| `expo-image-picker` | Sélection photo depuis galerie (OCR alternatif) |

**Note :** `expo-barcode-scanner` peut être remplacé par la fonction `scanFromURLAsync` de `expo-barcode-scanner` combinée avec `expo-camera` pour éviter une dépendance double.

---

## 7. State Management

| Package | Rôle |
|---------|------|
| `zustand` | State global léger (auth, scan en cours, compare) |
| `@tanstack/react-query` | Cache serveur, refetch, pagination (historique, routine) |

**Pattern recommandé :**
- Zustand pour l'état **client** (UI state, session, panier comparaison)
- TanStack Query pour les données **serveur** (analyses, routine, profil)

---

## 8. Polices

| Package | Rôle |
|---------|------|
| `expo-font` | Chargement polices custom |
| `@expo-google-fonts/inter` | Inter 400/500/600/700 depuis Google Fonts |

**Chargement dans `_layout.tsx` :**
```typescript
const [fontsLoaded] = useFonts({
  'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'),
  'Inter-Medium': require('./assets/fonts/Inter-Medium.ttf'),
  'Inter-SemiBold': require('./assets/fonts/Inter-SemiBold.ttf'),
  'Inter-Bold': require('./assets/fonts/Inter-Bold.ttf'),
})
```

---

## 9. Stockage & Persistance

| Package | Rôle |
|---------|------|
| `expo-secure-store` | Tokens auth (chiffré, keychain) |
| `@react-native-async-storage/async-storage` | Données non-sensibles (cache local, préférences UI) |
| `expo-file-system` | Fichiers temporaires (photos OCR avant envoi) |

---

## 10. Notifications & Feedback

| Package | Rôle |
|---------|------|
| `expo-notifications` | Push notifications (routine rappels) |
| `expo-haptics` | Retour haptique (scan, boutons importants) |

---

## 11. Utilitaires

| Package | Rôle |
|---------|------|
| `date-fns` | Formatage dates (historique) |
| `react-native-mmkv` | Alternative ultra-rapide à AsyncStorage (optionnel) |
| `expo-updates` | OTA updates en production |
| `expo-constants` | Accès aux constantes app (version, env) |

---

## 12. Build & Déploiement

| Outil | Usage |
|-------|-------|
| **EAS Build** | Builds natifs cloud (iOS .ipa, Android .apk/.aab) |
| **EAS Submit** | Soumission App Store / Google Play |
| **EAS Update** | Mises à jour OTA (sans rebuild) |
| **Expo Dev Client** | Build de développement custom (pour modules natifs) |

**Commandes EAS :**
```bash
# Build development (pour test sur device)
eas build --profile development --platform all

# Build preview (pour TestFlight / Internal Testing)
eas build --profile preview --platform all

# Build production
eas build --profile production --platform all

# Submit App Store
eas submit --platform ios

# Submit Play Store
eas submit --platform android
```

---

## 13. Configuration TypeScript

```json
// tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

---

## 14. Configuration Babel

```javascript
// babel.config.js
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',  // DOIT être en dernier
    ],
  }
}
```

---

## 15. Configuration Expo (`app.json`)

```json
{
  "expo": {
    "name": "Cosme Check",
    "slug": "cosme-check",
    "version": "1.0.0",
    "scheme": "cosmecheck",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "splash": {
      "image": "./assets/images/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#FAFAFA"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.cosmecheck.app",
      "infoPlist": {
        "NSCameraUsageDescription": "CosmeCheck utilise la caméra pour scanner les codes-barres et photographier les listes d'ingrédients.",
        "NSPhotoLibraryUsageDescription": "CosmeCheck accède à vos photos pour analyser les emballages de produits."
      }
    },
    "android": {
      "package": "com.cosmecheck.app",
      "permissions": [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "VIBRATE"
      ]
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-camera",
        { "cameraPermission": "CosmeCheck utilise la caméra pour scanner les produits." }
      ]
    ]
  }
}
```

---

## 16. Package.json (dépendances complètes)

```json
{
  "dependencies": {
    "expo": "~51.0.0",
    "expo-router": "~3.5.0",
    "react": "18.2.0",
    "react-native": "0.74.0",

    "@supabase/supabase-js": "^2.43.0",
    "expo-secure-store": "~13.0.0",
    "expo-auth-session": "~5.5.0",
    "expo-web-browser": "~13.0.0",
    "expo-crypto": "~13.0.0",

    "@gorhom/bottom-sheet": "^4.6.0",
    "react-native-reanimated": "~3.10.0",
    "react-native-gesture-handler": "~2.16.0",
    "react-native-safe-area-context": "4.10.0",
    "react-native-screens": "3.31.0",
    "expo-blur": "~13.0.0",
    "expo-linear-gradient": "~13.0.0",
    "react-native-svg": "15.2.0",

    "react-hook-form": "^7.51.0",
    "zod": "^3.22.0",
    "@hookform/resolvers": "^3.3.4",

    "expo-camera": "~15.0.0",
    "expo-barcode-scanner": "~13.0.0",
    "expo-haptics": "~13.0.0",
    "expo-image-picker": "~15.0.0",

    "zustand": "^4.5.0",
    "@tanstack/react-query": "^5.32.0",

    "expo-font": "~12.0.0",
    "@expo-google-fonts/inter": "^0.2.3",

    "@react-native-async-storage/async-storage": "1.23.1",
    "expo-file-system": "~17.0.0",

    "date-fns": "^3.6.0",
    "expo-updates": "~0.25.0",
    "expo-constants": "~16.0.0",
    "expo-notifications": "~0.28.0",
    "expo-haptics": "~13.0.0",

    "@expo/vector-icons": "^14.0.0",
    "@react-navigation/native": "^6.1.17",
    "@react-navigation/bottom-tabs": "^6.5.20",
    "@react-navigation/stack": "^6.3.29"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@types/react": "~18.2.79",
    "@types/react-native": "~0.73.0",
    "typescript": "~5.3.3"
  }
}
```

---

## 17. Architecture des appels API

```
CosmeCheck App (Expo)
  │
  ├── Supabase (direct)
  │     ├── Auth (signIn, signUp, OAuth, signOut)
  │     ├── DB reads (analyses, routine, profil)
  │     └── DB writes (save analysis, update routine)
  │
  └── CosmetWiki API (fetch)
        ├── POST /api/analyser → AnalyseResponse
        ├── POST /api/coherence → CoherenceResult
        └── GET /api/advisor → streaming SSE (chat IA)
```

Les appels à l'API CosmetWiki passent par `EXPO_PUBLIC_API_BASE_URL` (configurable pour pointer vers prod ou dev).

---

## 18. Environnements

| Env | EXPO_PUBLIC_API_BASE_URL | Profil EAS |
|-----|--------------------------|-----------|
| Development | `http://localhost:3000` | `development` |
| Preview | `https://cosmetwiki-staging.vercel.app` | `preview` |
| Production | `https://cosmetwiki.vercel.app` | `production` |
