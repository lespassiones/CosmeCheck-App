// Thin wrapper around OpenAI's web-search-enabled model. Port of CosmetWiki
// lib/ai/webSearch.ts. Reuses the shared aiClient (openai/hasOpenAI). Model:
// gpt-4o-mini-search-preview (AI_MODEL_SEARCH) — cheap inference + native web
// search billed separately by OpenAI (~$0.025/call tier 1).
import { AI_MODEL_SEARCH, hasOpenAI, openai } from "../../_shared/aiClient.ts";

export type WebSearchResult = {
  text: string;
  citations: { url: string; title: string | null }[];
};

/** Ask the web-search model for a single completion. search-preview models
 *  reject temperature/response_format/tools — they ship with search baked in
 *  and behave at temp 0 by default. */
export async function webSearchComplete(
  system: string,
  userMsg: string,
  opts: { timeoutMs?: number } = {},
): Promise<WebSearchResult> {
  if (!hasOpenAI()) {
    throw new Error("openai_unavailable");
  }
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const completion = await Promise.race([
    openai().chat.completions.create({
      model: AI_MODEL_SEARCH,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      // deno-lint-ignore no-explicit-any
      web_search_options: { search_context_size: "medium" },
    } as any),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("web-search timeout")), timeoutMs),
    ),
  ]);

  const choice = completion.choices?.[0];
  const text = choice?.message?.content ?? "";
  type Annot = { type?: string; url_citation?: { url?: string; title?: string } };
  const annots = (choice?.message as unknown as { annotations?: Annot[] } | undefined)?.annotations ?? [];
  const citations = annots
    .filter((a) => a.type === "url_citation" && a.url_citation?.url)
    .map((a) => ({ url: a.url_citation!.url as string, title: a.url_citation!.title ?? null }));

  return { text, citations };
}
