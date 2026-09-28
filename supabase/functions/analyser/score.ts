/**
 * NOTATION PROPRIÉTAIRE CosmeCheck : PASTILLE couleur, indépendante de toute source tierce.
 *
 * Les couleurs par ingrédient (`ColorRating`) proviennent désormais de notre
 * dérivation publique (règlement CE 1223/2009 : annexes II/III/IV/V/VI + CMR,
 * perturbateurs endocriniens ANSES/UE, 26 allergènes UE), stockée dans
 * `cosme_check.ingredients.color_rating` (écrasée) + table de preuve
 * `cosme_check.ingredient_color`.
 *
 * Le SCORE 0-20 n'est plus une formule log-pénalité calquée sur un tiers :
 * c'est un score SYNTHÉTISÉ dans la bande de notre pastille, pour que tout le
 * code existant (RPC catalogue, `verdictToneFromScore`, affichage, tri) reflète
 * NOTRE système sans réécriture. Port fidèle de `Cosme-Scraper/rescore_lab/
 * derive_product_pastille.py` (moteur) + `finalize_local.py` (bandes).
 *
 *   Pastille (NON dégressive — ne tombe jamais à 0 à cause du nombre) :
 *     - Branche DOUCE (que du vert + jaune) : forcément vert ; œil jaune
 *       UNIQUEMENT si jaunes > verts.
 *     - Branche SÉVÈRE (≥1 orange/rouge) : plafond par zone de position
 *       (Tête×3 / Corps×2 / Queue×1) + composition (ratio pondéré) ; pire des 2.
 *   Score synthétisé = base_bande + largeur × ratio(vert)  →  scoreLabel/tone
 *   retombent EXACTEMENT sur la pastille (seuils ≥17 / ≥13 / ≥9 / ≥5).
 */
export type ColorRating = "Vert" | "Jaune" | "Orange" | "Rouge";
export type ScoreTone = "green" | "amber" | "orange" | "rose";
export type VerdictTone =
  | "very-safe"
  | "safe"
  | "caution"
  | "warning"
  | "danger"
  | "high-risk"
  | "unknown";

const RANK: Record<ColorRating, number> = { Vert: 0, Jaune: 1, Orange: 2, Rouge: 3 };
const UNRANK: Record<number, ColorRating> = { 0: "Vert", 1: "Jaune", 2: "Orange", 3: "Rouge" };

export type PastilleResult = {
  tone: VerdictTone;
  reason: string;
  nVert: number;
  nJaune: number;
  nOrange: number;
  nRouge: number;
  nIdent: number;
};

/**
 * Calcule la pastille d'un produit à partir des couleurs positionnées.
 * @param colored  liste { color, position } (position = ordre INCI, 0- ou 1-based)
 * @param totalInci  nombre total de tokens INCI (identifiés + non reconnus)
 * @param gate  si true, renvoie "unknown" quand < 50 % d'ingrédients identifiés
 *              (utilisé pour le bulk catalogue ; false pour un scan en direct).
 */
