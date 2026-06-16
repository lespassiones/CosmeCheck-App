/**
 * LLM calls for the coherence feature — Deno port of CosmetWiki/lib/ai/coherence.ts.
 * Reuses the shared aiClient (callWithFallback / openai / mistralChat / hasOpenAI /
 * hasMistral) and shared sanitize. OpenAI gpt-4o-mini json_schema primary,
 * Mistral json_object fallback; defensive parsers; degrades to empty/fallback
 * when no AI key is configured.
 */

import {
  AI_MODEL,
  callWithFallback,
  hasMistral,
  hasOpenAI,
  mistralChat,
  openai,
} from "../../_shared/aiClient.ts";
import { NO_LONG_DASHES_RULE, stripLongDashes } from "../../_shared/sanitize.ts";
import {
  absenceCategoriesForPrompt,
  effectCategoriesForPrompt,
} from "./claims.ts";
import {
  PRODUCT_TYPE_LABELS,
  type CoherencePromise,
  type OutOfScopePromise,
  type ProductType,
} from "./types.ts";
import type { LlmPromiseProposal, OpenLlmMatch } from "./engine.ts";

// -----------------------------------------------------------------------------
// 1) Promise extraction
// -----------------------------------------------------------------------------

export type ExtractionResult = {
  proposals: LlmPromiseProposal[];
  unverifiable: { excerpt: string; reason: string }[];
  outOfScope: OutOfScopePromise[];
};

const UNVERIFIABLE_REASONS = [
  "composition",
  "certification",
  "sensoriel",
  "marketing_general",
  "autre",
] as const;

const PRODUCT_TYPE_GUIDANCE: Record<ProductType, string> = {
  cheveux:
    "Le produit agit sur la fibre capillaire et le cuir chevelu. Promesses pertinentes : hydratation, démêlage, brillance, anti-frisottis, anti-chute, densification, anti-pellicules, fixation/coiffage, protection thermique, fortification de la fibre. Le cheveu mort ne contient ni collagène ni cellules vivantes - toute promesse 'régénère les cellules du cheveu' / 'collagène capillaire' / 'jeunesse cellulaire' / 'anti-âge cellulaire' est HORS-SUJET biologiquement. Le cuir chevelu peut être apaisé / nourri (peau). IMPORTANT : 'protection contre la chaleur / protection thermique' est une PROMESSE D'EFFET valide (catégorie 'autre', label 'Protection thermique') — la mention d'une température (ex: 'jusqu'à 450°F / 232°C') est une SPÉCIFICATION de la promesse, PAS une raison de la classer unverifiable ou out_of_scope.",
  peau_visage:
    "Le produit agit sur la peau du visage. Promesses pertinentes : hydratation, apaisement, anti-âge, éclat, exfoliation, raffermissement, anti-tache, anti-pores, anti-acné, protection UV, ET aussi toutes les promesses qui décrivent un état de la peau visé par la formule : douceur, souplesse, confort cutané, beauté, lumière du teint, peau lisse, peau repulpée, peau saine, peau régénérée, nutrition. HORS-SUJET : promesses capillaires (démêlage, anti-frisottis…), olfactives (tenue parfum), dentaires.",
  peau_corps:
    "Le produit agit sur la peau du corps (incluant mains, pieds, bras…). Promesses pertinentes : hydratation, apaisement, nourrissant, anti-âge corps, raffermissement, exfoliation, anti-vergetures, ET aussi tout effet visé décrit côté peau : douceur (\"rend les mains douces\", \"peau de bébé\"), souplesse, confort cutané, beauté de la peau, peau lisse, peau réparée, élasticité, peau veloutée, nutrition de la peau. HORS-SUJET : promesses capillaires, dentaires, oculaires.",
  levres:
    "Le produit agit sur les lèvres. Promesses pertinentes : hydratation, nourrissant, repulpant, anti-gerçures, protection UV, brillance/couvrance, ET aussi douceur des lèvres, confort, souplesse, lèvres lisses, lèvres réparées. HORS-SUJET : promesses capillaires, dentaires, anti-rides cellulaire profonde.",
  parfum:
    "Le produit est un parfum / eau de toilette. Promesses pertinentes : tenue, sillage, fraîcheur, intensité, persistance, notes olfactives. HORS-SUJET : hydratation (sauf base alcoolique mentionnée comme telle), anti-âge, démêlage, etc.",
  dents:
    "Le produit agit sur les dents et la cavité buccale. Promesses pertinentes : blancheur, anti-tartre, anti-caries, fraîcheur d'haleine, gencives, sensibilité. HORS-SUJET : promesses capillaires, cutanées, anti-âge cellulaire.",
  ongles:
    "Le produit agit sur les ongles et cuticules. Promesses pertinentes : durcissement, brillance, anti-cassure, soin cuticules, base/top coat. HORS-SUJET : promesses capillaires, cutanées (sauf cuticules), olfactives.",
  maquillage:
    "Le produit est un maquillage (teint, yeux, lèvres). Promesses pertinentes : tenue, couvrance, fini (mat/satin/glow), confort de port, anti-transfert. Promesses soin parfois ajoutées (hydratation, anti-âge) à analyser comme bonus, mais le cœur reste maquillage. HORS-SUJET : promesses capillaires.",
  autre:
    "Type de produit inconnu - analyse de façon permissive, n'envoie en hors-sujet que les claims manifestement absurdes (ex: 'régénère les cellules' sur un parfum).",
};

