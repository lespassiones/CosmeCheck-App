/**
 * Coherence engine - pure deterministic logic.
 *
 * The LLM proposes (in lib/ai/coherence.ts) which actives WOULD support a
 * given promise. This engine then *mechanically* checks whether those actives
 * are actually present in the parent INCI analysis, in what position, and
 * derives the per-promise verdict from rules.
 *
 * No LLM call here. The engine is what guarantees we never report an
 * ingredient that isn't physically in the formula.
 */

import type { AnalyseItem, AnalyseResponse } from "@/lib/analysis/types";
import { CLAIM_CATEGORIES, findCategoryBySlug, type ActiveEntry, type ClaimCategory } from "./claims";
import type {
  CoherencePromise,
  CoherenceResult,
  CoherenceVerdict,
  OutOfScopePromise,
  ProductType,
  UnverifiableClaim,
} from "./types";

// -----------------------------------------------------------------------------
// Matching helpers
// -----------------------------------------------------------------------------

/**
 * Normalised string for fuzzy comparison: lowercase, no diacritics, no
 * non-alphanumerics. Catches "Acide hyaluronique" ≈ "Hyaluronic Acid"
 * loosely, and "Caféine" ≈ "Caffeine" exactly after stripping.
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Find an item in the parent analysis that corresponds to a candidate
 * active proposed by the LLM.
 *
 * Match priority:
 *   1. exact slug match (most reliable, since `claims.ts` uses the same
 *      slug schema as cosme_check.ingredients.slug)
 *   2. exact normalised name match
 *   3. normalised name contained in either direction (handles
 *      "Caffeine" inside "Caffeine Anhydrous", or display name vs INCI)
 */
function findItemForActive(
  active: ActiveEntry,
  items: AnalyseItem[],
): AnalyseItem | null {
  // 1. slug match
  if (active.slug) {
    const bySlug = items.find((it) => it.slug === active.slug);
    if (bySlug) return bySlug;
  }

  const targetName = norm(active.name);
  const targetSlug = norm(active.slug ?? "");

  // 2. exact normalised name (try both `name` and `input` since users sometimes
  //    paste a translated/aliased token)
  const exactName = items.find((it) => {
    const n1 = norm(it.name ?? "");
    const n2 = norm(it.input ?? "");
    return (
      (targetName.length > 0 && (n1 === targetName || n2 === targetName))
      || (targetSlug.length > 0 && (n1 === targetSlug || n2 === targetSlug))
    );
  });
  if (exactName) return exactName;

  // 3. partial normalised match - only when the candidate is at least 5
  //    characters long, otherwise we'd match noise (e.g. "C" inside "Cocoa")
  if (targetName.length >= 5) {
    const partial = items.find((it) => {
      const n1 = norm(it.name ?? "");
      const n2 = norm(it.input ?? "");
      return (
        (n1 && (n1.includes(targetName) || targetName.includes(n1)))
        || (n2 && (n2.includes(targetName) || targetName.includes(n2)))
      );
    });
    if (partial) return partial;
  }

  return null;
}

/** True when the item sits past the first fragrance OR first preservative. */
function isInTrace(item: AnalyseItem): boolean {
  return (
    item.thresholdContext === "after_fragrance"
    || item.thresholdContext === "after_preservative"
  );
}

// Allergènes parfumants BI-FONCTION (Annexe III UE 1223/2009) : molécules
// listées comme allergène parfumant réglementé MAIS très souvent employées à
// une AUTRE fonction (conservateur/solvant/fixateur). PARITÉ STRICTE avec le
// moteur web et l'edge coherence-analyze :
// - benzyl-alcohol   : conservateur / solvant (≈90 % des usages)
// - benzyl-benzoate  : solvant, fixateur, plastifiant
// - benzyl-salicylate: aussi absorbeur UV faible
const DUAL_USE_ALLERGEN_SLUGS = new Set<string>([
  'benzyl-alcohol',
  'benzyl-benzoate',
  'benzyl-salicylate',
])
function isDualUseAllergen(it: AnalyseItem): boolean {
  if (it.slug && DUAL_USE_ALLERGEN_SLUGS.has(it.slug)) return true
  const n = norm(it.name ?? it.input ?? '')
  return (
    n.includes('benzylalcohol')
    || n.includes('benzylbenzoate')
    || n.includes('benzylsalicylate')
  )
}

