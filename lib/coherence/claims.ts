/**
 * Catalogue of cosmetic promise categories and the documented actives that
 * support each one.
 *
 * This is the **anti-hallucination knowledge base**: the LLM is constrained
 * to propose actives FROM this list only. Actives are referenced by their
 * canonical INCI slug (matches `cosme_check.ingredients.slug`) so the engine
 * can mechanically check their presence in the parent formula.
 *
 * NOTES
 * - For MVP we keep 12 broad categories. The list is meant to be enriched
 *   over time by domain experts (cosmétologues / chimistes).
 * - `evidence` levels:
 *     - "documented"  → biologically active at usage doses, peer-reviewed.
 *     - "supportive"  → contributes indirectly (e.g. emollients for hair
 *                       feel) but isn't the actual driver of the claim.
 *     - "marketing"   → cosmetic / sensory effect only, no biological action.
 * - `keywords` are French phrases / morphemes the LLM can use to map a
 *   marketing description fragment to this category (it's also used as a
 *   safety net regex if the LLM misses something).
 */

export type EvidenceLevel = "documented" | "supportive" | "marketing";

export type ActiveEntry = {
  /** Canonical INCI slug as stored in cosme_check.ingredients.slug. */
  slug: string;
  /** Display name (FR/EN, depending on what the literature uses). */
  name: string;
  evidence: EvidenceLevel;
};

export type ClaimCategory = {
  slug: string;
  label: string;
  /** Plain-French keywords that hint at this category in marketing text. */
  keywords: string[];
  /** Documented + supportive + cosmetic actives, in display order. */
  actives: ActiveEntry[];
  /** Short hint shown if the LLM falls back to "non_demontree". */
  hint: string;
  /**
   * When set, this category represents an "absence" claim (sans paraben,
   * sans sulfate…). The engine resolves it by checking every formula item
   * for this tag rather than by matching positive actives. `actives` is
   * empty in that case.
   */
  forbiddenTag?: string;
  /**
   * Product types this category is biologically relevant for. When omitted,
   * the category is treated as universally applicable (mostly used for
   * absence claims like "sans paraben"). The reclassifier in engine.ts uses
   * this list to disambiguate keywords shared across categories — e.g.
   * "éclat" appears in BOTH `brillance` (hair shine) and `eclat`
   * (skin radiance / anti-spot); on a hair product only the `brillance`
   * variant is admissible.
   */
  productTypes?: ReadonlyArray<
    | "cheveux"
    | "peau_visage"
    | "peau_corps"
    | "levres"
    | "parfum"
    | "dents"
    | "ongles"
    | "maquillage"
  >;
};

/**
 * 12 promise categories covering ~80% of mainstream cosmetic claims.
 */