function buildExtractionPrompt(description: string, productType: ProductType) {
  const effectCats = effectCategoriesForPrompt();
  const absenceCats = absenceCategoriesForPrompt();
  const effectList = effectCats
    .map(
      (c) =>
        `- ${c.slug} (${c.label}) - actifs typiques : ${c.example_actives.join(", ")}`,
    )
    .join("\n");
  const absenceList = absenceCats
    .map((c) => `- ${c.slug} (${c.label}) - mots-clés : ${c.keywords.join(", ")}`)
    .join("\n");

  const typeLabel = PRODUCT_TYPE_LABELS[productType];
  const typeGuidance = PRODUCT_TYPE_GUIDANCE[productType];

  const system = `Tu es un assistant qui analyse les descriptions marketing de produits cosmétiques en français.

Ta mission : identifier TOUTES les PROMESSES VÉRIFIABLES (effets ET absences d'ingrédients) et les classer.

═══ TYPE DE PRODUIT ═══
${typeLabel}

${typeGuidance}

═══ CATÉGORIES D'EFFETS (promesses positives sur la peau/cheveux) ═══
${effectList}

═══ CATÉGORIES D'ABSENCE (promesses "sans X") ═══
${absenceList}

CATÉGORIE "autre" - À UTILISER GÉNÉREUSEMENT :
Les 12 catégories ci-dessus ne couvrent PAS tout le champ cosmétique : elles ratent volontairement la douceur, la souplesse, le confort cutané, la nutrition, la beauté/éclat de la peau, la réparation, la fixation, la régulation du sébum, le repulpant lèvres, le toucher velouté, etc. Pour TOUTES ces promesses qui ne tombent dans aucune catégorie d'effet listée, tu utilises category_slug="autre" avec un label précis et descriptif.

TU PEUX (et tu DOIS) avoir PLUSIEURS entrées avec category_slug="autre" dans la même réponse - une par effet distinct. Exemples de labels : "Douceur de la peau", "Confort cutané", "Souplesse de la peau", "Nutrition de la peau", "Régulation du sébum", "Fixation des boucles", "Repulpant lèvres", "Toucher velouté", "Beauté du teint", "Réparation cutanée"… Chaque effet bio distinct = une entrée "autre" séparée, avec un label différent. Ne fusionne PAS deux effets distincts juste parce qu'ils tombent tous les deux en "autre".

═══ MÉTHODE SYSTÉMATIQUE (suivre dans l'ordre) ═══

Étape 1 - Découpage : lis la description et coupe-la mentalement EN PHRASES. N'ignore aucune phrase.

Étape 2 - Pour chaque phrase, repère :
  (a) Un VERBE D'EFFET (liste indicative non exhaustive) :
      hydrate, nourrit, fortifie, renforce, raffermit, lisse, démêle, fixe, coiffe, définit,
      stimule, ralentit, prévient, élimine, réduit, atténue, apaise, calme, protège, régénère,
      répare, restaure, sublime, illumine, éclaircit, unifie, donne du volume, densifie,
      gaine, scelle, condition, parfume, désodorise, blanchit, durcit, repulpe, tient, dure,
      conserve, contient (suivi d'un actif), agit, contribue à, favorise, aide à,
      rend (suivi d'un adjectif : "rend les mains douces", "rend la peau lumineuse"),
      donne (suivi d'un état : "donne du confort", "donne de la souplesse", "donne un toucher velouté"),
      laisse (suivi d'un état : "laisse la peau douce", "laisse les cheveux soyeux"),
      adoucit, assouplit, embellit, soigne, prend soin de.
  (b) Une CIBLE (peau, cheveux, lèvres, ongles, dents, fibre, cuir chevelu, boucles, pointes…).
  (c) OU une mention "sans X" / "0 % de X" / "free of X".

Si une phrase ne contient aucun de (a), (b), (c) → pas une promesse, passe.

Étape 3 - Filtre PERTINENCE selon le TYPE DE PRODUIT :
  Pour chaque promesse identifiée, vérifie qu'elle est BIOLOGIQUEMENT pertinente pour un produit de type "${typeLabel}".
  Si la promesse décrit un effet qui n'a PAS de sens biologique sur ce type de produit (ex: "production de collagène" sur les cheveux - le cheveu mort ne produit pas de collagène),
  → mets-la dans le champ \`out_of_scope\` (pas dans \`promises\`), avec une explication courte (1 phrase).

Étape 4 - DÉDUPLICATION FINALE : avant de retourner ton JSON, RELIS ta liste \`promises\`.
  Si deux entrées partagent le même \`category_slug\` OU expriment la même intention reformulée
  (ex: "anti-chute" + "stoppe la chute" + "ralentit la chute" = 1 seule promesse),
  GARDE celle dont l'excerpt est le plus complet, SUPPRIME les autres.
  La liste finale ne contient JAMAIS deux fois la même promesse.

═══ RÈGLES IMPORTANTES ═══

1. EXHAUSTIVITÉ : Sois EXHAUSTIF. Une description marketing contient typiquement 3 à 8 promesses distinctes (effets + absences). Si tu n'en trouves qu'une seule sur un texte de 5+ phrases, tu en oublies sûrement. Reprends ta méthode (étape 1-2) plutôt que de répondre trop court.

2. CLAIMS "SANS X" SONT DES PROMESSES VÉRIFIABLES :
   "sans sulfate", "sans paraben", "sans silicone", "sans huile minérale", "sans colorant", "sans parfum" → catégorie absence_* correspondante. Ce sont des promesses, PAS des unverifiable.

2bis. RÈGLE ABSOLUE "sans X" — ANTI-HALLUCINATION :
   N'extrais une promesse d'absence QUE si le mot exact "sans", "0 %", "free of", "exempt de" (ou équivalent direct) est LITTÉRALEMENT présent dans le texte fourni pour cet ingrédient précis.
   Si le texte ne le mentionne PAS → n'invente JAMAIS une promesse "sans X", même si tu connais la marque, même si le produit est probablement sans cet ingrédient, même si la formule semble naturelle.
   Exemple interdit : le texte dit "huile légère et concentrée" → tu n'extrais PAS "sans silicone". Jamais.

3. promesse vs unverifiable :
   ✓ EST UNE PROMESSE = un EFFET attendu sur la peau/cheveux/etc. OU une absence d'ingrédient. Toute phrase qui décrit un état de la peau ou des cheveux visé par le produit ("rend les mains douces", "laisse la peau souple", "donne du confort", "embellit le teint", "redonne de l'éclat") est une PROMESSE - même si le verbe est ambigu. Si l'utilisateur peut dire "je vérifie si la formule contient un actif qui fait ça", c'est une promesse.
   ✗ EST UNVERIFIABLE = ni effet sur la peau/cheveux ni absence d'ingrédient ni présence d'un actif nommé :
     - composition VAGUE, sans actif nommé : "97 % d'origine naturelle", "formule clean", "à base d'ingrédients naturels"
     - certification : "Ecocert", "Cosmos Organic", "vegan", "cruelty-free", "bio"
     - sensoriel PUR (du produit lui-même, pas de la peau après usage) : "odeur sucrée", "texture fondante", "mousse rapidement", "fragrance fraîche du produit"
     - marketing_general : "véritable soin", "efficacité prouvée", "résultats visibles", sans cible précise

   ⚠️ DANS LE DOUTE : si la phrase mentionne la PEAU / les CHEVEUX / les LÈVRES / les MAINS / les ONGLES / l'HALEINE / etc., classe-la en PROMESSE (catégorie listée si possible, sinon "autre"). Le bucket "unverifiable" est réservé aux mentions qui parlent UNIQUEMENT du produit en pot (composition, certification, label, odeur du produit) sans dire ce qu'il fait à la zone d'application.

4. RÈGLE D'OR : si une phrase dit qu'un ingrédient FAIT quelque chose ("la provitamine B5 fortifie les cheveux"), c'est une PROMESSE d'effet. Si elle dit qu'un ingrédient N'EST PAS dedans ("sans sulfate"), c'est une PROMESSE d'absence. Si elle décrit un état souhaité pour la zone d'application après usage ("rend les mains douces", "peau veloutée"), c'est aussi une PROMESSE d'effet (en "autre" si aucune catégorie listée ne colle). Sinon c'est unverifiable.

4bis. PRÉSENCE D'UN ACTIF NOMMÉ = PROMESSE VÉRIFIABLE (ne JAMAIS mettre en unverifiable) :
   "enrichi en X", "à la X", "au X", "contient de la X", "formulé avec X", "à base de X" — où X est un
   ingrédient/actif PRÉCIS et identifiable (spiruline, niacinamide / vitamine B3, acide hyaluronique, bambou,
   ananas, caféine, aloe vera…). C'est une promesse de PRÉSENCE : on peut vérifier si X figure réellement
   dans l'INCI. → category_slug="autre", label="Présence : X" (ex: "Présence : Spiruline", "Présence : Vitamine B3").
   UNE entrée par actif nommé distinct. Reste unverifiable UNIQUEMENT la composition vague SANS actif nommé
   ("97 % naturel", "formule clean", "actifs d'origine végétale" sans préciser lesquels).

5. EXCERPT : verbatim exact (ou fragment fidèle), max 80 caractères.

6. La description peut être en français ou en anglais.

7. EFFETS DISTINCTS — N'INFÈRE PAS un effet à partir d'un autre :
   "douceur" ≠ "démêlage" : ce sont deux effets distincts. Si le texte dit "douceur" sans mentionner "démêlage", extrais "Douceur capillaire" (autre), PAS "Démêlage". De même : "brillance" ≠ "fortification", "légèreté" ≠ "sans silicone".
   Règle générale : n'extrais QUE ce que le texte dit EXPLICITEMENT ou implique DIRECTEMENT (ex: "fixe les boucles" → "Fixation des boucles"). Ne construis pas de promesse par déduction à plusieurs étapes.

═══ EXEMPLE 1 (cheveux, claim pertinent) ═══

Type : Cheveux
Description : "Cette gelée enrichie en spiruline hydrate les cheveux, fixe les boucles et limite les frisottis. Sans sulfate ni silicone, formulée à 96 % naturel, odeur de vanille."

Sortie :
- promises:
  · {category_slug: "autre", label: "Présence : Spiruline", excerpt: "enrichie en spiruline"}  ← actif NOMMÉ → promesse de présence (vérifiable dans l'INCI), PAS unverifiable
  · {category_slug: "hydratation", label: "Hydratation", excerpt: "hydrate les cheveux"}
  · {category_slug: "autre", label: "Fixation des boucles", excerpt: "fixe les boucles"}
  · {category_slug: "anti_frisottis", label: "Anti-frisottis", excerpt: "limite les frisottis"}
  · {category_slug: "absence_sulfate", label: "Sans sulfate", excerpt: "sans sulfate"}
  · {category_slug: "absence_silicone", label: "Sans silicone", excerpt: "ni silicone"}
- unverifiable:
  · {excerpt: "formulée à 96 % naturel", reason: "composition"}  ← composition VAGUE sans actif nommé → unverifiable
  · {excerpt: "odeur de vanille", reason: "sensoriel"}
- out_of_scope: []

═══ EXEMPLE 2 (cheveux, claim hors-sujet biologique) ═══

Type : Cheveux
Description : "L'Huile Essentielle de Géranium Rosat contribue à la production de collagène dans le cheveu. Elle régénère les cellules pour maintenir la beauté de la chevelure. Sans paraben."

Sortie :
- promises:
  · {category_slug: "absence_paraben", label: "Sans paraben", excerpt: "Sans paraben"}
- unverifiable: []
- out_of_scope:
  · {excerpt: "production de collagène dans le cheveu", claimed_effect: "anti-âge cellulaire", reason: "Le cheveu mort ne contient pas de cellules vivantes ni de collagène - la production de collagène n'a pas de support biologique sur un produit capillaire."}
  · {excerpt: "régénère les cellules", claimed_effect: "régénération cellulaire", reason: "Les cellules du cheveu kératinisé ne se régénèrent pas - promesse biologiquement non applicable à un produit capillaire."}

═══ EXEMPLE 3 (parfum, dédup) ═══

Type : Parfum
Description : "Un parfum qui tient toute la journée. Sa tenue de 12 h est impressionnante. Sillage longue durée."

Sortie :
- promises:
  · {category_slug: "autre", label: "Tenue longue durée", excerpt: "tient toute la journée"}  ← une seule entrée, on FUSIONNE "tient" + "tenue de 12 h" + "longue durée"
- unverifiable: []
- out_of_scope: []

═══ EXEMPLE 4 (peau du corps, plusieurs "autre" distincts - excerpts VERBATIM) ═══

Type : Peau du corps
Description : "Crème pour les mains au parfum d'agrumes et de fleur d'oranger. Sa formule riche nourrit les mains et les rend douces. Pour des mains belles et soignées au quotidien. Confort longue durée après application. Cosmos Natural."

Sortie :
- promises:
  · {category_slug: "hydratation", label: "Hydratation", excerpt: "nourrit les mains"}  ← "nourrit" implique apport hydratant/lipidique
  · {category_slug: "autre", label: "Douceur de la peau", excerpt: "les rend douces"}  ← effet "douceur" - non listé dans les 12 catégories, va en "autre" avec label propre. NOTE : l'excerpt est verbatim ("les rend douces" est dans le texte).
  · {category_slug: "autre", label: "Beauté de la peau", excerpt: "mains belles et soignées"}  ← effet "beauté" - encore "autre" avec un label différent. Excerpt verbatim.
  · {category_slug: "autre", label: "Confort cutané", excerpt: "Confort longue durée après application"}  ← 3e "autre", label distinct
- unverifiable:
  · {excerpt: "parfum d'agrumes et de fleur d'oranger", reason: "sensoriel"}  ← odeur du produit, pas un effet sur la peau
  · {excerpt: "Cosmos Natural", reason: "certification"}
- out_of_scope: []

(Note : 3 entrées "autre" coexistent avec 3 labels différents. Chaque effet biologique distinct mérite sa propre ligne. TOUS les excerpts sont des fragments VERBATIM de la description, jamais reformulés.)`;

  const user = `Description du produit (type: ${typeLabel}) à analyser :
"""
${description.trim().slice(0, 6000)}
"""

Retourne le JSON.`;

  return { system, user };
}

