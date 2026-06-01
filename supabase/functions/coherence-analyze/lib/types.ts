/**
 * Types for the "Promesses vs Formule" (coherence) feature — Deno port of
 * CosmetWiki/lib/coherence/types.ts. Copied (not imported from the RN mobile
 * lib) so the Edge Function bundle stays self-contained.
 */

export type CoherenceVerdict =
  | "tenue"
  | "partielle"
  | "marketing"
  | "non_demontree"
  | "contredite";

/** Minimal item shape we read from a persisted analyse's result_json.items. */
export type AnalyseItem = {
  position: number;
  input: string;
  slug: string | null;
  name: string | null;
  colorRating: "Vert" | "Jaune" | "Orange" | "Rouge" | null;
  primaryFunction: string | null;
  tags: string[] | null;
  thresholdContext:
    | "before_fragrance"
    | "after_fragrance"
    | "before_preservative"
    | "after_preservative"
    | null;
};

/** Minimal parent analyse shape (result_json) used by the engine. */
export type AnalyseResponse = {
  counts: { total: number; [k: string]: number };
  items: AnalyseItem[];
};

export type CoherencePromise = {
  slug: string;
  label: string;
  excerpt: string;
  verdict: CoherenceVerdict;
  expectedActives: string[];
  foundActives: {
    name: string;
    slug: string | null;
    position: number;
    inTrace: boolean;
  }[];
  cosmeticActives: {
    name: string;
    slug: string | null;
    position: number;
    note: string;
  }[];
  missingActives: string[];
  contradictingActives?: {
    name: string;
    slug: string | null;
    position: number;
  }[];
  score: number;
  inferred?: boolean;
};

export type UnverifiableClaim = {
  excerpt: string;
  reason: string;
};

export type ProductType =
  | "cheveux"
  | "peau_visage"
  | "peau_corps"
  | "levres"
  | "parfum"
  | "dents"
  | "ongles"
  | "maquillage"
  | "autre";

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  cheveux: "Cheveux",
  peau_visage: "Peau visage",
  peau_corps: "Peau corps",
  levres: "Lèvres",
  parfum: "Parfum",
  dents: "Dents",
  ongles: "Ongles",
  maquillage: "Maquillage",
  autre: "Autre",
};

export type OutOfScopePromise = {
  excerpt: string;
  claimed_effect: string;
  reason: string;
};

export type CoherenceResult = {
  computedAt: string;
  description: string;
  promises: CoherencePromise[];
  unverifiable: UnverifiableClaim[];
  outOfScope?: OutOfScopePromise[];
  productType?: ProductType;
  metrics: {
    tenuePct: number;
    tenueCount: number;
    partielleCount: number;
    marketingCount: number;
    nonDemontreeCount: number;
    contrediteCount: number;
    totalPromises: number;
    marketingIndex: number;
  };
  conclusion: string;
  positionSnapshot: {
    firstFragrancePos: number | null;
    firstPreservativePos: number | null;
    thresholdPos: number | null;
    totalPositions: number;
    keyIngredients: {
      name: string;
      position: number;
      inTrace: boolean;
      colorRating: "Vert" | "Jaune" | "Orange" | "Rouge" | null;
    }[];
  };
};
