/**
 * personal-insights/lib.ts — génère 3 encarts PERSONNALISÉS (titre + description
 * + ton couleur) à partir d'une analyse INCI et du PROFIL complet de
 * l'utilisateur (objectifs, préoccupations, type de peau, allergies,
 * restrictions). Remplace l'ancienne « synthèse » par 3 blocs courts et
 * actionnables.
 *
 * Réutilise l'infra de la fonction `synthesis` (profil + restrictions +
 * checkRestrictions) et le client IA mutualisé (_shared/aiClient).
 *
 * Sortie : JSON STRICT { goals, skin, watch }, chaque bloc =
 *   { title: string, description: string, tone: "vert"|"ambre"|"rouge"|"neutre" }
 *
 * DÉGRADE GRACIEUSEMENT : sans clé IA → renvoie null (l'appelant gère).
 */
import {
  AI_MODEL,
  callWithFallback,
  getCached,
  hasMistral,
  hasOpenAI,
  mistralChat,
  MISTRAL_MODEL,
  openai,
  setCached,
  sha256Hex,
} from "../_shared/aiClient.ts";
import { stripLongDashes } from "../_shared/sanitize.ts";
import type { ColorRating, RestrictionMatch } from "../synthesis/lib.ts";

export type Tone = "vert" | "ambre" | "rouge" | "neutre";
export type Block = { title: string; description: string; tone: Tone };
export type PersonalBlocks = { goals: Block; skin: Block; watch: Block };

export const PERSONAL_PROMPT_VERSION = 7;

export type PersonalInput = {
  enriched: {
    input_raw: string;
    name: string | null;
    color_rating: ColorRating | null;
    primary_function: string | null;
    tags: string[] | null;
    restriction_reason?: string | null;
  }[];
  counts: Record<string, number>;
  score: number;
  scoreLabel: string;
  productLabel: string | null;
  /** Type/catégorie du produit (ex : "dentifrice", "crème visage") — pour la
   *  pertinence : ne pas forcer un raisonnement « peau » sur un produit non-peau. */
  category?: string | null;
  userId?: string | null;
  profileBlock?: string | null;
  restrictionsBlock?: string | null;
  restrictionMatches: RestrictionMatch[];
};

/** Clé de cache : ingrédients + profil + restrictions + version de prompt. */
export async function makePersonalCacheKey(input: PersonalInput): Promise<string> {
  const list = input.enriched
    .map((r) => `${(r.name ?? r.input_raw).trim().toUpperCase()}:${r.color_rating ?? "?"}${r.restriction_reason ? ":R" : ""}`)
    .join("|");
  const profileKey = input.profileBlock ? `|prof=${(await sha256Hex(input.profileBlock)).slice(0, 12)}` : "";
  const resKey = input.restrictionsBlock ? `|res=${(await sha256Hex(input.restrictionsBlock)).slice(0, 12)}` : "";
  const hash = (await sha256Hex(`${list}${profileKey}${resKey}|v=${PERSONAL_PROMPT_VERSION}`)).slice(0, 32);
  return `personal-insights:${hash}`;
}

/** Clé profil (persistée sur la ligne) : régénère si le profil change. */
export async function profileSignature(profileBlock: string | null, restrictionsBlock: string | null): Promise<string> {
  const p = profileBlock ? await sha256Hex(profileBlock) : "noprofile";
  const r = restrictionsBlock ? await sha256Hex(restrictionsBlock) : "norestr";
  return `v${PERSONAL_PROMPT_VERSION}:${p.slice(0, 12)}:${r.slice(0, 12)}`;
}

