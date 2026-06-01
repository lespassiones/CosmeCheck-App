/**
 * Les 26 substances parfumantes réglementées UE (Règlement CE 1223/2009,
 * Annexe III). Port byte-for-byte de `CosmetWiki/lib/euAllergens.ts`.
 * Noms normalisés en majuscules + sans accents pour matcher la sortie du
 * parseur INCI.
 */
export type EuAllergen = {
  inciName: string;
  label: string;
  note: string;
};

export const EU_FRAGRANCE_ALLERGENS: EuAllergen[] = [
  { inciName: "AMYL CINNAMAL", label: "Amyl cinnamal", note: "Parfum synthétique, sensibilisant connu." },
  { inciName: "BENZYL ALCOHOL", label: "Benzyl alcohol", note: "Conservateur et solvant, allergène pour certaines peaux." },
  { inciName: "CINNAMYL ALCOHOL", label: "Cinnamyl alcohol", note: "Composant naturel de la cannelle, sensibilisant." },
  { inciName: "CITRAL", label: "Citral", note: "Note citronnée, sensibilisant fréquent." },
  { inciName: "EUGENOL", label: "Eugenol", note: "Présent dans le clou de girofle, allergène modéré." },
  { inciName: "HYDROXYCITRONELLAL", label: "Hydroxycitronellal", note: "Note florale synthétique, sensibilisant connu." },
  { inciName: "ISOEUGENOL", label: "Isoeugenol", note: "Restreint UE pour son potentiel allergisant." },
  { inciName: "AMYLCINNAMYL ALCOHOL", label: "Amylcinnamyl alcohol", note: "Note florale, sensibilisant." },
  { inciName: "BENZYL SALICYLATE", label: "Benzyl salicylate", note: "Fixateur de parfum, sensibilisant léger." },
  { inciName: "CINNAMAL", label: "Cinnamal", note: "Composant naturel de la cannelle, allergène." },
  { inciName: "COUMARIN", label: "Coumarin", note: "Note vanillée, sensibilisant connu." },
  { inciName: "GERANIOL", label: "Geraniol", note: "Note florale présente dans le géranium, sensibilisant fréquent." },
  { inciName: "ANISE ALCOHOL", label: "Anise alcohol", note: "Note anisée, sensibilisant." },
  { inciName: "BENZYL CINNAMATE", label: "Benzyl cinnamate", note: "Fixateur de parfum, sensibilisant." },
  { inciName: "FARNESOL", label: "Farnesol", note: "Note florale, sensibilisant." },
  { inciName: "BUTYLPHENYL METHYLPROPIONAL", label: "Butylphenyl methylpropional", note: "Aussi appelé Lilial - restreint UE depuis 2022." },
  { inciName: "LINALOOL", label: "Linalool", note: "Note florale (lavande, bergamote), sensibilisant après oxydation." },
  { inciName: "BENZYL BENZOATE", label: "Benzyl benzoate", note: "Fixateur de parfum, sensibilisant modéré." },
  { inciName: "CITRONELLOL", label: "Citronellol", note: "Note florale citronnée, sensibilisant léger." },
  { inciName: "HEXYL CINNAMAL", label: "Hexyl cinnamal", note: "Note florale synthétique, sensibilisant." },
  { inciName: "LIMONENE", label: "Limonene", note: "Note citronnée, sensibilisant après oxydation (très commun)." },
  { inciName: "METHYL 2-OCTYNOATE", label: "Methyl 2-octynoate", note: "Note verte, sensibilisant rare." },
  { inciName: "ALPHA-ISOMETHYL IONONE", label: "α-Isomethyl ionone", note: "Note florale, sensibilisant." },
  { inciName: "EVERNIA PRUNASTRI EXTRACT", label: "Evernia prunastri (mousse de chêne)", note: "Extrait naturel de mousse, fort sensibilisant." },
  { inciName: "EVERNIA FURFURACEA EXTRACT", label: "Evernia furfuracea (mousse d'arbre)", note: "Extrait naturel de mousse, fort sensibilisant." },
  { inciName: "HYDROXYISOHEXYL 3-CYCLOHEXENE CARBOXALDEHYDE", label: "HICC (Lyral)", note: "Lyral - INTERDIT dans l'UE depuis 2021, signal d'alerte fort." },
];

const EU_NAMES_SET = new Set(EU_FRAGRANCE_ALLERGENS.map((a) => a.inciName));
const EU_BY_NAME = new Map(EU_FRAGRANCE_ALLERGENS.map((a) => [a.inciName, a]));

export function isEuFragranceAllergen(inciName: string): boolean {
  return EU_NAMES_SET.has(inciName.toUpperCase().trim());
}

export function getEuFragranceAllergen(inciName: string): EuAllergen | null {
  return EU_BY_NAME.get(inciName.toUpperCase().trim()) ?? null;
}

export const EU_ALLERGENS_TOTAL = EU_FRAGRANCE_ALLERGENS.length;