// Marqueurs INCI qui signalent explicitement une composition parfumante.
const FRAGRANCE_MARKER_NAMES = new Set<string>(['PARFUM', 'FRAGRANCE', 'AROMA', 'FLAVOR'])

// Détecte si la formule contient un parfum DÉCLARÉ : mot PARFUM/FRAGRANCE/
// AROMA/FLAVOR explicite, tag parfum-synthese, ou allergène Annexe III « pur
// parfum » (NON dual-use, pour éviter l'auto-confirmation circulaire).
function formulaHasDeclaredFragrance(items: AnalyseItem[]): boolean {
  for (const it of items) {
    const upperName = (it.name ?? it.input ?? '').toUpperCase().trim()
    if (FRAGRANCE_MARKER_NAMES.has(upperName)) return true
    const tags = it.tags ?? []
    if (tags.includes('parfum-synthese')) return true
    if (tags.includes('allergene-parfumant') && !isDualUseAllergen(it)) {
      return true
    }
  }
  return false
}

// -----------------------------------------------------------------------------
// Verdict derivation
// -----------------------------------------------------------------------------

/**
 * Decide the verdict for one promise based on what was found in the formula.
 *
 * Rules (evaluated top-down):
 *   - At least one *documented* active is present AND well dosed (not in trace)
 *     → "tenue"
 *   - At least one *documented* active is present but ALL are in trace (≤1 %)
 *     → "partielle"
 *   - No documented active, but a *marketing* active is present
 *     (e.g. polysaccharides for densification) → "marketing"
 *   - Otherwise → "non_demontree"
 */
function deriveVerdict({
  confirmingFound,
  confirmingWellDosed,
}: {
  confirmingFound: number;
  confirmingWellDosed: number;
}): CoherenceVerdict {
  // Tout ingrédient confirmant (actif documenté OU cosmétique/sensoriel)
  // compte. Bien placé → tenue ; uniquement en trace → partielle ; aucun →
  // non démontré. Le verdict "marketing" n'est plus produit.
  if (confirmingWellDosed > 0) return "tenue";
  if (confirmingFound > 0) return "partielle";
  return "non_demontree";
}

/**
 * Unified score 0–100 - same scale for catalogue AND open promises so the
 * progress bars are visually comparable.
 *
 * Anchored on the verdict tier (predictable colour + rough position), with a
 * small bonus per additional active so users see "more support" within the
 * same tier:
 *   - tenue   (well dosed documented)         → 80 + 5×(extra wells), max 100
 *   - partielle (only in-trace documented)    → 35 + 5×(extra traces), max 60
 *   - marketing (only cosmetic actives)       → 20 + 5×(extra cosmetics), max 35
 *   - non_demontree                            → 0
 */
function unifiedScore({
  wellDosed,
  inTrace,
  cosmetic,
}: {
  wellDosed: number;
  inTrace: number;
  cosmetic: number;
}): number {
  if (wellDosed > 0) return Math.min(100, 80 + (wellDosed - 1) * 5);
  if (inTrace > 0) return Math.min(60, 35 + (inTrace - 1) * 5);
  if (cosmetic > 0) return Math.min(35, 20 + (cosmetic - 1) * 5);
  return 0;
}