export const CLAIM_CATEGORIES: ClaimCategory[] = [
  {
    slug: "anti_chute",
    label: "Anti-chute",
    productTypes: ["cheveux"],
    keywords: ["anti-chute", "chute", "anti chute", "stop chute", "tombe", "tomber", "ralentir la chute"],
    actives: [
      { slug: "caffeine", name: "Caféine", evidence: "documented" },
      { slug: "minoxidil", name: "Minoxidil", evidence: "documented" },
      { slug: "biotin", name: "Biotine", evidence: "supportive" },
      { slug: "saw-palmetto-extract", name: "Saw palmetto", evidence: "supportive" },
      { slug: "redensyl", name: "Redensyl", evidence: "documented" },
      { slug: "aminexil", name: "Aminexil", evidence: "documented" },
      { slug: "capilectine", name: "Capilectine", evidence: "documented" },
      { slug: "anageline", name: "Anagéline", evidence: "documented" },
      { slug: "procapil", name: "Procapil", evidence: "documented" },
    ],
    hint: "Aucun actif anti-chute documenté (caféine, minoxidil, peptides anti-chute…) n'a été trouvé.",
  },
  {
    slug: "densification",
    label: "Densification",
    productTypes: ["cheveux"],
    keywords: ["densifie", "densification", "densité", "épaissi", "épaisseur", "volume capillaire", "ancrage"],
    actives: [
      { slug: "redensyl", name: "Redensyl", evidence: "documented" },
      { slug: "capixyl", name: "Capixyl", evidence: "documented" },
      { slug: "biotinyl-tripeptide-1", name: "Biotinyl-Tripeptide-1", evidence: "documented" },
      { slug: "hydrolyzed-keratin", name: "Kératine hydrolysée", evidence: "supportive" },
      { slug: "hydrolyzed-rice-protein", name: "Protéines de riz hydrolysées", evidence: "supportive" },
      // Cosmetic-only fillers (give visual volume, not biological density)
      { slug: "polyquaternium-7", name: "Polyquaternium-7", evidence: "marketing" },
      { slug: "polyquaternium-10", name: "Polyquaternium-10", evidence: "marketing" },
      { slug: "algae-extract", name: "Polysaccharides d'algues", evidence: "marketing" },
    ],
    hint: "Densification biologique non démontrée - la formule peut donner un effet visuel/sensoriel sans agir sur l'épaisseur réelle de la fibre.",
  },
  {
    slug: "hydratation",
    label: "Hydratation",
    productTypes: ["cheveux", "peau_visage", "peau_corps", "levres"],
    keywords: ["hydrate", "hydratation", "hydratant", "humidité", "humidifie"],
    actives: [
      { slug: "glycerin", name: "Glycérine", evidence: "documented" },
      { slug: "sodium-hyaluronate", name: "Acide hyaluronique (sel de sodium)", evidence: "documented" },
      { slug: "hyaluronic-acid", name: "Acide hyaluronique", evidence: "documented" },
      { slug: "panthenol", name: "Panthénol (provitamine B5)", evidence: "documented" },
      { slug: "urea", name: "Urée", evidence: "documented" },
      { slug: "aloe-barbadensis-leaf-juice", name: "Aloe vera", evidence: "documented" },
      { slug: "betaine", name: "Bétaïne", evidence: "documented" },
      { slug: "propanediol", name: "Propanediol", evidence: "supportive" },
      { slug: "sodium-pca", name: "Sodium PCA", evidence: "documented" },
    ],
    hint: "Aucun humectant ou actif hydratant documenté trouvé en quantité utile.",
  },
  {
    slug: "anti_age",
    label: "Anti-âge",
    productTypes: ["peau_visage", "peau_corps"],
    keywords: ["anti-âge", "anti age", "rides", "fermeté", "raffermi", "jeunesse", "rajeunit"],
    actives: [
      { slug: "retinol", name: "Rétinol", evidence: "documented" },
      { slug: "retinyl-palmitate", name: "Rétinyl palmitate", evidence: "documented" },
      { slug: "ascorbic-acid", name: "Vitamine C (acide ascorbique)", evidence: "documented" },
      { slug: "tetrahexyldecyl-ascorbate", name: "Vitamine C stable (tétrahexyldécyl ascorbate)", evidence: "documented" },
      { slug: "niacinamide", name: "Niacinamide (vitamine B3)", evidence: "documented" },
      { slug: "bakuchiol", name: "Bakuchiol", evidence: "documented" },
      { slug: "palmitoyl-tripeptide-1", name: "Peptides anti-âge", evidence: "documented" },
      { slug: "palmitoyl-pentapeptide-4", name: "Matrixyl", evidence: "documented" },
      { slug: "tocopherol", name: "Vitamine E (tocophérol)", evidence: "supportive" },
    ],
    hint: "Aucun actif anti-âge documenté (rétinol, vitamine C, peptides…) trouvé.",
  },
  {
    slug: "raffermissement",
    label: "Raffermissement",
    productTypes: ["peau_visage", "peau_corps"],
    keywords: ["raffermi", "ferme", "tonifi", "tone", "élasticité"],
    actives: [
      { slug: "caffeine", name: "Caféine", evidence: "documented" },
      { slug: "centella-asiatica-extract", name: "Centella asiatica", evidence: "documented" },
      { slug: "palmitoyl-tripeptide-1", name: "Peptides", evidence: "documented" },
      { slug: "ascorbic-acid", name: "Vitamine C", evidence: "documented" },
      { slug: "retinol", name: "Rétinol", evidence: "documented" },
      { slug: "dmae", name: "DMAE", evidence: "supportive" },
    ],
    hint: "Aucun actif raffermissant documenté trouvé.",
  },
  {
    slug: "anti_pellicules",
    label: "Anti-pellicules",
    productTypes: ["cheveux"],
    keywords: ["pellicules", "antipelliculaire", "anti-pelliculaire", "pellicule", "squames"],
    actives: [
      { slug: "piroctone-olamine", name: "Piroctone olamine", evidence: "documented" },
      { slug: "zinc-pyrithione", name: "Zinc pyrithione", evidence: "documented" },
      { slug: "selenium-disulfide", name: "Sulfure de sélénium", evidence: "documented" },
      { slug: "ketoconazole", name: "Kétoconazole", evidence: "documented" },
      { slug: "salicylic-acid", name: "Acide salicylique", evidence: "documented" },
      { slug: "climbazole", name: "Climbazole", evidence: "documented" },
      { slug: "melaleuca-alternifolia-leaf-oil", name: "Tea tree (huile)", evidence: "supportive" },
    ],
    hint: "Aucun actif antipelliculaire documenté trouvé.",
  },
  {
    slug: "demelage",
    label: "Démêlage",
    productTypes: ["cheveux"],
    keywords: ["démêle", "démêlant", "demele", "demelant", "facile à coiffer", "douceur des cheveux", "douceur cheveux", "souplesse des cheveux", "souplesse cheveux", "souple"],
    actives: [
      { slug: "behentrimonium-methosulfate", name: "Behentrimonium methosulfate", evidence: "documented" },
      { slug: "behenamidopropyl-dimethylamine", name: "Behenamidopropyl dimethylamine", evidence: "documented" },
      { slug: "cetrimonium-chloride", name: "Cetrimonium chloride", evidence: "documented" },
      { slug: "cetearyl-alcohol", name: "Alcool cétéarylique (alcool gras)", evidence: "supportive" },
      { slug: "behenyl-alcohol", name: "Alcool béhénylique", evidence: "supportive" },
      { slug: "polyquaternium-7", name: "Polyquaternium-7", evidence: "documented" },
      { slug: "polyquaternium-10", name: "Polyquaternium-10", evidence: "documented" },
      { slug: "amodimethicone", name: "Amodiméthicone", evidence: "documented" },
    ],
    hint: "Aucun conditionneur cationique ou silicone démêlant documenté trouvé.",
  },
  {
    slug: "brillance",
    label: "Brillance",
    // Brillance = hair-shine; the "éclat" keyword is intentionally shared
    // with the `eclat` (skin radiance) category — the reclassifier resolves
    // the ambiguity using productTypes (hair products route to here, skin
    // products to `eclat`).
    productTypes: ["cheveux"],
    keywords: [
      "brillance",
      "brillant",
      "brillants",
      "éclat",
      "éclat de la fibre",
      "éclat des cheveux",
      "éclat fibre capillaire",
      "lumière",
      "lumineux",
      "shine",
    ],
    actives: [
      { slug: "dimethicone", name: "Diméthicone", evidence: "documented" },
      { slug: "cyclopentasiloxane", name: "Cyclopentasiloxane", evidence: "documented" },
      { slug: "argania-spinosa-kernel-oil", name: "Huile d'argan", evidence: "supportive" },
      { slug: "amodimethicone", name: "Amodiméthicone", evidence: "documented" },
    ],
    hint: "Aucun agent filmogène documenté pour la brillance trouvé.",
  },
  {
    slug: "anti_frisottis",
    label: "Anti-frisottis",
    productTypes: ["cheveux"],
    keywords: ["frisottis", "anti-frisottis", "frizz", "lisse", "défrisé"],
    actives: [
      { slug: "amodimethicone", name: "Amodiméthicone", evidence: "documented" },
      { slug: "dimethicone", name: "Diméthicone", evidence: "documented" },
      { slug: "argania-spinosa-kernel-oil", name: "Huile d'argan", evidence: "supportive" },
      { slug: "behentrimonium-methosulfate", name: "Behentrimonium methosulfate", evidence: "documented" },
    ],
    hint: "Aucun agent filmogène ou conditionneur anti-frisottis trouvé.",
  },
  {
    slug: "apaisement",
    label: "Apaisement",
    productTypes: ["peau_visage", "peau_corps", "cheveux"],
    keywords: ["apaise", "apaisant", "calme", "irritation", "rougeur", "sensibilité"],
    actives: [
      { slug: "centella-asiatica-extract", name: "Centella asiatica", evidence: "documented" },
      { slug: "panthenol", name: "Panthénol", evidence: "documented" },
      { slug: "aloe-barbadensis-leaf-juice", name: "Aloe vera", evidence: "documented" },
      { slug: "bisabolol", name: "Bisabolol", evidence: "documented" },
      { slug: "allantoin", name: "Allantoïne", evidence: "documented" },
      { slug: "niacinamide", name: "Niacinamide", evidence: "documented" },
      { slug: "calendula-officinalis-flower-extract", name: "Calendula", evidence: "supportive" },
    ],
    hint: "Aucun actif apaisant documenté trouvé.",
  },
  {
    slug: "exfoliation",
    label: "Exfoliation",
    productTypes: ["peau_visage", "peau_corps"],
    keywords: ["exfolie", "exfoliant", "peeling", "renouvellement", "gomme", "scrub"],
    actives: [
      { slug: "glycolic-acid", name: "Acide glycolique (AHA)", evidence: "documented" },
      { slug: "lactic-acid", name: "Acide lactique (AHA)", evidence: "documented" },
      { slug: "salicylic-acid", name: "Acide salicylique (BHA)", evidence: "documented" },
      { slug: "mandelic-acid", name: "Acide mandélique (AHA)", evidence: "documented" },
      { slug: "polyhydroxyacid", name: "PHA", evidence: "documented" },
      { slug: "papain", name: "Papaïne (enzyme)", evidence: "documented" },
      { slug: "bromelain", name: "Bromélaïne (enzyme)", evidence: "documented" },
    ],
    hint: "Aucun acide exfoliant ou enzyme exfoliante documentée trouvée.",
  },
  {
    slug: "eclat",
    label: "Éclaircissement / Éclat",
    // Skin-only: "éclat du teint", anti-spot. The shared "éclat" keyword
    // routes hair-product contexts to `brillance` via the reclassifier;
    // here we keep the skin-specific keywords first so the LLM prompt
    // disambiguates correctly.
    productTypes: ["peau_visage", "peau_corps"],
    keywords: ["éclat du teint", "éclaircit", "éclaircissant", "tache", "pigmentation", "uniformise", "anti-tache", "éclat"],
    actives: [
      { slug: "niacinamide", name: "Niacinamide", evidence: "documented" },
      { slug: "ascorbic-acid", name: "Vitamine C", evidence: "documented" },
      { slug: "alpha-arbutin", name: "Alpha-arbutine", evidence: "documented" },
      { slug: "kojic-acid", name: "Acide kojique", evidence: "documented" },
      { slug: "tranexamic-acid", name: "Acide tranexamique", evidence: "documented" },
      { slug: "azelaic-acid", name: "Acide azélaïque", evidence: "documented" },
      { slug: "licorice-root-extract", name: "Extrait de réglisse", evidence: "supportive" },
    ],
    hint: "Aucun actif éclaircissant ou anti-taches documenté trouvé.",
  },
  // ─── Absence claims ───────────────────────────────────────────────────────
  // "Sans X" promises. Resolved by scanning items[].tags for forbiddenTag
  // rather than by matching positive actives. The tag names match what the
  // INCI analyser pipeline already attaches to ingredients
  // (cf. app/api/analyser/route.ts TAG_LABELS).
  {
    slug: "absence_sulfate",
    label: "Sans sulfate",
    keywords: ["sans sulfate", "sans sulfates", "sulfate-free", "no sulfate"],
    actives: [],
    forbiddenTag: "sulfate",
    hint: "Aucun sulfate détecté dans la formule - promesse tenue.",
  },
  {
    slug: "absence_silicone",
    label: "Sans silicone",
    keywords: ["sans silicone", "sans silicones", "silicone-free", "no silicone"],
    actives: [],
    forbiddenTag: "silicone",
    hint: "Aucun silicone détecté dans la formule - promesse tenue.",
  },
  {
    slug: "absence_paraben",
    label: "Sans paraben",
    keywords: ["sans paraben", "sans parabens", "paraben-free", "no paraben"],
    actives: [],
    forbiddenTag: "paraben",
    hint: "Aucun paraben détecté dans la formule - promesse tenue.",
  },
  {
    slug: "absence_huile_minerale",
    label: "Sans huile minérale",
    keywords: ["sans huile minérale", "sans huiles minérales", "sans paraffine", "sans petrolatum"],
    actives: [],
    forbiddenTag: "huile-minerale",
    hint: "Aucune huile minérale détectée dans la formule - promesse tenue.",
  },
  {
    slug: "absence_colorant_synthese",
    label: "Sans colorant de synthèse",
    keywords: ["sans colorant", "sans colorants", "sans colorant de synthèse", "sans colorants synthétiques"],
    actives: [],
    forbiddenTag: "colorant-synthese",
    hint: "Aucun colorant de synthèse détecté dans la formule - promesse tenue.",
  },
  {
    slug: "absence_parfum_synthese",
    label: "Sans parfum de synthèse",
    keywords: ["sans parfum", "sans parfum de synthèse", "sans parfum synthétique", "fragrance-free"],
    actives: [],
    forbiddenTag: "parfum-synthese",
    hint: "Aucun parfum de synthèse détecté dans la formule - promesse tenue.",
  },
  {
    slug: "absence_allergene_parfumant",
    label: "Sans allergène parfumant",
    keywords: ["sans allergène", "sans allergènes", "hypoallergénique"],
    actives: [],
    forbiddenTag: "allergene-parfumant",
    hint: "Aucun allergène parfumant réglementé détecté - promesse tenue.",
  },
  {
    slug: "absence_ethoxyle",
    label: "Sans composés éthoxylés",
    keywords: ["sans peg", "sans pegs", "sans éthoxylés", "sans ethoxyle"],
    actives: [],
    forbiddenTag: "ethoxyle",
    hint: "Aucun composé éthoxylé (PEG…) détecté - promesse tenue.",
  },
  {
    slug: "absence_ammonium_quaternaire",
    label: "Sans ammonium quaternaire",
    keywords: ["sans ammonium quaternaire", "sans quaternium", "sans quat"],
    actives: [],
    forbiddenTag: "ammonium-quaternaire",
    hint: "Aucun ammonium quaternaire détecté - promesse tenue.",
  },
];

