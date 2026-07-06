/**
 * normalizeAdvisorForm — couche de normalisation du champ "form" généré par le LLM.
 *
 * Le LLM peut générer des valeurs de form approximatives ("serum" sans zone,
 * "creme visage" avec stopword, "anti-rides" qui n'est pas un nom de catégorie...).
 * Cette fonction mappe ces valeurs vers des tokens fiables que la RPC
 * cosme_check_recommend_products sait interroger (matching AND sur le dernier
 * segment de `catalog.category`).
 *
 * Règles appliquées dans l'ORDRE — la première qui matche gagne.
 * Si aucune règle ne matche : on supprime les stopwords et on retourne le résidu.
 * Si le résidu est vide : on retourne null (pas de filtre catégorie).
 */

const STOPWORDS = new Set([
  "creme", "cream", "soin", "soins", "produit", "produits",
  "pour", "les", "des", "de", "du", "au", "aux",
  "mon", "ma", "mes", "un", "une", "le", "la",
  "et", "a", "en", "sur",
]);

type Rule = { match: RegExp; form: string | null };

/**
 * Règles de normalisation. Ordre important : les plus spécifiques en premier.
 * Chaque regex est testée sur la valeur lowercasée et nettoyée.
 */
const RULES: Rule[] = [
  // ── PIEDS (priorité haute — évite confusion avec corps/jambes) ───────────
  { match: /hydrat.{0,10}pied|pied.{0,10}hydrat|lotion.{0,5}pied/i,     form: "hydratants pieds" },
  { match: /deodor.{0,10}pied|pied.{0,10}deodor|anti.?odeur.{0,5}pied|transpir.{0,10}pied/i, form: "deodorant pieds" },
  { match: /gomm.{0,10}pied|exfoli.{0,10}pied|pied.{0,10}gomm/i,        form: "gommage pieds" },
  { match: /masque.{0,10}pied|pied.{0,10}masque/i,                       form: "masque pieds" },
  { match: /bain.{0,10}pied|pied.{0,10}bain/i,                           form: "bain pieds" },
  { match: /callosit|durillon|fissur.{0,10}pied/i,                       form: "gommage pieds" },
  { match: /\bpieds?\b/i,                                                  form: "hydratants pieds" },

  // ── YEUX / CONTOUR ────────────────────────────────────────────────────────
  { match: /contour.{0,10}yeux|yeux.{0,10}contour|anti.?cerne|anti.?poche|cernes?|poches?.{0,10}yeux/i, form: "yeux contour" },
  { match: /cils?|mascara|sourcil/i,                                       form: "mascara" },

  // ── LÈVRES ───────────────────────────────────────────────────────────────
  { match: /baume.{0,10}l[eè]vre|l[eè]vre.{0,10}baume/i,                 form: "baume levres" },
  { match: /rouge.{0,10}l[eè]vre/i,                                       form: "rouge levres" },
  { match: /gloss|brillant.{0,10}l[eè]vre/i,                             form: "gloss levres" },
  { match: /gomm.{0,10}l[eè]vre|exfoli.{0,10}l[eè]vre/i,                form: "gommage levres" },
  { match: /\bl[eè]vres?\b/i,                                              form: "baume levres" },

  // ── MAINS ────────────────────────────────────────────────────────────────
  { match: /\bmains?\b/i,                                                  form: "mains" },

  // ── ANTI-RIDES / ANTI-ÂGE VISAGE — avant le bloc sérum générique ────────
  { match: /anti.?ride|anti.?[aâ]ge|vieilliss|rides?.{0,10}visage/i,      form: "serum visage" },

  // ── SÉRUM ─────────────────────────────────────────────────────────────────
  { match: /s[eé]rum.{0,10}visage|visage.{0,10}s[eé]rum/i,               form: "serum visage" },
  { match: /s[eé]rum.{0,10}cheveux|cheveux.{0,10}s[eé]rum|s[eé]rum.{0,10}capill/i, form: "serum cheveux" },
  // "serum" seul → visage (cas le plus fréquent ; cheveux ont leur propre règle ci-dessus)
  { match: /\bs[eé]rum\b/i,                                                form: "serum visage" },

  // ── VISAGE (soins généraux) ───────────────────────────────────────────────
  { match: /[eé]clat|luminosit[eé]|teint.{0,10}visage|taches?.{0,10}visage/i, form: "serum visage" },
  { match: /acn[eé]|boutons?|imperfection|points?.{0,5}noirs?/i,          form: "imperfections" },
  { match: /nettoy.{0,10}visage|visage.{0,10}nettoy|gel.{0,10}nettoy|mousse.{0,10}nettoy|lait.{0,10}nettoy/i, form: "nettoyant visage" },
  { match: /tonique|toner/i,                                               form: "tonique visage" },
  { match: /masque.{0,10}visage|visage.{0,10}masque|masque.{0,10}tissu/i, form: "masque" },
  { match: /gomm.{0,10}visage|visage.{0,10}gomm|exfoli.{0,10}visage/i,   form: "gommage visage" },
  { match: /hydrat.{0,10}visage|visage.{0,10}hydrat/i,                    form: "hydratant visage" },
  { match: /eau.{0,10}thermale|brume.{0,10}visage/i,                      form: "eau thermale" },
  { match: /rougeur|couperose|sensib.{0,10}visage/i,                      form: "hydratant visage" },

  // ── CORPS ────────────────────────────────────────────────────────────────
  { match: /hydrat.{0,10}corps|corps.{0,10}hydrat|lait.{0,10}corps|corps.{0,10}lait/i, form: "hydratant corps" },
  { match: /gomm.{0,10}corps|corps.{0,10}gomm|exfoli.{0,10}corps/i,      form: "gommage corps" },
  // "gommage" seul sans zone → corps par défaut (plus courant que visage/pieds)
  { match: /\bgommage\b/i,                                                  form: "gommage corps" },
  { match: /anti.?cellulite|cellulite/i,                                   form: "anti cellulite" },
  { match: /vergeture|vergetur/i,                                           form: "vergetures" },
  { match: /jambe.{0,10}lourde|lourdeur.{0,10}jambe|circulation/i,        form: "jambes" },
  { match: /huile.{0,10}corps|corps.{0,10}huile/i,                        form: "huile corps" },
  { match: /raffermis|tonici|fermet[eé]/i,                                 form: "anti cellulite" },

  // ── CHEVEUX ──────────────────────────────────────────────────────────────
  { match: /shampoing|shampooing|shampoo/i,                                form: "shampoing" },
  { match: /apr[eè]s.?shamp|conditionn|d[eé]m[eê]lant/i,                  form: "apres shampoing" },
  { match: /masque.{0,10}cheveux|cheveux.{0,10}masque/i,                  form: "masque cheveux" },
  { match: /huile.{0,10}cheveux|cheveux.{0,10}huile|huile.{0,10}capill/i, form: "huile cheveux" },
  { match: /coloration|teinture.{0,10}cheveux/i,                          form: "coloration" },
  { match: /laque|spray.{0,10}coiff|gel.{0,10}coiff|cire.{0,10}cheveux/i, form: "gel coiffant" },

  // ── HYGIÈNE ──────────────────────────────────────────────────────────────
  { match: /gel.{0,10}douche|douche/i,                                     form: "gel douche" },
  { match: /savon/i,                                                        form: "savon" },
  { match: /bain.{0,10}moussant|mousse.{0,10}bain|bombe.{0,10}bain/i,     form: "bain moussant" },
  { match: /intime/i,                                                       form: "intime" },
  { match: /d[eé]odorant|d[eé]o(?!.{0,5}pied)/i,                          form: "deodorant" },
  { match: /dentifrice|dents?\b/i,                                          form: "dentifrice" },
  { match: /bain.{0,10}bouche|rince.{0,10}bouche/i,                       form: "bain bouche" },

  // ── MAQUILLAGE ───────────────────────────────────────────────────────────
  { match: /fond.{0,10}teint|teint.{0,10}fond/i,                          form: "fond teint" },
  { match: /mascara/i,                                                      form: "mascara" },
  { match: /eyeliner|eye.?liner/i,                                         form: "eyeliner" },
  { match: /crayon.{0,10}yeux|yeux.{0,10}crayon|khol\b|kohl\b/i,          form: "crayon yeux" },
  { match: /fard.{0,10}paupi|ombre.{0,10}[oœ]eil|palette.{0,10}yeux/i,   form: "fard paupieres" },
  { match: /rouge.{0,10}l[eè]vre|lipstick/i,                              form: "rouge levres" },
  { match: /gloss/i,                                                        form: "gloss levres" },
  { match: /blush/i,                                                        form: "blush" },
  { match: /correcteur|concealer/i,                                         form: "correcteur" },
  { match: /primer|base.{0,10}teint/i,                                     form: "primer" },
  { match: /bb.?cr[eè]me|bb.?creme/i,                                      form: "bb" },
  { match: /poudre.{0,10}bronz|bronzant/i,                                 form: "poudre" },
  { match: /d[eé]maquillant|eau.{0,10}micellaire|micellaire/i,             form: "demaquillant" },

  // ── PARFUM ───────────────────────────────────────────────────────────────
  { match: /parfum.{0,10}femme|femme.{0,10}parfum/i,                      form: "parfum femme" },
  { match: /parfum.{0,10}homme|homme.{0,10}parfum/i,                      form: "parfum homme" },
  { match: /\bparfum\b|eau.{0,10}parfum|eau.{0,10}toilette/i,             form: "parfum" },

  // ── BÉBÉ ─────────────────────────────────────────────────────────────────
  { match: /b[eé]b[eé].{0,10}shampoo?ing|shampoo?ing.{0,10}b[eé]b[eé]/i,  form: "bebe shampoing" },
  { match: /b[eé]b[eé]|nourrisson/i,                                        form: "bebe" },

  // ── HOMME ────────────────────────────────────────────────────────────────
  { match: /rasage|after.?shave|apr[eè]s.{0,5}rasage/i,                   form: "rasage" },
];

/**
 * Normalise un champ `form` généré par le LLM.
 * Retourne la valeur normalisée ou null si la zone/type sont indéterminables.
 */
export function normalizeAdvisorForm(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const input = raw.toLowerCase().trim();

  // 1. Essai des règles dans l'ordre
  for (const rule of RULES) {
    if (rule.match.test(input)) {
      return rule.form;
    }
  }

  // 2. Fallback : suppression des stopwords et retour du résidu
  const tokens = input
    .split(/[\s\-_]+/)
    .map((t) => t.replace(/[^a-z0-9àâäéèêëîïôöùûüÿœæç]/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));

  return tokens.length > 0 ? tokens.join(" ") : null;
}

/**
 * Post-traite un bloc RECO JSON brut (entre <<<RECO>>> et <<<END>>>).
 * Normalise le champ "form" et retourne le JSON re-sérialisé.
 * Si le parsing échoue, retourne le raw inchangé.
 */
export function normalizeRecoBlock(raw: string): string {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj.form === "string" || obj.form == null) {
      const normalized = normalizeAdvisorForm(obj.form as string | null);
      obj.form = normalized;
    }
    return JSON.stringify(obj);
  } catch {
    return raw;
  }
}
