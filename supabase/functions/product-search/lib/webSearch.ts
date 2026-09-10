// Wrapper de recherche web. Délègue à `openaiWebSearch` (_shared/aiClient),
// qui passe par l'API Responses + outil `web_search` : les anciens modèles
// `*-search-preview` de Chat Completions ont été retirés par OpenAI (404
// model_not_found). Contrat inchangé pour les appelants.
import { openaiWebSearch } from "../../_shared/aiClient.ts";

export type WebSearchResult = {
  text: string;
  citations: { url: string; title: string | null }[];
};

/** Une complétion avec recherche web. Jette "openai_unavailable" sans clé,
 *  "web-search timeout" au timeout (l'appelant mappe vers 503/504). */
export async function webSearchComplete(
  system: string,
  userMsg: string,
  opts: { timeoutMs?: number } = {},
): Promise<WebSearchResult> {
  const r = await openaiWebSearch(system, userMsg, { timeoutMs: opts.timeoutMs });
  return { text: r.text, citations: r.citations };
}
