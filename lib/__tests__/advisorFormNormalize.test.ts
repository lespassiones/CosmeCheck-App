/**
 * normalizeAdvisorForm — garde-fou de RÉGRESSION du Beauty Advisor (agent).
 *
 * Contexte incident (juil 2026) : l'Edge Function `advisor-agent` passait le
 * champ `form` généré par le LLM DIRECTEMENT à la RPC `cosme_check_recommend_products`,
 * SANS le normaliser. Or gpt-5-mini/gpt-5 génèrent souvent des PHRASES
 * descriptives ("traitement anti-imperfections visage", "soin anti-taches peau
 * sensible", "boutons visage", "anti-rides"…). La RPC fait un AND STRICT sur les
 * segments de `catalog.category` : un seul mot hors-taxonomie → 0 produit →
 * carrousel « Quelques pistes à considérer » VIDE (bug rapporté).
 *
 * Le correctif rebranche `normalizeAdvisorForm()` dans `advisor-agent` (il était
 * déjà utilisé par l'ancien `advisor-chat`). Ce test verrouille le mapping des
 * formes-phrases RÉELLEMENT produites par le modèle (capturées lors du probe)
 * vers des tokens de catégorie VALIDES (vérifiés côté RPC : ils renvoient 30
 * produits, alors que les phrases brutes en renvoyaient 0).
 */
import { normalizeAdvisorForm } from '../../supabase/functions/advisor-chat/normalizeAdvisorForm'

describe('normalizeAdvisorForm — formes-phrases du LLM (bug réel) → token catalogue valide', () => {
  // Chaque entrée : [ form brut généré par gpt-5*, token canonique attendu ].
  // Les phrases brutes renvoyaient 0 produit ; les tokens attendus en renvoient 30.
  const CASES: Array<[string, string]> = [
    ['traitement boutons taches visage', 'serum visage'],
    ['traitement anti-imperfections visage', 'imperfections'],
    ['soin visage anti-imperfections taches', 'imperfections'],
    ['soin anti-imperfections taches peau sensible', 'imperfections'],
    ['anti-acné visage', 'imperfections'],
    ['boutons visage', 'imperfections'],
    ['anti-rides', 'serum visage'],
    ['traitement anti-imperfections', 'imperfections'],
  ]

  it.each(CASES)('« %s » → « %s »', (raw, expected) => {
    expect(normalizeAdvisorForm(raw)).toBe(expected)
  })

  it('aucune forme-phrase du bug ne reste une phrase multi-mots hors-catégorie', () => {
    for (const [raw] of CASES) {
      const out = normalizeAdvisorForm(raw)
      expect(out).not.toBeNull()
      // Un token de catégorie valide fait au plus 2 mots (« serum visage »,
      // « yeux contour »…). Une phrase de 3+ mots = non normalisée = 0 produit.
      expect((out as string).split(' ').length).toBeLessThanOrEqual(2)
    }
  })
})

describe('normalizeAdvisorForm — formes déjà canoniques : passthrough (pas de régression)', () => {
  const OK: Array<[string, string]> = [
    ['serum visage', 'serum visage'],
    ['hydratant visage', 'hydratant visage'],
    ['hydratant corps', 'hydratant corps'],
    ['imperfections', 'imperfections'],
    ['shampoing', 'shampoing'],
    ['deodorant', 'deodorant'],
    ['baume levres', 'baume levres'],
    ['fond teint', 'fond teint'],
  ]
  it.each(OK)('« %s » → « %s »', (raw, expected) => {
    expect(normalizeAdvisorForm(raw)).toBe(expected)
  })
})

describe('normalizeAdvisorForm — entrées vides / nulles', () => {
  it('null / undefined / vide → null (la RPC cherche alors par ingrédients seuls)', () => {
    expect(normalizeAdvisorForm(null)).toBeNull()
    expect(normalizeAdvisorForm(undefined)).toBeNull()
    expect(normalizeAdvisorForm('')).toBeNull()
    expect(normalizeAdvisorForm('   ')).toBeNull()
  })
})
