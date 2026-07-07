/**
 * Coherence engine — pure deterministic logic. Deno port of
 * CosmetWiki/lib/coherence/engine.ts. No LLM call here: the engine guarantees
 * we never report an ingredient that isn't physically in the formula.
 */

import {
  CLAIM_CATEGORIES,
  findCategoryBySlug,
  type ActiveEntry,
  type ClaimCategory,
} from "./claims.ts";
import type {
  AnalyseItem,
  AnalyseResponse,
  CoherencePromise,
  CoherenceResult,
  CoherenceVerdict,
  OutOfScopePromise,
  ProductType,
  UnverifiableClaim,
} from "./types.ts";

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[^a-z0-9]/g, "");
}

function findItemForActive(
  active: ActiveEntry,
  items: AnalyseItem[],
): AnalyseItem | null {
  if (active.slug) {
    const bySlug = items.find((it) => it.slug === active.slug);
    if (bySlug) return bySlug;
  }

  const targetName = norm(active.name);
  const targetSlug = norm(active.slug ?? "");

  const exactName = items.find((it) => {
    const n1 = norm(it.name ?? "");
    const n2 = norm(it.input ?? "");
    return (
      (targetName.length > 0 && (n1 === targetName || n2 === targetName)) ||
      (targetSlug.length > 0 && (n1 === targetSlug || n2 === targetSlug))
    );
  });
  if (exactName) return exactName;

  if (targetName.length >= 5) {
    const partial = items.find((it) => {
      const n1 = norm(it.name ?? "");
      const n2 = norm(it.input ?? "");
      return (
        (n1 && (n1.includes(targetName) || targetName.includes(n1))) ||
        (n2 && (n2.includes(targetName) || targetName.includes(n2)))
      );
    });
    if (partial) return partial;
  }

  return null;
}

function isInTrace(item: AnalyseItem): boolean {
  return (
    item.thresholdContext === "after_fragrance" ||
    item.thresholdContext === "after_preservative"
  );
}

// Allergènes parfumants BI-FONCTION (Annexe III UE 1223/2009) : molécules
// listées comme allergène parfumant réglementé MAIS très souvent employées à
// une AUTRE fonction (conservateur/solvant/fixateur). PARITÉ STRICTE avec le
// moteur web (lib/coherence/engine.ts côté CosmetWiki) :
// - benzyl-alcohol   : conservateur / solvant (≈90 % des usages)
// - benzyl-benzoate  : solvant, fixateur, plastifiant
// - benzyl-salicylate: aussi absorbeur UV faible
const DUAL_USE_ALLERGEN_SLUGS = new Set<string>([
  "benzyl-alcohol",
  "benzyl-benzoate",
  "benzyl-salicylate",
]);
function isDualUseAllergen(it: AnalyseItem): boolean {
  if (it.slug && DUAL_USE_ALLERGEN_SLUGS.has(it.slug)) return true;
  const n = norm(it.name ?? it.input ?? "");
  return (
    n.includes("benzylalcohol") ||
    n.includes("benzylbenzoate") ||
    n.includes("benzylsalicylate")
  );
}

// Marqueurs INCI qui signalent explicitement une composition parfumante.
const FRAGRANCE_MARKER_NAMES = new Set<string>([
  "PARFUM",
  "FRAGRANCE",
  "AROMA",
  "FLAVOR",
]);

// Détecte si la formule contient un parfum DÉCLARÉ : mot PARFUM/FRAGRANCE/
// AROMA/FLAVOR explicite, tag parfum-synthese, ou allergène Annexe III « pur
// parfum » (NON dual-use, pour éviter l'auto-confirmation circulaire : la
// présence de Benzyl Alcohol seul ne prouve pas que la formule est parfumée).
function formulaHasDeclaredFragrance(items: AnalyseItem[]): boolean {
  for (const it of items) {
    const upperName = (it.name ?? it.input ?? "").toUpperCase().trim();
    if (FRAGRANCE_MARKER_NAMES.has(upperName)) return true;
    const tags = it.tags ?? [];
    if (tags.includes("parfum-synthese")) return true;
    if (tags.includes("allergene-parfumant") && !isDualUseAllergen(it)) {
      return true;
    }
  }
  return false;
}

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

