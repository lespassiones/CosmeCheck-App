/**
 * Product Scoring — Calcule le score d'un produit basé sur intent + profil utilisateur
 *
 * Critères:
 *   - ingredient_bonus: +30 pour ingrédient principal match
 *   - zone_bonus: +20 pour zone match
 *   - restriction_penalty: -500 si contient restriction
 *   - routine_bonus: +15 si déjà dans routine
 *   - score_floor: produit doit avoir score ≥ min_score
 */

interface CatalogProduct {
  ean?: string;
  brand?: string;
  name?: string;
  score?: number;
  ingredients_text?: string | null;
  product_category?: string | null;
  sub_category?: string | null;
  product_type?: string | null;
  count_total?: number;
}

export interface ProductScore {
  ean: string;
  brand: string;
  name: string;
  base_score: number;
  ingredient_bonus: number;
  zone_bonus: number;
  restriction_penalty: number;
  routine_bonus: number;
  final_score: number;
  reasoning: string[];
}

/**
 * Calcule le score d'un produit basé sur:
 *   - Base: score du catalog
 *   - Intent: ingredient hints matching
 *   - Zone: body_zone matching (optionnel)
 *   - Restrictions: pénalité si ingrédient bloqué
 *   - Routine: bonus si déjà utilisé
 */
export function scoreProduct(
  product: CatalogProduct,
  ingredientHints: string[] | undefined,
  bodyZone: string | null,
  restricedIngredients: string[],
  restrictedFamilies: string[],
  alreadyInRoutine: boolean,
): ProductScore {
  const baseScore = product.score || 0;
  const reasoning: string[] = [];
  let ingredientBonus = 0;
  let zoneBonus = 0;
  let restrictionPenalty = 0;
  let routineBonus = 0;

  const ingredientsText = (product.ingredients_text || '').toLowerCase();

  // 1. Ingredient bonus
  if (ingredientHints && ingredientHints.length > 0) {
    const matchedHints = ingredientHints.filter((hint) =>
      ingredientsText.includes(hint.toLowerCase()),
    );
    if (matchedHints.length > 0) {
      ingredientBonus = Math.min(30 * matchedHints.length, 60);
      reasoning.push(`Ingrédients match (${matchedHints.join(', ')}): +${ingredientBonus}`);
    }
  }

  // 2. Zone bonus (if applicable)
  if (bodyZone) {
    const productCategory = (product.product_category || '').toLowerCase();
    const subCategory = (product.sub_category || '').toLowerCase();
    const productType = (product.product_type || '').toLowerCase();

    // Exact zone match (feet → foot products)
    const zoneKeywords: Record<string, string[]> = {
      feet: ['foot', 'pied', 'talon', 'odor', 'feet'],
      face: ['visage', 'face', 'facial', 'moisturizer', 'serum', 'cream'], // cream is often for face
      hair: ['cheveux', 'hair', 'scalp', 'shampoo', 'conditioner'],
      hands: ['main', 'hand', 'doigt', 'hand'],
      eyes: ['yeux', 'eye', 'contour', 'eye'],
      lips: ['lèvre', 'lip', 'balm', 'lip'],
      body: ['corps', 'body', 'lotion'],
      scalp: ['cuir chevelu', 'scalp', 'shampoo'],
    };

    const keywords = zoneKeywords[bodyZone] || [];
    const hasZoneMatch = keywords.some((kw) =>
      productCategory.includes(kw) || subCategory.includes(kw) || productType.includes(kw),
    );

    if (hasZoneMatch) {
      zoneBonus = 20;
      reasoning.push(`Zone match (${bodyZone}): +${zoneBonus}`);
    }
  }

  // 3. Restriction penalty (severe)
  const allRestrictions = [
    ...restrictedFamilies,
    ...restricedIngredients,
  ];

  if (allRestrictions.length > 0) {
    const hasRestriction = allRestrictions.some((restriction) =>
      ingredientsText.includes(restriction.toLowerCase()),
    );

    if (hasRestriction) {
      restrictionPenalty = -500;
      reasoning.push(`⚠️ Contient restriction: ${restrictionPenalty}`);
    }
  }

  // 4. Routine bonus
  if (alreadyInRoutine) {
    routineBonus = 15;
    reasoning.push(`Déjà dans routine: +${routineBonus}`);
  }

  const finalScore = baseScore + ingredientBonus + zoneBonus + restrictionPenalty + routineBonus;

  return {
    ean: product.ean || '',
    brand: product.brand || 'Unknown',
    name: product.name || 'Unknown',
    base_score: baseScore,
    ingredient_bonus: ingredientBonus,
    zone_bonus: zoneBonus,
    restriction_penalty: restrictionPenalty,
    routine_bonus: routineBonus,
    final_score: finalScore,
    reasoning,
  };
}

/**
 * Filtre et trie une liste de produits par score
 * @returns Produits filtrés et triés, exclusion automatique des scores < 0
 */
export function sortProductsByScore(
  scoredProducts: ProductScore[],
  minScore: number = 0,
): ProductScore[] {
  return scoredProducts
    .filter((p) => p.final_score >= minScore)
    .sort((a, b) => {
      // Sort by final_score desc, then by base_score desc
      if (a.final_score !== b.final_score) {
        return b.final_score - a.final_score;
      }
      return b.base_score - a.base_score;
    });
}

/**
 * Résumé textuel d'un ProductScore pour affichage utilisateur
 */
export function formatProductScore(score: ProductScore): string {
  if (score.final_score < 0) {
    return `${score.brand} ${score.name} — ⚠️ Contient une restriction (score: ${score.final_score})`;
  }

  let label = '';
  if (score.final_score >= 90) {
    label = '⭐⭐⭐⭐⭐ Parfait match';
  } else if (score.final_score >= 70) {
    label = '⭐⭐⭐⭐ Très bon match';
  } else if (score.final_score >= 50) {
    label = '⭐⭐⭐ Bon match';
  } else if (score.final_score >= 30) {
    label = '⭐⭐ Acceptable';
  } else {
    label = '⭐ Pas idéal';
  }

  return `${label} — ${score.brand} ${score.name}`;
}
