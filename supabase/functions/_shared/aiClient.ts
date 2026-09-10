/**
 * Client IA centralisé pour les Edge Functions (Deno). Port de
 * `lib/ai/client.ts` (CosmetWiki web).
 *
 * Stratégie provider : OpenAI gpt-4o-mini en primaire pour tout (texte +
 * vision), Mistral en fallback. Tous les appels passent ici pour centraliser :
 * sélection du modèle, timeout, fallback, cache, logging.
 *
 * Clés lues via Deno.env : OPENAI_API_KEY, MISTRAL_API_KEY. Le client
 * service-role (logs + cache) provient de auth.ts -> serviceClient().
 */
import OpenAI from "openai";
import { serviceClient } from "./auth.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");

/** Modèles - inchangés vs web. */
export const AI_MODEL = "gpt-4o-mini";
/**
 * Modèle utilisé pour les recherches web.
 *
 * ⚠️ Les modèles `*-search-preview` (Chat Completions + `web_search_options`)
 * ont été RETIRÉS par OpenAI : depuis début septembre 2026 l'API répond
 * `404 model_not_found — has been deprecated`. Tous les appels web-search
 * passent donc désormais par l'API **Responses** avec l'outil `web_search`
 * (`openaiWebSearch` ci-dessous), disponible sur les modèles standards.
 */
export const AI_MODEL_SEARCH = "gpt-4o-mini";
export const MISTRAL_MODEL = "mistral-small-latest";
// Modèle dédié à l'analyse de cohérence "Promesses vs Formule" (2 passes :
// extraction + critique). gpt-4o-mini n'est pas assez fiable sur l'anti-
// invention et le mapping INCI ; gpt-4.1 suit les consignes bien mieux.
// Basculer sur "gpt-4o" si l'account n'a pas accès à gpt-4.1.
export const AI_MODEL_COHERENCE = "gpt-4.1";

export const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

let _openai: OpenAI | null = null;
export function openai(): OpenAI {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  if (!_openai) _openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  return _openai;
}

export function hasOpenAI(): boolean {
  return Boolean(OPENAI_API_KEY);
}

export function hasMistral(): boolean {
  return Boolean(MISTRAL_API_KEY);
}

export type WebSearchCitation = { url: string; title: string | null };

/** Résultat brut d'un appel web-search (texte + sources + usage tokens). */
export type WebSearchRaw = {
  text: string;
  citations: WebSearchCitation[];
  tokensIn: number | null;
  tokensOut: number | null;
};

/**
 * Un appel de recherche web via l'API Responses d'OpenAI (`tools:[web_search]`).
 *
 * Remplace l'ancien `chat.completions.create({ model: "*-search-preview",
 * web_search_options })`, mort depuis le retrait des modèles search-preview.
 * Contrat conservé à l'identique pour les appelants : on renvoie le texte du
 * message et les `url_citation` extraites des annotations.
 *
 * Jette `openai_unavailable` sans clé, `web-search timeout` au timeout, et
 * `web-search http_<code>` sur erreur API (l'appelant mappe vers 503/504/500).
 */
export async function openaiWebSearch(
  system: string,
  userMsg: string,
  opts: {
    timeoutMs?: number;
    model?: string;
    searchContextSize?: "low" | "medium" | "high";
    maxOutputTokens?: number;
  } = {},
): Promise<WebSearchRaw> {
  if (!OPENAI_API_KEY) throw new Error("openai_unavailable");

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model ?? AI_MODEL_SEARCH,
        instructions: system,
        input: userMsg,
        tools: [
          { type: "web_search", search_context_size: opts.searchContextSize ?? "medium" },
        ],
        tool_choice: "auto",
        ...(opts.maxOutputTokens ? { max_output_tokens: opts.maxOutputTokens } : {}),
      }),
      signal: ctl.signal,
    });
  } catch (err) {
    if (ctl.signal.aborted) throw new Error("web-search timeout");
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`web-search http_${res.status}: ${detail.slice(0, 300)}`);
  }

  type OutContent = {
    type?: string;
    text?: string;
    annotations?: Array<{ type?: string; url?: string; title?: string }>;
  };
  const json = (await res.json()) as {
    output?: Array<{ type?: string; content?: OutContent[] }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  let text = "";
  const citations: WebSearchCitation[] = [];
  const seen = new Set<string>();
  for (const item of json.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      text += part.text ?? "";
      for (const a of part.annotations ?? []) {
        if (a.type !== "url_citation" || !a.url || seen.has(a.url)) continue;
        seen.add(a.url);
        citations.push({ url: a.url, title: a.title ?? null });
      }
    }
  }

  return {
    text,
    citations,
    tokensIn: json.usage?.input_tokens ?? null,
    tokensOut: json.usage?.output_tokens ?? null,
  };
}

