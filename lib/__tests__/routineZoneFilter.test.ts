/**
 * Filtre grossier de la liste routine (Visage / Corps / Cheveux / Autres).
 */
import { presentZones, routineZonesOf } from '../routine/zoneFilter'

describe('routineZonesOf', () => {
  it('classe un shampooing en cheveux (par le nom)', () => {
    expect(routineZonesOf({ product_label: 'Shampooing doux avoine' })).toEqual(['cheveux'])
  })

  it('classe une crème visage en visage', () => {
    expect(routineZonesOf({ product_label: 'Crème hydratante visage' })).toEqual(['visage'])
  })

  it('classe un gel douche en corps', () => {
    expect(routineZonesOf({ product_label: 'Gel douche surgras' })).toEqual(['corps'])
  })

  it('range un dentifrice dans « autres »', () => {
    expect(routineZonesOf({ product_label: 'Anticavity Toothpaste, Watermelon' })).toEqual(['autres'])
  })

  it('lit la catégorie catalogue de result_json en priorité', () => {
    expect(
      routineZonesOf({
        product_label: 'Soin nutritif',
        result_json: { catalogCategory: 'coiffure/soin-capillaire/masque-capillaire' },
      }),
    ).toEqual(['cheveux'])
  })

  it('sans aucun signal : « autres », jamais vide', () => {
    expect(routineZonesOf(null)).toEqual(['autres'])
    expect(routineZonesOf({})).toEqual(['autres'])
  })

  it('résiste à un result_json malformé', () => {
    expect(routineZonesOf({ product_label: 'Gel douche', result_json: { items: [null, 42] } })).toEqual([
      'corps',
    ])
  })
})

describe('presentZones', () => {
  it("renvoie les zones présentes dans l'ordre des filtres, sans doublon", () => {
    expect(presentZones([['cheveux'], ['visage', 'corps'], ['visage'], ['autres']])).toEqual([
      'visage',
      'corps',
      'cheveux',
      'autres',
    ])
    expect(presentZones([['corps'], ['corps']])).toEqual(['corps'])
    expect(presentZones([])).toEqual([])
  })
})
