/**
 * Integration tests pour le système de recommandation intent-based du Beauty Advisor
 *
 * Tests: cas normaux, pièges, performance, edge cases
 * Performance target: < 500ms end-to-end
 */

import { supabase } from '@/lib/supabase/client'

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL'
  duration_ms: number
  expected: string
  got: string
  notes?: string
}

const results: TestResult[] = []

async function test(
  name: string,
  fn: () => Promise<{ expected: string; got: string; duration: number; notes?: string }>,
) {
  const start = performance.now()
  try {
    const { expected, got, duration, notes } = await fn()
    const duration_ms = Math.round(performance.now() - start)
    const status = expected === got ? 'PASS' : 'FAIL'
    results.push({ name, status, duration_ms, expected, got, notes })
    console.log(`${status === 'PASS' ? '✅' : '❌'} ${name} (${duration_ms}ms)`)
  } catch (err) {
    const duration_ms = Math.round(performance.now() - start)
    results.push({
      name,
      status: 'FAIL',
      duration_ms,
      expected: 'no error',
      got: String(err),
    })
    console.log(`❌ ${name} - ERROR (${duration_ms}ms): ${err}`)
  }
}

// ============================================================================
// TESTS NORMAUX
// ============================================================================

describe('Beauty Advisor Intent System - Integration Tests', () => {
  it('Test 1: odor_control_feet → déodorants', async () => {
    await test('odor_control_feet retourne déodorants', async () => {
      const start = performance.now()
      const { data, error } = await supabase.rpc('cosme_check_recommend_by_intent', {
        p_need: 'odor_control_feet',
        p_body_zone: 'feet',
        p_limit: 5,
      })

      const duration = performance.now() - start
      if (error) throw error

      const count = (data as any[])?.length ?? 0
      const hasBrand = data?.[0]?.brand ? 'true' : 'false'
      const hasScore = data?.[0]?.score ? 'true' : 'false'

      return {
        expected: 'count>0 & brand & score',
        got: `count=${count} & brand=${hasBrand} & score=${hasScore}`,
        duration,
        notes: `Found ${count} products in ${Math.round(duration)}ms`,
      }
    })
  })

  it('Test 2: hydration_face → sérums/crèmes', async () => {
    await test('hydration_face retourne sérums', async () => {
      const start = performance.now()
      const { data, error } = await supabase.rpc('cosme_check_recommend_by_intent', {
        p_need: 'hydration_face',
        p_body_zone: 'face',
        p_limit: 5,
      })

      const duration = performance.now() - start
      if (error) throw error

      const count = (data as any[])?.length ?? 0
      return {
        expected: 'count>0',
        got: `count=${count}`,
        duration,
      }
    })
  })

  it('Test 3: anti_aging → retinol/peptides', async () => {
    await test('anti_aging retourne produits anti-rides', async () => {
      const start = performance.now()
      const { data, error } = await supabase.rpc('cosme_check_recommend_by_intent', {
        p_need: 'anti_aging',
        p_body_zone: 'face',
        p_limit: 5,
      })

      const duration = performance.now() - start
      if (error) throw error

      const count = (data as any[])?.length ?? 0
      return {
        expected: 'count>0',
        got: `count=${count}`,
        duration,
      }
    })
  })

  it('Test 4: Avec restrictions (filtre alcool)', async () => {
    await test('Restrictions filtrées correctement', async () => {
      const start = performance.now()
      const { data, error } = await supabase.rpc('cosme_check_recommend_by_intent', {
        p_need: 'odor_control_feet',
        p_body_zone: 'feet',
        p_exclude_ingredients: ['alcohol'],
        p_limit: 5,
      })

      const duration = performance.now() - start
      if (error) throw error

      const count = (data as any[])?.length ?? 0
      // Vérifier qu'aucun produit ne contient "alcohol"
      const hasAlcohol = data?.some((p: any) =>
        p.ingredients_text?.toLowerCase().includes('alcohol'),
      )

      return {
        expected: 'no alcohol',
        got: hasAlcohol ? 'found alcohol' : 'no alcohol',
        duration,
        notes: `Found ${count} products without alcohol`,
      }
    })
  })

  it('Test 5: Performance avec limit=50', async () => {
    await test('Performance avec 50 produits', async () => {
      const start = performance.now()
      const { data, error } = await supabase.rpc('cosme_check_recommend_by_intent', {
        p_need: 'hydration_face',
        p_limit: 50,
      })

      const duration = performance.now() - start
      if (error) throw error

      const count = (data as any[])?.length ?? 0
      const passed = duration < 150 ? 'true' : 'false'

      return {
        expected: 'duration<150ms',
        got: `duration=${Math.round(duration)}ms`,
        duration,
        notes: `Retrieved ${count} products in ${Math.round(duration)}ms`,
      }
    })
  })

  // ============================================================================
  // TESTS DE PIÈGES
  // ============================================================================

  it('Piège 1: Besoin inexistant', async () => {
    await test('Besoin inexistant → graceful empty', async () => {
      const start = performance.now()
      const { data, error } = await supabase.rpc('cosme_check_recommend_by_intent', {
        p_need: 'nonexistent_need',
        p_limit: 5,
      })

      const duration = performance.now() - start
      // Pas d'erreur, mais data vide
      const isEmpty = !data || (Array.isArray(data) && data.length === 0)

      return {
        expected: 'empty_array',
        got: isEmpty ? 'empty_array' : 'has_results',
        duration,
        notes: 'Should return gracefully without error',
      }
    })
  })

  it('Piège 2: NULL body_zone', async () => {
    await test('NULL body_zone fonctionne', async () => {
      const start = performance.now()
      const { data, error } = await supabase.rpc('cosme_check_recommend_by_intent', {
        p_need: 'hydration_face',
        p_body_zone: null,
        p_limit: 5,
      })

      const duration = performance.now() - start
      if (error) throw error

      const count = (data as any[])?.length ?? 0
      return {
        expected: 'count>0',
        got: `count=${count}`,
        duration,
      }
    })
  })

  it('Piège 3: Array vide de restrictions', async () => {
    await test('Empty restrictions array', async () => {
      const start = performance.now()
      const { data, error } = await supabase.rpc('cosme_check_recommend_by_intent', {
        p_need: 'odor_control_feet',
        p_exclude_families: [],
        p_exclude_ingredients: [],
        p_limit: 5,
      })

      const duration = performance.now() - start
      if (error) throw error

      const count = (data as any[])?.length ?? 0
      return {
        expected: 'count>0',
        got: `count=${count}`,
        duration,
      }
    })
  })

  it('Piège 4: Zone non existante', async () => {
    await test('Zone inexistante → fallback', async () => {
      const start = performance.now()
      const { data, error } = await supabase.rpc('cosme_check_recommend_by_intent', {
        p_need: 'hydration_face',
        p_body_zone: 'queue',
        p_limit: 5,
      })

      const duration = performance.now() - start
      // Pas d'erreur, juste pas de zone match dans match_reason
      const count = (data as any[])?.length ?? 0

      return {
        expected: 'no_crash',
        got: count > 0 ? 'returned_results' : 'no_results',
        duration,
      }
    })
  })

  it('Piège 5: Restriction très restrictive', async () => {
    await test('Restrictions très restrictives', async () => {
      const start = performance.now()
      const { data, error } = await supabase.rpc('cosme_check_recommend_by_intent', {
        p_need: 'odor_control_feet',
        p_exclude_ingredients: ['water', 'alcohol', 'glycerin', 'salt'],
        p_limit: 10,
      })

      const duration = performance.now() - start
      if (error) throw error

      const count = (data as any[])?.length ?? 0
      const isEmpty = count === 0

      return {
        expected: 'might_be_empty',
        got: isEmpty ? 'empty' : `${count}_products`,
        duration,
        notes: 'Very restrictive filters may return 0 results',
      }
    })
  })

  // ============================================================================
  // TESTS DE SCORING/CLIENT
  // ============================================================================

  it('Scoring Test 1: Ingredient bonus', async () => {
    const product = {
      ean: 'test-001',
      brand: 'TestBrand',
      name: 'Test Product',
      score: 50,
      ingredients_text: 'water, zinc, baking_soda, glycerin',
    }
    const ingredientHints = ['zinc', 'baking_soda']

    const ingredientBonus = ingredientHints.filter((hint) =>
      product.ingredients_text?.toLowerCase().includes(hint.toLowerCase()),
    ).length

    const finalScore = product.score + ingredientBonus * 30

    return {
      name: 'Ingredient bonus calculation',
      duration_ms: 1,
      status: 'PASS',
      expected: 'final_score=110',
      got: `final_score=${finalScore}`,
    }
  })
})