export function pastilleTone(
  colored: { color: ColorRating | null; position: number }[],
  totalInci: number,
  gate = true,
): PastilleResult {
  const ident = colored
    .filter((c): c is { color: ColorRating; position: number } => c.color != null && c.color in RANK)
    .slice()
    .sort((a, b) => a.position - b.position);
  const n = ident.length;
  let nVert = 0, nJaune = 0, nOrange = 0, nRouge = 0;
  for (const { color } of ident) {
    if (color === "Vert") nVert++;
    else if (color === "Jaune") nJaune++;
    else if (color === "Orange") nOrange++;
    else if (color === "Rouge") nRouge++;
  }
  const base = { nVert, nJaune, nOrange, nRouge, nIdent: n };

  if (n === 0 || (gate && totalInci && n / totalInci < 0.5)) {
    return { tone: "unknown", reason: "Trop d'ingrédients non identifiés", ...base };
  }

  // ── BRANCHE DOUCE : uniquement vert + jaune ──────────────────────────────
  // Règle produit : forcément vert (cœur/feuille) ; œil jaune SEULEMENT si
  // les jaunes dépassent les verts.
  if (nOrange === 0 && nRouge === 0) {
    if (nJaune > nVert) {
      return { tone: "caution", reason: `vert/jaune - jaunes ${nJaune} > verts ${nVert}`, ...base };
    }
    if (nJaune === 0) {
      return { tone: "very-safe", reason: `${nVert} verts, aucun à surveiller`, ...base };
    }
    return { tone: "safe", reason: `${nVert} verts / ${nJaune} jaunes (jaunes <= verts)`, ...base };
  }

  // ── BRANCHE SÉVÈRE : au moins un orange ou rouge (position + composition) ──
  const corpsMax = Math.ceil(0.6 * n);
  const zoneOf = (rank1: number): "Tete" | "Corps" | "Queue" =>
    rank1 <= 5 ? "Tete" : rank1 <= corpsMax ? "Corps" : "Queue";

  let ceiling = 0; // Vert
  let cntRouge = 0, cntOrange = 0;
  let sgood = 0, stot = 0;
  ident.forEach(({ color }, i) => {
    const z = zoneOf(i + 1);
    const w = z === "Tete" ? 3 : z === "Corps" ? 2 : 1;
    stot += w;
    if (color === "Vert") sgood += w;
    else if (color === "Jaune") sgood += 0.5 * w;
    if (color === "Rouge") {
      cntRouge++;
      const cap = z === "Tete" ? 3 : z === "Corps" ? 2 : 1; // Rouge / Orange / Jaune
      ceiling = Math.max(ceiling, cap);
    } else if (color === "Orange") {
      cntOrange++;
      // V2 (allègement) : un orange isolé ne plafonne qu'à Jaune (rien en queue).
      const cap = z === "Queue" ? 0 : 1;
      ceiling = Math.max(ceiling, cap);
    }
  });
  if (cntRouge >= 2) ceiling = Math.max(ceiling, 2); // ≥2 rouge -> au moins Orange
  if (cntOrange >= 4) ceiling = Math.max(ceiling, 2); // ≥4 orange -> au moins Orange

  const ratio = stot ? sgood / stot : 0;
  const comp = ratio >= 0.8 ? 0 : ratio >= 0.55 ? 1 : ratio >= 0.32 ? 2 : 3;
  // Sans AUCUN rouge, la composition seule ne peut pas descendre en "rouge"
  // (danger) : un produit 100 % orange = orange (warning), pas danger.
  const compCapped = cntRouge === 0 ? Math.min(comp, 2) : comp;
  const final = Math.max(ceiling, compCapped);
  const reason = `plafond=${UNRANK[ceiling]} - compo=${UNRANK[comp]} (ratio ${ratio.toFixed(2)}) - ${n} ingr.`;
  if (final === 3) return { tone: cntRouge >= 2 ? "high-risk" : "danger", reason, ...base };
  if (final === 2) return { tone: "warning", reason, ...base };
  if (final === 1) return { tone: "caution", reason, ...base };
  return { tone: "safe", reason, ...base }; // filet (orange/rouge présents mais dominés)
}

// Bandes de score synthétisé par pastille : [base, largeur]. Alignées sur
// `verdictToneFromScore` (≥17 / ≥13 / ≥9 / ≥5) — cf. finalize_local.py.
const BAND: Record<Exclude<VerdictTone, "unknown">, [number, number]> = {
  "very-safe": [17.0, 3.0],
  "safe": [13.0, 3.9],
  "caution": [9.0, 3.9],
  "warning": [5.0, 3.9],
  "danger": [0.0, 4.9],
  "high-risk": [0.0, 2.0],
};

/**
 * Score 0–20 synthétisé dans la bande de la pastille (nuance fine par ratio de
 * vert, pour conserver un tri stable). `null` si pastille indéterminée.
 */
export function synthScore(p: PastilleResult): number | null {
  if (p.tone === "unknown") return null;
  const [b, w] = BAND[p.tone];
  const ratio = p.nIdent ? (p.nVert + 0.5 * p.nJaune) / p.nIdent : 0;
  return Math.round((b + w * ratio) * 100) / 100;
}

/** Map a numeric score (0-20) to a qualitative label + tone. Tone : ≥13 vert (convention unique). */
export function scoreLabel(score: number): { label: string; tone: ScoreTone } {
  // TONE aligné sur catalog.f_score_tone (>=13 vert) = convention unique
  // (mobile/web/DB). Le LABEL garde "Très bien" dès 17.
  if (score >= 17) return { label: "Très bien", tone: "green" };
  if (score >= 13) return { label: "Bien", tone: "green" };
  if (score >= 9) return { label: "Moyen", tone: "amber" };
  if (score >= 5) return { label: "Faible", tone: "orange" };
  return { label: "Faible", tone: "rose" };
}

