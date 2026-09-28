/**
 * Renommer une analyse — garde-fou du bug bêta « Renommer ne marche pas »
 * (Stela, 12 sept 2026).
 *
 * Le renommage écrivait bien `analyses.name` en base, mais les écrans ne
 * lisaient pas tous le même champ en premier : l'historique affichait `name`
 * puis `product_label`, la FICHE produit l'inverse. On renommait, la liste
 * changeait, la fiche non.
 *
 * Règle désormais unique :
 *   - `displayTitle` (nom vu par le propriétaire) : son renommage gagne ;
 *   - `catalogTitle` (identité du produit) : le nom RÉEL, jamais le renommage,
 *     parce qu'il sert à retrouver la ligne catalogue, l'image et les
 *     alternatives. Renommer « Mon sérum du soir » ne doit pas faire chercher
 *     un produit qui n'existe pas.
 */
import { catalogTitle, displayTitle } from '../analysis/displayTitle'

describe('displayTitle — le renommage est ce que l’utilisateur voit', () => {
  it('préfère le nom personnalisé au libellé produit', () => {
    const row = { name: 'Mon sérum du soir', product_label: 'Azelaic Acid 10 Serum' }
    expect(displayTitle(row)).toBe('Mon sérum du soir')
  })

  it('retombe sur le libellé produit quand le nom est vide ou absent', () => {
    expect(displayTitle({ name: '', product_label: 'Azelaic Acid 10' })).toBe('Azelaic Acid 10')
    expect(displayTitle({ name: '   ', product_label: 'Azelaic Acid 10' })).toBe('Azelaic Acid 10')
    expect(displayTitle({ name: null, product_label: 'Azelaic Acid 10' })).toBe('Azelaic Acid 10')
    expect(displayTitle({ product_label: 'Azelaic Acid 10' })).toBe('Azelaic Acid 10')
  })

  it('utilise le repli fourni quand les deux libellés manquent', () => {
    expect(displayTitle({ name: null, product_label: null })).toBe('Analyse')
    expect(displayTitle({}, 'Analyse de votre liste')).toBe('Analyse de votre liste')
  })

  it('ignore les espaces autour du nom personnalisé', () => {
    expect(displayTitle({ name: '  Mon soin  ', product_label: 'X' })).toBe('Mon soin')
  })
})

describe('catalogTitle — l’identité produit ne suit JAMAIS le renommage', () => {
  it('garde le libellé produit même quand l’utilisateur a renommé', () => {
    const row = { name: 'Mon sérum du soir', product_label: 'Azelaic Acid 10 Serum' }
    expect(catalogTitle(row)).toBe('Azelaic Acid 10 Serum')
  })

  it('retombe sur le nom seulement si le libellé produit manque', () => {
    expect(catalogTitle({ name: 'Analyse du 12 sept', product_label: null }))
      .toBe('Analyse du 12 sept')
  })

  it('les deux lectures divergent dès qu’il y a un renommage (c’est le but)', () => {
    const row = { name: 'Mon soin', product_label: 'CeraVe Gel Nettoyant' }
    expect(displayTitle(row)).not.toBe(catalogTitle(row))
  })

  it('les deux lectures coïncident quand rien n’a été renommé', () => {
    // À la création, `name` est pré-rempli avec `product_label`.
    const row = { name: 'CeraVe Gel Nettoyant', product_label: 'CeraVe Gel Nettoyant' }
    expect(displayTitle(row)).toBe(catalogTitle(row))
  })
})