export type LlmPromiseProposal = {
  category_slug: string;
  label: string;
  excerpt: string;
};

function deburre(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICS_RE, "");
}

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
        productType &&
        cat.productTypes &&
        !cat.productTypes.includes(productType as Exclude<ProductType, "autre">)
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
    const key =
      slug === "autre"
        ? `autre::${(p.label || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(DIACRITICS_RE, "")
            .replace(/[^a-z0-9]+/g, "")}`
        : `slug::${slug}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, p);
      continue;
    }
    if ((p.excerpt?.length ?? 0) > (existing.excerpt?.length ?? 0)) {
      byKey.set(key, { ...p, label: existing.label || p.label });
    }
  }
  return Array.from(byKey.values());
}

export type OpenLlmMatch = {
  item_slug: string;
  item_name: string;
  evidence: "documented" | "supportive" | "marketing";
  reason: string;
};

export function resolvePromise(
  proposal: LlmPromiseProposal,
  items: AnalyseItem[],
): CoherencePromise {
  const cat = findCategoryBySlug(proposal.category_slug);

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
    missingActives: missing.slice(0, 5),
    score,
  };
}

export function resolveAbsencePromise(
  proposal: LlmPromiseProposal,
  cat: ClaimCategory,
  items: AnalyseItem[],
): CoherencePromise {
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
  // (PARITÉ STRICTE avec le moteur web). Les substances dual-use (Benzyl
  // Alcohol…) servent alors à leur autre fonction (conservateur/solvant) :
  //   - si elles sont les SEULS fautifs → « partielle » (50, à nuancer),
  //     l'ingrédient reste signalé dans contradictingActives ;
  //   - s'il existe AUSSI un vrai allergène (Limonene, Linalool…) → on garde
  //     « contredite » sur les vrais fautifs (les dual-use sont écartés).
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

export function resolveOpenPromise(
  proposal: LlmPromiseProposal,
  items: AnalyseItem[],
  llmMatches: OpenLlmMatch[],
  llmMissing: string[],
): CoherencePromise {
  const validated = llmMatches
    .map((m) => {
      let item = m.item_slug
        ? items.find((it) => it.slug && it.slug === m.item_slug) ?? null
        : null;
      if (!item && m.item_name) {
        const target = norm(m.item_name);
        if (target.length >= 4) {
          item =
            items.find((it) => {
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

  // Règle d'absence : si le label commence par "sans " et qu'aucun ingrédient
  // correspondant n'a été trouvé dans la formule (ni matches ni missing), la
  // promesse est tenue — l'absence dans l'INCI prouve l'absence dans le produit.
  const isAbsenceClaim = /^sans[\s\-]/i.test((proposal.label ?? "").trim());
  if (isAbsenceClaim && foundDocumented.length === 0 && foundCosmetic.length === 0 && llmMissing.length === 0) {
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

export function computeMetrics(promises: CoherencePromise[]): CoherenceResult["metrics"] {
  const total = promises.length;
  const tenueCount = promises.filter((p) => p.verdict === "tenue").length;
  const partielleCount = promises.filter((p) => p.verdict === "partielle").length;
  const marketingCount = promises.filter((p) => p.verdict === "marketing").length;
  const nonDemontreeCount = promises.filter((p) => p.verdict === "non_demontree").length;
  const contrediteCount = promises.filter((p) => p.verdict === "contredite").length;
  const unsupportedCount = marketingCount + nonDemontreeCount + contrediteCount;
  const marketingIndex = total === 0 ? 100 : Math.round((unsupportedCount / total) * 100);
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
  let firstFragrancePos: number | null = null;
  let firstPreservativePos: number | null = null;
  for (const it of parent.items) {
    const tags = it.tags ?? [];
    if (
      firstFragrancePos === null &&
      (tags.includes("parfum-synthese") || tags.includes("allergene-parfumant"))
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