const EXTRACTION_SCHEMA = {
  name: "promise_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      promises: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category_slug: { type: "string" },
            label: { type: "string" },
            excerpt: { type: "string" },
          },
          required: ["category_slug", "label", "excerpt"],
        },
      },
      unverifiable: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            excerpt: { type: "string" },
            reason: { type: "string", enum: [...UNVERIFIABLE_REASONS] },
          },
          required: ["excerpt", "reason"],
        },
      },
      out_of_scope: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            excerpt: { type: "string" },
            claimed_effect: { type: "string" },
            reason: { type: "string" },
          },
          required: ["excerpt", "claimed_effect", "reason"],
        },
      },
    },
    required: ["promises", "unverifiable", "out_of_scope"],
  },
} as const;

function safeParseExtraction(raw: string): ExtractionResult | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    const promises = Array.isArray(obj.promises) ? obj.promises : [];
    const unverifiable = Array.isArray(obj.unverifiable) ? obj.unverifiable : [];
    const outOfScope = Array.isArray(obj.out_of_scope) ? obj.out_of_scope : [];
    return {
      proposals: promises
        .map((p) => p as Record<string, unknown>)
        .filter(
          (p): p is { category_slug: string; label: string; excerpt: string } =>
            typeof p.category_slug === "string" &&
            typeof p.label === "string" &&
            typeof p.excerpt === "string",
        )
        .map((p) => ({
          category_slug: p.category_slug,
          label: p.label,
          excerpt: p.excerpt.slice(0, 200),
        })),
      unverifiable: unverifiable
        .map((u) => u as Record<string, unknown>)
        .filter(
          (u): u is { excerpt: string; reason: string } =>
            typeof u.excerpt === "string" && typeof u.reason === "string",
        )
        .map((u) => ({
          excerpt: u.excerpt.slice(0, 200),
          reason: UNVERIFIABLE_REASONS.includes(
            u.reason as (typeof UNVERIFIABLE_REASONS)[number],
          )
            ? u.reason
            : "autre",
        })),
      outOfScope: outOfScope
        .map((o) => o as Record<string, unknown>)
        .filter(
          (o): o is { excerpt: string; claimed_effect: string; reason: string } =>
            typeof o.excerpt === "string" &&
            typeof o.claimed_effect === "string" &&
            typeof o.reason === "string",
        )
        .map((o) => ({
          excerpt: o.excerpt.slice(0, 200),
          claimed_effect: o.claimed_effect.slice(0, 80),
          reason: o.reason.slice(0, 280),
        })),
    };
  } catch {
    return null;
  }
}

