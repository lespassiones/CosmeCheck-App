/**
 * Feature-local helpers for promesse-identify — Deno port of
 * CosmetWiki/lib/ai/webSearch.ts (webSearchComplete) + a compact JSON
 * extractor matching lib/zod/llmParse.ts behaviour (extract first balanced
 * JSON block; no Zod dependency in Deno bundle, we validate by hand).
 */
import { openaiWebSearch } from "../_shared/aiClient.ts";

export type WebSearchResult = {
  text: string;
  citations: { url: string; title: string | null }[];
};

/**
 * Une complétion avec recherche web, via l'API Responses + outil `web_search`
 * (`openaiWebSearch` dans _shared/aiClient). Les anciens modèles
 * `*-search-preview` de Chat Completions ont été retirés par OpenAI
 * (404 model_not_found) : ce chemin les remplace, contrat identique.
 * Jette "openai_unavailable" sans clé, "web-search timeout" au timeout —
 * l'appelant mappe vers 503/504.
 */
export async function webSearchComplete(
  system: string,
  userMsg: string,
  opts: { timeoutMs?: number } = {},
): Promise<WebSearchResult> {
  const r = await openaiWebSearch(system, userMsg, { timeoutMs: opts.timeoutMs });
  return { text: r.text, citations: r.citations };
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
