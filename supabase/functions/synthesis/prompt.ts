/**
 * Construction du prompt de synthèse PERSONNALISÉE (pur, SANS dépendance Deno).
 *
 * Extrait de `lib.ts` pour être testable en Jest (env node), au même titre que
 * `advisor-chat/routineNormalize.ts`. Voir `lib/__tests__/synthesisPrompt.test.ts`.
 *
 * RÈGLE DE CONCENTRATION (ajout juillet 2026) : l'ordre INCI reflète la dose
 * décroissante (au moins jusqu'aux ingrédients à ~1%). Avant, la liste des verts
 * fournie au LLM ne portait AUCUN signal de position → le modèle mettait en avant
 * l'ingrédient le plus CÉLÈBRE (ex. huile de coco, dont la fonction en base est
 * "Conditionneur capillaire") au lieu du plus DOSÉ, alors que des huiles placées
 * plus haut (tournesol, avocat) étaient ignorées. On passe désormais le rang #N
 * de chaque vert ET on impose de privilégier / regrouper les actifs bénéfiques
 * les plus concentrés.
 */
import { NO_LONG_DASHES_RULE } from "../_shared/sanitize.ts";

export type ColorRating = "Vert" | "Jaune" | "Orange" | "Rouge";

export type SynthesisInput = {
  enriched: {
    input_raw: string;
    name: string | null;
    color_rating: ColorRating | null;
    primary_function: string | null;
    tags: string[] | null;
    position_idx: number;
    threshold_label?: string | null;
    restriction_reason?: string | null;
  }[];
  counts: Record<string, number>;
  score: number;
  scoreLabel: string;
  observations: { label: string; status: "present" | "absent" | "info" | "warn"; count: number }[];
  productLabel: string | null;
  userId?: string | null;
  profileBlock?: string | null;
  restrictionsBlock?: string | null;
};

export const SYNTH_PROMPT_VERSION = 14;

