# NAVIGATION — CosmeCheck Mobile (Expo Router)

> Structure de navigation complète de l'application, basée sur Expo Router v3 (file-based routing).

---

## 1. Vue d'ensemble

Expo Router utilise le système de fichiers pour définir les routes. Chaque fichier dans `app/` devient une route.

```
app/
├── _layout.tsx              → Root layout (AuthGuard, fonts, providers)
├── +not-found.tsx           → 404
├── (auth)/                  → Groupe auth (pas de navigation bar)
├── (onboarding)/            → Groupe onboarding (barre de progression)
├── (tabs)/                  → Groupe principal (bottom tab bar)
├── analyse/[id].tsx         → Modal/screen analyse détail
├── promesses/               → Screens promesses
├── advisor/index.tsx        → Screen Beauty Advisor
├── compare/index.tsx        → Screen comparaison
├── profile/                 → Screens profil
├── ingredient/[slug].tsx    → Screen détail ingrédient
└── offre/index.tsx          → Screen abonnement
```

---

## 2. Groupes de routes

### 2.1 Root Layout (`app/_layout.tsx`)

Point d'entrée de toute l'application.

**Responsabilités :**
1. Chargement des polices Inter (useFonts)
2. Gestion de l'AuthGuard :
   - Si pas de session → redirect vers `/(auth)/sign-in`
   - Si session + préférences incomplètes → redirect vers `/(onboarding)`
   - Si session + profil OK → accès à `/(tabs)`
3. Configuration StatusBar (transparent sur iOS, dark-content)
4. Initialisation des providers globaux (QueryClientProvider, etc.)

**Flux décisionnel :**
```
App launch
  ↓
[_layout.tsx]
  ├── isLoading (fonts + auth) → SplashScreen
  ├── !session → redirect (auth)/sign-in
  ├── session + !onboarding_completed → redirect (onboarding)/
  └── session + profil OK → Slot (/(tabs)/index)
```

### 2.2 Groupe Auth (`app/(auth)/`)

Écrans accessibles sans authentification.
Le layout `(auth)/_layout.tsx` redirige vers `/(tabs)` si l'utilisateur est déjà connecté.

| Fichier | URL | Description |
|---------|-----|-------------|
| `sign-in.tsx` | `/sign-in` | Connexion |
| `sign-up.tsx` | `/sign-up` | Inscription |
| `forgot-password.tsx` | `/forgot-password` | Mot de passe oublié |
| `reset-password.tsx` | `/reset-password` | Réinitialisation (deep link) |

**Transitions :** Slide horizontal (Stack.Screen avec animation)

### 2.3 Groupe Onboarding (`app/(onboarding)/`)

Écrans de configuration initiale. Accessible uniquement si session existe mais `preferences.onboarding_completed = false`.

| Fichier | URL | Description |
|---------|-----|-------------|
| `index.tsx` | `/` (dans groupe) | Wizard 3 étapes |

Le wizard est interne au fichier (3 composants Step1/2/3 montés séquentiellement via state local), pas 3 routes séparées.

**À la fin :** `router.replace('/(tabs)')` pour effacer la pile de navigation.

### 2.4 Groupe Tabs (`app/(tabs)/`)

Navigation principale avec Bottom Tab Bar.

| Fichier | Tab | Icône | URL |
|---------|-----|-------|-----|
| `index.tsx` | Tab 1 — Accueil | HomeIcon | `/(tabs)/` |
| `routine.tsx` | Tab 2 — Routine | LayersIcon | `/(tabs)/routine` |
| `scan.tsx` | Tab 3 — Décode (FAB) | CameraIcon | `/(tabs)/scan` |
| `history.tsx` | Tab 4 — Historique | ClockIcon | `/(tabs)/history` |
| `promesses.tsx` | Tab 5 — Promesses | PromisesIcon | `/(tabs)/promesses` |

**Note :** Le Tab 3 (scan) n'est jamais directement navigué. Le FAB central ouvre un `BottomSheet` (`ScanSheet`) au-dessus de l'UI existante.

---

## 3. Screens modaux / push

Ces écrans s'affichent en push (Stack) au-dessus des tabs, ou en modal.

### Analyse Détail
```
Route: /analyse/[id]
Accès depuis:
  - Historique (tap sur item)
  - Dashboard (tap sur "dernière analyse")
  - Routine (tap sur carte produit)
  - ScanSheet (après analyse terminée)
Présentation: Push stack (slide from right)
Boutons header: ← Retour, partager, ajouter à la routine
```

### Promesses
```
/promesses/nouvelle
  Accès depuis: Tab Promesses → bouton "+"
  Présentation: Modal (slide from bottom)

/promesses/[id]
  Accès depuis: Tab Promesses → tap item, ou /analyse/[id] → "Voir les promesses"
  Présentation: Push stack
```

### Advisor
```
/advisor
  Accès depuis: Dashboard CTA, Tab profil, ou icône dans header
  Présentation: Push stack avec animation fade
```