async function mistralExtract(
  description: string,
  productType: ProductType,
): Promise<ExtractionResult | null> {
  if (!hasMistral()) return null;
  const { system, user } = buildExtractionPrompt(description, productType);
  try {
    const raw = await mistralChat({
      temperature: 0.1,
      maxTokens: 2000,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `${user}\n\nFormat strict :\n{ "promises": [{"category_slug","label","excerpt"}], "unverifiable": [{"excerpt","reason"}], "out_of_scope": [{"excerpt","claimed_effect","reason"}] }`,
        },
      ],
    });
    if (!raw) return null;
    return safeParseExtraction(raw);
  } catch {
    return null;
  }
}

export async function extractPromisesFromDescription(
  description: string,
  productType: ProductType,
  userId?: string | null,
): Promise<ExtractionResult> {
  if (!hasOpenAI() && !hasMistral()) {
    return { proposals: [], unverifiable: [], outOfScope: [] };
  }

  const { system, user } = buildExtractionPrompt(description, productType);

  try {
    const result = await callWithFallback<ExtractionResult | null>({
      feature: "categorize",
      userId: userId ?? null,
      timeoutMs: 30_000,
      primary: async () => {
        if (!hasOpenAI()) throw new Error("openai disabled");
        const resp = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0.1,
          max_tokens: 2000,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: EXTRACTION_SCHEMA,
          },
        });
        const raw = resp.choices?.[0]?.message?.content ?? null;
        const value = raw ? safeParseExtraction(raw) : null;
        return {
          value,
          tokensIn: resp.usage?.prompt_tokens,
          tokensOut: resp.usage?.completion_tokens,
        };
      },
      fallback: async () => ({
        value: await mistralExtract(description, productType),
        provider: "mistral",
      }),
    });
    return result ?? { proposals: [], unverifiable: [], outOfScope: [] };
  } catch {
    return { proposals: [], unverifiable: [], outOfScope: [] };
  }
}

