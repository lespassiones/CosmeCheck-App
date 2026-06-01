# DESIGN SYSTEM — CosmeCheck Mobile

> Tokens de design complets pour assurer la cohérence visuelle entre le web (CosmetWiki) et l'application mobile.

---

## 1. Couleurs

### Couleurs de base

| Token | Valeur | Usage |
|-------|--------|-------|
| `colors.bg` | `#FAFAFA` | Fond d'écran principal |
| `colors.surface` | `#FFFFFF` | Fond des cartes, modals |
| `colors.ink` | `#1F2937` | Texte principal |
| `colors.inkMuted` | `#6B7280` | Texte secondaire / labels |
| `colors.inkLight` | `#9CA3AF` | Texte désactivé, placeholders |
| `colors.border` | `#E5E7EB` | Bordures légères |
| `colors.borderMuted` | `rgba(0,0,0,0.06)` | Bordures très subtiles |

### Accent & Brand

| Token | Valeur | Usage |
|-------|--------|-------|
| `colors.accent` | `#8B5CF6` | Violet — couleur principale CTA |
| `colors.accentSoft` | `#EDE9FE` | Fond violet très clair |
| `colors.rose` | `#F43F5E` | Rose — FAB central, CTAs primaires |
| `colors.roseSoft` | `#FFE4E6` | Fond rose très clair |
| `colors.roseDeep` | `#E11D48` | Rose foncé (hover/pressed) |

### Système de notation (Rating)

| Token | Couleur texte | Couleur fond | Usage |
|-------|--------------|--------------|-------|
| `colors.rating.vert` | `#16A34A` | `#DCFCE7` | Score 15-20 — Excellent |
| `colors.rating.jaune` | `#CA8A04` | `#FEF9C3` | Score 10-14 — Bon |
| `colors.rating.orange` | `#EA580C` | `#FFEDD5` | Score 5-9 — Acceptable |
| `colors.rating.rouge` | `#DC2626` | `#FEE2E2` | Score 0-4 — À améliorer |

### Neumorphisme

| Token | Valeur | Usage |
|-------|--------|-------|
| `colors.neu.bg` | `#E8ECF1` | Fond neumorphique |
| `colors.neu.shadowDark` | `#C5CCD6` | Ombre portée (côté sombre) |
| `colors.neu.shadowLight` | `#FFFFFF` | Ombre portée (côté clair) |

### Glassmorphisme

| Token | Valeur | Usage |
|-------|--------|-------|
| `colors.glass.bg` | `rgba(255,255,255,0.70)` | Fond semi-transparent |
| `colors.glass.border` | `rgba(0,0,0,0.06)` | Bordure ring subtile |
| `colors.glass.blur` | `20px` | Flou backdrop (expo-blur) |

### États & Feedback

| Token | Valeur | Usage |
|-------|--------|-------|
| `colors.success` | `#16A34A` | Succès |
| `colors.warning` | `#CA8A04` | Avertissement |
| `colors.error` | `#DC2626` | Erreur |
| `colors.info` | `#2563EB` | Information |

---

## 2. Typographie

### Police principale : Inter

L'application utilise uniquement **Inter** chargée via `expo-font`.

| Variante | Poids | Fichier font |
|----------|-------|-------------|
| Regular | 400 | `Inter-Regular.ttf` |
| Medium | 500 | `Inter-Medium.ttf` |
| SemiBold | 600 | `Inter-SemiBold.ttf` |
| Bold | 700 | `Inter-Bold.ttf` |

### Échelle typographique

| Token | fontSize | fontWeight | lineHeight | Usage |
|-------|----------|------------|------------|-------|
| `typography.h1` | 32 | 700 | 40 | Titres principaux (onboarding) |
| `typography.h2` | 24 | 700 | 32 | Titres de section |
| `typography.h3` | 20 | 600 | 28 | Titres de cartes |
| `typography.h4` | 18 | 600 | 26 | Sous-titres |
| `typography.body` | 16 | 400 | 24 | Texte courant |
| `typography.bodyMedium` | 16 | 500 | 24 | Corps mis en avant |
| `typography.small` | 14 | 400 | 20 | Labels, metadata |
| `typography.smallMedium` | 14 | 500 | 20 | Labels mis en avant |
| `typography.xs` | 12 | 400 | 16 | Texte très petit (badges) |
| `typography.caption` | 11 | 400 | 14 | Légendes |

---

## 3. Espacement

Basé sur une grille de 4px :

| Token | Valeur | Usage |
|-------|--------|-------|
| `spacing.xs` | 4 | Micro-espacement |
| `spacing.sm` | 8 | Espacement compact |
| `spacing.md` | 12 | Espacement standard |
| `spacing.base` | 16 | Espacement de base (padding screens) |
| `spacing.lg` | 20 | Espacement large |
| `spacing.xl` | 24 | Espacement extra large |
| `spacing.2xl` | 32 | Sections |
| `spacing.3xl` | 48 | Sections importantes |
| `spacing.4xl` | 64 | Gros espacement |