### Compare
```
/compare
  Accès depuis: /analyse/[id] → bouton "Comparer", ou Dashboard
  Présentation: Push stack ou modal plein écran
  State: ids des analyses passées via route params ou store Zustand
```

### Profil
```
/profile          → Push depuis tab bar header (icône user) ou navbar
/profile/restrictions  → Push depuis /profile
```

### Ingrédient
```
/ingredient/[slug]
  Accès depuis: /analyse/[id] → tap sur tag ingrédient
  Présentation: Push stack (slide from right)
```

### Offre
```
/offre
  Accès depuis: CreditsPill (tap), guard Premium, profil
  Présentation: Modal (slide from bottom)
```

---

## 4. Bottom Sheet (hors Expo Router)

Le `ScanSheet` n'est **pas** une route Expo Router. C'est un composant `@gorhom/bottom-sheet` monté dans le layout des tabs.

**Cycle de vie :**
1. FAB central (bouton rose) → `bottomSheetRef.current?.expand()`
2. ScanSheet s'ouvre (slide from bottom, snap points: 60%, 90%)
3. L'utilisateur scanne / saisit l'INCI
4. Après analyse → ScanSheet se ferme + navigation vers `/analyse/[new-id]`

**Implémentation recommandée :**
- `BottomSheetModalProvider` en wrappant le layout root
- `useBottomSheet()` hook dans ScanFAB pour le contrôle

---

## 5. Deep Links

Pour la fonctionnalité "reset-password" depuis l'email :

```json
// app.json
{
  "expo": {
    "scheme": "cosmecheck",
    "plugins": [
      ["expo-router", { "origin": "https://cosmecheck.app" }]
    ]
  }
}
```

Deep link URL : `cosmecheck://reset-password?token=xxx`
Route : `app/(auth)/reset-password.tsx`

---

## 6. Guards et redirections

### AuthGuard (dans `_layout.tsx`)

```typescript
// Pseudo-code du guard
const { session, isLoading } = useAuth()
const { preferences } = useProfile()
const segments = useSegments()
const router = useRouter()

useEffect(() => {
  if (isLoading) return

  const inAuthGroup = segments[0] === '(auth)'
  const inOnboarding = segments[0] === '(onboarding)'

  if (!session && !inAuthGroup) {
    // Pas connecté → auth
    router.replace('/(auth)/sign-in')
  } else if (session && inAuthGroup) {
    // Connecté mais sur page auth → tabs
    router.replace('/(tabs)')
  } else if (session && !preferences?.onboarding_completed && !inOnboarding) {
    // Connecté mais pas d'onboarding → onboarding
    router.replace('/(onboarding)')
  } else if (session && preferences?.onboarding_completed && inOnboarding) {
    // Onboarding déjà fait → tabs
    router.replace('/(tabs)')
  }
}, [session, isLoading, preferences, segments])
```

### Premium Guard

Pour les features Premium (Advisor, Promesses, Comparaison illimitée) :
- Vérifier `user.subscription_tier === 'premium'` OU crédits > 0
- Sinon → afficher `UpgradePromptModal` ou rediriger vers `/offre`

---

## 7. Transitions et animations

| Contexte | Animation |
|----------|-----------|
| Auth → Tabs | Fade |
| Stack push (default) | Slide from right |
| Modaux | Slide from bottom |
| Tabs (switch) | Pas d'animation (instant) |
| Onboarding steps | Slide horizontal (entre steps) |
| ScanSheet | Slide from bottom (spring) |
| Analyse result | Fade in progressif (Reveal) |

---

## 8. Header configuration

### Tabs (Bottom Nav) — pas de header natif
Les tabs n'utilisent pas le header natif de React Navigation. Chaque écran gère son propre "header" via un composant custom.

### Stack screens — header minimal
```typescript
<Stack.Screen
  options={{
    title: 'Détail analyse',
    headerTransparent: true,
    headerBlurEffect: 'light',
    headerBackTitle: '', // sans texte sur iOS
    headerTintColor: colors.ink,
  }}
/>
```

---

## 9. Tab Bar configuration

```typescript
// (tabs)/_layout.tsx — config des tabs
<Tabs
  screenOptions={{
    tabBarShowLabel: true,
    tabBarStyle: {
      position: 'absolute',
      borderTopWidth: 0,
      elevation: 0,
      backgroundColor: 'transparent',
    },
  }}
  tabBar={(props) => <BottomTabBar {...props} />}
>
  <Tabs.Screen name="index" options={{ title: 'Accueil', ... }} />
  <Tabs.Screen name="routine" options={{ title: 'Routine', ... }} />
  <Tabs.Screen name="scan" options={{ href: null }} /> {/* caché */}
  <Tabs.Screen name="history" options={{ title: 'Historique', ... }} />
  <Tabs.Screen name="promesses" options={{ title: 'Promesses', ... }} />
</Tabs>
```

Note : `href: null` cache le tab "scan" de la barre de navigation tout en gardant le fichier pour des raisons de structure.
