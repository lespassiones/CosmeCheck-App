/**
 * Feature-local helpers for promesse-fetch-description — Deno port of
 * CosmetWiki/lib/ai/webSearch.ts (webSearchComplete) + a compact JSON
 * extractor (matching lib/zod/llmParse.ts behaviour, no Zod in the bundle).
 * Kept inside the function dir to avoid touching _shared (no collisions).
 */
import { AI_MODEL_SEARCH, hasOpenAI, openai } from "../_shared/aiClient.ts";

export type WebSearchResult = {
  text: string;
  citations: { url: string; title: string | null }[];
};

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

export function extractJsonBlock(text: string): unknown {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const firstBrace = trimmed.search(/[{[]/);
  if (firstBrace === -1) return null;
  for (let i = trimmed.length; i > firstBrace; i--) {
    const slice = trimmed.slice(firstBrace, i);
    try {
      return JSON.parse(slice);
    } catch {
      // keep narrowing
    }
  }
  return null;
}
