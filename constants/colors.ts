/**
 * Tokens de couleurs du design system CosmeCheck.
 * Reprend exactement les valeurs du web app (CosmetWiki).
 */

export const colors = {
  // ── Couleurs de base ──────────────────────────────────────────────
  bg: '#FAFAFA',           // Fond d'écran principal
  surface: '#FFFFFF',      // Fond des cartes, modals
  ink: '#1F2937',          // Texte principal
  inkMuted: '#6B7280',     // Texte secondaire / labels
  inkLight: '#9CA3AF',     // Texte désactivé, placeholders
  border: '#E5E7EB',       // Bordures légères
  borderMuted: 'rgba(0,0,0,0.06)', // Bordures très subtiles

  // ── Accent & Brand ────────────────────────────────────────────────
  accent: '#8B5CF6',       // Violet — couleur principale CTA
  accentDeep: '#7C3AED',   // Violet foncé (pressed state)
  accentDark: '#6D28D9',   // Violet très foncé (web accentDark)
  accentSoft: '#EDE9FE',   // Fond violet très clair
  rose: '#F43F5E',         // Rose — FAB central, CTAs primaires
  roseSoft: '#FFE4E6',     // Fond rose très clair
  roseDeep: '#E11D48',     // Rose foncé (pressed/hover)

  // ── Système de notation (Rating) ─────────────────────────────────
  // text (couleur texte), bg/soft (fond chip), ink (texte foncé sur fond clair), DEFAULT (couleur pleine)
  rating: {
    vert: {
      text: '#16A34A',
      bg: '#DCFCE7',
      soft: '#DCFCE7',
      ink: '#14532D',
      DEFAULT: '#16A34A',
    },
    jaune: {
      text: '#CA8A04',
      bg: '#FEF9C3',
      soft: '#FEF9C3',
      ink: '#713F12',
      DEFAULT: '#CA8A04',
    },
    orange: {
      text: '#EA580C',
      bg: '#FFEDD5',
      soft: '#FFEDD5',
      ink: '#7C2D12',
      DEFAULT: '#EA580C',
    },
    rouge: {
      text: '#DC2626',
      bg: '#FEE2E2',
      soft: '#FEE2E2',
      ink: '#7F1D1D',
      DEFAULT: '#DC2626',
    },
  },

  // ── Neumorphisme ─────────────────────────────────────────────────
  neu: {
    bg: '#E8ECF1',          // Fond neumorphique
    shadowDark: '#C5CCD6',  // Ombre côté sombre
    shadowLight: '#FFFFFF', // Ombre côté clair
  },

  // ── Glassmorphisme ───────────────────────────────────────────────
  glass: {
    bg: 'rgba(255,255,255,0.70)',  // Fond semi-transparent
    bgStrong: 'rgba(255,255,255,0.90)', // Fond plus opaque (tab bar)
    border: 'rgba(0,0,0,0.06)',   // Bordure ring subtile
  },

  // ── États & Feedback ─────────────────────────────────────────────
  success: '#16A34A',
  successDeep: '#15803D', // Vert foncé — état pressed/hover des CTA primaires
  successSoft: '#DCFCE7',
  warning: '#CA8A04',
  warningSoft: '#FEF9C3',
  error: '#DC2626',
  errorSoft: '#FEE2E2',
  info: '#2563EB',
  infoSoft: '#DBEAFE',

  // ── Niveaux de gris utilitaires ──────────────────────────────────
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',

  // ── Blob / Donut (IngredientBlob) — DISTINCT des chips rating ─────
  blob: { vert: '#A3D26C', jaune: '#F6CE5A', orange: '#F49B43', rouge: '#E0432A' },
  // Ombres colorées neumorphiques par tranche
  blobShadow: {
    vert: 'rgba(123,176,67,0.70)',
    jaune: 'rgba(214,165,44,0.68)',
    orange: 'rgba(214,118,40,0.68)',
    rouge: 'rgba(190,52,28,0.68)',
  },
  blobText: { vert: '#84B043', jaune: '#D4A017', orange: '#E07F2C', rouge: '#C73523' },

  // ── HalfDonut (composant séparé) — palette HARD, distincte du blob ─
  halfDonut: { vert: '#10B981', jaune: '#FBBF24', orange: '#F97316', rouge: '#F43F5E', empty: '#E5E7EB' },

  // ── Spectrum (carrés analyse) ─────────────────────────────────────
  spectrum: { vert: '#10B981', jaune: '#FBBF24', orange: '#FB923C', rouge: '#F43F5E', empty: '#E5E7EB' },

  // ── Verdict (PROMESSES) — source unique de vérité ─────────────────
  verdict: {
    tenue:         { DEFAULT: '#10B981', soft: '#ECFDF5', ring: '#A7F3D0', text: '#047857' },
    partielle:     { DEFAULT: '#FBBF24', soft: '#FFFBEB', ring: '#FDE68A', text: '#B45309' },
    marketing:     { DEFAULT: '#FB923C', soft: '#FFF7ED', ring: '#FED7AA', text: '#C2410C' },
    non_demontree: { DEFAULT: '#EF4444', soft: '#FEF2F2', ring: '#FECACA', text: '#B91C1C' },
    contredite:    { DEFAULT: '#DC2626', soft: '#FEF2F2', ring: '#FCA5A5', text: '#991B1B' },
  },

  // ── Sélection de texte (TextInput selectionColor) ─────────────────
  textSelection: 'rgba(244,63,94,0.20)',
} as const

// Alias pratiques
export const ratingColors = colors.rating
export const neuColors = colors.neu
export const glassColors = colors.glass

// Type utilitaire pour les ratings
export type RatingKey = keyof typeof colors.rating
