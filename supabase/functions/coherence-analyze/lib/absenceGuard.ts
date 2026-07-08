/**
 * Garde anti-hallucination pour les promesses d'absence ("sans X").
 *
 * Le LLM d'extraction invente parfois une promesse d'absence ("sans sulfate")
 * que la description n'a JAMAIS faite (il voit "sans A, sans B" et extrapole un
 * "sans C" plausible pour la marque). Le moteur, trouvant ensuite l'ingrédient
 * dans la formule, rend "contredite" : on accuse alors une marque d'avoir trahi
 * une promesse qu'elle n'a jamais formulée. Audit prod juillet 2026 : au moins
 * 7/45 promesses d'absence étaient dans ce cas (0 marqueur d'absence dans le
 * texte), 3/3 vérifiées à la main confirmées (LRP "sans sulfate", Caudalie
 * "sans parfum", Garnier "sans éthoxylés").
 *
 * Ce garde est le pendant DÉTERMINISTE de la validation formule : une promesse
 * `absence_*` n'est conservée que si la DESCRIPTION source contient réellement
 * le token de l'ingrédient ET un marqueur de négation proche. Pas de LLM, pas
 * de réseau : simple contrôle de chaîne. PARITÉ STRICTE mobile ↔ web.
 */

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/** minuscule + sans accents + ponctuation → espace + espaces compactés. */
function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens de la famille d'ingrédient par catégorie d'absence (normalisés). */
const ABSENCE_TOKENS: Record<string, string[]> = {
  absence_sulfate: ["sulfat"],
  absence_silicone: ["silicon"],
  absence_paraben: ["paraben"],
  absence_huile_minerale: [
    "huile minerale",
    "huiles minerales",
    "paraffin",
    "petrolatum",
    "vaselin",
    "mineral oil",
  ],
  absence_colorant_synthese: ["colorant"],
  absence_parfum_synthese: ["parfum", "fragrance"],
  absence_allergene_parfumant: ["allergen"],
  absence_ethoxyle: ["peg", "ethoxyl", "polyethylene glycol"],
  absence_ammonium_quaternaire: ["ammonium", "quaternium", "quaternaire", "quats"],
};

/** Marqueurs de négation qui signalent une allégation d'absence. */
const ABSENCE_MARKERS = [
  "sans",
  "0 %",
  "0%",
  "exempt",
  "free",
  "without",
  "zero",
  "depourvu",
];

const WINDOW = 40;

/**
 * True si la description AFFIRME littéralement l'absence de l'ingrédient de
 * cette catégorie (token présent + marqueur de négation dans une fenêtre de
 * ~40 caractères autour, ce qui gère les énumérations "sans huiles, silicones
 * ni quats"). Fail-open sur un slug inconnu (ne bloque pas).
 */
export function descriptionSupportsAbsenceClaim(
  slug: string,
  description: string,
): boolean {
  const tokens = ABSENCE_TOKENS[slug];
  if (!tokens) return true; // catégorie inconnue → ne bloque pas
  const d = normalize(description);
  if (!d) return false;

  // "hypoallergénique" est en soi une allégation d'absence d'allergène.
  if (slug === "absence_allergene_parfumant" && d.includes("hypoallergen")) {
    return true;
  }

  for (const tok of tokens) {
    let idx = d.indexOf(tok);
    while (idx !== -1) {
      const from = Math.max(0, idx - WINDOW);
      const to = Math.min(d.length, idx + tok.length + WINDOW);
      const window = d.slice(from, to);
      if (ABSENCE_MARKERS.some((m) => window.includes(m))) return true;
      idx = d.indexOf(tok, idx + tok.length);
    }
  }
  return false;
}
