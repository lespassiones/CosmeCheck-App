/**
 * Constantes de routes Expo Router pour CosmeCheck.
 * Centralise toutes les routes de l'app pour éviter les strings hardcodées.
 */

export const ROUTES = {
  // ── Auth ────────────────────────────────────────────────────────
  AUTH: {
    SIGN_IN: '/(auth)/sign-in',
    SIGN_UP: '/(auth)/sign-up',
    FORGOT_PASSWORD: '/(auth)/forgot-password',
    RESET_PASSWORD: '/(auth)/reset-password',
  },

  // ── Pré-onboarding (carrousel 1er lancement, device-level) ──────
  PREONBOARDING: {
    INDEX: '/(preonboarding)',
  },

  // ── Onboarding ──────────────────────────────────────────────────
  ONBOARDING: {
    INDEX: '/(onboarding)',
  },

  // ── Tabs ────────────────────────────────────────────────────────
  TABS: {
    HOME: '/(tabs)',
    ROUTINE: '/(tabs)/routine',
    SCAN: '/(tabs)/scan',
    HISTORY: '/(tabs)/history',
    PROMESSES: '/(tabs)/promesses',
  },

  // ── Analyse ─────────────────────────────────────────────────────
  ANALYSE: {
    DETAIL: (id: string) => `/analyse/${id}` as const,
  },

  // ── Alternatives (page « Voir tout ») ────────────────────────────
  ALTERNATIVES: {
    DETAIL: (ean: string) => `/alternatives/${ean}` as const,
  },

  // ── Promesses ───────────────────────────────────────────────────
  PROMESSES: {
    NOUVELLE: '/promesses/nouvelle',
    DETAIL: (id: string) => `/promesses/${id}` as const,
  },

  // ── Advisor ─────────────────────────────────────────────────────
  ADVISOR: {
    INDEX: '/advisor',
  },

  // ── Compare ─────────────────────────────────────────────────────
  COMPARE: {
    INDEX: '/compare',
  },

  // ── Profil ──────────────────────────────────────────────────────
  PROFILE: {
    INDEX: '/profile',
    RESTRICTIONS: '/profile/restrictions',
  },

  // ── Ingrédient ──────────────────────────────────────────────────
  INGREDIENT: {
    DETAIL: (slug: string) => `/ingredient/${slug}` as const,
  },

  // ── Offre ────────────────────────────────────────────────────────
  OFFRE: {
    INDEX: '/offre',
  },

  // ── Mentions légales / RGPD / CGU / À propos ──────────────────────
  LEGAL: {
    CGU: '/legal/cgu',
    PRIVACY: '/legal/privacy',
    MENTIONS: '/legal/mentions',
    ABOUT: '/legal/about',
  },
} as const

/**
 * Deep link scheme de l'application.
 * Utilisé pour les deep links OAuth et les notifications.
 * Défini dans app.json: "scheme": "cosmecheck"
 */
export const APP_SCHEME = 'cosmecheck'

/**
 * URLs de deep link.
 * Ex: cosmecheck://reset-password
 */
export const DEEP_LINKS = {
  RESET_PASSWORD: `${APP_SCHEME}://reset-password`,
  AUTH_CALLBACK: `${APP_SCHEME}://auth/callback`,
} as const

/**
 * Type utilitaire pour les routes d'analyse.
 * Utilisation: ROUTES.ANALYSE.DETAIL(analysis.id)
 */
export type AnalyseRoute = ReturnType<typeof ROUTES.ANALYSE.DETAIL>
export type PromesseRoute = ReturnType<typeof ROUTES.PROMESSES.DETAIL>
export type IngredientRoute = ReturnType<typeof ROUTES.INGREDIENT.DETAIL>