---

## 4. Rayons (Border Radius)

| Token | Valeur | Usage |
|-------|--------|-------|
| `radius.sm` | 8 | Petits éléments |
| `radius.md` | 12 | Éléments moyens (chips, inputs) |
| `radius.lg` | 16 | Cartes standard |
| `radius.xl` | 20 | Grandes cartes |
| `radius.card` | 24 | Cards principales (rounded-3xl) |
| `radius.full` | 9999 | Pilules, boutons ronds |

---

## 5. Ombres

### Ombres standard (style iOS)

```typescript
// Ombre légère (cartes)
shadowLight: {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,        // Android
}

// Ombre moyenne (modals, sheets)
shadowMedium: {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.10,
  shadowRadius: 16,
  elevation: 6,
}

// Ombre forte (FAB, éléments flottants)
shadowHeavy: {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.16,
  shadowRadius: 24,
  elevation: 12,
}
```

### Ombres neumorphiques

```typescript
// NeuCard raised (surface au-dessus du fond)
neuRaised: {
  shadowColor: colors.neu.shadowDark,
  shadowOffset: { width: 6, height: 6 },
  shadowOpacity: 1,
  shadowRadius: 10,
  elevation: 8,
  // + ombre côté clair via outline ou background trick
}

// NeuCard pressed (surface enfoncée)
neuPressed: {
  // Inversion des ombres : côté sombre en haut-gauche
  shadowColor: colors.neu.shadowDark,
  shadowOffset: { width: -4, height: -4 },
  shadowOpacity: 0.8,
  shadowRadius: 6,
  elevation: 0,
}

// Note: Les ombres double face neumorphiques nécessitent
// souvent une lib comme react-native-neumorphism ou
// une implémentation custom avec 2 Views superposées
```

### Ombre glassmorphique

Le glassmorphisme s'obtient avec :
- `expo-blur` (`BlurView`) pour le backdrop blur
- Fond `rgba(255,255,255,0.70)`
- Bordure `rgba(0,0,0,0.06)` via `borderWidth: 1`

---

## 6. Composants UI — Spécifications visuelles

### Cards

```
GlassCard
  borderRadius: 24 (radius.card)
  backgroundColor: rgba(255,255,255,0.70)
  borderWidth: 1
  borderColor: rgba(0,0,0,0.06)
  backdropBlur: 20px (BlurView d'expo)
  padding: 20 (spacing.lg)

NeuCard (raised)
  borderRadius: 24
  backgroundColor: #E8ECF1
  ombres double face
  padding: 20

NeuCard (pressed, state interactif)
  ombres inversées pour effet enfoncé
```

### Boutons

```
Bouton Primary (GlassPillDark)
  backgroundColor: #1F2937 (ink)
  color: #FFFFFF
  borderRadius: 9999 (full)
  paddingVertical: 14
  paddingHorizontal: 28
  fontWeight: 600
  fontSize: 16

Bouton Rose (FAB, CTAs importants)
  backgroundColor: #F43F5E
  color: #FFFFFF
  borderRadius: 9999
  + ombre lourde

Bouton Ghost
  backgroundColor: transparent
  borderWidth: 1.5
  borderColor: currentColor
  borderRadius: 9999

Bouton Accent (Violet)
  backgroundColor: #8B5CF6
  color: #FFFFFF
  borderRadius: 9999
```

### Inputs (NeuInput)

```
NeuInput
  backgroundColor: #E8ECF1 (neu.bg)
  borderRadius: 14
  paddingVertical: 14
  paddingHorizontal: 18
  ombres creuses neumorphiques (état repos)
  ombres raised en focus
  borderWidth: 0 (pas de bordure classique)
  fontSize: 16
  color: #1F2937
```

### Chips / Tags

```
Chip non-sélectionné
  backgroundColor: #F3F4F6
  borderRadius: 9999
  paddingVertical: 8
  paddingHorizontal: 16
  fontSize: 14
  color: #6B7280

Chip sélectionné
  backgroundColor: #EDE9FE (accentSoft)
  color: #7C3AED
  fontWeight: 600
  ombre neumorphique creuse

Chip rose (FAB context)
  backgroundColor: #FFE4E6
  color: #E11D48
```

### Badges de score (ColorBadge)

```
Dot (petit point coloré)
  width: 8, height: 8
  borderRadius: 4
  backgroundColor: colors.rating.vert|jaune|orange|rouge

Chip (badge avec texte)
  borderRadius: 9999
  paddingVertical: 2
  paddingHorizontal: 8
  backgroundColor: soft color
  color: main color
  fontSize: 12
  fontWeight: 600

Full (badge large)
  borderRadius: 12
  paddingVertical: 6
  paddingHorizontal: 12
  fontSize: 14
  fontWeight: 700
```

---

## 7. Navigation

### Bottom Tab Bar

