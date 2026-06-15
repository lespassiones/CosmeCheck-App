/**
 * dedupeKey — clé de dédoublonnage stable d'un produit (marque + nom).
 *
 * Identique au `dedupeKey` de product-suggest : on normalise (minuscules, sans
 * accents, alphanum), on trie les tokens et on garde les 6 premiers pour absorber
 * les variations de formulation entre sources/utilisateurs. Partagé pour que la
 * file `web_products` fusionne bien les doublons quelle que soit l'Edge function
 * qui l'alimente (analyser, ecommerce-scrape).
 */
export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function dedupeKey(brand: string | null, name: string | null): string {
  const all = `${brand ?? ""} ${name ?? ""}`;
  return normalizeLabel(all).split(/\s+/).filter(Boolean).sort().slice(0, 6).join(" ");
}