export type AIFeature =
  | "synthesis"
  | "ocr"
  | "typo"
  | "categorize"
  | "coherence"
  | "validate"
  | "product_search"
  | "explain"
  | "parse_inci"
  | "compare"
  | "routine_conflicts"
  | "routine_organize"
  | "goals_coverage"
  | "face_scan";

export type AIProvider = "openai" | "mistral" | "tesseract" | "cache";

type LogEntry = {
  feature: AIFeature;
  provider: AIProvider;
  status: "success" | "fallback" | "error";
  /** Modèle exact (ex. "gpt-4o-mini+web_search") → coût précis côté admin. */
  model?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  duration_ms?: number | null;
  user_id?: string | null;
};

/** Log fire-and-forget vers cosme_check.ai_logs. Ne casse jamais le flux. */
export function logAI(entry: LogEntry): void {
  try {
    const sb = serviceClient();
    void sb
      .schema("cosme_check")
      .from("ai_logs")
      .insert({
        feature: entry.feature,
        provider: entry.provider,
        status: entry.status,
        model: entry.model ?? null,
        tokens_in: entry.tokens_in ?? null,
        tokens_out: entry.tokens_out ?? null,
        duration_ms: entry.duration_ms ?? null,
        user_id: entry.user_id ?? null,
      })
      .then(() => undefined);
  } catch {
    // ne jamais laisser le logging casser le flux réel
  }
}

/** Hash SHA-256 hex d'une chaîne (clé de cache). Remplace le hash Node web. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Lookup cache. Renvoie le payload `result` mis en cache ou null. */
export async function getCached<T = unknown>(cacheKey: string): Promise<T | null> {
  try {
    const sb = serviceClient();
    const { data } = await sb
      .schema("cosme_check")
      .from("ai_cache")
      .select("result")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (!data) return null;
    // Compteur de hits (fire-and-forget) → alimente le « cache hit rate » admin.
    void sb
      .schema("cosme_check")
      .rpc("cosme_check_bump_ai_cache_hit", { p_key: cacheKey })
      .then(() => undefined);
    return data.result as T;
  } catch {
    return null;
  }
}

export async function setCached(cacheKey: string, result: unknown): Promise<void> {
  try {
    const sb = serviceClient();
    await sb
      .schema("cosme_check")
      .from("ai_cache")
      .upsert({ cache_key: cacheKey, result }, { onConflict: "cache_key" });
  } catch {
    // ignore - un cache miss est acceptable
  }
}

/**
 * Appel Mistral minimal (fallback texte). Renvoie le contenu du 1er choix.
 * Utilisé par les `fallback` de callWithFallback.
 */
export async function mistralChat(opts: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" | "text" };
}): Promise<string> {
  if (!MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY missing");
  const res = await fetch(MISTRAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: opts.model ?? MISTRAL_MODEL,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.topP !== undefined ? { top_p: opts.topP } : {}),
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mistral error ${res.status}: ${body}`);
  }
  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}

/**
 * Encapsule un appel OpenAI avec timeout + try/fallback. Le caller fournit
 * une fonction `primary` async et un `fallback` optionnel. Les erreurs,
 * timeouts et rate limits déclenchent le fallback.
 */
export async function callWithFallback<T>(opts: {
  feature: AIFeature;
  userId?: string | null;
  /** Modèle OpenAI primaire (défaut gpt-4o-mini) → coût précis côté admin. */
  model?: string;
  primary: () => Promise<{ value: T; tokensIn?: number; tokensOut?: number }>;
  fallback?: () => Promise<{ value: T; provider: AIProvider }>;
  timeoutMs?: number;
}): Promise<T> {
  const { feature, primary, fallback } = opts;
  const primaryModel = opts.model ?? AI_MODEL;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const t0 = Date.now();

  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race<{ value: T; tokensIn?: number; tokensOut?: number }>([
      primary(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("AI timeout")), timeoutMs);
      }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
    logAI({
      feature,
      provider: "openai",
      status: "success",
      model: primaryModel,
      tokens_in: result.tokensIn ?? null,
      tokens_out: result.tokensOut ?? null,
      duration_ms: Date.now() - t0,
      user_id: opts.userId ?? null,
    });
    return result.value;
  } catch (err) {
    if (!fallback) {
      logAI({
        feature,
        provider: "openai",
        status: "error",
        model: primaryModel,
        duration_ms: Date.now() - t0,
        user_id: opts.userId ?? null,
      });
      throw err;
    }
    try {
      const result = await fallback();
      logAI({
        feature,
        provider: result.provider,
        status: "fallback",
        model: result.provider === "mistral" ? MISTRAL_MODEL : primaryModel,
        duration_ms: Date.now() - t0,
        user_id: opts.userId ?? null,
      });
      return result.value;
    } catch (err2) {
      logAI({
        feature,
        provider: "openai",
        status: "error",
        model: primaryModel,
        duration_ms: Date.now() - t0,
        user_id: opts.userId ?? null,
      });
      throw err2;
    }
  }
}