/** Lookup by slug. */
export function findCategoryBySlug(slug: string): ClaimCategory | undefined {
  return CLAIM_CATEGORIES.find((c) => c.slug === slug);
}

/** True when this category is resolved by checking an absence of tag rather
 *  than by matching positive actives. */
export function isAbsenceCategory(cat: ClaimCategory): boolean {
  return Boolean(cat.forbiddenTag);
}

/** Effect categories (everything except the "sans X" absence claims). */
export function effectCategoriesForPrompt(): { slug: string; label: string; example_actives: string[] }[] {
  return CLAIM_CATEGORIES.filter((c) => !c.forbiddenTag).map((c) => ({
    slug: c.slug,
    label: c.label,
    example_actives: c.actives
      .filter((a) => a.evidence === "documented")
      .slice(0, 4)
      .map((a) => a.name),
  }));
}

/** Absence categories - used by the prompt to map "sans X" claims. */
export function absenceCategoriesForPrompt(): { slug: string; label: string; keywords: string[] }[] {
  return CLAIM_CATEGORIES.filter((c) => c.forbiddenTag).map((c) => ({
    slug: c.slug,
    label: c.label,
    keywords: c.keywords,
  }));
}

/**
 * @deprecated Use {@link effectCategoriesForPrompt} - kept temporarily for
 * any caller that hasn't migrated. Returns only effect categories (no
 * absence claims) so existing prompts don't break.
 */
export function categoriesForPrompt(): { slug: string; label: string; example_actives: string[] }[] {
  return effectCategoriesForPrompt();
}

/** All known active slugs (used by the engine to constrain matching). */
export function allKnownActiveSlugs(): Set<string> {
  const s = new Set<string>();
  for (const cat of CLAIM_CATEGORIES) {
    for (const a of cat.actives) s.add(a.slug);
  }
  return s;
}
