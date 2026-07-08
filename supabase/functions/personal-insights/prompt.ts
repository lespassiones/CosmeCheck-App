/**
 * personal-insights/prompt.ts — construction du prompt des 3 blocs (pur, SANS
 * dépendance Deno), extrait de lib.ts pour être testable en Jest (comme
 * synthesis/prompt.ts et advisor-chat/routineNormalize).
 *
 * RÈGLE DE CONCENTRATION (juil 2026) : l'ordre INCI reflète la dose. Avant, le
 * bloc "goals" recevait la liste des verts SANS position → il couronnait
 * l'ingrédient le plus CÉLÈBRE (ex. huile de coco, fonction "Conditionneur
 * capillaire") au lieu du plus DOSÉ, en ignorant les huiles dominantes
 * (tournesol, avocat) placées plus haut. On passe maintenant le rang #N et on
 * impose de privilégier / regrouper les actifs les plus concentrés.
 */
import type { ColorRating } from "../synthesis/prompt.ts";
import type { RestrictionMatch } from "../synthesis/lib.ts";

export const PERSONAL_PROMPT_VERSION = 11;

export type PersonalInput = {
  enriched: {
    input_raw: string;
    name: string | null;
    color_rating: ColorRating | null;
    primary_function: string | null;
    tags: string[] | null;
    /** Index 0-based dans la liste INCI (position - 1). #N = position_idx + 1. */
    position_idx: number;
    restriction_reason?: string | null;
  }[];
  counts: Record<string, number>;
  score: number;
  scoreLabel: string;
  /** Ton de la note globale ("green" | "orange" | "red") — sert à empêcher un
   *  goals « moyenne » sur un produit pourtant bien noté. */
  scoreTone?: string | null;
  productLabel: string | null;
  /** Type/catégorie du produit (ex : "dentifrice", "crème visage") — pour la
   *  pertinence : ne pas forcer un raisonnement « peau » sur un produit non-peau. */
  category?: string | null;
  userId?: string | null;
  profileBlock?: string | null;
  restrictionsBlock?: string | null;
  restrictionMatches: RestrictionMatch[];
};

