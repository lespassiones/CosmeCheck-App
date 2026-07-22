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

describe('normalizeAdvisorForm — accents + pieds (bug réel « déo pieds → déos aisselles », 22 juil 2026)', () => {
  // Le LLM écrit en français ACCENTUÉ : sans désaccentuation, « déodorant
  // pieds » ratait la règle déo-pieds, tombait sur /\bpieds?\b/ → hydratants
  // pieds → 0 candidat avec les terms → repli → déos aisselles affichés.
  const CASES: Array<[string, string]> = [
    ['déodorant pieds', 'deodorant pieds'],
    ['déodorant pour les pieds', 'deodorant pieds'],
    ['deodorant pour les pieds', 'deodorant pieds'],
    ['déo pieds', 'deodorant pieds'],
    ['odeur pieds', 'deodorant pieds'],
    ['anti-odeur pieds', 'deodorant pieds'],
    ['transpiration des pieds', 'deodorant pieds'],
    ['pieds qui transpirent', 'deodorant pieds'],
    ['déodorant', 'deodorant'], // sans zone → aisselles, comportement voulu
    ['pieds secs', 'hydratants pieds'],
    ['gommage pour les pieds', 'gommage pieds'],
    ['sérum visage', 'serum visage'],
    ['bébé', 'bebe'],
    ['baume lèvres', 'baume levres'],
    ['crème hydratante visage', 'hydratant visage'],
  ]
  it.each(CASES)('« %s » → « %s »', (raw, expected) => {
    expect(normalizeAdvisorForm(raw)).toBe(expected)
  })
})

describe('normalizeAdvisorForm — solaire (le segment base est "creme-solaire", sans zone)', () => {
  // Sans règle solaire, « crème solaire visage » donnait le résidu
  // « solaire visage » → AND strict → 0 produit (alors que 1102 solaires verts
  // existent) → réponse « rien trouvé » à tort.
  const CASES: Array<[string, string]> = [
    ['crème solaire visage', 'solaire'],
    ['creme solaire', 'solaire'],
    ['protection solaire', 'solaire'],
    ['écran total', 'solaire'],
    ['spf 50', 'solaire'],
    ['après-soleil', 'apres soleil'],
    ['autobronzant', 'autobronzant'],
  ]
  // Eau micellaire : le segment base est "eau-micellaire" — la règle générique
  // "demaquillant" le rendait invisible (1039 produits verts ratés).
  it('« eau micellaire » → « micellaire » (pas « demaquillant »)', () => {
    expect(normalizeAdvisorForm('eau micellaire')).toBe('micellaire')
    expect(normalizeAdvisorForm('eau micellaire démaquillante')).toBe('micellaire')
    expect(normalizeAdvisorForm('démaquillant')).toBe('demaquillant')
  })
  it.each(CASES)('« %s » → « %s »', (raw, expected) => {
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