/**
 * Barème d'effet RECALIBRÉ (anti-surcrédit), à partir des matches DÉJÀ validés
 * contre la formule. Distingue le niveau de preuve (documenté vs supportif vs
 * visuel) pour qu'un seul ingrédient « supportif » ne suffise plus à donner
 * « tenue » :
 *   - ≥1 actif DOCUMENTÉ bien placé        → tenue   (80 + 5 par actif en plus)
 *   - ≥2 actifs SUPPORTIFS bien placés     → tenue   (72 +)
 *   - 1 seul actif supportif bien placé    → partielle (55)
 *   - uniquement en trace (fin de liste)   → partielle (35)
 *   - uniquement effet visuel/sensoriel    → partielle (30)
 *   - rien de validé                        → non démontré (0)
 */
function gradeEffect(c: {
  docWellDosed: number;
  docTrace: number;
  supWellDosed: number;
  supTrace: number;
  cosmetic: number;
}): { verdict: CoherenceVerdict; score: number } {
  const { docWellDosed, docTrace, supWellDosed, supTrace, cosmetic } = c;
  if (docWellDosed >= 1) {
    const extra = docWellDosed - 1 + supWellDosed;
    return { verdict: "tenue", score: Math.min(100, 80 + extra * 5) };
  }
  if (supWellDosed >= 2) {
    return { verdict: "tenue", score: Math.min(90, 72 + (supWellDosed - 2) * 5) };
  }
  if (supWellDosed === 1) {
    return { verdict: "partielle", score: 55 };
  }
  if (docTrace + supTrace >= 1) {
    return { verdict: "partielle", score: 35 };
  }
  if (cosmetic >= 1) {
    return { verdict: "partielle", score: 30 };
  }
  return { verdict: "non_demontree", score: 0 };
}

// -----------------------------------------------------------------------------
// Per-promise resolver - the main mechanical step
// -----------------------------------------------------------------------------

export type LlmPromiseProposal = {
  /** Slug from the catalogue (or "autre" for an off-catalogue claim). */
  category_slug: string;
  /** Human label (LLM-provided fallback if the slug doesn't map). */
  label: string;
  /** Verbatim phrase from the description that triggered this promise. */
  excerpt: string;
};

/**
 * Mechanical safety net for promise deduplication.
 *
 * The extraction prompt already asks the LLM to fuse equivalent claims
 * ("hydrate" + "préserve l'hydratation" → 1 entry), but GPT-4o-mini drops
 * the rule on long marketing texts and ships duplicates. This filter
 * collapses the LLM output by:
 *
 *   - For catalogue slugs (anti_chute, hydratation, absence_*, …) :
 *       1 entry per category_slug - kept = longest excerpt (most informative).
 *   - For the "autre" / off-catalogue bucket :
 *       1 entry per normalised label (lowercased, no diacritics, alphanums
 *       only) - same tiebreaker. Prevents "Tenue 12h" / "Tenue longue durée"
 *       / "tient toute la journée" from showing as 3 separate rows when
 *       they're all the same intention.
 *
 * Pure function, called once at the start of /api/coherence right after
 * extraction. No-op when the LLM already deduped properly.
 */