/**
 * SCORE SERVI = LE SCORE CATALOGUE, POINT.
 *
 * Règle produit (14 sept 2026, arbitrage bêta) : l'app LIT les notes déjà
 * calculées, elle n'en recalcule aucune à l'affichage. Le catalogue est la
 * SEULE source de vérité quand il porte une note ; le score live (moteur
 * pastille sur l'INCI) ne sert que pour un produit ABSENT du catalogue ou
 * catalogué sans note (saisie manuelle, produit trouvé sur internet).
 *
 * Ce que ça remplace : l'ancien `reconcileScore` servait le score LIVE quand il
 * tombait dans une bande de qualité différente du catalogue. Conséquence vue en
 * bêta (Stela, 12 sept) : l'Anua Azelaic Acid 10 sortait à 12,9 « Moyen » (œil
 * jaune) dans la recherche et à 16,51 « Bien » (4 étoiles vertes) sur sa fiche,
 * parce que la fiche servait le live et la recherche le catalogue. Une seule
 * note partout vaut mieux qu'une note « plus juste » sur un seul écran, d'autant
 * que `routine-smart-suggest` qualifie les produits sur la note catalogue.
 *
 * Corollaire assumé : si le coloriage catalogue diverge du coloriage live, les
 * étoiles peuvent sembler sévères au regard des couleurs listées en dessous. Le
 * correctif est alors de corriger la LIGNE CATALOGUE (re-score hors ligne), pas
 * de diverger à l'affichage.
 */
export function resolveDisplayScore(
  catalogScore: number | null | undefined,
  liveScore: number | null | undefined,
): number | null {
  if (catalogScore != null && !Number.isNaN(catalogScore)) return catalogScore;
  return liveScore != null && !Number.isNaN(liveScore) ? liveScore : null;
}

/**
 * NOTE DE RÉFÉRENCE d'une analyse (28 sept 2026) : le moteur pastille appliqué
 * aux ingrédients AFFICHÉS, si au moins 50 % d'entre eux sont identifiés ;
 * sinon `null` (analyse pas assez fiable pour faire foi).
 *
 * Pourquoi : la note catalogue venait de l'ancien outil d'import, qui découpe
 * l'INCI autrement. Résultat vu en bêta (Stela, 27 sept) : « pielsana gel de
 * ducha » à 17,34 « Très bien » dans les alternatives, alors que sa fiche
 * listait 2 rouges (MIT + MCI) et 3 orange. Décision éditeur : la note unique
 * est celle du moteur sur les ingrédients affichés. Le trigger SQL
 * `trg_align_catalog_from_analysis` (f_reference_score, même règle des 50 %)
 * recopie cette note dans le catalogue dès que l'analyse produit est écrite,
 * donc recherche, alternatives, Pépites et historique lisent la même valeur.
 */
export function referenceScore(
  items: { colorRating?: ColorRating | null; position?: number | null }[],
): number | null {
  if (items.length === 0) return null;
  const colored = items.filter((it) => it.colorRating != null && it.colorRating in RANK);
  if (colored.length / items.length < 0.5) return null;
  return synthScore(
    pastilleTone(
      items.map((it) => ({ color: it.colorRating ?? null, position: Number(it.position ?? 0) })),
      items.length,
      false,
    ),
  );
}

/**
 * Note servie pour un produit (cache EAN ou calcul live) :
 *   - catalogue sans note (retirée volontairement ou jamais notée) → le moteur ;
 *   - sinon la note de référence des ingrédients servis, et à défaut (analyse
 *     peu fiable) la note catalogue.
 * Le trigger SQL applique la même règle au catalogue : la valeur servie ici est
 * donc celle que la recherche et les alternatives afficheront.
 */
export function servedProductScore(
  catalogScore: number | null | undefined,
  items: { colorRating?: ColorRating | null; position?: number | null }[],
  engineScore: number,
): number {
  if (catalogScore == null || Number.isNaN(catalogScore)) return engineScore;
  return referenceScore(items) ?? catalogScore;
}
