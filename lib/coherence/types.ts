/**
 * Types for the "Promesses vs Formule" feature.
 *
 * Port byte-for-byte du web `lib/coherence/types.ts` (types RÉELS, aucun stub
 * de compatibilité).
 *
 * Pipeline (anti-hallucination by construction):
 *   1. LLM extracts marketing promises from the description (constrained JSON).
 *   2. LLM proposes documented active ingredients for each promise (constrained
 *      to known categories from `claims.ts`).
 *   3. Engine matches proposed actives against the parent INCI analysis items
 *      by slug/name - purely mechanical, the LLM never decides.
 *   4. Engine reads each match's `thresholdContext` to decide if it's well
 *      dosed (above the 1% line) or in trace (after fragrance/preservative).
 *   5. Engine derives the verdict per promise from the match results.
 *   6. LLM writes a one-sentence conclusion based on the engine's verdicts.
 *
 * Steps 3-5 are deterministic. The LLM only proposes candidates and rephrases
 * - it cannot invent ingredients that aren't in the formula.
 */

/** Verdict for a single promise. */
export type CoherenceVerdict =
  | "tenue" // green - actives present and well dosed
  | "partielle" // amber - actives present but in trace (≤1%) or only some present
  | "marketing" // orange - only cosmetic/visual support, no biological actives
  | "non_demontree" // rose - no documented active found
  // Reserved for "absence" promises ("sans sulfate", "sans paraben"…). Set
  // when the product claims to be free of a category of ingredients but the
  // formula contains at least one item with the corresponding tag. Rendered
  // in deep red so it's clearly worse than non_demontree (which is just
  // "couldn't prove it" - contredite is "the formula actively contradicts
  // the claim").
  | "contredite";

export type CoherencePromise = {
  /** Standardised slug from the catalogue (anti_chute, hydratation, ...). */
  slug: string;
  /** Human label in French ("Anti-chute"). */
  label: string;
  /** Verbatim phrase from the description that triggered this promise. */
  excerpt: string;
  /** Engine-decided verdict. */
  verdict: CoherenceVerdict;
  /**
   * Documented actives the LLM proposed (canonical names from claims catalogue,
   * before matching against the formula).
   */
  expectedActives: string[];
  /**
   * Actives that were both proposed AND found in the formula. Each entry
   * carries the position so the UI can show "Glycérine (pos. 3)".
   */
  foundActives: {
    name: string;
    slug: string | null;
    position: number;
    /** True if the ingredient is past the fragrance/preservative threshold. */
    inTrace: boolean;
  }[];
  /**
   * Cosmetic-only actives proposed by the LLM (e.g. polysaccharides for
   * "densifies hair") - present in the formula but only provide visual /
   * sensory effect, not biological. Used for the "marketing" verdict.
   */
  cosmeticActives: {
    name: string;
    slug: string | null;
    position: number;
    /** True if past the fragrance/preservative threshold (≤1 %). */
    inTrace: boolean;
    note: string;
  }[];
  /**
   * Actives that would have been needed but aren't in the formula. The UI
   * shows these in the "Manque" column of the table.
   */
  missingActives: string[];
  /**
   * Ingredients that CONTRADICT an "absence" promise - i.e. the product
   * says "sans sulfate" but the formula contains Sodium Laureth Sulfate.
   * Only populated when verdict === "contredite". Otherwise empty / omitted.
   */
  contradictingActives?: {
    name: string;
    slug: string | null;
    position: number;
  }[];
  /**
   * Score 0-100. Ratio of expected actives that are present AND well dosed.
   * Drives the per-promise progress bar in the UI.
   */
  score: number;
  /**
   * True if this promise was inferred from an unmatched ingredient rather
   * than extracted directly from the description. Inferred promises are
   * always "tenue" by construction (the ingredient is present AND the
   * description supports the effect verbatim) and are surfaced in a
   * dedicated UI section so users see them as "found in addition to" the
   * directly-extracted ones. Optional - omitted on legacy rows.
   */
  inferred?: boolean;
};

