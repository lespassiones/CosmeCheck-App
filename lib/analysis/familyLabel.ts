/**
 * Convertit des slugs de familles restreintes en noms d'affichage.
 * Ex: 'paraben' → 'Parabens'
 */

export const FAMILY_DISPLAY_NAMES: Record<string, string> = {
  paraben: 'Parabens',
  silicone: 'Silicones',
  sulfate: 'Sulfates',
  'huile-minerale': 'Huiles minérales',
  ethoxyle: 'Composés éthoxylés',
  'colorant-synthese': 'Colorants de synthèse',
  'ammonium-quaternaire': 'Ammoniums quaternaires',
  'allergene-parfumant': 'Allergènes parfumants',
  conservateur: 'Conservateurs',
  'parfum-synthese': 'Parfums de synthèse',
  'huile-essentielle': 'Huiles essentielles',
}

export function familyLabel(slug: string): string {
  return FAMILY_DISPLAY_NAMES[slug] || slug
}

export function familyLabels(slugs: string[]): string[] {
  return slugs.map(familyLabel)
}
