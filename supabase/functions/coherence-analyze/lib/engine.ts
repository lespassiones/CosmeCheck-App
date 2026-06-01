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

function deriveVerdict({
  documentedFound,
  documentedFoundWellDosed,
  marketingFound,
}: {
  documentedFound: number;
  documentedFoundWellDosed: number;
  marketingFound: number;
}): CoherenceVerdict {
  if (documentedFoundWellDosed > 0) return "tenue";
  if (documentedFound > 0) return "partielle";
  if (marketingFound > 0) return "marketing";
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
        note: "effet visuel/sensoriel",
      });
    }
  }

  const wellDosed = foundDocumented.filter((f) => !f.inTrace).length;
  const inTrace = foundDocumented.filter((f) => f.inTrace).length;
  const verdict = deriveVerdict({
    documentedFound: foundDocumented.length,
    documentedFoundWellDosed: wellDosed,
    marketingFound: foundCosmetic.length,
  });
  const score = unifiedScore({
    wellDosed,
    inTrace,
    cosmetic: foundCosmetic.length,
  });

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
  const offenders = items.filter((it) => (it.tags ?? []).includes(tag));

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

  const seenPositions = new Set<number>();

  for (const { match, item } of validated) {
    if (seenPositions.has(item.position)) continue;
    seenPositions.add(item.position);
    if (match.evidence === "marketing") {
      foundCosmetic.push({
        name: item.name ?? match.item_name,
        slug: item.slug,
        position: item.position,
        note: match.reason.trim().slice(0, 80) || "effet visuel/sensoriel",
      });
    } else {
      foundDocumented.push({
        name: item.name ?? match.item_name,
        slug: item.slug,
        position: item.position,
        inTrace: isInTrace(item),
      });
    }
  }

  const wellDosed = foundDocumented.filter((f) => !f.inTrace).length;
  const trace = foundDocumented.filter((f) => f.inTrace).length;
  const verdict = deriveVerdict({
    documentedFound: foundDocumented.length,
    documentedFoundWellDosed: wellDosed,
    marketingFound: foundCosmetic.length,
  });

  const score = unifiedScore({
    wellDosed,
    inTrace: trace,
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
