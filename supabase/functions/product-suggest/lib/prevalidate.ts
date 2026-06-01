// Pre-validation of web candidates before showing them to the user. OpenAI
// Web Search returns URLs to merchant pages that don't always expose the INCI
// list; we extract the INCI in parallel and keep only candidates that have a
// valid one — guaranteeing 100% clickable cards. Port of CosmetWiki
// lib/productSearch/prevalidate.ts. Cost: ~1 fetch + 1 gpt-4o-mini call per
// candidate tested.
import { fetchPageHtml } from "./httpFetch.ts";
import { extractInciFromHtml } from "./extract.ts";
import type { PrevalidatedCandidate, WebCandidate } from "./types.ts";

const PER_CANDIDATE_TIMEOUT_MS = 6000;
const BATCH_SIZE = 8;

export async function prevalidateCandidates(
  candidates: WebCandidate[],
  targetCount: number,
): Promise<{ validated: PrevalidatedCandidate[]; failedUrls: string[] }> {
  const validated: PrevalidatedCandidate[] = [];
  const failedUrls: string[] = [];

  for (let i = 0; i < candidates.length && validated.length < targetCount; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (c) => {
        try {
          const html = await Promise.race([
            fetchPageHtml(c.url),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), PER_CANDIDATE_TIMEOUT_MS),
            ),
          ]);
          if (!html) return { candidate: c, inci: null as string | null };
          const label = [c.brand, c.productName].filter(Boolean).join(" ") || c.title;
          const inci = await extractInciFromHtml({ label, html });
          return { candidate: c, inci };
        } catch {
          return { candidate: c, inci: null as string | null };
        }
      }),
    );
    for (const r of results) {
      if (r.inci) {
        validated.push({ ...r.candidate, ingredientsText: r.inci });
        if (validated.length >= targetCount) break;
      } else {
        failedUrls.push(r.candidate.url);
      }
    }
  }

  return { validated, failedUrls };
}
