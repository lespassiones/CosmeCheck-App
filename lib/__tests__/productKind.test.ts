import { classifyProductKind } from '@/lib/routine/productKind'

describe('classifyProductKind', () => {
  it('classe les soins visage comme routine (défaut)', () => {
    expect(classifyProductKind('Sérum vitamine C')).toBe('routine')
    expect(classifyProductKind('Crème hydratante visage')).toBe('routine')
    expect(classifyProductKind('Nettoyant doux')).toBe('routine')
    expect(classifyProductKind(null)).toBe('routine')
    expect(classifyProductKind('')).toBe('routine')
  })

  it('classe les produits du quotidien comme staple par nom', () => {
    expect(classifyProductKind('Dentifrice menthe')).toBe('staple')
    expect(classifyProductKind('Déodorant 48h')).toBe('staple')
    expect(classifyProductKind('Gel douche hydratant')).toBe('staple')
    expect(classifyProductKind('Shampooing fortifiant')).toBe('staple')
    expect(classifyProductKind('Eau de parfum')).toBe('staple')
    expect(classifyProductKind('Vernis à ongles rouge')).toBe('staple')
    expect(classifyProductKind('Savon de Marseille')).toBe('staple')
  })

  it('est insensible aux accents et à la casse', () => {
    expect(classifyProductKind('DÉODORANT')).toBe('staple')
    expect(classifyProductKind('deodorant')).toBe('staple')
    expect(classifyProductKind('Après-shampoing')).toBe('staple')
    expect(classifyProductKind('apres shampoing')).toBe('staple')
  })

  it('utilise la catégorie enum comme filet quand le nom ne matche pas', () => {
    expect(classifyProductKind('Produit inconnu', 'deodorant')).toBe('staple')
    expect(classifyProductKind('Produit inconnu', 'parfum')).toBe('staple')
    expect(classifyProductKind('Produit inconnu', 'shampooing')).toBe('staple')
    expect(classifyProductKind('Produit inconnu', 'nettoyant_visage')).toBe('routine')
  })

  it('le nom prime sur la catégorie (enum grossier)', () => {
    // Un dentifrice classé à tort « nettoyant_visage » par le LLM reste staple.
    expect(classifyProductKind('Dentifrice blancheur', 'nettoyant_visage')).toBe('staple')
  })
})
