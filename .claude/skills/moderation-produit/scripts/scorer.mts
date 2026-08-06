// Dry-run scorer: copies parse.ts + score.ts VERBATIM (pure fns) from the repo,
// calls the color RPC read-only, prints score/label/stars. NO writes.
// Usage: node scorer.ts <products.json>   (Node >= 22, TS type-stripping)
// products.json = [{ label, ean, inci }, ...]
import { readFileSync } from "node:fs";

// ───────────────────────── parse.ts (verbatim de analyser/parse.ts) ─────────────────────────
type ParsedToken = { raw: string; normalized: string; position: number };
const STOP_WORDS = new Set(["INGREDIENTS","INGREDIENT","INGRÉDIENTS","INGRÉDIENT","INCI","COMPOSITION","LISTE","INGREDIENTS:","INCI:"]);
const DESCRIPTIVE_PREFIXES: RegExp[] = [/^CERTIFIED\s+ORGANIC\s+/,/^COLD[\s-]+PRESSED\s+/,/^EXTRA\s+VIRGIN\s+/,/^STEAM\s+DISTILLED\s+/,/^FAIR[\s-]?TRADE\s+/,/^WILD[\s-]?CRAFTED\s+/,/^REVERSE\s+OSMOSIS\s+/,/^ISSU\s+DE\s+L'AGRICULTURE\s+BIOLOGIQUE\s+/,/^ORGANIC\s+/,/^NATURAL\s+/,/^NATUREL(LE)?\s+/,/^VEGETABLE\s+/,/^VEGETAL(E)?\s+/,/^VIRGIN\s+/,/^VIERGE\s+/,/^WILD\s+/,/^SAUVAGE\s+/,/^RAW\s+/,/^FRESH\s+/,/^PURE\s+/,/^PURIFIED\s+/,/^PURIFIE(E)?\s+/,/^DISTILLED\s+/,/^DISTILLE(E)?\s+/,/^DEIONIZED\s+/,/^DEMINERALIZED\s+/,/^DEMINERALISE(E)?\s+/,/^FILTERED\s+/,/^FILTRE(E)?\s+/,/^SPRING\s+/,/^IONIZED\s+/,/^BIO\s+/];
function stripDescriptivePrefixes(upper: string): string { let work = upper; let changed = true; while (changed) { changed = false; for (const re of DESCRIPTIVE_PREFIXES) { const next = work.replace(re, ""); if (next !== work && next.trim().length >= 4) { work = next.trim(); changed = true; break; } } } return work; }
const NOISE_PATTERNS: RegExp[] = [/\(F\.?I\.?L\.?\s+[A-Z0-9]+\/?\d*\)/gi,/\(\+\/?\-\)/g,/\(may contain\)/gi,/\(peut contenir\)/gi,/\([A-Z0-9. ]+\d+\/\d+\)/g,/\[\s*\+\/?\-?\s*/g,/\b(?:MAY\s+CONTAIN|PEUT\s+CONTENIR)\s*:?/gi,/\]/g,/\b(?:INGREDIENTS?|INGRÉDIENTS?|INCI|COMPOSITION)\s*:\s*/gi,/^\s*[A-Z0-9]{4,}\s*[-:]\s+/];
function stripAccents(s: string): string { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
const PAREN_ALIAS_RE = /\(([^()]{1,60})\)/g;
function looksLikeAliasContent(inner: string): boolean { const trimmed = inner.trim(); if (!trimmed) return false; if (/[.;:!?]/.test(trimmed)) return false; if (/^CI\s*\d/i.test(trimmed)) return false; if (/^\d/.test(trimmed)) return false; return /^[a-zA-ZÀ-ÿ\s/,'-]+$/.test(trimmed); }
function parseInciList(text: string): ParsedToken[] {
  if (!text) return [];
  let work = text;
  for (const re of NOISE_PATTERNS) work = work.replace(re, " ");
  work = work.replace(PAREN_ALIAS_RE, (_m, inner: string) => looksLikeAliasContent(inner) ? " " : `(${inner})`);
  work = work.replace(/\([^)]{20,}\)/g, " ");
  const hasRealSeparator = /[,;\n]/.test(work);
  if (hasRealSeparator) work = work.replace(/\*+/g, " "); else work = work.replace(/\s*\*+\s*/g, ", ");
  work = work.replace(/(?<=[A-Za-z)])\.\s+(?=[A-Z])/g, ", ");
  work = work.replace(/\.+$/g, " ");
  work = work.replace(/\s+\/\s+/g, ", ");
  work = work.replace(/([A-Za-z][A-Za-z-]*)\/([A-Za-z][A-Za-z-]*)(?![A-Za-z0-9/-]*\s+[A-Za-z])/g, "$1, $2");
  work = work.replace(/(?<=\w)(?:\s+-+\s*|\s*-+\s+)(?=\w)/g, ", ");
  work = work.replace(/(?<=\w)\s*[•·●◆▪]\s*(?=\w)/g, ", ");
  work = work.replace(/\s*[•·●◆▪]\s*/g, ", ");
  const rawParts = work.split(/[,;\n]+/g).map((p) => p.trim()).filter((p) => p.length > 0);
  const tokens: ParsedToken[] = []; let position = 0; const seen = new Set<string>();
  for (const raw of rawParts) {
    const cleaned = raw.replace(/^[\s\-•·]+|[\s\-•·.]+$/g, "").replace(/\s{2,}/g, " ").trim();
    if (!cleaned || cleaned.length < 2 || cleaned.length > 260) continue;
    const upper = stripAccents(cleaned).toUpperCase();
    if (STOP_WORDS.has(upper)) continue;
    if (/^[\d\s\-+%]+$/.test(upper)) continue;
    const normalized = stripDescriptivePrefixes(upper);
    if (seen.has(normalized)) continue; seen.add(normalized);
    tokens.push({ raw: cleaned, normalized, position: position++ });
  }
  return tokens;
}

// ───────────────────────── score.ts (verbatim de analyser/score.ts) ─────────────────────────
type ColorRating = "Vert" | "Jaune" | "Orange" | "Rouge";
type VerdictTone = "very-safe"|"safe"|"caution"|"warning"|"danger"|"high-risk"|"unknown";
const RANK: Record<ColorRating, number> = { Vert: 0, Jaune: 1, Orange: 2, Rouge: 3 };
const UNRANK: Record<number, ColorRating> = { 0: "Vert", 1: "Jaune", 2: "Orange", 3: "Rouge" };
type PastilleResult = { tone: VerdictTone; reason: string; nVert: number; nJaune: number; nOrange: number; nRouge: number; nIdent: number };
function pastilleTone(colored: { color: ColorRating | null; position: number }[], totalInci: number, gate = true): PastilleResult {
  const ident = colored.filter((c): c is { color: ColorRating; position: number } => c.color != null && c.color in RANK).slice().sort((a, b) => a.position - b.position);
  const n = ident.length; let nVert = 0, nJaune = 0, nOrange = 0, nRouge = 0;
  for (const { color } of ident) { if (color === "Vert") nVert++; else if (color === "Jaune") nJaune++; else if (color === "Orange") nOrange++; else if (color === "Rouge") nRouge++; }
  const base = { nVert, nJaune, nOrange, nRouge, nIdent: n };
  if (n === 0 || (gate && totalInci && n / totalInci < 0.5)) return { tone: "unknown", reason: "Trop d'ingrédients non identifiés", ...base };
  if (nOrange === 0 && nRouge === 0) {
    if (nJaune > nVert) return { tone: "caution", reason: `vert/jaune`, ...base };
    if (nJaune === 0) return { tone: "very-safe", reason: `${nVert} verts`, ...base };
    return { tone: "safe", reason: `${nVert}v/${nJaune}j`, ...base };
  }
  const corpsMax = Math.ceil(0.6 * n);
  const zoneOf = (rank1: number) => rank1 <= 5 ? "Tete" : rank1 <= corpsMax ? "Corps" : "Queue";
  let ceiling = 0; let cntRouge = 0, cntOrange = 0; let sgood = 0, stot = 0;
  ident.forEach(({ color }, i) => {
    const z = zoneOf(i + 1); const w = z === "Tete" ? 3 : z === "Corps" ? 2 : 1; stot += w;
    if (color === "Vert") sgood += w; else if (color === "Jaune") sgood += 0.5 * w;
    if (color === "Rouge") { cntRouge++; const cap = z === "Tete" ? 3 : z === "Corps" ? 2 : 1; ceiling = Math.max(ceiling, cap); }
    else if (color === "Orange") { cntOrange++; const cap = z === "Queue" ? 0 : 1; ceiling = Math.max(ceiling, cap); }
  });
  if (cntRouge >= 2) ceiling = Math.max(ceiling, 2);
  if (cntOrange >= 4) ceiling = Math.max(ceiling, 2);
  const ratio = stot ? sgood / stot : 0;
  const comp = ratio >= 0.8 ? 0 : ratio >= 0.55 ? 1 : ratio >= 0.32 ? 2 : 3;
  const compCapped = cntRouge === 0 ? Math.min(comp, 2) : comp;
  const final = Math.max(ceiling, compCapped);
  const reason = `plafond=${UNRANK[ceiling]} compo=${UNRANK[comp]} (ratio ${ratio.toFixed(2)}) ${n}i`;
  if (final === 3) return { tone: cntRouge >= 2 ? "high-risk" : "danger", reason, ...base };
  if (final === 2) return { tone: "warning", reason, ...base };
  if (final === 1) return { tone: "caution", reason, ...base };
  return { tone: "safe", reason, ...base };
}
const BAND: Record<Exclude<VerdictTone, "unknown">, [number, number]> = { "very-safe":[17.0,3.0],"safe":[13.0,3.9],"caution":[9.0,3.9],"warning":[5.0,3.9],"danger":[0.0,4.9],"high-risk":[0.0,2.0] };
function synthScore(p: PastilleResult): number | null { if (p.tone === "unknown") return null; const [b, w] = BAND[p.tone]; const ratio = p.nIdent ? (p.nVert + 0.5 * p.nJaune) / p.nIdent : 0; return Math.round((b + w * ratio) * 100) / 100; }
function scoreLabel(score: number): { label: string; tone: string } { if (score >= 17) return { label: "Très bien", tone: "green" }; if (score >= 13) return { label: "Bien", tone: "green" }; if (score >= 9) return { label: "Moyen", tone: "amber" }; if (score >= 5) return { label: "Faible", tone: "orange" }; return { label: "Faible", tone: "rose" }; }
function starsFromScore(score: number): number { if (score >= 17) return 5; if (score >= 13) return 4; if (score >= 9) return 3; if (score >= 5) return 2; return 1; }

// ───────────────────────── runner ─────────────────────────
const ENV_PATH = process.env.CC_ENV_PATH ?? "c:/Projet/CosmeCheckAdmin/.env";
function readEnv(): { url: string; key: string } {
  const raw = readFileSync(ENV_PATH, "utf8");
  const url = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(raw)![1].trim();
  const key = /SUPABASE_SERVICE_ROLE_KEY=(.+)/.exec(raw)![1].trim();
  return { url, key };
}
async function matchColors(url: string, key: string, tokens: string[]): Promise<{ color_rating: ColorRating | null; position_idx: number }[]> {
  const res = await fetch(`${url}/rest/v1/rpc/cosme_check_match_inci_batch`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_tokens: tokens }) });
  if (!res.ok) throw new Error(`RPC ${res.status}: ${await res.text()}`);
  return res.json();
}
async function main() {
  const { url, key } = readEnv();
  const products = JSON.parse(readFileSync(process.argv[2], "utf8"));
  for (const p of products) {
    const tokens = parseInciList(p.inci ?? "");
    let out: any = { label: p.label ?? p.name, ean: p.ean };
    if (tokens.length === 0) { out.verdict = "INCI non parsable"; console.log(JSON.stringify(out)); continue; }
    const rows = await matchColors(url, key, tokens.map((t) => t.normalized));
    const matches = rows.map((r) => ({ color: r.color_rating, position: (r.position_idx ?? 0) + 1 }));
    const nIdent = matches.filter((m) => m.color != null).length;
    const pastille = pastilleTone(matches, tokens.length, true);
    if (pastille.tone === "unknown") { out.verdict = "REFUSÉ (<50% reconnus)"; out.nIdent = nIdent; out.nTokens = tokens.length; console.log(JSON.stringify(out)); continue; }
    const score = synthScore(pastille) ?? 0;
    const { label } = scoreLabel(score);
    console.log(JSON.stringify({ ...out, nTokens: tokens.length, nIdent, identPct: Math.round(100 * nIdent / tokens.length), score: Number(score.toFixed(2)), scoreLabel: label, stars: starsFromScore(score), nVert: pastille.nVert, nJaune: pastille.nJaune, nOrange: pastille.nOrange, nRouge: pastille.nRouge }));
  }
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
