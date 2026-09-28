/**
 * Une seule note par produit — garde-fou du bug bêta « la recherche dit jaune,
 * la fiche dit 4 étoiles vertes » (Stela, 12 sept 2026).
 *
 * Cas réel, EAN 8809640739019 (Anua Azelaic Acid 10 Hyaluron Serum) :
 *   - `catalog.score` = 12,9 avec `count_rouge` = 1 → œil jaune en recherche ;
 *   - analyse live      = 16,51 (28 verts / 7 jaunes / 0 orange / 0 rouge)
 *     → 4 étoiles vertes sur la fiche.
 * L'ancien arbitrage servait le live sur la fiche et le catalogue dans la liste.
 * Deux notes pour un même produit, et `routine-smart-suggest` qualifiant sur la
 * note catalogue, les recommandations partaient aussi de travers.
 *
 * Règle vérifiée ici : le catalogue gagne TOUJOURS quand il porte une note, et
 * le plafond couleur s'applique sur les compteurs de la MÊME source que la note
 * (ceux du catalogue quand la note vient du catalogue). Les deux surfaces
 * tombent donc forcément sur la même bande.
 */
import { applyColorCap, resolveDisplayScore, scoreToneFromScore } from '../analysis/scoreCap'

/** Ce qu'affiche une carte de recherche / une alternative / un mini-produit. */
function searchSurface(catalogScore: number | null, cOrange: number, cRouge: number) {
  return applyColorCap(catalogScore ?? 0, cOrange, cRouge)
}

/** Ce qu'affiche la fiche produit (étoiles + jauge). */
function sheetSurface(
  catalogScore: number | null,
  servedScore: number | null,
  catalogCounts: { orange: number; rouge: number } | null,
  liveCounts: { orange: number; rouge: number },
) {
  const base = resolveDisplayScore(catalogScore, servedScore)
  const counts = catalogScore != null && catalogCounts ? catalogCounts : liveCounts
  return base == null ? null : applyColorCap(base, counts.orange, counts.rouge)
}

describe('cas Anua — la fiche et la recherche ne se contredisent plus', () => {
  const CATALOG = 12.9
  const CATALOG_COUNTS = { orange: 0, rouge: 1 }
  const LIVE = 16.51
  const LIVE_COUNTS = { orange: 0, rouge: 0 }

  it('les deux surfaces affichent la même note', () => {
    const search = searchSurface(CATALOG, CATALOG_COUNTS.orange, CATALOG_COUNTS.rouge)
    const sheet = sheetSurface(CATALOG, LIVE, CATALOG_COUNTS, LIVE_COUNTS)
    expect(sheet).toBe(search)
    expect(sheet).toBe(12.9)
  })

  it('et donc la même bande de couleur (œil jaune des deux côtés)', () => {
    const search = searchSurface(CATALOG, CATALOG_COUNTS.orange, CATALOG_COUNTS.rouge)
    const sheet = sheetSurface(CATALOG, LIVE, CATALOG_COUNTS, LIVE_COUNTS)!
    expect(scoreToneFromScore(search)).toBe('amber')
    expect(scoreToneFromScore(sheet)).toBe('amber')
  })

  it('l’ancien comportement (servir le live) aurait bien donné deux bandes', () => {
    // Garde-fou explicite : on documente ce qu'on a CESSÉ de faire.
    expect(scoreToneFromScore(LIVE)).toBe('green')
    expect(scoreToneFromScore(CATALOG)).toBe('amber')
  })
})

describe('produit hors catalogue — le score de l’analyse reste servi', () => {
  it('sans note catalogue, la fiche utilise le score live', () => {
    const sheet = sheetSurface(null, 16.51, null, { orange: 0, rouge: 0 })
    expect(sheet).toBe(16.51)
    expect(scoreToneFromScore(sheet!)).toBe('green')
  })

  it('le plafond couleur s’applique alors sur les compteurs de l’analyse', () => {
    // 2 rouges → plafond 8,9 quelle que soit la note annoncée.
    const sheet = sheetSurface(null, 17.4, null, { orange: 0, rouge: 2 })
    expect(sheet).toBe(8.9)
    expect(scoreToneFromScore(sheet!)).toBe('orange')
  })

  it('aucune note nulle part → rien à afficher', () => {
    expect(sheetSurface(null, null, null, { orange: 0, rouge: 0 })).toBeNull()
  })
})

describe('plafond couleur : mêmes compteurs des deux côtés', () => {
  it('utiliser les compteurs LIVE avec une note CATALOGUE recréerait l’écart', () => {
    // Catalogue 16,3 mais 1 rouge côté catalogue → la recherche plafonne à 12,9.
    const search = searchSurface(16.3, 0, 1)
    expect(scoreToneFromScore(search)).toBe('amber')
    // Si la fiche prenait les compteurs live (0 rouge), elle resterait à 16,3.
    const wrong = applyColorCap(16.3, 0, 0)
    expect(scoreToneFromScore(wrong)).toBe('green')
    // Avec les compteurs catalogue, elle retombe sur la même bande que la liste.
    const right = sheetSurface(16.3, 16.3, { orange: 0, rouge: 1 }, { orange: 0, rouge: 0 })!
    expect(right).toBe(search)
    expect(scoreToneFromScore(right)).toBe('amber')
  })

  it('un produit sain n’est jamais modifié par le plafond', () => {
    expect(searchSurface(18.2, 0, 0)).toBe(18.2)
    expect(sheetSurface(18.2, 18.2, { orange: 0, rouge: 0 }, { orange: 0, rouge: 0 })).toBe(18.2)
  })
})
