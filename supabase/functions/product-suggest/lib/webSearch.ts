// Wrapper de recherche web. Délègue à `openaiWebSearch` (_shared/aiClient),
// qui passe par l'API Responses + outil `web_search` : les anciens modèles
// `*-search-preview` de Chat Completions ont été retirés par OpenAI (404
// model_not_found). Contrat inchangé pour les appelants.
// Logué dans ai_logs → le coût admin inclut le frais de recherche web par
// appel (facturé par OpenAI en plus des tokens), sinon invisible.
import { AI_MODEL_SEARCH, logAI, openaiWebSearch } from "../../_shared/aiClient.ts";

export type WebSearchResult = {
  text: string;
  citations: { url: string; title: string | null }[];
};

export async function webSearchComplete(
  system: string,
  userMsg: string,
  opts: { timeoutMs?: number; userId?: string | null } = {},
): Promise<WebSearchResult> {
  const t0 = Date.now();
  try {
    const r = await openaiWebSearch(system, userMsg, { timeoutMs: opts.timeoutMs });
    logAI({
      feature: "product_search",
      provider: "openai",
      status: "success",
      model: `${AI_MODEL_SEARCH}+web_search`,
      tokens_in: r.tokensIn,
      tokens_out: r.tokensOut,
      duration_ms: Date.now() - t0,
      user_id: opts.userId ?? null,
    });
    return { text: r.text, citations: r.citations };
  } catch (err) {
    logAI({
      feature: "product_search",
      provider: "openai",
      status: "error",
      model: `${AI_MODEL_SEARCH}+web_search`,
      duration_ms: Date.now() - t0,
      user_id: opts.userId ?? null,
    });
    throw err;
  }
}
