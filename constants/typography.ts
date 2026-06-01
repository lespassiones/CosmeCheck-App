/**
 * Tokens de typographie pour CosmeCheck.
 * Police unique: Inter (400/500/600/700)
 */

export const fontFamilies = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semiBold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
} as const

/** Tailles de texte */
export const fontSizes = {
  xs: 11,      // Légendes, badges compacts
  sm: 12,      // Très petit texte
  base: 14,    // Labels, metadata
  body: 16,    // Texte courant
  lg: 18,      // Sous-titres
  xl: 20,      // Titres de cartes (h4)
  '2xl': 24,   // Titres de section (h3)
  '3xl': 28,   // Grands titres (h2)
  '4xl': 32,   // Très grands titres (h1)
  '5xl': 40,   // Score analyse (géant)
  '6xl': 48,   // Score ingrédient détail
} as const

/** Hauteurs de ligne */
export const lineHeights = {
  xs: 14,
  sm: 16,
  base: 20,
  body: 24,
  lg: 26,
  xl: 28,
  '2xl': 32,
  '3xl': 36,
  '4xl': 40,
  '5xl': 48,
  '6xl': 56,
} as const

/** Poids de police */
export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
} as const

/**
 * Styles typographiques précomposés.
 * Utilisables directement dans StyleSheet.create() ou en inline styles.
 */
export const typography = {
  // ── Titres ───────────────────────────────────────────────────────
  h1: {
    fontFamily: fontFamilies.bold,
    fontSize: fontSizes['4xl'],   // 32
    lineHeight: lineHeights['4xl'],
    letterSpacing: -0.5,
  },
  h2: {
    fontFamily: fontFamilies.bold,
    fontSize: fontSizes['3xl'],   // 28
    lineHeight: lineHeights['3xl'],
    letterSpacing: -0.3,
  },
  h3: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes['2xl'],   // 24
    lineHeight: lineHeights['2xl'],
    letterSpacing: -0.2,
  },
  h4: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.xl,       // 20
    lineHeight: lineHeights.xl,
  },

  // ── Corps de texte ────────────────────────────────────────────────
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.body,     // 16
    lineHeight: lineHeights.body,
  },
  bodyMedium: {
    fontFamily: fontFamilies.medium,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
  },
  bodySemiBold: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
  },

  // ── Labels / Petits textes ────────────────────────────────────────
  small: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.base,     // 14
    lineHeight: lineHeights.base,
  },
  smallMedium: {
    fontFamily: fontFamilies.medium,
    fontSize: fontSizes.base,
    lineHeight: lineHeights.base,
  },
  smallSemiBold: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.base,
    lineHeight: lineHeights.base,
  },

  // ── Très petits textes ────────────────────────────────────────────
  xs: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.sm,       // 12
    lineHeight: lineHeights.sm,
  },
  xsMedium: {
    fontFamily: fontFamilies.medium,
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.sm,
  },
  xsSemiBold: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.sm,
  },

  // ── Micro textes ─────────────────────────────────────────────────
  caption: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.xs,       // 11
    lineHeight: lineHeights.xs,
  },

  // ── Tabs et navigation ───────────────────────────────────────────
  tabLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    fontFamily: fontFamilies.bold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.2,
  },

  // ── Boutons ──────────────────────────────────────────────────────
  button: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.body,     // 16
    lineHeight: fontSizes.body,
    letterSpacing: 0.1,
  },
  buttonSmall: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.base,     // 14
    lineHeight: fontSizes.base,
  },

  // ── Scores géants (jauge analyse) ────────────────────────────────
  scoreGiant: {
    fontFamily: fontFamilies.bold,
    fontSize: fontSizes['5xl'],   // 40
    lineHeight: fontSizes['5xl'],
    letterSpacing: -1,
  },
  scoreLarge: {
    fontFamily: fontFamilies.bold,
    fontSize: fontSizes['4xl'],   // 32
    lineHeight: fontSizes['4xl'],
    letterSpacing: -0.5,
  },
} as const
