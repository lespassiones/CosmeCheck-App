/**
 * Constantes de routes Expo Router pour CosmeCheck.
 * Centralise toutes les routes de l'app pour éviter les strings hardcodées.
 */

export const ROUTES = {
  // ── Auth ────────────────────────────────────────────────────────
  AUTH: {
    WELCOME: '/(auth)/welcome',
    SIGN_IN: '/(auth)/sign-in',
    SIGN_UP: '/(auth)/sign-up',
    FORGOT_PASSWORD: '/(auth)/forgot-password',
    RESET_PASSWORD: '/(auth)/reset-password',
  },

  // ── Pré-onboarding : parcours « Le diagnostic de Perle » en mode invité ──
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
    /** Plus d'onglet dédié (28/09/2026) : onglet « Promesses » de l'Historique. */
    PROMESSES: '/(tabs)/history?tab=promesses',
    PROFIL: '/(tabs)/profil',
  },

  // ── Routine (pages détail hors tab) ──────────────────────────────
  ROUTINE: {
    EXPOSITION: '/routine/exposition',
    PRODUITS: '/routine/produits',
    FAVORIS: '/routine/favoris',
    ITEM: (id: string) => `/routine/item/${id}` as const,
  },

  // ── Analyse ─────────────────────────────────────────────────────
  ANALYSE: {
    DETAIL: (id: string) => `/analyse/${id}` as const,
    /** Page « Liste des ingrédients » ; `focus` = position à afficher d'emblée. */
    INGREDIENTS: (id: string, focus?: number) =>
      focus != null ? `/analyse/ingredients/${id}?focus=${focus}` : `/analyse/ingredients/${id}`,
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
    RECOMMENDATIONS: '/advisor/recommendations',
  },

  // ── Compare ─────────────────────────────────────────────────────
  COMPARE: {
    INDEX: '/compare',
  },

  // ── Profil ──────────────────────────────────────────────────────
  PROFILE: {
    /** Le profil est un onglet de la barre du bas depuis le 28/09/2026. */
    INDEX: '/(tabs)/profil',
    RESTRICTIONS: '/profile/restrictions',
    OBJECTIVES: '/profile/objectives',
    BEAUTY: '/profile/beauty',
    CREDITS: '/profile/credits',
  },

  // ── Ingrédient ──────────────────────────────────────────────────
  INGREDIENT: {
    /** Annuaire complet (liste alphabétique + recherche). */
    INDEX: '/ingredient',
    DETAIL: (slug: string) => `/ingredient/${slug}` as const,
  },

  // ── Offre ────────────────────────────────────────────────────────
  OFFRE: {
    INDEX: '/offre',
  },

  // ── Bienvenue Premium (après un achat réussi) ────────────────────
  PREMIUM: {
    WELCOME: '/premium',
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