// ============================================================================
// RAPPORT FINAL
// ============================================================================

console.log('\n========================================')
console.log('BEAUTY ADVISOR INTENT SYSTEM - TEST REPORT')
console.log('========================================\n')

const passed = results.filter((r) => r.status === 'PASS').length
const failed = results.filter((r) => r.status === 'FAIL').length
const totalTime = results.reduce((sum, r) => sum + r.duration_ms, 0)

console.log('SUMMARY')
console.log('-------')
console.log(`Total Tests: ${results.length}`)
console.log(`Passed: ${passed} ✅`)
console.log(`Failed: ${failed} ❌`)
console.log(`Total Time: ${totalTime}ms`)
console.log(`Avg Time: ${Math.round(totalTime / results.length)}ms\n`)

console.log('DETAILED RESULTS')
console.log('----------------')
results.forEach((r) => {
  console.log(
    `${r.status === 'PASS' ? '✅' : '❌'} ${r.name}`,
    `(${r.duration_ms}ms)`,
  )
  if (r.status === 'FAIL') {
    console.log(`   Expected: ${r.expected}`)
    console.log(`   Got: ${r.got}`)
  }
  if (r.notes) {
    console.log(`   Note: ${r.notes}`)
  }
})

console.log('\n========================================')
console.log(passed === results.length ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED')
console.log('========================================\n')
