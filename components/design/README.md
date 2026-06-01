# Design System Components

Composants de base du design system de CosmeCheck.
Implémentent le neumorphisme et le glassmorphisme définis dans DESIGN_SYSTEM.md.

## Composants

### `GlassCard.tsx`
Carte glassmorphique (fond blanc semi-transparent + blur + ring).

### `NeuCard.tsx`
Carte neumorphique avec ombres portées/creuses. Variants: flat/raised/pressed.

### `ColorBadge.tsx`
Badge de couleur de notation (Vert/Jaune/Orange/Rouge). Variants: dot/chip/full.

### `BackgroundGlow.tsx`
Orbes pastels en arrière-plan pour l'effet de profondeur.

### `Reveal.tsx`
Animation d'apparition fade-in + translateY avec stagger optionnel.

## Utilisation

```typescript
// Carte glassmorphique
<GlassCard style={{ marginBottom: 16 }}>
  <Text>Contenu</Text>
</GlassCard>

// Carte neumorphique
<NeuCard variant="raised" onPress={handlePress}>
  <Text>Contenu pressable</Text>
</NeuCard>

// Badge de score
<ColorBadge rating="vert" variant="chip" label="Excellent" />
<ColorBadge rating="rouge" variant="dot" />
<ColorBadge rating="orange" variant="full" score={7} />

// Animation d'apparition
<Reveal stagger={50}>
  <ChipA />
  <ChipB />
  <ChipC />
</Reveal>
```

## Notes d'implémentation

- GlassCard utilise `expo-blur` (BlurView) pour le backdrop blur
- NeuCard nécessite deux ombres (sombre + claire) — iOS supporte nativement,
  Android nécessite une bibliothèque (react-native-neumorphism ou implémentation custom)
- Reveal utilise `react-native-reanimated` (useAnimatedStyle + withTiming/withDelay)