// -----------------------------------------------------------------------------
// Product type detection
// -----------------------------------------------------------------------------

const PRODUCT_TYPE_SCHEMA = {
  name: "product_type_detection",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      product_type: {
        type: "string",
        enum: [
          "cheveux",
          "peau_visage",
          "peau_corps",
          "levres",
          "parfum",
          "dents",
          "ongles",
          "maquillage",
          "autre",
        ],
      },
      confidence: { type: "number" },
      hint: { type: "string" },
    },
    required: ["product_type", "confidence", "hint"],
  },
} as const;

function isProductType(s: string): s is ProductType {
  return (
    s === "cheveux" ||
    s === "peau_visage" ||
    s === "peau_corps" ||
    s === "levres" ||
    s === "parfum" ||
    s === "dents" ||
    s === "ongles" ||
    s === "maquillage" ||
    s === "autre"
  );
}

export async function detectProductType(
  description: string,
  hint?: string | null,
  userId?: string | null,
): Promise<ProductType> {
  if (!hasOpenAI() && !hasMistral()) return "autre";

  const system = `Tu classifies un texte marketing cosmétique en UN type de produit.

Types disponibles :
- cheveux           → shampoings, après-shampoings, masques, sérums, huiles capillaires, gels, mousses coiffantes
- peau_visage       → crèmes visage, sérums visage, contour des yeux, masques visage, nettoyants visage, démaquillants
- peau_corps        → laits, baumes, huiles corps, gommages corps, gels douche soin
- levres            → baumes à lèvres, gloss soin (pas maquillage couvrant)
- parfum            → eaux de parfum, eaux de toilette, brumes parfumées, déodorants parfumés
- dents             → dentifrices, bains de bouche, soins gencives
- ongles            → vernis, soins ongles, bases / top coats
- maquillage        → fonds de teint, mascaras, rouges à lèvres couvrants, fards, blushs, eyeliners
- autre             → si vraiment impossible à classer (déodorant non parfumé, hygiène intime, etc.)

Règles :
1. Choisis UN seul type, le plus probable.
2. Confidence ∈ [0,1] : 1.0 = certain, &lt;0.5 = ambigu.
3. Si la description mentionne explicitement le type (ex: "shampoing"), confidence ≥ 0.9.
4. Si ambigu mais une zone d'application est citée ("cheveux", "visage"), suis-la.
5. Si vraiment indécidable, "autre" avec confidence = 0.5.

Retourne JSON strict.`;

  const userMsg = `${hint ? `Indice externe : ${hint}\n\n` : ""}Texte :\n"""\n${description.trim().slice(0, 1500)}\n"""`;

  try {
    const detected = await callWithFallback<ProductType | null>({
      feature: "categorize",
      userId: userId ?? null,
      timeoutMs: 10_000,
      primary: async () => {
        if (!hasOpenAI()) throw new Error("openai disabled");
        const resp = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0,
          max_tokens: 80,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
          response_format: {
            type: "json_schema",
            json_schema: PRODUCT_TYPE_SCHEMA,
          },
        });
        const raw = resp.choices?.[0]?.message?.content ?? null;
        let value: ProductType | null = null;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { product_type?: string };
            if (parsed.product_type && isProductType(parsed.product_type)) {
              value = parsed.product_type;
            }
          } catch {
            // fallthrough
          }
        }
        return {
          value,
          tokensIn: resp.usage?.prompt_tokens,
          tokensOut: resp.usage?.completion_tokens,
        };
      },
      fallback: async () => {
        if (!hasMistral()) return { value: null, provider: "mistral" as const };
        try {
          const raw = await mistralChat({
            temperature: 0,
            maxTokens: 80,
            responseFormat: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content: `${userMsg}\n\nFormat: { "product_type": "...", "confidence": 0.9, "hint": "..." }` },
            ],
          });
          let value: ProductType | null = null;
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as { product_type?: string };
              if (parsed.product_type && isProductType(parsed.product_type)) {
                value = parsed.product_type;
              }
            } catch {
              // fallthrough
            }
          }
          return { value, provider: "mistral" as const };
        } catch {
          return { value: null, provider: "mistral" as const };
        }
      },
    });
    return detected ?? "autre";
  } catch {
    return "autre";
  }
}