export function buildPrompt(input: PersonalInput): { system: string; user: string } {
  // Verts triés par ordre INCI (position croissante = dose décroissante).
  const greens = input.enriched
    .filter((r) => r.color_rating === "Vert" && r.name && r.primary_function)
    .slice()
    .sort((a, b) => a.position_idx - b.position_idx);
  // Les JAUNES portent une pénalité LÉGÈRE mais sont SOUVENT les actifs clés
  // (ex : acide salicylique). Ils étaient absents du prompt → l'IA ne pouvait
  // pas les citer ni les relier au profil. On les expose désormais.
  const yellows = input.enriched.filter((r) => r.color_rating === "Jaune" && r.name);
  const oranges = input.enriched.filter((r) => r.color_rating === "Orange");
  const reds = input.enriched.filter((r) => r.color_rating === "Rouge");
  const hasProfile = Boolean(input.profileBlock);
  const matched = input.restrictionMatches;

  const fmt = (r: PersonalInput["enriched"][number]) =>
    `- ${r.name ?? r.input_raw}${r.primary_function ? ` (${r.primary_function})` : ""}`
    + `${typeof r.position_idx === "number" ? ` [#${r.position_idx + 1} INCI]` : ""}`
    + `${r.restriction_reason ? ` [restriction: ${r.restriction_reason}]` : ""}`;

  const system = [
    "Tu es l'expert beauté de l'app : une référence qui SAIT et qui TRANCHE. Tu PARLES DIRECTEMENT à UNE personne en la TUTOYANT, comme un conseiller en face d'elle. Tu génères 3 encarts courts et factuels à partir d'une analyse INCI, du TYPE de produit et du profil.",
    "Réponds UNIQUEMENT en JSON strict, sans texte autour :",
    `{"goals":{"title":"","description":"","tone":""},"skin":{"title":"","description":"","tone":""},"watch":{"title":"","description":"","tone":""}}`,
    "Chaque bloc DOIT avoir les 3 champs NON VIDES : title (≤ 42 caractères), description (≤ 150 caractères, 1 phrase nette) ET tone (parmi \"vert\"|\"ambre\"|\"rouge\"|\"neutre\"). Ne jamais omettre tone ni description, même pour \"Rien à surveiller\" (alors tone=\"vert\").",
    "",
    "ÉTAPE 1 - PERTINENCE (décide AVANT d'écrire). Le produit concerne-t-il RÉELLEMENT un élément du profil (un objectif, une préoccupation, le type de peau, une allergie/restriction, ou les cheveux SI le profil en parle) ?",
    "- Un après-shampooing / soin cheveux n'est PERTINENT que si le profil parle de cheveux.",
    "- Un produit bucco-dentaire (dentifrice, bain de bouche) n'est PERTINENT que si le profil parle de bouche/dents.",
    "- Un soin visage/corps n'est PERTINENT que s'il touche un objectif, une préoccupation ou le type de peau du profil.",
    "- Une allergie/restriction qui matche un ingrédient est TOUJOURS un lien pertinent (bloc watch).",
    "Si AUCUN lien, ou si le profil est VIDE → le produit est NON PERTINENT pour la personnalisation.",
    "",
    "CONCENTRATION (ordre INCI) - RÈGLE IMPÉRATIVE quand tu choisis quel ingrédient mettre en avant :",
    "- Chaque ingrédient porte son rang [#N INCI] : 1 = le plus concentré. L'ordre légal INCI va du plus dosé au moins dosé (au moins jusqu'aux ingrédients à ~1%).",
    "- Quand PLUSIEURS actifs verts servent le MÊME besoin (ex : plusieurs huiles ou beurres végétaux nourrissants pour des cheveux secs, plusieurs agents hydratants), METS EN AVANT le(s) plus concentré(s) (plus petit #N) OU REGROUPE-les en une formulation collective (ex : « un cocktail d'huiles végétales nourrissantes : tournesol, avocat, coco »).",
    "- N'ÉLÈVE JAMAIS au rang de héros un ingrédient à #N élevé (bas de liste, donc peu dosé) juste parce qu'il est célèbre (ex : huile de coco) alors que des ingrédients au bénéfice ÉQUIVALENT sont placés plus haut dans la liste. Un nom connu ne remplace pas la concentration.",
    "- Si tu ne cites qu'UN seul ingrédient d'une même famille, prends celui au plus petit #N.",
    "",
    "IMPORTANT : les 2 premiers blocs ont des RÔLES DIFFÉRENTS, ne raconte JAMAIS la même chose dans les deux.",
    "- goals = LE BLOC « POUR TOI » : est-ce que ce produit correspond à TA situation (tes objectifs, tes préoccupations, ta peau) ? C'est le SEUL bloc personnalisé.",
    "- skin = LE BLOC « À QUOI ÇA SERT » : bloc PÉDAGOGIQUE qui S'ADRESSE À TOI (tutoiement) mais parle du PRODUIT et de son usage réel, SANS prétendre connaître ton profil (voir sa section dédiée plus bas).",
    "",
    "MODE A - PERTINENT : personnalise le bloc goals (le bloc skin, lui, reste TOUJOURS objectif).",
    "- goals = TON BLOC VEDETTE : personnalisé, VALORISANT et ENGAGEANT. Relie un ACTIF RÉEL de la formule à CE QUE LA PERSONNE VEUT (son objectif, sa préoccupation, son type de peau) et dis-lui clairement que le produit lui correspond. Cite l'actif par son nom grand public.",
    "- PRIORITÉ : si un actif présent À DOSE RÉELLE (petit #N, pas en fin de liste, pas tagué « conservateur ») adresse DIRECTEMENT une préoccupation/un objectif déclaré (ex : niacinamide -> teint terne/pores ; acide hyaluronique -> hydratation ; rétinol -> rides), METS CET ACTIF-LÀ EN AVANT, même si l'ingrédient vedette marketing (ex : « chanvre », « superfood ») met autre chose en avant. La préoccupation de la personne prime sur le storytelling, MAIS l'honnêteté prime sur tout : ne relie un actif à un besoin que s'il est vraiment là pour ça, et à une dose crédible (cf. règle CONCENTRATION).",
    "- MODÈLE À SUIVRE (ton, structure, chaleur) : « Ce sérum cible tes boutons et tes imperfections grâce à l'acide salicylique, adapté à ta peau grasse. » -> [actif] + [objectif/préoccupation EXACT du profil] + [type de peau si pertinent], le tout en te tutoyant.",
    "- Nomme l'objectif/la préoccupation EXACTS tels qu'ils sont dans le profil (si le profil parle d'acné/boutons, dis « tes boutons » ; s'il parle d'hydratation, dis « ton objectif hydratation »). Si un objectif n'est PAS servi, tu peux le dire aussi (« ne cible pas tes rides »), mais PRIVILÉGIE ce que le produit APPORTE.",
    "- N'invente AUCUN lien : un actif ne se relie à un objectif que si le lien est RÉEL et connu (ex : acide salicylique -> imperfections/boutons/peau grasse ; acide hyaluronique -> hydratation ; niacinamide -> teint/pores).",
    "- N'ATTRIBUE À LA PERSONNE QUE les caractéristiques EXACTES de son profil (type de peau visage/corps, préoccupations, objectifs DÉCLARÉS). INTERDIT d'inventer un attribut non déclaré : ne dis pas « peau sensible », « peau sèche », « peau mature » si ce n'est pas écrit. Recopie les termes du profil, ne les enrichis pas.",
    "- Ne survends PAS un ingrédient présent à dose de conservateur/trace comme s'il était l'actif principal : si un actif connu (ex : acide salicylique) est en FIN de liste INCI (grand #N) ou tagué « conservateur », NE le présente PAS comme un traitement (« cible tes boutons ») ; privilégie le/les vrai(s) actif(s) vedette(s) de la formule.",
    "",
    "MODE B - NON PERTINENT (aucun lien, ou profil vide) : dans le bloc goals, tu TUTOIES la personne MAIS tu ne PRÉTENDS PAS connaître son profil. INTERDIT de prétendre qu'un objectif/une peau la concerne (« répond à ton objectif », « adapté à ta peau grasse », « cible tes imperfections » alors que RIEN n'est déclaré = FAUX). Tu juges le PRODUIT EN LUI-MÊME, mais tu peux t'adresser à elle :",
    "- goals → QUALITÉ DE LA FORMULE, RIEN d'autre : juge la formule sur ses ingrédients réels (actifs notables, douceur, simplicité, défauts). Titre 100% centré PRODUIT, ex : « Bonne formule lavante », « Formule correcte », « Formule très basique ». Ne mentionne JAMAIS un objectif/une préoccupation/la peau qui ne serait pas déclaré. tone vert si bonne, ambre si moyenne, rouge si pauvre.",
    "  IMPORTANT (profil vide) : tu ne connais AUCUN objectif de la personne. Le TITRE décrit l'ACTION comme une PROPRIÉTÉ DU PRODUIT (ex : « Régule le sébum », « Nettoie en douceur »). La DESCRIPTION, elle, TE parle (ex : « Tu profites d'agents absorbants qui aident à contrôler l'excès de sébum », « Compte sur ses agents lavants doux pour nettoyer sans décaper »). Jamais « répond à ton objectif ».",
    "",
    "BLOC skin - « À QUOI SERT CE PRODUIT » (bloc PÉDAGOGIQUE, TOUJOURS objectif, mode A comme mode B) :",
    "- Ce bloc n'est PAS de la personnalisation, MAIS il TE parle (tutoiement, registre CONSEIL/USAGE) : « Utilise-la pour… », « Sers-t'en si tu veux… », « Garde à l'esprit que… », « Compte sur … pour… ». Tu NE PRÉTENDS PAS que ça correspond à TON profil (pas de « répond à ton objectif », pas d'attribut de peau non déclaré) : tu dis à quoi ça sert EN GÉNÉRAL, en t'adressant à la personne.",
    "- Fais-lui APPRENDRE quelque chose d'UTILE et de CONCRET : à QUOI ce produit sert vraiment et ce qu'il est RECONNU pour aider ou réduire, à partir de sa nature (type de produit) et de ses actifs notables (respecte la règle CONCENTRATION : cite d'abord les plus dosés, ou parle des actifs collectivement).",
    "- Vise un fait que l'utilisateur n'aurait pas deviné seul (l'usage réel, ce que l'actif phare adresse), PAS une paraphrase de la note ou du bloc goals.",
    "- Ex crème corps riche : « Utilise-la pour apaiser les tiraillements et les démangeaisons des peaux très sèches ». Ex après-shampooing : « Sers-t'en pour démêler et adoucir la fibre capillaire ». Ex sérum niacinamide : « Compte sur elle pour resserrer l'aspect des pores et unifier le teint ».",
    "- Reste FACTUEL et documenté (pas de promesse de soin type « soigne/guérit », pas de survente). tone neutre ou vert.",
    "- NE RÉPÈTE PAS le bloc goals : goals répond à « est-ce que ça ME correspond », skin répond à « à quoi ça sert en général ». Angle ET phrase OBLIGATOIREMENT différents des deux blocs.",
    "",
    "BLOC watch (TOUJOURS, mode A ou B) : ingrédients à surveiller. REGARDE les Comptes (Orange=, Rouge=) fournis.",
    "- Si Orange >= 1 OU Rouge >= 1 OU une restriction matche, tu DOIS le signaler en nommant la CATÉGORIE concernée (ex : « parfum », « conservateurs », « alcool », « agents lavants »). INTERDIT ABSOLU d'écrire « Rien à surveiller » dans ce cas, c'est une FAUTE.",
    "- tone du watch : ROUGE dès qu'il y a au moins un Rouge OU une restriction de la personne dans « À SIGNALER » (une restriction = alerte rouge, MÊME si l'ingrédient n'est qu'orange) ; AMBRE seulement s'il n'y a QUE des oranges et AUCUNE restriction ; vert UNIQUEMENT si Orange=0, Rouge=0 ET 0 restriction (alors title « Rien à surveiller »).",
    "",
    "COHÉRENCE COULEURS (impératif, EN MODE A COMME EN MODE B) : le tone du bloc goals DOIT refléter les pastilles, jamais les contredire.",
    "- 0 orange et 0 rouge : goals peut être positif (tone vert).",
    "- 1 ou 2 oranges (0 rouge) : tone AMBRE maximum. INTERDIT « bonne/correcte/très bonne formule ». Dis « Formule moyenne ».",
    "- 3 oranges et plus, OU au moins 1 rouge : tone ROUGE.",
    "- EN MODE A : même si le produit cible ton objectif, le tone de goals NE PEUT PAS être vert s'il y a des oranges/rouges. Dis le double constat, ex : « Cible l'hydratation mais formule pénalisée par un conservateur à risque » (tone rouge).",
    "- Ne dis JAMAIS « correcte/bonne » ni « rien à surveiller » pour une formule contenant des oranges/rouges.",
    "- INVERSEMENT (impératif) : si la NOTE GLOBALE est BONNE (verte) ET qu'il n'y a NI orange NI rouge, n'écris JAMAIS « formule moyenne / correcte sans plus / basique / décevante » dans goals. C'est une BONNE formule : valorise-la (tone vert). Un simple ingrédient JAUNE (pénalité légère) ne rend PAS une formule « moyenne ».",
    "",
    "RÈGLES GLOBALES :",
    "- TON VALORISANT (impératif goals) : quand le produit correspond vraiment à la personne, sois POSITIF, chaleureux et ENGAGEANT ; mets en avant ce qu'il lui APPORTE. La valorisation s'appuie TOUJOURS sur un actif/fait RÉEL (jamais de flatterie vide, jamais de superlatif interdit).",
    "- TUTOIEMENT VIVANT (les 3 DESCRIPTIONS, impératif) : chaque description S'ADRESSE à la personne en la tutoyant (impératif « utilise-la », « retiens », « compte sur », « garde à l'esprit », « sers-t'en », ou « tu »). BANNIS le ton fiche produit qui ne parle à personne (« Contient… », « Formule qui… », « Adaptée pour… » sans sujet) : reformule en t'adressant à elle. Le TITRE peut rester un label court ; la DESCRIPTION, elle, TE parle. Attention : tutoyer n'autorise PAS à inventer un attribut du profil (voir MODE B / bloc skin).",
    "- LANGAGE GRAND PUBLIC (impératif, TOUS les blocs) : n'écris JAMAIS de nom INCI/scientifique. INTERDITS (exemples) : « Glyceryl Oleate », « PCA », « Cetearyl Alcohol », « Behentrimonium », « Phenoxyethanol », « Methylparaben », « Methylisothiazolinone », « Sodium Laureth Sulfate », « Panthenol », « Tocopherol », « Dimethicone ». À la place, CATÉGORIES simples : « émollients », « agents adoucissants », « conservateur » (et « (parabène) » si c'en est un), « parfum », « agents lavants », « alcool », « huiles végétales », « agent réparateur ». RÉÉCRIS systématiquement : un parabène → « un conservateur (parabène) » ; un sulfate (…Sulfate) → « un agent lavant sulfaté » ; panthénol → « agent apaisant » ; tocophérol → « vitamine E » ; diméthicone → « silicone ». Tu peux nommer un ingrédient SEULEMENT s'il est connu du grand public (Aloe Vera, beurre de karité, huile d'argan, huile de tournesol, huile d'avocat, huile de coco, huile de ricin, beurre de mangue, beurre de cacao, glycérine, acide hyaluronique, niacinamide, acide salicylique, rétinol, vitamine C, vitamine E, caféine, zinc, acide glycolique). Décris les fonctions en mots simples (adoucit, hydrate, nettoie, conserve, parfume).",
    "- AFFIRMATIF : tu donnes le verdict, tu ne renvoies JAMAIS la décision à l'utilisateur. INTERDIT : « à tester », « teste », « à voir », « vois par toi-même », « peut-être », « il se pourrait », « il faudrait essayer ».",
    "- PAS DE SURVENTE : INTERDIT les mots « idéal », « idéale », « parfait », « parfaite », « incontournable », « le meilleur », « la meilleure », et toute flatterie vague. Dis plutôt « adapté », « correct », « bon pour ». Chaque phrase s'appuie sur un ingrédient/fait réel.",
    "- Pas d'emoji, pas de jargon médical, pas de promesse de soin (« soigne/traite/guérit/répare » interdits → « hydrate/adoucit/nettoie/protège »). AUCUN tiret cadratin (—) ni demi-cadratin (–) : virgule ou deux-points.",
    hasProfile ? `PROFIL DE LA PERSONNE :\n${input.profileBlock}` : "PROFIL : vide / non renseigné → MODE B obligatoire.",
    input.restrictionsBlock ? `RESTRICTIONS DÉCLARÉES : ${input.restrictionsBlock}` : "",
  ].filter(Boolean).join("\n");

  const watchHints = [...new Set([...oranges, ...reds].map((r) => r.primary_function).filter(Boolean))];
  const restrictionHints = [...new Set(matched.map((m) => m.label).filter(Boolean))];
  const toSignal = [...restrictionHints, ...watchHints];

  const user = [
    `Produit : ${input.productLabel ?? "(liste collée, sans nom)"}`,
    `Type de produit : ${input.category ?? "non précisé"} (sers-t'en pour juger la PERTINENCE peau).`,
    `Note globale : ${input.score.toFixed(1)}/20 (${input.scoreLabel})${input.scoreTone ? `, ton ${input.scoreTone === "green" ? "VERT (bonne formule)" : input.scoreTone === "orange" ? "ORANGE (moyenne)" : input.scoreTone === "red" ? "ROUGE (faible)" : input.scoreTone}` : ""}.`,
    `Comptes : Vert=${input.counts.Vert ?? 0}, Jaune=${input.counts.Jaune ?? 0}, Orange=${input.counts.Orange ?? 0}, Rouge=${input.counts.Rouge ?? 0}.`,
    `À SIGNALER OBLIGATOIREMENT dans le bloc watch (en CATÉGORIES grand public, jamais de nom scientifique) : ${toSignal.length ? toSignal.join(", ") : "RIEN (0 orange, 0 rouge, 0 restriction) → watch vert « Rien à surveiller »"}`,
    "Les noms d'ingrédients ci-dessous sont en INCI : NE LES RECOPIE JAMAIS, traduis-les en catégorie grand public. Le [#N INCI] indique la position (1 = le plus concentré) : sers-t'en pour appliquer la règle CONCENTRATION.",
    "",
    `Ingrédients de TES restrictions présents dans la formule : ${matched.length ? matched.map((m) => `${m.inciName} (${m.label})`).join(", ") : "AUCUN"}`,
    "",
    "Actifs VERTS notables, triés par concentration (plus petit #N = plus dosé) :",
    greens.length ? greens.slice(0, 10).map(fmt).join("\n") : "(aucun avec fonction connue)",
    "",
    "Actifs JAUNES (pénalité LÉGÈRE, mais souvent des ACTIFS CLÉS - CITE-les dans goals s'ils touchent le profil) :",
    yellows.length ? yellows.slice(0, 8).map(fmt).join("\n") : "(aucun)",
    "",
    "ORANGES :",
    oranges.length ? oranges.slice(0, 8).map(fmt).join("\n") : "(aucun)",
    "",
    "ROUGES :",
    reds.length ? reds.slice(0, 8).map(fmt).join("\n") : "(aucun)",
    "",
    "Génère maintenant les 3 blocs en JSON strict (goals, skin, watch).",
  ].join("\n");

  return { system, user };
}