export function buildPrompt(input: SynthesisInput): { system: string; user: string } {
  const red = input.enriched.filter((r) => r.color_rating === "Rouge");
  const orange = input.enriched.filter((r) => r.color_rating === "Orange");
  const yellow = input.enriched.filter((r) => r.color_rating === "Jaune");
  const green = input.enriched.filter((r) => r.color_rating === "Vert");
  const total =
    (input.counts.Vert ?? 0) + (input.counts.Jaune ?? 0) +
    (input.counts.Orange ?? 0) + (input.counts.Rouge ?? 0);

  const top3 = input.enriched
    .slice()
    .sort((a, b) => a.position_idx - b.position_idx)
    .slice(0, 3)
    .map((r) => `${r.name ?? r.input_raw}${r.primary_function ? ` (${r.primary_function})` : ""}`);

  // Verts triés par ordre INCI (position croissante = dose décroissante). On
  // annote chaque ligne du rang #N pour que le LLM privilégie / regroupe les
  // plus concentrés au lieu d'isoler un ingrédient mineur mais connu.
  const greenWithFunction = green
    .filter((r) => r.primary_function && r.name)
    .slice()
    .sort((a, b) => a.position_idx - b.position_idx)
    .slice(0, 8)
    .map((r) => `- ${r.name} (#${r.position_idx + 1} dans la liste INCI) : ${r.primary_function}`);

  const fmt = (r: SynthesisInput["enriched"][number]) =>
    `- ${r.name ?? r.input_raw} : ${r.primary_function ?? "fonction inconnue"}`
    + `${r.tags && r.tags.length ? ` [tags: ${r.tags.slice(0, 3).join(", ")}]` : ""}`
    + `${r.threshold_label ? ` [position: ${r.threshold_label}]` : ""}`
    + `${r.restriction_reason ? ` [restriction: ${r.restriction_reason}]` : ""}`;

  const restrictedIngredients = input.enriched.filter((r) => r.restriction_reason);
  const hasProfile = Boolean(input.profileBlock);
  const hasRestrictions = Boolean(input.restrictionsBlock);
  const hasMatches = restrictedIngredients.length > 0;

  // Règle partagée (system + user) : ne jamais braquer le projecteur sur un
  // ingrédient célèbre mais peu dosé.
  const CONCENTRATION_RULE =
    "RÈGLE DE CONCENTRATION (INCI) : la liste est classée par dose décroissante ; "
    + "le #N à côté de chaque vert est sa position (plus N est petit, plus l'ingrédient est concentré). "
    + "Quand plusieurs verts partagent un bénéfice similaire (plusieurs huiles ou beurres végétaux nourrissants, plusieurs actifs hydratants...), "
    + "PRIVILÉGIE ceux au plus petit #N, ou REGROUPE-les en UNE puce qui cite les 2 à 3 premiers en gras "
    + "(ex : \"Riche en huiles végétales nourrissantes : **NOM1**, **NOM2**, **NOM3**\"). "
    + "N'isole JAMAIS un ingrédient bénéfique placé bas dans la liste (donc peu dosé) en passant sous silence "
    + "des ingrédients au bénéfice équivalent placés plus haut. Un ingrédient très connu mais peu dosé "
    + "ne doit pas voler la vedette aux ingrédients dominants de la formule.";

  const baseSystem =
    "Tu écris la synthèse d'une analyse cosmétique INCI pour un consommateur français.\n\n"
    + "TON & STYLE : comme un pote bien informé qui te parle franchement, sans tourner autour du pot. Phrases courtes, vocabulaire simple mais jamais enfantin. Tu peux dire \"franchement\", \"honnêtement\", \"au final\", \"bonne nouvelle\", \"là, attention\", \"tu peux respirer\", \"ya pas de mystère\". Tu utilises \"tu\" et la 2e personne. Pas d'emoji, pas de marketing (\"idéal\", \"généreux\", \"rassurant\", \"agréable\"), pas de description sensorielle (texture, odeur, fini), pas de conseil médical.\n\n"
    + "MISE EN FORME : **gras** UNIQUEMENT pour les noms INCI. Pas de titre, pas de préambule, pas de signature.\n\n"
    + CONCENTRATION_RULE + "\n\n"
    + NO_LONG_DASHES_RULE + "\n\n"
    + "RESTRICTIONS : quand une ligne d'ingrédient porte [restriction: X], cet ingrédient est dans les restrictions de l'utilisateur (X est le libellé). DANS la puce concernée, mentionne-le clairement, par exemple en glissant \"(..., dans tes restrictions)\" juste après le nom + rôle. Pas de paragraphe dédié.\n\n"
    + "ROUGES ET ORANGES : pour chaque rouge, fais 1 puce avec un DANGER CONCRET BREF (1 phrase, exemples : \"peut provoquer des bronchospasmes chez l'asthmatique\", \"soupçonné de favoriser des kystes\", \"lié à des cas d'irritation sévère documentés\", \"libère du formaldéhyde, classé cancérigène\"). Pour les oranges :\n"
    + "- 1 à 2 oranges isolés → 1 puce par ingrédient avec un effet concret bref.\n"
    + "- 3 oranges OU plusieurs oranges de la MÊME famille (même tag) → 1 SEULE puce groupée qui les cite tous en **gras** et donne le mécanisme/danger commun en une phrase. Exemple : \"- **Dimethicone**, **Cyclopentasiloxane**, **Cyclomethicone** (trois silicones) : ils donnent l'effet peau lisse à l'application, mais peuvent étouffer la peau et favoriser les points noirs sur la durée.\"\n\n"
    + "JAUNES : 1 à 3 jaunes notables = 1 puce courte chacun. Plus de 3 = regroupés en 1 puce \"À surveiller selon les peaux sensibles : NOM1, NOM2...\".";

  let system = baseSystem;
  if (input.profileBlock) {
    system += `\n\n${input.profileBlock}\n\nDEUX directions de personnalisation, comme un conseiller/pharmacien qui s'adresse à CETTE personne :\n(1) POSITIF (bon pour toi) : repère les ingrédients VERTS dont le rôle répond DIRECTEMENT à une préoccupation, un objectif ou au type de peau du profil, et mets-les en avant comme un bénéfice personnel ("bon pour ta peau sèche", "intéressant pour tes imperfections"). Applique la RÈGLE DE CONCENTRATION : entre deux verts au bénéfice comparable, cite en priorité le plus dosé (plus petit #N) ou regroupe-les. N'invente jamais un bénéfice : si un vert ne correspond à rien du profil, ne force pas le lien.\n(2) VIGILANCE : quand un orange/rouge touche le profil (peau sèche + alcool dénaturé, peau sensible/réactive + parfum ou allergène parfumant), souligne-le dans sa puce et relie l'alerte à la peau de l'utilisateur ("sur ta peau réactive, ..."). Adapte aussi le closing au profil.`;
  }
  if (input.restrictionsBlock) {
    system += `\n\n${input.restrictionsBlock}\n\nC'est la liste de référence pour les ingrédients à signaler comme restreints (voir aussi le flag [restriction: X] sur les lignes d'ingrédients).`;
  }

  const openingRule = (() => {
    if (hasMatches) {
      const first = restrictedIngredients[0];
      const firstName = first.name ?? first.input_raw;
      const firstReason = first.restriction_reason;
      return `Le produit contient au moins un ingrédient des restrictions de l'utilisateur (${firstName} → ${firstReason}). OUVERTURE OBLIGATOIRE : commence par "Pour toi" et signale CE point en premier. Exemple : "Pour toi : ce produit contient **${firstName}** que tu as choisi d'éviter." (adapte la formulation, mais cite l'ingrédient ET sa restriction).`;
    }
    if (hasRestrictions) {
      return `L'utilisateur a défini des restrictions mais AUCUNE ne match dans cette formule. OUVERTURE OBLIGATOIRE : rassure d'entrée. Exemple : "Bonne nouvelle d'entrée : aucune de tes restrictions ici." (varie la formulation).`;
    }
    if (hasProfile) {
      return `L'utilisateur a un profil rempli mais pas de restrictions. OUVERTURE OBLIGATOIRE : pose le contexte personnel en 1 phrase d'accroche reliée à son profil. Exemple : "Pour ta peau sèche et sensible, voici ce qu'il faut savoir." (adapte au profil exact, ne sois pas générique).`;
    }
    return `L'utilisateur n'a renseigné ni profil ni restrictions. OUVERTURE OBLIGATOIRE : un hook factuel et concret sur le type de produit ou son caractère, basé sur les 3 premiers ingrédients. Exemple : "Un déo en spray bien classique." OU "Une formule légère dominée par l'eau et la glycérine." (pas générique, pas marketing).`;
  })();

  const restrictionCount = restrictedIngredients.length;
  const isLowScore = input.score < 13;

  const closingRule = (() => {
    if (hasMatches) {
      if (restrictionCount >= 2 || isLowScore) {
        return `CLOSING (DERNIÈRE PUCE, obligatoire) : conseil actionnable et constructif basé sur les restrictions matchées. Oriente vers ce qu'il faut chercher pour remplacer ce produit : quelle famille d'ingrédients éviter dans la recherche, quel label regarder sur l'emballage (ex : "sans parfum de synthèse", "hypoallergénique", "sans conservateurs"), ou quel type de formule privilégier pour ce profil. Appuie-toi sur les ingrédients matchés pour rendre le conseil concret et personnalisé. INTERDIT : ne jamais dire "ya mieux ailleurs", "évite ce produit", "va voir ailleurs" ni aucune formulation orientant vers une alternative externe. Commence par "- Pour toi" ou "- Au final".`;
      }
      return `CLOSING (DERNIÈRE PUCE, obligatoire) : nuance l'usage de manière constructive. Si la restriction matchée est mineure ou si le score est correct, indique dans quelles conditions ce produit peut convenir (ponctuellement, zone corporelle précise, fréquence réduite) ET ce qu'il faudrait vérifier sur la prochaine formule pour éviter ce point. Reste concret et utile, pas alarmiste. INTERDIT : ne jamais dire "ya mieux ailleurs", "évite ce produit" ni orienter vers une alternative externe. Commence par "- Pour toi" ou "- Au final".`;
    }
    if (hasRestrictions || hasProfile) {
      return `CLOSING (DERNIÈRE PUCE, obligatoire) : conseil pratique positif qui relie le verdict de la formule au profil. Donne une info utile sur l'usage ou un point à surveiller à l'avenir pour ce type de produit avec ce profil de peau/restrictions. Reste concret. INTERDIT : ne jamais dire "ya mieux ailleurs" ni orienter vers une alternative externe. Commence par "- Pour toi" ou "- Au final".`;
    }
    return `CLOSING (DERNIÈRE PUCE, obligatoire) : 1 phrase de prise de recul factuelle sur la formule SUIVIE d'un soft nudge à compléter le profil dans l'app, pour bénéficier d'une analyse encore plus personnalisée. Exemple : "- Au final, un anti-transpirant efficace mais chargé en parfum. Tu peux renseigner ton profil ou tes restrictions dans l'app pour savoir précisément si ce produit te convient." INTERDIT : ne jamais dire "ya mieux ailleurs".`;
  })();

  const user = `Rédige la synthèse de l'analyse INCI ci-dessous en suivant la STRUCTURE imposée.

CONTEXTE :
- Profil utilisateur : ${hasProfile ? "REMPLI (voir bloc dans le system prompt)" : "VIDE"}
- Restrictions utilisateur : ${hasRestrictions ? "DÉFINIES (voir bloc dans le system prompt)" : "AUCUNE"}
- Ingrédients de cette formule en restriction : ${hasMatches ? restrictedIngredients.map((r) => `${r.name ?? r.input_raw} (${r.restriction_reason})`).join(", ") : "AUCUN"}

STRUCTURE OBLIGATOIRE (deux blocs séparés par une ligne vide) :

BLOC 1 (prose, 2 à 3 phrases, pas de puce) :
- Phrase 1 (OUVERTURE) — règle :
  ${openingRule}
- Phrase 2 (CONSTAT CHIFFRÉ, naturel) : ${total === 0 ? "Aucun ingrédient n'a pu être reconnu dans la liste fournie. Dis-le simplement, sans utiliser de chiffres comme \"0 sur 0\" ou \"0 ingrédient\". Exemple : \"Aucun ingrédient de cette liste n'est dans notre base, difficile d'aller plus loin.\" ou \"La formule n'a pas pu être lue, les ingrédients sont peut-être mal orthographiés ou trop fragmentés.\" (adapte selon le contexte)." : `"Sur les ${total} ingrédients identifiés, ${input.counts.Vert ?? 0} sont sans risque connu et ${(input.counts.Jaune ?? 0) + (input.counts.Orange ?? 0) + (input.counts.Rouge ?? 0)} méritent un coup d'œil." (varie la formulation, garde les chiffres).`}
- Phrase 3 (TRANSITION, courte) : "Voici ce qu'il faut retenir pour toi :" ou similaire (neutre : le détail commence par ce qui est BON, puis les points de vigilance).
- ANTI-DOUBLON : ne cite jamais deux fois le même ingrédient dans le bloc 1. Si tu utilises la traduction française ("l'eau", "le beurre de karité"), n'ajoute pas le nom INCI entre parenthèses. Choisis UNE formulation par ingrédient.

BLOC 2 (puces, chaque ligne commence par "- ", 4 à 7 puces max) :

1. BON POUR TOI (1 à 2 puces, EN PREMIER) :
${hasProfile
    ? "- Repère les ingrédients VERTS dont le rôle répond DIRECTEMENT à une préoccupation, un objectif ou au type de peau du profil, et présente-les comme un point positif PERSONNALISÉ. Format : \"- **NOM** (rôle simple) : ce qu'il fait, ce qui est bon pour <préoccupation/type de peau cité du profil>.\" Maximum 2 puces, les plus pertinentes. N'invente AUCUN bénéfice : si un vert ne correspond à rien du profil, ne le force pas. Si vraiment aucun vert ne matche le profil, fais 1 puce \"Bon à savoir\" sur un vert notable (Niacinamide, Acide hyaluronique, Panthénol, Centella Asiatica)."
    : "- 1 puce \"Bon à savoir\" sur UN vert notable (Niacinamide, Acide hyaluronique, Panthénol, Centella Asiatica) avec son bénéfice simple. Ignore eau / glycérine / propanediol / sodium hydroxide / pH ajusteurs."}
- ${CONCENTRATION_RULE}
- INTERDIT : ne jamais énumérer ce qui est absent (style "Sans parabens, sans sulfates..."). C'est déjà affiché dans le panneau Observations.

2. ROUGES : 1 puce par ingrédient rouge, avec un DANGER CONCRET BREF. Format :
"- **NOM** (famille + rôle simple${hasMatches ? ", et si flag [restriction], ajouter \", dans tes restrictions\"" : ""}) : danger concret en 1 phrase. Position en fin de phrase si dispo."${hasProfile ? " Si l'alerte touche le profil (peau sensible/réactive, sèche...), relie-la : \"sur ta peau sensible, ...\"." : ""}

3. ORANGES : applique la règle de groupage du system prompt :
- 1 à 2 oranges isolés (familles différentes) → 1 puce par ingrédient avec effet concret bref.
- 3 oranges OU plusieurs de la même famille (même tag dans [tags: ...]) → 1 puce groupée.${hasProfile ? " Relie au profil quand pertinent." : ""}

4. JAUNES :
- 1 à 3 jaunes notables → 1 puce courte chacun.
- Plus de 3 → 1 puce groupée "À surveiller selon les peaux sensibles : **NOM1**, **NOM2**, **NOM3**...".

5. CLOSING (DERNIÈRE PUCE, obligatoire), règle :
   ${closingRule}

CONTRAINTES STRICTES :
- Total puces (bloc 2) : 4 à 7 max, closing comprise.
- Chaque puce : 1 à 2 phrases courtes. Pas de pavé.
- Pas de jargon médical (dermatite, eczéma, comédogène, sébo-régulateur). Préfère "peut irriter", "peut boucher les pores".
- INTERDIT absolu : les verbes "soigne", "traite", "guérit", "cicatrise", "régénère", "répare", "restaure" — réservés aux médicaments (Règlement CE 1223/2009). Utilise à la place : "entretient la peau", "maintient en bon état", "hydrate", "adoucit", "protège", "reconstitue".
- Pas d'emoji, pas d'astérisque autre que les **gras INCI**.
- AUCUN tiret cadratin (—) ni demi-cadratin (–). Utilise virgule, deux-points ou nouvelle phrase.
- VARIE l'attaque du bloc 1 d'une analyse à l'autre.
- Si tu cites le danger concret d'un rouge/orange, reste sobre et factuel : pas de catastrophisme, pas d'invention. Si tu n'as aucune raison documentée, dis-le platement ("controversé sans consensus clair").

DONNÉES :
${input.productLabel ? `Produit : ${input.productLabel}` : "Produit : liste collée par l'utilisateur, pas de nom de produit fourni."}
Note : ${input.score.toFixed(1)}/20 (${input.scoreLabel})
Comptes : Vert=${input.counts.Vert ?? 0}, Jaune=${input.counts.Jaune ?? 0}, Orange=${input.counts.Orange ?? 0}, Rouge=${input.counts.Rouge ?? 0}, total reconnu=${total}.

3 premiers ingrédients (utilisés pour caractériser la formule si tu rédiges un hook produit) :
${top3.length ? top3.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(non disponible)"}

ROUGES :
${red.length ? red.map(fmt).join("\n") : "(aucun)"}

ORANGE :
${orange.length ? orange.map(fmt).join("\n") : "(aucun)"}

JAUNES (jusqu'à 8 cités) :
${yellow.length ? yellow.slice(0, 8).map(fmt).join("\n") + (yellow.length > 8 ? `\n- et ${yellow.length - 8} autres` : "") : "(aucun)"}

VERTS de la formule, triés par ordre INCI (#N = position ; plus le numéro est petit, plus l'ingrédient est concentré). Sers-toi de cette liste pour la puce "Bon pour toi" : quand plusieurs verts ont un bénéfice similaire, privilégie les plus petits #N ou regroupe-les, ne mets pas en avant un ingrédient à gros #N (peu dosé) au détriment des dominants :
${greenWithFunction.length ? greenWithFunction.join("\n") : "(aucun avec fonction connue)"}

Écris maintenant la synthèse en suivant la structure (Bloc 1 prose, ligne vide, Bloc 2 puces). Pas de titre, pas de préambule, pas de signature.`;

  return { system, user };
}