// -----------------------------------------------------------------------------
// 1.5) Open-promise exploration
// -----------------------------------------------------------------------------

export type FormulaItemForLlm = {
  slug: string;
  name: string;
  primaryFunction: string | null;
};

export type OpenPromiseExploration = {
  matches: OpenLlmMatch[];
  missing: string[];
};

const OPEN_PROMISE_SCHEMA = {
  name: "open_promise_exploration",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      matches: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            item_slug: { type: "string" },
            item_name: { type: "string" },
            evidence: {
              type: "string",
              enum: ["documented", "supportive", "marketing"],
            },
            reason: { type: "string" },
          },
          required: ["item_slug", "item_name", "evidence", "reason"],
        },
      },
      missing: { type: "array", items: { type: "string" } },
    },
    required: ["matches", "missing"],
  },
} as const;

function buildOpenPromisePrompt(
  promiseLabel: string,
  promiseExcerpt: string,
  items: FormulaItemForLlm[],
) {
  const itemsList = items
    .slice(0, 60)
    .map(
      (it, i) =>
        `${i + 1}. ${it.name} (slug: ${it.slug})${
          it.primaryFunction ? ` - ${it.primaryFunction}` : ""
        }`,
    )
    .join("\n");

  const system = `Tu es chimiste cosmétique. On te donne une promesse marketing extraite d'un produit, et la liste réelle des ingrédients de ce produit. Tu dois identifier QUELS ingrédients de la liste soutiennent biologiquement cette promesse.

RÈGLES STRICTES (anti-hallucination) :
1. Tu ne peux citer QUE les ingrédients de la liste fournie. Le champ item_slug DOIT être un slug exact présent dans la liste. JAMAIS d'ingrédient inventé.
2. Pour chaque ingrédient pertinent, choisis un niveau d'évidence :
   - "documented" : actif biologiquement reconnu pour cette promesse, à des doses cosmétiques usuelles (ex: caféine pour anti-chute, niacinamide pour pores)
   - "supportive" : contribue indirectement (ex: panthénol pour confort général)
   - "marketing" : effet visuel/sensoriel uniquement, pas biologique (ex: silicones qui donnent un toucher "lisse")
3. Si AUCUN ingrédient de la liste ne soutient la promesse, retourne matches: [].
4. Sois conservateur. Mieux vaut sous-citer que sur-citer. Si tu n'es pas sûr, ne cite pas.
5. Pas plus de 6 matches au total.
6. Tu peux aussi lister jusqu'à 5 actifs documentés qui auraient typiquement été utilisés pour cette promesse mais qui ne sont PAS dans la liste (champ "missing"). Noms en français de préférence.
7. PROMESSE DE PRÉSENCE ("Présence : X") : la promesse affirme simplement que l'actif X est dans le produit. Cherche X (ou son nom INCI équivalent, ex: "spiruline" → "Spirulina Maxima Extract", "vitamine B3" → "Niacinamide", "acide hyaluronique" → "Sodium Hyaluronate") dans la liste. S'il y est → 1 match "documented" sur cet ingrédient. S'il N'y est PAS → matches: [] (la présence annoncée n'est pas confirmée par l'INCI). Ne mets PAS X dans "missing".`;

  const user = `Promesse à vérifier : "${promiseLabel}"
Phrase exacte de la description : "${promiseExcerpt}"

Liste des ingrédients du produit (slug INCI + fonction principale) :
${itemsList}

Retourne le JSON.`;

  return { system, user };
}

