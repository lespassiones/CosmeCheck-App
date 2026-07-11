/**
 * Clé de dédoublonnage des alertes conflit de routine (lib/notifications/planner.ts).
 *
 * POURQUOI ces tests : la clé doit être symétrique (l'ordre des deux produits
 * ne change rien), insensible à la casse/aux accents/aux espaces, et distincte
 * par semaine ISO et par paire de produits (sinon on rate ou on double une
 * alerte). La logique de planification du bilan peau a été retirée avec la
 * fonctionnalité Score de peau (juillet 2026).
 */

import { conflictDedupKey } from '@/lib/notifications/planner'

describe('conflictDedupKey', () => {
  it('est symétrique : (A, B) et (B, A) donnent la même clé', () => {
    const w = '2026-W28'
    expect(conflictDedupKey('Retinol Serum', 'Vitamine C', w)).toBe(
      conflictDedupKey('Vitamine C', 'Retinol Serum', w),
    )
  })

  it('normalise casse, accents et espaces superflus', () => {
    const w = '2026-W28'
    expect(conflictDedupKey('  RÉTINOL   Serum ', 'vitamine c', w)).toBe(
      conflictDedupKey('retinol serum', 'Vitamine C', w),
    )
  })

  it('une semaine différente produit une clé différente', () => {
    const a = conflictDedupKey('Retinol Serum', 'Vitamine C', '2026-W28')
    const b = conflictDedupKey('Retinol Serum', 'Vitamine C', '2026-W29')
    expect(a).not.toBe(b)
  })

  it('des paires de produits différentes produisent des clés différentes', () => {
    const w = '2026-W28'
    expect(conflictDedupKey('Retinol Serum', 'Vitamine C', w)).not.toBe(
      conflictDedupKey('Retinol Serum', 'AHA Peeling', w),
    )
  })
})
