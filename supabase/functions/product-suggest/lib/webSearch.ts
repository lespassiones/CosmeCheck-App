// Thin wrapper around OpenAI's web-search-enabled model. Port of CosmetWiki
// lib/ai/webSearch.ts. Reuses the shared aiClient (openai/hasOpenAI). Model:
// gpt-4o-mini-search-preview (AI_MODEL_SEARCH) — cheap inference + native web
// search billed separately by OpenAI (~$0.025/call tier 1).
import { AI_MODEL_SEARCH, hasOpenAI, logAI, openai } from "../../_shared/aiClient.ts";

export type WebSearchResult = {
  text: string;
  citations: { url: string; title: string | null }[];
};

/** Ask the web-search model for a single completion. search-preview models
 *  reject temperature/response_format/tools — they ship with search baked in
 *  and behave at temp 0 by default.
 *  Logué dans ai_logs (modèle search-preview) → le coût admin inclut le frais
 *  de recherche web par appel, sinon invisible. */
export async function webSearchComplete(
  system: string,
  userMsg: string,
  opts: { timeoutMs?: number; userId?: string | null } = {},
): Promise<WebSearchResult> {
  if (!hasOpenAI()) {
    throw new Error("openai_unavailable");
  }
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const t0 = Date.now();

  let completion: Awaited<ReturnType<ReturnType<typeof openai>["chat"]["completions"]["create"]>>;
  try {
    completion = await Promise.race([
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
  } catch (err) {
    logAI({
      feature: "product_search",
      provider: "openai",
      status: "error",
      model: AI_MODEL_SEARCH,
      duration_ms: Date.now() - t0,
      user_id: opts.userId ?? null,
    });
    throw err;
  }

  // deno-lint-ignore no-explicit-any
  const usage = (completion as any).usage ?? {};
  logAI({
    feature: "product_search",
    provider: "openai",
    status: "success",
    model: AI_MODEL_SEARCH,
    tokens_in: usage.prompt_tokens ?? null,
    tokens_out: usage.completion_tokens ?? null,
    duration_ms: Date.now() - t0,
    user_id: opts.userId ?? null,
  });

  const choice = completion.choices?.[0];
  const text = choice?.message?.content ?? "";
  type Annot = { type?: string; url_citation?: { url?: string; title?: string } };
  const annots = (choice?.message as unknown as { annotations?: Annot[] } | undefined)?.annotations ?? [];
  const citations = annots
    .filter((a) => a.type === "url_citation" && a.url_citation?.url)
    .map((a) => ({ url: a.url_citation!.url as string, title: a.url_citation!.title ?? null }));

  return { text, citations };
}