function buildPrompt(input: PersonalInput): { system: string; user: string } {
  const greens = input.enriched.filter((r) => r.color_rating === "Vert" && r.name && r.primary_function);
  const oranges = input.enriched.filter((r) => r.color_rating === "Orange");
  const reds = input.enriched.filter((r) => r.color_rating === "Rouge");
  const hasProfile = Boolean(input.profileBlock);
  const matched = input.restrictionMatches;

  const fmt = (r: PersonalInput["enriched"][number]) =>
    `- ${r.name ?? r.input_raw}${r.primary_function ? ` (${r.primary_function})` : ""}${r.restriction_reason ? ` [restriction: ${r.restriction_reason}]` : ""}`;

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
    "IMPORTANT : les 2 premiers blocs ont des RÔLES DIFFÉRENTS, ne raconte JAMAIS la même chose dans les deux.",
    "- goals = LE BLOC « POUR TOI » : est-ce que ce produit correspond à TA situation (tes objectifs, tes préoccupations, ta peau) ? C'est le SEUL bloc personnalisé.",
    "- skin = LE BLOC « À QUOI ÇA SERT » : bloc PÉDAGOGIQUE qui S'ADRESSE À TOI (tutoiement) mais parle du PRODUIT et de son usage réel, SANS prétendre connaître ton profil (voir sa section dédiée plus bas).",
    "",
    "MODE A - PERTINENT : personnalise UNIQUEMENT le bloc goals sur les éléments réellement concernés (le bloc skin, lui, reste TOUJOURS objectif).",
    "- goals : répond-il à un objectif/une préoccupation du profil ? Cite l'actif ou le fait précis. AFFIRME (« Répond à ton objectif hydratation » / « Ne cible pas tes imperfections »).",
    "- N'invente AUCUN lien sur un objectif/une zone que le profil ne mentionne pas.",
    "",
    "MODE B - NON PERTINENT (aucun lien, ou profil vide) : dans le bloc goals, tu TUTOIES la personne MAIS tu ne PRÉTENDS PAS connaître son profil. INTERDIT de prétendre qu'un objectif/une peau la concerne (« répond à ton objectif », « adapté à ta peau grasse », « cible tes imperfections » alors que RIEN n'est déclaré = FAUX). Tu juges le PRODUIT EN LUI-MÊME, mais tu peux t'adresser à elle :",
    "- goals → QUALITÉ DE LA FORMULE, RIEN d'autre : juge la formule sur ses ingrédients réels (actifs notables, douceur, simplicité, défauts). Titre 100% centré PRODUIT, ex : « Bonne formule lavante », « Formule correcte », « Formule très basique ». Ne mentionne JAMAIS un objectif/une préoccupation/la peau qui ne serait pas déclaré. tone vert si bonne, ambre si moyenne, rouge si pauvre.",
    "  IMPORTANT (profil vide) : tu ne connais AUCUN objectif de la personne. Le TITRE décrit l'ACTION comme une PROPRIÉTÉ DU PRODUIT (ex : « Régule le sébum », « Nettoie en douceur »). La DESCRIPTION, elle, TE parle (ex : « Tu profites d'agents absorbants qui aident à contrôler l'excès de sébum », « Compte sur ses agents lavants doux pour nettoyer sans décaper »). Jamais « répond à ton objectif ».",
    "",
    "BLOC skin - « À QUOI SERT CE PRODUIT » (bloc PÉDAGOGIQUE, TOUJOURS objectif, mode A comme mode B) :",
    "- Ce bloc n'est PAS de la personnalisation, MAIS il TE parle (tutoiement, registre CONSEIL/USAGE) : « Utilise-la pour… », « Sers-t'en si tu veux… », « Garde à l'esprit que… », « Compte sur … pour… ». Tu NE PRÉTENDS PAS que ça correspond à TON profil (pas de « répond à ton objectif », pas d'attribut de peau non déclaré) : tu dis à quoi ça sert EN GÉNÉRAL, en t'adressant à la personne.",
    "- Fais-lui APPRENDRE quelque chose d'UTILE et de CONCRET : à QUOI ce produit sert vraiment et ce qu'il est RECONNU pour aider ou réduire, à partir de sa nature (type de produit) et de ses actifs notables.",
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
    "",
    "RÈGLES GLOBALES :",
    "- TUTOIEMENT VIVANT (les 3 DESCRIPTIONS, impératif) : chaque description S'ADRESSE à la personne en la tutoyant (impératif « utilise-la », « retiens », « compte sur », « garde à l'esprit », « sers-t'en », ou « tu »). BANNIS le ton fiche produit qui ne parle à personne (« Contient… », « Formule qui… », « Adaptée pour… » sans sujet) : reformule en t'adressant à elle. Le TITRE peut rester un label court ; la DESCRIPTION, elle, TE parle. Attention : tutoyer n'autorise PAS à inventer un attribut du profil (voir MODE B / bloc skin).",
    "- LANGAGE GRAND PUBLIC (impératif, TOUS les blocs) : n'écris JAMAIS de nom INCI/scientifique. INTERDITS (exemples) : « Glyceryl Oleate », « PCA », « Cetearyl Alcohol », « Behentrimonium », « Phenoxyethanol », « Methylparaben », « Methylisothiazolinone », « Sodium Laureth Sulfate », « Panthenol », « Tocopherol », « Dimethicone ». À la place, CATÉGORIES simples : « émollients », « agents adoucissants », « conservateur » (et « (parabène) » si c'en est un), « parfum », « agents lavants », « alcool », « huiles végétales », « agent réparateur ». RÉÉCRIS systématiquement : un parabène → « un conservateur (parabène) » ; un sulfate (…Sulfate) → « un agent lavant sulfaté » ; panthénol → « agent apaisant » ; tocophérol → « vitamine E » ; diméthicone → « silicone ». Tu peux nommer un ingrédient SEULEMENT s'il est connu du grand public (Aloe Vera, beurre de karité, huile d'argan, glycérine, acide hyaluronique, niacinamide). Décris les fonctions en mots simples (adoucit, hydrate, nettoie, conserve, parfume).",
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
    `Note globale : ${input.score.toFixed(1)}/20 (${input.scoreLabel}).`,
    `Comptes : Vert=${input.counts.Vert ?? 0}, Jaune=${input.counts.Jaune ?? 0}, Orange=${input.counts.Orange ?? 0}, Rouge=${input.counts.Rouge ?? 0}.`,
    `À SIGNALER OBLIGATOIREMENT dans le bloc watch (en CATÉGORIES grand public, jamais de nom scientifique) : ${toSignal.length ? toSignal.join(", ") : "RIEN (0 orange, 0 rouge, 0 restriction) → watch vert « Rien à surveiller »"}`,
    "Les noms d'ingrédients ci-dessous sont en INCI : NE LES RECOPIE JAMAIS, traduis-les en catégorie grand public.",
    "",
    `Ingrédients de TES restrictions présents dans la formule : ${matched.length ? matched.map((m) => `${m.inciName} (${m.label})`).join(", ") : "AUCUN"}`,
    "",
    "Actifs VERTS notables (rôle) :",
    greens.length ? greens.slice(0, 10).map(fmt).join("\n") : "(aucun avec fonction connue)",
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

const TONES: Tone[] = ["vert", "ambre", "rouge", "neutre"];

/**
 * Filet de sécurité « langage grand public » : remplace les noms INCI courants
 * que le LLM pourrait recopier par des catégories compréhensibles. Best-effort.
 */
function plainifyIngredientNames(s: string): string {
  return s
    .replace(/sodium\s+(laureth|lauryl)\s+sulfate/gi, "agent lavant sulfaté")
    .replace(/\b(methyl|propyl|butyl|ethyl)paraben\b/gi, "conservateur (parabène)")
    .replace(/(methylchloroiso|methyliso)thiazolinone|phenoxyethanol/gi, "conservateur")
    .replace(/cetearyl\s+alcohol|behentrimonium\s*\w*/gi, "agent adoucissant")
    .replace(/zinc\s+pca/gi, "zinc")
    .replace(/\bpca\b/gi, "")
    .replace(/panthenol/gi, "agent apaisant")
    .replace(/tocopherol/gi, "vitamine E")
    .replace(/dimethicone/gi, "silicone")
    .replace(/glyceryl\s+\w+/gi, "émollient")
    // anti-survente déterministe (« idéal/parfait » → « adapté/très bon »)
    .replace(/\bidéales\b/gi, "adaptées")
    .replace(/\bidéaux\b/gi, "adaptés")
    .replace(/\bidéale\b/gi, "adaptée")
    .replace(/\bidéal\b/gi, "adapté")
    .replace(/\bparfaites\b/gi, "très bonnes")
    .replace(/\bparfaits\b/gi, "très bons")
    .replace(/\bparfaite\b/gi, "très bonne")
    .replace(/\bparfait\b/gi, "très bon")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function coerceBlock(raw: unknown, fallbackTitle: string): Block | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? plainifyIngredientNames(stripLongDashes(o.title)).slice(0, 60) : "";
  const description = typeof o.description === "string" ? plainifyIngredientNames(stripLongDashes(o.description)).slice(0, 200) : "";
  let tone = typeof o.tone === "string" ? (o.tone.trim().toLowerCase() as Tone) : "neutre";
  if (!TONES.includes(tone)) tone = "neutre";
  if (!title && !description) return null;
  return { title: title || fallbackTitle, description, tone };
}

/**
 * Invariants DURS appliqués côté code (le LLM est stochastique) :
 *  - watch ne peut JAMAIS être « rien à surveiller » s'il y a orange/rouge/restriction ;
 *    tone watch = rouge (rouge|restriction), ambre (orange seul), vert (rien).
 *  - tone goals borné par les couleurs : rouge si (rouge|>=3 orange), jamais vert si orange/rouge.
 */
function enforceInvariants(
  blocks: PersonalBlocks,
  ctx: { orange: number; red: number; restrictionHit: boolean; signalCats: string[] },
): PersonalBlocks {
  const { orange, red, restrictionHit, signalCats } = ctx;
  const concerns = red > 0 || orange > 0 || restrictionHit;

  blocks.watch.tone = red > 0 || restrictionHit ? "rouge" : orange > 0 ? "ambre" : "vert";
  if (
    concerns &&
    /rien\s+à\s+surveiller|aucun\s+ingrédient|rien\s+à\s+signaler/i.test(
      `${blocks.watch.title} ${blocks.watch.description}`,
    )
  ) {
    blocks.watch.title = "Ingrédients à surveiller";
    blocks.watch.description = signalCats.length
      ? `Surveille : ${signalCats.join(", ")}.`
      : `Surveille ${orange + red} ingrédient(s) de cette formule.`;
  }

  if (red > 0 || orange >= 3) blocks.goals.tone = "rouge";
  else if (orange > 0 && blocks.goals.tone === "vert") blocks.goals.tone = "ambre";

  // description watch jamais vide
  if (!blocks.watch.description || !blocks.watch.description.trim()) {
    blocks.watch.description = concerns
      ? signalCats.length
        ? `Surveille : ${signalCats.join(", ")}.`
        : "Garde un œil sur certains ingrédients de cette formule."
      : "Rien d'inquiétant pour toi dans cette formule.";
  }
  return blocks;
}

function parseBlocks(raw: string | null): PersonalBlocks | null {
  if (!raw) return null;
  let jsonText = raw.trim();
  // Robustesse : extraire le 1er objet JSON si le modèle a ajouté du texte.
  const first = jsonText.indexOf("{");
  const last = jsonText.lastIndexOf("}");
  if (first > 0 || last < jsonText.length - 1) {
    if (first >= 0 && last > first) jsonText = jsonText.slice(first, last + 1);
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
  const goals = coerceBlock(obj.goals, "Tes objectifs");
  const skin = coerceBlock(obj.skin, "À quoi ça sert");
  const watch = coerceBlock(obj.watch, "À surveiller pour toi");
  if (!goals || !skin || !watch) return null;
  return { goals, skin, watch };
}

export async function generatePersonalBlocks(input: PersonalInput): Promise<PersonalBlocks | null> {
  const cacheKey = await makePersonalCacheKey(input);
  const cached = await getCached<PersonalBlocks>(cacheKey);
  if (cached?.goals && cached?.skin && cached?.watch) return cached;

  if (!hasOpenAI() && !hasMistral()) return null;

  const { system, user } = buildPrompt(input);

  try {
    const blocks = await callWithFallback<PersonalBlocks | null>({
      feature: "personal-insights",
      userId: input.userId ?? null,
      timeoutMs: 25_000,
      primary: async () => {
        if (!hasOpenAI()) throw new Error("openai disabled");
        const resp = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0.3,
          max_tokens: 600,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });
        return {
          value: parseBlocks(resp.choices?.[0]?.message?.content ?? null),
          tokensIn: resp.usage?.prompt_tokens,
          tokensOut: resp.usage?.completion_tokens,
        };
      },
      fallback: async () => {
        if (!hasMistral()) return { value: null, provider: "mistral" as const };
        const raw = await mistralChat({
          model: MISTRAL_MODEL,
          temperature: 0.3,
          maxTokens: 600,
          messages: [
            { role: "system", content: `${system}\n\nRéponds UNIQUEMENT avec l'objet JSON, rien d'autre.` },
            { role: "user", content: user },
          ],
        });
        return { value: parseBlocks(raw), provider: "mistral" as const };
      },
    });

    if (!blocks) return null;
    const enforced = enforceInvariants(blocks, {
      orange: input.counts.Orange ?? 0,
      red: input.counts.Rouge ?? 0,
      restrictionHit: input.restrictionMatches.length > 0,
      signalCats: [
        ...new Set(input.restrictionMatches.map((m) => m.label).filter(Boolean)),
        ...new Set(
          input.enriched
            .filter((r) => r.color_rating === "Orange" || r.color_rating === "Rouge")
            .map((r) => r.primary_function)
            .filter((f): f is string => Boolean(f)),
        ),
      ],
    });
    void setCached(cacheKey, enforced);
    return enforced;
  } catch {
    return null;
  }
}