/**
 * A description fragment the LLM saw but couldn't map to a verifiable
 * promise (composition claims, sensory claims, certifications, etc.).
 */
export type UnverifiableClaim = {
  excerpt: string;
  /** Why it's unverifiable: "composition" | "certification" | "sensoriel" | "autre" */
  reason: string;
};

/**
 * Product type used to gate which promises are biologically relevant.
 * Detected automatically from the description by a lightweight LLM call
 * (cf. `detectProductType` in lib/ai/coherence.ts) when no hint is
 * provided via OCR / analysis metadata.
 */
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

/** Human label for a product type - used in prompts and the UI. */
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

/**
 * A claim the description makes that is biologically irrelevant for the
 * detected product type (e.g. "production de collagène" on a hair product -
 * hair has no collagen to produce). Surfaced as a dedicated UI section so
 * the user understands the marketing copy overreached, without being mixed
 * into the regular verdict ladder.
 */
export type OutOfScopePromise = {
  /** Verbatim phrase from the description, max ~160 chars. */
  excerpt: string;
  /** Effect the marketing copy claimed (e.g. "anti-âge", "régénération"). */
  claimed_effect: string;
  /** Short FR explanation of why it doesn't apply to this product type. */
  reason: string;
};

export type CoherenceResult = {
  /** ISO timestamp at the moment the result was computed. */
  computedAt: string;
  /** The original description text the user pasted. */
  description: string;
  /** All extracted promises with their verdicts. */
  promises: CoherencePromise[];
  /** Description fragments that aren't verifiable against the formula. */
  unverifiable: UnverifiableClaim[];
  /**
   * Promises that the marketing copy makes but that don't apply to the
   * detected product type (e.g. collagen claim on a hair product). The
   * engine doesn't score these - they get their own UI section.
   * Optional: legacy rows (before this field existed) just have no entry.
   */
  outOfScope?: OutOfScopePromise[];
  /**
   * Product type used to gate the extraction. Stored so the UI can show
   * "Analysé en tant que: Cheveux" and the user can correct if wrong.
   * Optional for backwards compatibility with rows persisted before this
   * field existed.
   */
  productType?: ProductType;
  /** Aggregate metrics. */
  metrics: {
    /** % of promises with verdict === "tenue". */
    tenuePct: number;
    /** Count of promises kept (tenue). */
    tenueCount: number;
    /** Count of promises with partial coherence (verdict === "partielle"). */
    partielleCount: number;
    /** Count of promises with marketing-only support (verdict === "marketing"). */
    marketingCount: number;
    /** Count of promises with no documented active (verdict === "non_demontree"). */
    nonDemontreeCount: number;
    /** Count of "sans X" promises actively contradicted by the formula. */
    contrediteCount: number;
    /** Total promises analysed. */
    totalPromises: number;
    /**
     * Marketing index: % of promises without any documented active
     * (verdict in [marketing, non_demontree]). 0–100.
     */
    marketingIndex: number;
  };
  /** One-sentence conclusion written by the LLM after all verdicts are known. */
  conclusion: string;
  /**
   * Snapshot of "key" ingredients positions used by the position chart.
   * Computed from the parent analysis's items + the actives found above.
   */
  positionSnapshot: {
    /** First fragrance position (or null if no fragrance in formula). */
    firstFragrancePos: number | null;
    /** First preservative position (or null). */
    firstPreservativePos: number | null;
    /** The smaller of the two - the actual "1% threshold" position. */
    thresholdPos: number | null;
    /** Total number of ingredients in the formula. */
    totalPositions: number;
    /** Key ingredients (the foundActives flattened, deduped, sorted by position). */
    keyIngredients: {
      name: string;
      position: number;
      inTrace: boolean;
      /** Vert / Jaune / Orange / Rouge of the parent analysis, or null if unknown. */
      colorRating: "Vert" | "Jaune" | "Orange" | "Rouge" | null;
    }[];
  };
};

export type CoherenceRow = {
  id: string;
  user_id: string;
  analysis_id: string;
  description: string;
  result_json: CoherenceResult;
  created_at: string;
};
