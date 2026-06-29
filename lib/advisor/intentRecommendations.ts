/**
 * Intent Recommendations — Récupère et score les produits recommandés
 *
 * Flow:
 *   1. Appelle RPC cosme_check_recommend_by_intent
 *   2. Score local (product_scoring.ts)
 *   3. Tri et limite top N
 */

import { db } from '@/lib/supabase/client';
import {
  scoreProduct,
  sortProductsByScore,
  type ProductScore,
} from './productScoring';

// Type definitions for RPC response and user profile
interface CatalogProduct {
  ean: string;
  brand: string;
  name: string;
  score: number;
  ingredients_text?: string;
  product_category?: string;
  sub_category?: string;
  product_type?: string;
  count_total?: number;
}

interface UserProfile {
  id: string;
  first_name?: string;
  tier?: string;
  preferences?: Record<string, any>;
}

export interface RecommendationResult {
  product: CatalogProduct;
  score: ProductScore;
  confidence: number;
}

/**
 * Récupère les recommandations basées sur un intent
 *
 * @param need Intent need code (e.g., 'hydration_face')
 * @param bodyZone Optional body zone
 * @param restrictions User restrictions (ingredients & families)
 * @param profile User profile (pour routine, skin type, etc.)
 * @param limit Nombre de produits à retourner
 * @returns Promise<RecommendationResult[]>
 */
export async function fetchRecommendationsByIntent(
  need: string,
  bodyZone: string | null,
  restrictions: {
    ingredients: string[];
    families: string[];
  },
  profile: UserProfile | null,
  limit: number = 10,
): Promise<RecommendationResult[]> {
  if (!need) {
    return [];
  }

  const startTime = performance.now();

  try {
    // 1. Call RPC to get recommendations
    const rpcStartTime = performance.now();

    const { data: rpcResults, error: rpcError } = await db()
      .rpc('cosme_check_recommend_by_intent', {
        p_need: need,
        p_body_zone: bodyZone,
        p_exclude_families: restrictions.families,
        p_exclude_ingredients: restrictions.ingredients,
        p_limit: limit * 2, // Fetch extra, filter locally
      });

    const rpcEndTime = performance.now();
    console.log(
      `[fetchRecommendationsByIntent] RPC call took ${(rpcEndTime - rpcStartTime).toFixed(0)}ms`,
    );

    if (rpcError) {
      console.error('[fetchRecommendationsByIntent] RPC error:', rpcError);
      return [];
    }

    if (!rpcResults || rpcResults.length === 0) {
      console.log('[fetchRecommendationsByIntent] No products found for intent:', need);
      return [];
    }

    // 2. Get intent mapping to extract ingredient hints
    const { data: intentMappings, error: intentError } = await db()
      .from('product_intent_mapping')
      .select('ingredient_hints')
      .eq('need', need)
      .single();

    if (intentError) {
      console.warn('[fetchRecommendationsByIntent] Could not load intent hints:', intentError);
    }

    const ingredientHints = intentMappings?.ingredient_hints || undefined;

    // 3. Get user routine (for bonus)
    let routineEans: string[] = [];
    if (profile?.id) {
      const { data: routineData } = await db()
        .from('routine_items')
        .select('analysis_id')
        .eq('user_id', profile.id)
        .limit(50);

      if (routineData && routineData.length > 0) {
        const analysisIds = routineData.map((r: any) => r.analysis_id);
        const { data: analyses } = await db()
          .from('analyses')
          .select('result_json')
          .in('id', analysisIds);

        if (analyses) {
          routineEans = analyses
            .map((a: any) => {
              try {
                const json = typeof a.result_json === 'string'
                  ? JSON.parse(a.result_json)
                  : a.result_json;
                return json?.product_ean;
              } catch {
                return null;
              }
            })
            .filter(Boolean);
        }
      }
    }

    // 4. Score each product locally
    const scoringStartTime = performance.now();

    const recommendations: RecommendationResult[] = (rpcResults || [])
      .map((row: any) => {
        // Convert RPC result to CatalogProduct-like object
        const product: CatalogProduct = {
          ean: row.ean || '',
          brand: row.brand || '',
          name: row.name || '',
          score: row.score || 0,
          ingredients_text: row.ingredients_text || '',
          product_category: row.product_category || '',
          sub_category: row.sub_category || '',
          product_type: row.product_type || '',
          count_total: 0,
        };

        const score = scoreProduct(
          product as any,
          ingredientHints,
          bodyZone,
          restrictions.ingredients,
          restrictions.families,
          routineEans.includes(row.ean || ''),
        );

        return {
          product,
          score,
          confidence: row.relevance_score || 0.5,
        };
      })
      .filter((rec: RecommendationResult) => rec.score.final_score >= 0); // Exclude restricted products

    const scoringEndTime = performance.now();
    console.log(
      `[fetchRecommendationsByIntent] Scoring ${recommendations.length} products took ${(scoringEndTime - scoringStartTime).toFixed(0)}ms`,
    );

    // 5. Sort and limit
    const sorted = recommendations.sort(
      (a, b) => b.score.final_score - a.score.final_score,
    );

    const endTime = performance.now();
    console.log(
      `[fetchRecommendationsByIntent] Total execution took ${(endTime - startTime).toFixed(0)}ms`,
    );

    return sorted.slice(0, limit);
  } catch (error) {
    console.error('[fetchRecommendationsByIntent] Error:', error);
    return [];
  }
}

/**
 * Format recommendations for display in chat
 */
export function formatRecommendationsForChat(
  recommendations: RecommendationResult[],
  headerText: string = 'Je te recommande ces produits:',
): string {
  if (recommendations.length === 0) {
    return "Je n'ai pas trouvé de produits qui correspondent. Peux-tu me donner plus de détails?";
  }

  const lines = [headerText, ''];

  recommendations.forEach((rec: RecommendationResult, idx: number) => {
    const stars = Math.round(rec.score.final_score / 20);
    const starStr = '⭐'.repeat(Math.max(1, Math.min(5, stars)));

    lines.push(
      `${idx + 1}. **${rec.product.brand} ${rec.product.name}** ${starStr}`,
    );
    lines.push(
      `   Score: ${rec.score.final_score}${rec.score.reasoning.length > 0 ? ' (' + rec.score.reasoning[0] + ')' : ''}`,
    );
  });

  return lines.join('\n');
}
