/**
 * Edge Function `validate-suggestions` — garde-fou IA des « Suggestions
 * intelligentes » (routine).
 *
 * Entrée : { items: [{ product: string, alternative: string }] }
 * Sortie : { results: [{ logical: boolean, product_type: string }] }  (même ordre)
 *
 * Pour CHAQUE paire, le LLM dit si l'alternative proposée est le MÊME TYPE de
 * produit que le produit (remplacement logique), et renvoie le TYPE réel du
 * produit (français simple) pour permettre au client de re-router une suggestion
 * illogique vers la bonne catégorie. UNE seule passe LLM (appelée au build du
 * deck côté client, donc mise en cache). Auth Bearer, AUCUN crédit débité ici.
 *
 * Dégrade : sans clé IA, renvoie tout `logical:true` (ne bloque jamais l'affichage).
 */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getBearerToken, unauthorizedResponse, userClient } from "../_shared/auth.ts";
import {
  AI_MODEL,
  callWithFallback,
  hasMistral,
  hasOpenAI,
  mistralChat,
  openai,
} from "../_shared/aiClient.ts";

type Pair = { product: string; alternative: string };
type Body = { items?: Pair[]; skinContext?: string };
type Verdict = { logical: boolean; product_type: string };

const MAX_ITEMS = 12;

const SCHEMA = {
  name: "suggestion_validation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            logical: { type: "boolean" },
            product_type: { type: "string" },
          },
          required: ["logical", "product_type"],
        },
      },
    },
    required: ["results"],
  },
} as const;

function buildPrompt(items: Pair[], skinContext?: string | null): { system: string; user: string } {
  const profileLine = skinContext
    ? `\nProfil utilisateur : ${skinContext}. Vérifie aussi que l'alternative est ADAPTÉE à ce profil (ex: éviter les produits occlusifs pour une peau grasse, les irritants pour peau sensible, les huiles lourdes pour acné). Si inadapté au profil ET illogique à la fois → logical: false. Si juste légèrement sous-optimal mais acceptable → logical: true (ne pas sur-filtrer).`
    : "";
  const system =
    "Tu es un expert cosmétique. On te donne des paires (Produit, Alternative proposée). "
    + "Pour CHAQUE paire, détermine si l'alternative est le MÊME TYPE de produit que le produit, "
    + "donc un remplacement LOGIQUE : un vernis remplace un vernis, un autobronzant un autobronzant, "
    + "un shampoing un shampoing, un enlumineur un enlumineur, une crème mains une crème mains. "
    + "Un type DIFFÉRENT est illogique (ex : proposer un tatouage temporaire pour un autobronzant, "
    + "un crayon yeux pour un vernis, une lingette pour un parfum = illogique). "
    + profileLine
    + " Renvoie aussi `product_type` = le TYPE RÉEL du PRODUIT (pas de l'alternative), en français "
    + "simple et générique (ex : \"autobronzant\", \"enlumineur visage\", \"shampoing\", \"vernis à ongles\", "
    + "\"crème mains\", \"masque cheveux\"). Sois strict et factuel. "
    + "Réponds en JSON strict : un élément par paire, MÊME ordre, MÊME nombre.";
  const list = items
    .map((it, i) => `${i + 1}. Produit: "${it.product}"  |  Alternative proposée: "${it.alternative}"`)
    .join("\n");
  const user = `Paires à évaluer :\n${list}\n\nRetourne le JSON { "results": [{ "logical", "product_type" }] }.`;
  return { system, user };
}

function safeParse(raw: string | null, n: number): Verdict[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { results?: unknown };
    const arr = Array.isArray(parsed.results) ? parsed.results : null;
    if (!arr || arr.length !== n) return null;
    return arr.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        logical: o.logical !== false, // défaut prudent : logique si ambigu
        product_type: typeof o.product_type === "string" ? o.product_type.slice(0, 80) : "",
      };
    });
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, { status: 405 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "Requête invalide." }, { status: 400 });
  }
  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((it): it is Pair => Boolean(it && typeof it.product === "string" && typeof it.alternative === "string"))
    .slice(0, MAX_ITEMS);
  const skinContext = typeof body.skinContext === "string" ? body.skinContext.slice(0, 300) : null;

  // Auth Bearer (pas de crédit).
  const token = getBearerToken(req);
  if (!token) return unauthorizedResponse("Non authentifié.");
  const supabase = userClient(token);
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return unauthorizedResponse("Non authentifié.");
  const userId = userData.user.id;

  // Aucun item ou pas d'IA → tout logique (ne bloque jamais).
  const fallback = (): Response =>
    jsonResponse({ results: items.map(() => ({ logical: true, product_type: "" })) });
  if (items.length === 0 || (!hasOpenAI() && !hasMistral())) return fallback();

  const { system, user } = buildPrompt(items, skinContext);
  try {
    const results = await callWithFallback<Verdict[] | null>({
      feature: "categorize",
      userId,
      timeoutMs: 20_000,
      primary: async () => {
        if (!hasOpenAI()) throw new Error("openai disabled");
        const resp = await openai().chat.completions.create({
          model: AI_MODEL,
          temperature: 0,
          max_tokens: 60 * items.length + 100,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_schema", json_schema: SCHEMA },
        });
        return {
          value: safeParse(resp.choices?.[0]?.message?.content ?? null, items.length),
          tokensIn: resp.usage?.prompt_tokens,
          tokensOut: resp.usage?.completion_tokens,
        };
      },
      fallback: async () => {
        if (!hasMistral()) return { value: null, provider: "mistral" as const };
        const raw = await mistralChat({
          temperature: 0,
          maxTokens: 60 * items.length + 100,
          responseFormat: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: `${user}\n\nFormat strict: { "results": [{"logical": true/false, "product_type": "..."}] }` },
          ],
        });
        return { value: safeParse(raw, items.length), provider: "mistral" as const };
      },
    });
    if (!results) return fallback();
    return jsonResponse({ results });
  } catch {
    return fallback();
  }
});