function safeParseOpenPromise(raw: string): OpenPromiseExploration | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    const matches = Array.isArray(obj.matches) ? obj.matches : [];
    const missing = Array.isArray(obj.missing) ? obj.missing : [];
    return {
      matches: matches
        .map((m) => m as Record<string, unknown>)
        .filter(
          (
            m,
          ): m is {
            item_slug: string;
            item_name: string;
            evidence: "documented" | "supportive" | "marketing";
            reason: string;
          } =>
            typeof m.item_slug === "string" &&
            typeof m.item_name === "string" &&
            typeof m.reason === "string" &&
            (m.evidence === "documented" ||
              m.evidence === "supportive" ||
              m.evidence === "marketing"),
        )
        .slice(0, 6)
        .map((m) => ({
          item_slug: m.item_slug,
          item_name: m.item_name,
          evidence: m.evidence,
          reason: m.reason.slice(0, 200),
        })),
      missing: missing
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.slice(0, 80))
        .slice(0, 5),
    };
  } catch {
    return null;
  }
}

async function mistralExploreOpen(
  promiseLabel: string,
  promiseExcerpt: string,
  items: FormulaItemForLlm[],
): Promise<OpenPromiseExploration | null> {
  if (!hasMistral()) return null;
  const { system, user } = buildOpenPromisePrompt(promiseLabel, promiseExcerpt, items);
  try {
    const raw = await mistralChat({
      temperature: 0.2,
      maxTokens: 1200,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `${user}\n\nFormat strict :\n{ "matches": [{"item_slug","item_name","evidence","reason"}], "missing": ["string"] }`,
        },
      ],
    });
    if (!raw) return null;
    return safeParseOpenPromise(raw);
  } catch {
    return null;
  }
}

export async function exploreOpenPromise(
  promiseLabel: string,
  promiseExcerpt: string,
  items: FormulaItemForLlm[],
  userId?: string | null,
): Promise<OpenPromiseExploration> {
  if (items.length === 0) return { matches: [], missing: [] };
  if (!hasOpenAI() && !hasMistral()) return { matches: [], missing: [] };

  const { system, user } = buildOpenPromisePrompt(promiseLabel, promiseExcerpt, items);

  try {
    const result = await callWithFallback<OpenPromiseExploration | null>({
      feature: "categorize",
      userId: userId ?? null,
      timeoutMs: 20_000,
      primary: async () => {
        if (!hasOpenAI()) throw new Error("openai disabled");
        const resp = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0.2,
          max_tokens: 1200,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: OPEN_PROMISE_SCHEMA,
          },
        });
        const raw = resp.choices?.[0]?.message?.content ?? null;
        const value = raw ? safeParseOpenPromise(raw) : null;
        return {
          value,
          tokensIn: resp.usage?.prompt_tokens,
          tokensOut: resp.usage?.completion_tokens,
        };
      },
      fallback: async () => ({
        value: await mistralExploreOpen(promiseLabel, promiseExcerpt, items),
        provider: "mistral",
      }),
    });
    return result ?? { matches: [], missing: [] };
  } catch {
    return { matches: [], missing: [] };
  }
}

// -----------------------------------------------------------------------------
// 2) Conclusion sentence
// -----------------------------------------------------------------------------