// Lower-case + strip diacritics for keyword matching. Shared with the
// reclassifier below.
function deburre(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Re-route "autre" proposals to a catalogue category when their label or
 * excerpt strongly matches that category's keywords AND the category is
 * applicable to the detected product type.
 *
 * Without this step the LLM produces two semantically equivalent rows for
 * a single concept: a clean catalogue entry ("Brillance") AND a separate
 * "autre" entry whose label is a phrasing variant ("Éclat de la fibre
 * capillaire"). These two rows then go through different resolvers
 * (catalogue matching vs LLM-exploratory) and end up scored 0 % and 100 %
 * for what users perceive as one promise — confusing and contradictory.
 *
 * After reclassification, the regular `dedupProposals` will merge the
 * twin into the catalogue row on slug equality. Promises that don't match
 * any catalogue category keep their "autre" slug and flow through the
 * open-promise path as before.
 *
 * Heuristic:
 *   - keywords < 4 characters are ignored (avoid matching stop-words)
 *   - the candidate must match at least one keyword
 *   - among multiple matching categories, the one with the most keyword
 *     hits wins (ties resolved by catalogue order — first declaration)
 *   - productType compatibility (via the new `productTypes` field on
 *     each ClaimCategory) gates which categories are admissible. When
 *     productType is null we skip the gate and consider all categories,
 *     matching the prior behaviour for legacy callers.
 *
 * Pure function. No-op when the LLM stayed in catalogue or when no
 * keyword matches.
 */
export function reclassifyOpenProposals(
  proposals: LlmPromiseProposal[],
  productType: ProductType | null,
): LlmPromiseProposal[] {
  return proposals.map((p) => {
    if (p.category_slug !== "autre") return p;
    const haystack = deburre(`${p.label ?? ""} ${p.excerpt ?? ""}`);
    if (!haystack.trim()) return p;

    let best: { slug: string; label: string; matches: number } | null = null;
    for (const cat of CLAIM_CATEGORIES) {
      if (cat.forbiddenTag) continue;
      if (
        productType
        && cat.productTypes
        && !cat.productTypes.includes(productType as Exclude<ProductType, "autre">)
      ) {
        continue;
      }
      let matches = 0;
      for (const kw of cat.keywords) {
        const needle = deburre(kw);
        if (needle.length < 4) continue;
        if (haystack.includes(needle)) matches++;
      }
      if (matches === 0) continue;
      if (!best || matches > best.matches) {
        best = { slug: cat.slug, label: cat.label, matches };
      }
    }
    if (!best) return p;
    return { ...p, category_slug: best.slug, label: best.label };
  });
}

export function dedupProposals(proposals: LlmPromiseProposal[]): LlmPromiseProposal[] {
  const byKey = new Map<string, LlmPromiseProposal>();
  for (const p of proposals) {
    const slug = (p.category_slug || "").trim();
    if (!slug) continue;
    // Catalogue slugs are unique on slug alone. Open-promise "autre" buckets
    // are merged on a normalised label so wording variants collapse.
    const key
      = slug === "autre"
        ? `autre::${(p.label || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "")}`
        : `slug::${slug}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, p);
      continue;
    }
    // Keep the longer excerpt - it's the more informative formulation.
    if ((p.excerpt?.length ?? 0) > (existing.excerpt?.length ?? 0)) {
      byKey.set(key, { ...p, label: existing.label || p.label });
    }
  }
  return Array.from(byKey.values());
}

/**
 * Result of the "open promise" LLM exploration step. The LLM is given the
 * actual list of items in the formula and proposes which ones support the
 * promise - by slug. We validate every entry against the items list before
 * trusting it, so even if the LLM hallucinates a slug, we discard it.
 */
export type OpenLlmMatch = {
  item_slug: string;
  item_name: string;
  evidence: "documented" | "supportive" | "marketing";
  reason: string;
};

/**
 * For one promise proposed by the LLM, look up the catalogue, find which
 * candidate actives are actually in the formula, and compute the verdict.
 */
export function resolvePromise(
  proposal: LlmPromiseProposal,
  items: AnalyseItem[],
): CoherencePromise {
  const cat = findCategoryBySlug(proposal.category_slug);

  // Off-catalogue claim → we can't verify. Return as "non_demontree" so the
  // user still sees the claim was detected.
  if (!cat) {
    return {
      slug: proposal.category_slug || "autre",
      label: proposal.label || proposal.category_slug || "Promesse",
      excerpt: proposal.excerpt,
      verdict: "non_demontree",
      expectedActives: [],
      foundActives: [],
      cosmeticActives: [],
      missingActives: [],
      score: 0,
    };
  }

  const documentedActives = cat.actives.filter(
    (a) => a.evidence === "documented" || a.evidence === "supportive",
  );
  const cosmeticActives = cat.actives.filter((a) => a.evidence === "marketing");

  const foundDocumented: CoherencePromise["foundActives"] = [];
  const foundCosmetic: CoherencePromise["cosmeticActives"] = [];
  const missing: string[] = [];

  for (const active of documentedActives) {
    const item = findItemForActive(active, items);
    if (item) {
      foundDocumented.push({
        name: active.name,
        slug: item.slug,
        position: item.position,
        inTrace: isInTrace(item),
      });
    } else {
      missing.push(active.name);
    }
  }

  for (const active of cosmeticActives) {
    const item = findItemForActive(active, items);
    if (item) {
      foundCosmetic.push({
        name: active.name,
        slug: item.slug,
        position: item.position,
        inTrace: isInTrace(item),
        note: "effet visuel/sensoriel",
      });
    }
  }

  // Les ingrédients cosmétiques/sensoriels comptent comme confirmation.
  const wellDosed =
    foundDocumented.filter((f) => !f.inTrace).length
    + foundCosmetic.filter((c) => !c.inTrace).length;
  const inTrace =
    foundDocumented.filter((f) => f.inTrace).length
    + foundCosmetic.filter((c) => c.inTrace).length;
  const verdict = deriveVerdict({
    confirmingFound: foundDocumented.length + foundCosmetic.length,
    confirmingWellDosed: wellDosed,
  });
  const score = unifiedScore({ wellDosed, inTrace, cosmetic: 0 });

  return {
    slug: cat.slug,
    label: cat.label,
    excerpt: proposal.excerpt,
    verdict,
    expectedActives: documentedActives.map((a) => a.name),
    foundActives: foundDocumented,
    cosmeticActives: foundCosmetic,
    // Trim missing list to the most informative ones (max 5) so the table
    // doesn't blow up visually.
    missingActives: missing.slice(0, 5),
    score,
  };
}

/**
 * Resolve an "absence" promise (sans sulfate, sans paraben…) by scanning
 * every formula item for the forbidden tag.
 *
 * Verdict :
 *   - No item carries the tag → "tenue" (score 100). The promise holds.
 *   - At least one item carries the tag → "contredite" (score 0). The
 *     contradicting ingredients go into `contradictingActives` so the UI
 *     can name and shame them.
 *
 * Purely deterministic - no LLM call, no fuzzy matching. The tags were
 * computed once when the INCI list was first analysed, we just reread them
 * here.
 */
export function resolveAbsencePromise(
  proposal: LlmPromiseProposal,
  cat: ClaimCategory,
  items: AnalyseItem[],
): CoherencePromise {
  // Defensive: this function is only meant to be called on absence
  // categories. If misrouted, fall back to a non-démontrée verdict rather
  // than silently green-lighting the claim.
  if (!cat.forbiddenTag) {
    return {
      slug: cat.slug,
      label: cat.label,
      excerpt: proposal.excerpt,
      verdict: "non_demontree",
      expectedActives: [],
      foundActives: [],
      cosmeticActives: [],
      missingActives: [],
      score: 0,
    };
  }

  const tag = cat.forbiddenTag;
  let offenders = items.filter((it) => (it.tags ?? []).includes(tag));

  // Cas particulier « sans allergène parfumant » + formule SANS parfum déclaré
  // (PARITÉ STRICTE avec le moteur web et l'edge) :
  //   - dual-use SEULS fautifs → « partielle » (50, à nuancer), signalés ;
  //   - vrais allergènes présents → « contredite » sur les vrais uniquement.
  // Formule AVEC parfum déclaré → pas de nuance : tout fautif contredit.
  if (tag === "allergene-parfumant" && !formulaHasDeclaredFragrance(items)) {
    const dualUse = offenders.filter((it) => isDualUseAllergen(it));
    const real = offenders.filter((it) => !isDualUseAllergen(it));
    if (real.length === 0 && dualUse.length > 0) {
      const sortedDual = dualUse.slice().sort((a, b) => a.position - b.position);
      return {
        slug: cat.slug,
        label: cat.label,
        excerpt: proposal.excerpt,
        verdict: "partielle",
        expectedActives: [],
        foundActives: [],
        cosmeticActives: [],
        missingActives: [],
        contradictingActives: sortedDual.slice(0, 5).map((it) => ({
          name: it.name ?? it.input,
          slug: it.slug,
          position: it.position,
        })),
        score: 50,
      };
    }
    offenders = real;
  }

  if (offenders.length === 0) {
    return {
      slug: cat.slug,
      label: cat.label,
      excerpt: proposal.excerpt,
      verdict: "tenue",
      expectedActives: [],
      foundActives: [],
      cosmeticActives: [],
      missingActives: [],
      score: 100,
    };
  }

  // Sort offenders by position so the UI shows the most prominent (= most
  // concentrated, earlier in the INCI list) first.
  const sorted = offenders.slice().sort((a, b) => a.position - b.position);
  return {
    slug: cat.slug,
    label: cat.label,
    excerpt: proposal.excerpt,
    verdict: "contredite",
    expectedActives: [],
    foundActives: [],
    cosmeticActives: [],
    missingActives: [],
    contradictingActives: sorted.slice(0, 5).map((it) => ({
      name: it.name ?? it.input,
      slug: it.slug,
      position: it.position,
    })),
    score: 0,
  };
}

/**
 * Resolve a promise that's NOT in the static catalogue, using LLM-proposed
 * matches against the actual formula's items.
 *
 * The LLM has already returned a list of items it considers active for this
 * promise (by slug, picked from the items we showed it). This function:
 *   1. Re-validates each match against the parent items (defence in depth -
 *      even if the LLM hallucinated a slug, we drop it here).
 *   2. Reads each matched item's `thresholdContext` to decide if well dosed
 *      vs in trace.
 *   3. Derives the verdict using the same rules as the catalogue path.
 *
 * The LLM cannot cause an invented ingredient to appear in the result.
 */
export function resolveOpenPromise(
  proposal: LlmPromiseProposal,
  items: AnalyseItem[],
  llmMatches: OpenLlmMatch[],
  llmMissing: string[],
): CoherencePromise {
  // Validate each match against the actual items list. If the LLM cited a
  // slug that doesn't exist in the formula, drop the match silently.
  const validated = llmMatches
    .map((m) => {
      // 1. Slug match (primary path - what we asked the LLM to use).
      let item = m.item_slug
        ? items.find((it) => it.slug && it.slug === m.item_slug) ?? null
        : null;
      // 2. Name fallback for the rare case where the LLM picked the right
      //    item but mistyped its slug.
      if (!item && m.item_name) {
        const target = norm(m.item_name);
        if (target.length >= 4) {
          item = items.find((it) => {
            const a = norm(it.name ?? "");
            const b = norm(it.input ?? "");
            return a === target || b === target;
          }) ?? null;
        }
      }
      if (!item) return null;
      return { match: m, item };
    })
    .filter((x): x is { match: OpenLlmMatch; item: AnalyseItem } => x !== null);

  const foundDocumented: CoherencePromise["foundActives"] = [];
  const foundCosmetic: CoherencePromise["cosmeticActives"] = [];

  // Compteurs par NIVEAU DE PREUVE (documenté/supportif/visuel) × DOSAGE
  // (bien placé/trace) → barème recalibré (gradeEffect).
  let docWellDosed = 0;
  let docTrace = 0;
  let supWellDosed = 0;
  let supTrace = 0;

  // De-dupe by item position - the LLM might cite the same item twice.
  const seenPositions = new Set<number>();

  for (const { match, item } of validated) {
    if (seenPositions.has(item.position)) continue;
    seenPositions.add(item.position);
    const trace = isInTrace(item);
    if (match.evidence === "marketing") {
      foundCosmetic.push({
        name: item.name ?? match.item_name,
        slug: item.slug,
        position: item.position,
        inTrace: trace,
        note: match.reason.trim().slice(0, 80) || "effet visuel/sensoriel",
      });
    } else {
      foundDocumented.push({
        name: item.name ?? match.item_name,
        slug: item.slug,
        position: item.position,
        inTrace: trace,
      });
      if (match.evidence === "documented") {
        if (trace) docTrace++;
        else docWellDosed++;
      } else {
        if (trace) supTrace++;
        else supWellDosed++;
      }
    }
  }

  // Règle d'absence : label "sans X" sans aucun ingrédient correspondant
  // (ni match ni missing) → tenue (l'absence dans l'INCI prouve l'absence).
  const isAbsenceClaim = /^sans[\s\-]/i.test((proposal.label ?? "").trim());
  if (
    isAbsenceClaim &&
    foundDocumented.length === 0 &&
    foundCosmetic.length === 0 &&
    llmMissing.length === 0
  ) {
    return {
      slug: proposal.category_slug || "autre",
      label: proposal.label || "Promesse libre",
      excerpt: proposal.excerpt,
      verdict: "tenue",
      expectedActives: [],
      foundActives: [],
      cosmeticActives: [],
      missingActives: [],
      score: 100,
    };
  }

  const { verdict, score } = gradeEffect({
    docWellDosed,
    docTrace,
    supWellDosed,
    supTrace,
    cosmetic: foundCosmetic.length,
  });

  return {
    slug: proposal.category_slug || "autre",
    label: proposal.label || "Promesse libre",
    excerpt: proposal.excerpt,
    verdict,
    expectedActives: foundDocumented
      .map((f) => f.name)
      .concat(llmMissing.slice(0, 5))
      .slice(0, 8),
    foundActives: foundDocumented,
    cosmeticActives: foundCosmetic,
    missingActives: llmMissing.slice(0, 5),
    score,
  };
}

// -----------------------------------------------------------------------------
// Aggregate metrics & position snapshot
// -----------------------------------------------------------------------------

export function computeMetrics(promises: CoherencePromise[]): CoherenceResult["metrics"] {
  const total = promises.length;
  const tenueCount = promises.filter((p) => p.verdict === "tenue").length;
  const partielleCount = promises.filter((p) => p.verdict === "partielle").length;
  const marketingCount = promises.filter((p) => p.verdict === "marketing").length;
  const nonDemontreeCount = promises.filter((p) => p.verdict === "non_demontree").length;
  const contrediteCount = promises.filter((p) => p.verdict === "contredite").length;
  // "Marketing / unsupported index" = % of promises that are NOT actively
  // honoured by the formula. Contredite promises absolutely count here -
  // they're worse than non_demontree (the product actively lied about an
  // absence). Tenue absences (e.g. "sans paraben" → no paraben found) lift
  // the index DOWN, which is the right signal.
  const unsupportedCount = marketingCount + nonDemontreeCount + contrediteCount;
  const marketingIndex = total === 0 ? 100 : Math.round((unsupportedCount / total) * 100);
  // "Verdict global" (tenuePct) is the symmetrical opposite: % of promises
  // that DO have at least one documented active in the formula (verdict tenue
  // OR partielle). It's literally 100 − marketingIndex, so the green / rose
  // donut tells one consistent story (kept = green, marketing = rose).
  const supportedCount = tenueCount + partielleCount;
  const tenuePct = total === 0 ? 0 : Math.round((supportedCount / total) * 100);
  return {
    tenuePct,
    tenueCount,
    partielleCount,
    marketingCount,
    nonDemontreeCount,
    contrediteCount,
    totalPromises: total,
    marketingIndex,
  };
}

export function computePositionSnapshot(
  parent: AnalyseResponse,
  promises: CoherencePromise[],
): CoherenceResult["positionSnapshot"] {
  // Find first fragrance / first preservative position by scanning items.
  // We rely on the existing tag system (cf. ANALYSER_TAGS in api/analyser).
  let firstFragrancePos: number | null = null;
  let firstPreservativePos: number | null = null;
  for (const it of parent.items) {
    const tags = it.tags ?? [];
    if (
      firstFragrancePos === null
      && (tags.includes("parfum-synthese") || tags.includes("allergene-parfumant"))
    ) {
      firstFragrancePos = it.position;
    }
    if (firstPreservativePos === null && tags.includes("conservateur")) {
      firstPreservativePos = it.position;
    }
    if (firstFragrancePos !== null && firstPreservativePos !== null) break;
  }
  const thresholdPos = (() => {
    const xs = [firstFragrancePos, firstPreservativePos].filter(
      (x): x is number => x !== null,
    );
    return xs.length === 0 ? null : Math.min(...xs);
  })();

  // Deduplicate key ingredients across promises (same active can support
  // multiple claims). Sort by position ascending for the linear chart.
  // We hydrate each entry with its colorRating from the parent analysis so
  // the chart can tint pills by Vert/Jaune/Orange/Rouge.
  const colorByPos = new Map<number, "Vert" | "Jaune" | "Orange" | "Rouge" | null>();
  for (const it of parent.items) {
    colorByPos.set(it.position, it.colorRating);
  }
  const seen = new Set<number>();
  const keyIngredients: CoherenceResult["positionSnapshot"]["keyIngredients"] = [];
  for (const p of promises) {
    for (const f of p.foundActives) {
      if (seen.has(f.position)) continue;
      seen.add(f.position);
      keyIngredients.push({
        name: f.name,
        position: f.position,
        inTrace: f.inTrace,
        colorRating: colorByPos.get(f.position) ?? null,
      });
    }
    for (const c of p.cosmeticActives) {
      if (seen.has(c.position)) continue;
      seen.add(c.position);
      // Cosmetic actives flagged as in-trace if past threshold (deterministic).
      const item = parent.items.find((it) => it.position === c.position);
      const inTrace = item ? isInTrace(item) : false;
      keyIngredients.push({
        name: c.name,
        position: c.position,
        inTrace,
        colorRating: colorByPos.get(c.position) ?? null,
      });
    }
  }
  keyIngredients.sort((a, b) => a.position - b.position);

  return {
    firstFragrancePos,
    firstPreservativePos,
    thresholdPos,
    totalPositions: parent.counts.total,
    keyIngredients,
  };
}

// -----------------------------------------------------------------------------
// Top-level assembly
// -----------------------------------------------------------------------------

/**
 * Orchestrates the deterministic part of the pipeline. Takes the
 * already-resolved promises (mix of catalogue + open) and the parent INCI
 * analysis, returns the full structured result minus the conclusion sentence
 * (which the LLM writes on top of this output).
 *
 * Resolution itself is delegated to the route handler, which knows whether
 * each proposal is in the catalogue (→ resolvePromise) or open
 * (→ resolveOpenPromise after a per-promise LLM exploration).
 */
export function buildCoherenceResult(args: {
  description: string;
  promises: CoherencePromise[];
  unverifiable: UnverifiableClaim[];
  parent: AnalyseResponse;
  conclusion: string;
  outOfScope?: OutOfScopePromise[];
  productType?: ProductType;
}): CoherenceResult {
  const metrics = computeMetrics(args.promises);
  const positionSnapshot = computePositionSnapshot(args.parent, args.promises);
  return {
    computedAt: new Date().toISOString(),
    description: args.description,
    promises: args.promises,
    unverifiable: args.unverifiable,
    outOfScope: args.outOfScope ?? [],
    productType: args.productType,
    metrics,
    positionSnapshot,
    conclusion: args.conclusion,
  };
}