```
Container
  height: 72px (+ safe area inset bottom)
  backgroundColor: rgba(255,255,255,0.90)
  backdropBlur: 20px
  borderTopWidth: 1
  borderTopColor: rgba(0,0,0,0.06)

Tab item
  flex: 1
  alignItems: center
  justifyContent: center
  gap: 4

Tab icon (inactive)
  color: #9CA3AF
  size: 24

Tab icon (active)
  color: #8B5CF6 (accent)
  size: 24

Tab label (inactive)
  fontSize: 10
  color: #9CA3AF
  fontWeight: 500

Tab label (active)
  fontSize: 10
  color: #8B5CF6
  fontWeight: 700

Indicator (active)
  width: 4, height: 4
  borderRadius: 2
  backgroundColor: #8B5CF6
  position: below icon

FAB Central
  width: 64, height: 64
  borderRadius: 32
  backgroundColor: #F43F5E
  shadowHeavy
  marginBottom: 8 (pour le suréléver)
  gradient optionnel: from #F43F5E to #E11D48
```

### ScanSheet (Bottom Sheet)

```
Handle
  width: 40
  height: 4
  borderRadius: 2
  backgroundColor: #D1D5DB
  alignSelf: center
  marginTop: 12

Tabs horizontaux
  height: 44
  borderRadius: 12
  backgroundColor: #F3F4F6
  tab actif: backgroundColor: white, ombre légère

Contenu
  padding: 20
  minHeight: 300
```

---

## 8. Animations

### Conventions d'animation

| Type | Durée | Easing | Technologie |
|------|-------|--------|-------------|
| Transitions d'écran | 300ms | ease-in-out | Expo Router |
| Apparition composants | 400ms | spring (damping 20) | Reanimated |
| Stagger (listes) | 50ms entre items | ease-out | Reanimated |
| Jauge score (arc) | 800ms | spring (damping 15) | Reanimated |
| Pressed state | 150ms | ease-out | Reanimated |
| Bottom sheet | 350ms | spring | @gorhom/bottom-sheet |

### Composant Reveal

Le composant `<Reveal>` applique une animation combinée :
- `opacity: 0 → 1`
- `translateY: 16 → 0`
- Stagger de 50ms entre les enfants si `stagger` prop fournie

---

## 9. Orbes de fond (BackgroundGlow)

Sur plusieurs écrans (auth, onboarding, dashboard), des orbes pastels créent une atmosphère douce :

```
Orbe rose : width/height 280, borderRadius 140
  backgroundColor: rgba(244, 63, 94, 0.12)
  blur: 40 (BlurView ou style)
  position: absolute, top: -60, right: -80

Orbe violet : width/height 240, borderRadius 120
  backgroundColor: rgba(139, 92, 246, 0.10)
  blur: 40
  position: absolute, bottom: 80, left: -60

Orbe bleu : width/height 200, borderRadius 100
  backgroundColor: rgba(59, 130, 246, 0.08)
  blur: 30
  position: absolute, top: 200, left: 40
```

---

## 10. Icônes

L'application utilise **13 icônes SVG custom** légères :

| Icône | Usage |
|-------|-------|
| `HomeIcon` | Tab Accueil |
| `LayersIcon` | Tab Routine |
| `ClockIcon` | Tab Historique |
| `UserIcon` | Tab Profil (si présent) |
| `CameraIcon` | FAB central Scan |
| `BarcodeIcon` | Onglet scan code-barres |
| `ClipboardIcon` | Tab Promesses / saisie INCI |
| `SearchIcon` | SearchBar, onglet recherche |
| `SparklesIcon` | Beauty Advisor, synthèse IA |
| `PromisesIcon` | Tab Promesses marketing |
| `MenuIcon` | Burger menu (si applicable) |
| `CloseIcon` | Fermeture modals/sheets |
| `DiamondIcon` | Premium / abonnement |

Recommandé : utiliser `@expo/vector-icons` (Ionicons ou Feather) comme alternative rapide pendant le développement, puis remplacer par les SVG custom.

---

## 11. États vides (Empty States)

Chaque écran avec une liste doit avoir un état vide :

```
EmptyState
  illustration: SVG centered (120x120)
  title: texte principal (h3, ink)
  subtitle: texte secondaire (body, inkMuted)
  CTA: bouton optionnel

Exemple Historique vide:
  illustration: icône analyse avec point d'interrogation
  title: "Aucune analyse pour l'instant"
  subtitle: "Scannez votre premier produit pour commencer"
  CTA: "Scanner un produit" → ouvre ScanSheet
```

---

## 12. Safe Areas & Layout

```
Container principal
  paddingTop: SafeAreaInsets.top
  paddingBottom: SafeAreaInsets.bottom + 72 (height tabBar)
  paddingHorizontal: 16 (spacing.base)

Section header (écrans avec titre)
  paddingTop: 20
  paddingBottom: 16
  title: h2, ink

Content scroll area
  flex: 1
  padding: 16
```

---

*Ce document est la référence authoritative pour le design de l'application CosmeCheck. Toute décision de design doit être cohérente avec ces tokens.*