function buildConclusionPrompt(
  promises: CoherencePromise[],
  productLabel: string | null,
  profileBlock?: string | null,
  restrictionsBlock?: string | null,
) {
  const tenue = promises.filter((p) => p.verdict === "tenue").map((p) => p.label);
  const partielle = promises.filter((p) => p.verdict === "partielle").map((p) => p.label);
  const marketing = promises.filter((p) => p.verdict === "marketing").map((p) => p.label);
  const non = promises.filter((p) => p.verdict === "non_demontree").map((p) => p.label);
  const contredite = promises.filter((p) => p.verdict === "contredite").map((p) => p.label);

  const baseSystem = `Tu rédiges UNE phrase de conclusion (50-120 mots maximum) pour une analyse de cohérence entre les promesses d'un produit cosmétique et sa formule.

Style : direct, factuel, accessible à un consommateur français lambda. Pas de jugement moral, pas d'emoji, pas de marketing inversé ("trompeur"). Tu décris ce que la formule fait probablement vs ce qui est promis.

Si des promesses sont CONTREDITES (le produit dit "sans X" mais contient X), mentionne-les en priorité - c'est l'info la plus actionnable pour l'utilisateur.

Structure attendue : "[ce que la formule tient] mais [ce qu'elle ne tient pas / ce qui est contredit]. Effet attendu : [ce que l'utilisateur peut réellement ressentir]."

NE CITE QUE LES VERDICTS QUE JE TE DONNE. N'invente jamais d'ingrédient ni de verdict.

${NO_LONG_DASHES_RULE}`;
  let system = baseSystem;
  if (profileBlock) {
    system += `\n\n${profileBlock}\n\nIMPORTANT — Personnalisation :
1. Repère les promesses NON TENUES, PARTIELLES ou CONTREDITES qui correspondent DIRECTEMENT à une préoccupation du profil ci-dessus (ex : profil "cheveux secs, longueur affectée" + promesse "hydratation" non tenue, OU profil "rougeurs / sensibilité" + promesse "apaisant" non démontrée, OU une allergie listée présente dans la formule).
2. Si tu en trouves une, AJOUTE EN FIN DE CONCLUSION une phrase courte de rappel doux à la 2e personne : "Sachant que tu cherches X, cette promesse de Y n'est pas vraiment tenue ici." (adapte au profil et au verdict).
3. Reste factuel : tu signales, tu ne juges pas le produit en bloc. PAS de "à éviter", "déconseillé", "pas pour toi" — préfère "ne répond pas à ton besoin de Y", "ne couvre pas ta préoccupation Z".
4. Si AUCUNE promesse négative ne touche le profil, n'ajoute RIEN. Ne fabrique pas un lien forcé.
5. Si une promesse TENUE répond exactement à une préoccupation, tu peux le souligner en positif au lieu : "Bon point pour toi : la promesse de Y est tenue, ce qui correspond à ce que tu cherches."`;
  }
  if (restrictionsBlock) {
    system += `\n\n${restrictionsBlock}\n\nSi la formule de ce produit contient un ingrédient présent dans les restrictions ci-dessus, signale-le clairement en fin de conclusion à la 2e personne, en une phrase courte (ex : "À noter, ce produit contient X que tu as choisi d'éviter.").`;
  }

  const user = `${productLabel ? `Produit : ${productLabel}\n\n` : ""}Verdicts (déjà calculés mécaniquement) :
- Promesses TENUES : ${tenue.length ? tenue.join(", ") : "(aucune)"}
- Cohérence PARTIELLE : ${partielle.length ? partielle.join(", ") : "(aucune)"}
- Effet MARKETING uniquement : ${marketing.length ? marketing.join(", ") : "(aucun)"}
- Promesses NON DÉMONTRÉES : ${non.length ? non.join(", ") : "(aucune)"}
- Promesses CONTREDITES par la formule : ${contredite.length ? contredite.join(", ") : "(aucune)"}

Écris la phrase de conclusion. Pas de préambule, juste la phrase.`;

  return { system, user };
}

async function mistralConclusion(
  promises: CoherencePromise[],
  productLabel: string | null,
  profileBlock?: string | null,
  restrictionsBlock?: string | null,
): Promise<string | null> {
  if (!hasMistral()) return null;
  const { system, user } = buildConclusionPrompt(promises, productLabel, profileBlock, restrictionsBlock);
  try {
    const raw = await mistralChat({
      temperature: 0.3,
      maxTokens: 250,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return raw?.trim() ?? null;
  } catch {
    return null;
  }
}

function fallbackConclusion(promises: CoherencePromise[]): string {
  const tenue = promises.filter((p) => p.verdict === "tenue").length;
  const total = promises.length;
  if (total === 0) {
    return "Aucune promesse d'effet n'a été détectée dans la description fournie.";
  }
  if (tenue === total) {
    return "Toutes les promesses détectées sont soutenues par des actifs documentés dans la formule.";
  }
  if (tenue === 0) {
    return "Aucune des promesses détectées n'est soutenue par un actif documenté dans la formule.";
  }
  return `${tenue} promesse${tenue > 1 ? "s sont tenues" : " est tenue"} sur ${total}, les autres manquent d'actifs documentés dans la formule.`;
}

export async function generateConclusion(
  promises: CoherencePromise[],
  productLabel: string | null,
  userId?: string | null,
  profileBlock?: string | null,
  restrictionsBlock?: string | null,
): Promise<string> {
  if (!hasOpenAI() && !hasMistral()) return fallbackConclusion(promises);

  const { system, user } = buildConclusionPrompt(promises, productLabel, profileBlock, restrictionsBlock);

  try {
    const text = await callWithFallback<string | null>({
      feature: "synthesis",
      userId: userId ?? null,
      timeoutMs: 15_000,
      primary: async () => {
        if (!hasOpenAI()) throw new Error("openai disabled");
        const resp = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0.3,
          max_tokens: 250,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });
        const raw = resp.choices?.[0]?.message?.content?.trim() ?? null;
        const value = raw ? stripLongDashes(raw) : null;
        return {
          value,
          tokensIn: resp.usage?.prompt_tokens,
          tokensOut: resp.usage?.completion_tokens,
        };
      },
      fallback: async () => {
        const raw = await mistralConclusion(promises, productLabel, profileBlock, restrictionsBlock);
        return {
          value: raw ? stripLongDashes(raw) : null,
          provider: "mistral" as const,
        };
      },
    });
    return text ?? fallbackConclusion(promises);
  } catch {
    return fallbackConclusion(promises);
  }
}
