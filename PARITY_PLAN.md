I have enough verified ground truth. Writing the plan now.

---

# CosmeCheck Mobile — Definitive Implementation Plan (Web Twin)

**Target:** Expo SDK 54 / RN 0.81.5 / React 19 app at `D:\MesApps\deploy\CosmeCheck-App`, made a functional + design + UX twin of CosmetWiki (`D:\MesApps\deploy\CosmetWiki`), with its **own backend** built as **Supabase Edge Functions** (project ref `rogesnduejmqpxolhbif`), deploy-ready for App Store + Play Store.

**Key verified facts (ground truth):**
- All Expo native deps already installed (camera 17, image-picker 17, image-manipulator 14, blur, linear-gradient, haptics, svg 15.12, reanimated 4.1 + worklets, gesture-handler 2.28, bottom-sheet 5.2, @expo-google-fonts/inter, crypto). **No new RN libs strictly required.**
- **`@react-navigation/bottom-tabs` and `@expo/vector-icons` are USED but NOT declared in `package.json`** — must be added explicitly (currently resolving transitively = fragile, will break EAS builds).
- **No `supabase/functions` directory exists yet** — all Edge Functions are net-new.
- The real credit RPC is **`cosme_check_consume_credit`** (NOT `cosme_check_use_credit`).
- Web `apiGate` is **cookie-based** — it will reject mobile Bearer tokens as-is. This is the single biggest architectural blocker.
- `app.json`, icons, splash, scheme `cosmecheck`, bundle ids `com.cosmecheck.app`, iOS usage strings, Android CAMERA/VIBRATE perms already present.
- Mobile `constants/colors.ts` and `spacing.ts` already mirror web tokens but are **missing rating `ink` chip-text colors, `accentDark #6D28D9`, gradient stops, and blob colors**.

---

## 1. Design-Token Spec (React Native)

### 1.1 Color tokens — additions to `constants/colors.ts`

The existing `colors` object is correct for base/accent/neu/glass. Add the following (do **not** rewrite the file — extend it):

```ts
// rating: add `ink` (dark chip text) + `soft` aliases to each rating to match web triplets
rating: {
  vert:   { text: '#16A34A', bg: '#DCFCE7', soft: '#DCFCE7', ink: '#14532D', DEFAULT: '#16A34A' },
  jaune:  { text: '#CA8A04', bg: '#FEF9C3', soft: '#FEF9C3', ink: '#713F12', DEFAULT: '#CA8A04' },
  orange: { text: '#EA580C', bg: '#FFEDD5', soft: '#FFEDD5', ink: '#7C2D12', DEFAULT: '#EA580C' },
  rouge:  { text: '#DC2626', bg: '#FEE2E2', soft: '#FEE2E2', ink: '#7F1D1D', DEFAULT: '#DC2626' },
},

accentDark: '#6D28D9',  // web accentDark (was missing)

// Blob/donut fills (IngredientBlob) — DISTINCT from rating chips
blob: { vert: '#A3D26C', jaune: '#F6CE5A', orange: '#F49B43', rouge: '#E0432A' },
blobShadow: {            // neumorphic per-slice colored drop shadows
  vert: 'rgba(123,176,67,0.70)', jaune: 'rgba(214,165,44,0.68)',
  orange: 'rgba(214,118,40,0.68)', rouge: 'rgba(190,52,28,0.68)',
},
blobText: { vert: '#84B043', jaune: '#D4A017', orange: '#E07F2C', rouge: '#C73523' },

// HalfDonut (separate component) — HARD palette, NOT blob palette
halfDonut: { vert: '#10B981', jaune: '#FBBF24', orange: '#F97316', rouge: '#F43F5E', empty: '#E5E7EB' },

// Spectrum squares (analyse) palette
spectrum: { vert: '#10B981', jaune: '#FBBF24', orange: '#FB923C', rouge: '#F43F5E', empty: '#E5E7EB' },

// Verdict (PROMESSES) tone palette — single source of truth
verdict: {
  tenue:        { DEFAULT: '#10B981', soft: '#ECFDF5', ring: '#A7F3D0', text: '#047857' },
  partielle:    { DEFAULT: '#FBBF24', soft: '#FFFBEB', ring: '#FDE68A', text: '#B45309' },
  marketing:    { DEFAULT: '#FB923C', soft: '#FFF7ED', ring: '#FED7AA', text: '#C2410C' },
  non_demontree:{ DEFAULT: '#F43F5E', soft: '#FFF1F2', ring: '#FECDD3', text: '#BE123C' },
  contredite:   { DEFAULT: '#DC2626', soft: '#FEF2F2', ring: '#FCA5A5', text: '#991B1B' },
},

textSelection: 'rgba(244,63,94,0.20)',  // TextInput selectionColor
```

### 1.2 Gradient tokens — new `constants/gradients.ts`

RN gradients use `colors[]` + `start`/`end` (not CSS angles). Conversion table: `135deg`/`145deg` → `start{x:0,y:0} end{x:1,y:1}`; `to-r` → `{0,0.5}→{1,0.5}`; `to-b` → `{0,0}→{0,1}`; `to-br` → `{0,0}→{1,1}`; `to-bl` → `{1,0}→{0,1}`; `to-tr` → `{0,1}→{1,0}`.

```ts
export const gradients = {
  neuBtnPrimary:  { colors: ['#9b6ef5', '#7c3aed'], start: {x:0,y:0}, end: {x:1,y:1} },
  roseCta:        { colors: ['#F43F5E', '#EC4899'], start: {x:0,y:0}, end: {x:1,y:0.5} }, // rose-500→pink-500
  roseCtaSoft:    { colors: ['#FB7185', '#F472B6'], start: {x:0,y:0}, end: {x:1,y:0.5} }, // 400 variant
  fab:            { colors: ['#FB7185', '#EC4899'], start: {x:0,y:0}, end: {x:1,y:1} }, // rose-400→pink-500
  darkGlass:      { colors: ['#1F2937', '#111111', '#0A0A0A'], start: {x:0,y:0}, end: {x:1,y:1} },
  gradientText:   { colors: ['#8b5cf6', '#ec4899', '#f97316'], start: {x:0,y:0}, end: {x:1,y:1} },
  advisorCard:    { colors: ['#6C3FD8', '#4F46E5', '#7C3AED'], locations: [0,0.55,1], start:{x:0,y:0}, end:{x:1,y:1} },
  promessesCard:  { colors: ['#D6F5D6', '#E8FAE8', '#C8F0C8'], locations:[0,0.5,1], start:{x:0,y:0}, end:{x:1,y:1} },
  bottomNavPill:  { colors: ['rgba(255,228,230,0.85)', 'rgba(255,209,220,0.75)'], start:{x:0,y:0}, end:{x:0,y:1} }, // #FFE4E6/85→#FFD1DC/75
  ratingVert:     { colors: ['#10B981','#22C55E','#14B8A6'], start:{x:0,y:0}, end:{x:1,y:1} },
  ratingJaune:    { colors: ['#FBBF24','#EAB308','#FB923C'], start:{x:0,y:0}, end:{x:1,y:1} },
  ratingOrange:   { colors: ['#F97316','#EA580C','#EF4444'], start:{x:0,y:0}, end:{x:1,y:1} },
  ratingRouge:    { colors: ['#EF4444','#E11D48','#DB2777'], start:{x:0,y:0}, end:{x:1,y:1} },
  verdictDonutTrack: { colors: ['#FB7185','#E11D48'], start:{x:0,y:0}, end:{x:1,y:1} },
  verdictDonutFill:  { colors: ['#34D399','#059669'], start:{x:0,y:0}, end:{x:1,y:1} },
} as const;
```

`gradient-text` and the Logo "Check" word require **MaskedView + LinearGradient** (add `@react-native-masked-view/masked-view`). FAB/cards use `expo-linear-gradient` directly.

### 1.3 Shadow tokens — extend `constants/shadows.ts`

RN renders **one** drop shadow per View (iOS) + `elevation` (Android). Strategy per surface:

| Surface | iOS approach | Android |
|---|---|---|
| `card` | `shadowColor:'#0F172A', shadowOpacity:0.05, shadowRadius:3, shadowOffset:{0,1}` | `elevation:2` |
| `glassCard` | use largest web shadow only: `shadowColor:'#0F172A', shadowOpacity:0.18, shadowRadius:32, shadowOffset:{0,16}` + fake inset top: 1px top border `rgba(255,255,255,0.95)` | `elevation:8` |
| `glassPill` | `shadowColor:'#0F172A', shadowOpacity:0.16, shadowRadius:11, shadowOffset:{0,8}` | `elevation:6` |
| `darkGlass` (CTA) | `shadowColor:'#0F172A', shadowOpacity:0.45, shadowRadius:28, shadowOffset:{0,22}` | `elevation:12` |
| `searchFocus` | `shadowColor:'#F43F5E', shadowOpacity:0.18, shadowRadius:16, shadowOffset:{0,6}` | `elevation:8` |
| `fab` | `shadowColor:'#F43F5E', shadowOpacity:0.55, shadowRadius:11, shadowOffset:{0,8}` | `elevation:14` |
| `bottomNavPill` | `shadowColor:'#F43F5E', shadowOpacity:0.25, shadowRadius:12, shadowOffset:{0,10}` | `elevation:10` |
| **neumorphic** (`neu`) | already solved in `NeuCard.tsx` via **dual nested Views** (outer light `#FFFFFF` top-left, inner dark `#C5CCD6` bottom-right) | `elevation` fallback — keep as-is |

> RN 0.76+/Expo SDK 54 supports the CSS-string `boxShadow` style prop allowing **multiple** shadows on iOS. Optionally use it for `glassCard`/active-nav-pill to get closer multi-shadow fidelity; keep the single-shadow fallback for Android.

The existing `neuShadows.raised/pressed` pairs and `NeuCard` dual-View stack are **kept**. Add tinted-neu variants (rose/amber/emerald/orange/violet) as props on `NeuCard`.

### 1.4 Radii — `constants/spacing.ts` (already correct)

`sm:8, md:12, lg:16, xl:20, card:24, full:9999`. Add `pill:28` (web `rounded-[28px]` GLASS_PILL_CARD). Glass big panels = `card`(24); inner articles = `lg`(16).

### 1.5 Typography (already correct)

Inter 400/500/600/700 via `@expo-google-fonts/inter` (loaded in `_layout.tsx`). Single family for body + display. No display font. Keep `typography.ts`. Set `TextInput selectionColor={colors.textSelection}` globally.

### 1.6 Animations — `constants/motion.ts` (new)

Reanimated 4 easings to match web keyframes; gate all on `AccessibilityInfo.isReduceMotionEnabled()`:

| Web animation | RN |
|---|---|
| `reveal` (translateY 20→0, opacity, 900ms) | `withTiming({duration:900, easing: Easing.bezier(0.16,1,0.3,1)})` |
| `stagger-up` (12→0, 520ms, --stagger-delay) | same easing, 520ms, `withDelay(index*delay)` |
| `blob-pop` (scale 0.55→1 overshoot, 720ms) | `Easing.bezier(0.34,1.56,0.64,1)`, 720ms, scale+opacity |
| score/donut ring 0→value (3500ms ease-out-cubic) | mobile uses **~1100-1500ms** (faster on phone), `Easing.out(Easing.cubic)` |
| synthesis typewriter ~3.5s | Reanimated/`setInterval` char reveal |

### 1.7 Assets to copy

| Source (web) | Dest (mobile) | Used by |
|---|---|---|
| `D:\MesApps\deploy\CosmetWiki\public\image\petiteImage\potion.webp` | `assets/images/potion.webp` | TipCarousel |
| `D:\MesApps\deploy\CosmetWiki\public\image\petiteImage\portion2.webp` | `assets/images/advisor-illustration.webp` (already present — verify it's this asset) | Advisor card |
| `D:\MesApps\deploy\CosmetWiki\public\image\petiteImage\promesse.webp` | `assets/images/promesse-illustration.webp` (already present — verify) | Promesses card |
| `D:\MesApps\deploy\CosmetWiki\public\icon-192.png` / `icon.png` / `apple-icon.png` | reconcile with existing `assets/images/icon.png`, `adaptive-icon.png`, `splash.png`, `favicon.png` | store icons |

Already present in mobile assets: `advisor-illustration.webp`, `promesse-illustration.webp`, `tip-illustration.webp`, `icon.png`, `adaptive-icon.png`, `splash.png`, `favicon.png`. **Action:** verify the three illustrations match the web source visually; only the **potion.webp** (TipCarousel) is confirmed missing and must be copied. **The pastel BackgroundGlow** should be baked as a single static PNG/WEBP exported from web (cheaper than runtime blur on large gradient Views) and placed at `assets/images/bg-glow.webp`.

---

## 2. Edge Functions Backend (Supabase, ref `rogesnduejmqpxolhbif`)

**Why Edge Functions (not the Next.js routes):** mobile holds a Supabase JWT, not a cookie. Web `apiGate` reads cookies and will reject Bearer tokens. Two paths exist; **we adopt Path A as the long-term target, with Path B as an unblock-only stopgap:**

- **Path A (target):** Port each protected route to a Supabase Edge Function (Deno) that validates the JWT from the `Authorization: Bearer` header, reuses the `cosme_check` schema + RPCs, holds `OPENAI_API_KEY`/`MISTRAL_API_KEY` as Supabase secrets, and calls `cosme_check_consume_credit` server-side. Mobile calls via `supabase.functions.invoke(name, { body })` (JWT auto-attached).
- **Path B (stopgap, P0 only):** Add Bearer-token acceptance to the existing Next.js routes (read `Authorization` header, verify via `supabase.auth.getUser(token)`) so scan/analyse can light up **before** Edge Functions land. Retire once Path A functions deploy.

### 2.1 Shared modules (`supabase/functions/_shared/`)

- `cors.ts` — CORS headers + OPTIONS preflight.
- `auth.ts` — `getUserFromRequest(req)`: extract Bearer, `createClient` with the user token, `getUser()`, 401 helper.
- `gate.ts` — port of `lib/apiGate.ts`: (1) auth, (2) `rpc('cosme_check_check_rate_limit', {p_key:'burst:'+ip, p_max, p_window_sec})`, (3) `rpc('cosme_check_consume_credit', {p_feature})`. Returns `{ok,user,supabase,consumeCredit}` + 429 payload `{error, credits:{used,limit,remaining:0}}` with `Retry-After`.
- `aiClient.ts` — port of `lib/ai/client.ts`: `callWithFallback` (OpenAI primary via `npm:openai`, Mistral fallback via fetch), `logAI` → `ai_logs`, `getCached`/`setCached` → `ai_cache` (SHA-256 via `crypto.subtle`). Model names unchanged: `gpt-4o-mini`, `gpt-4o-mini-search-preview`, `mistral-small-latest`.
- `sanitize.ts` — `stripLongDashes`, `NO_LONG_DASHES_RULE`.
- Pure-TS ports (no DOM): `inciParser`, `coherence/engine`, `coherence/claims`, `essentiel/engine`, `routine/engine`, `euAllergens`. These are shared between functions and the mobile bundle where appropriate.

### 2.2 Edge Functions to build

| # | Function | Replaces | Input | Output | AI / keys | Credit | Notes |
|---|---|---|---|---|---|---|---|
| 1 | **analyser** | POST /api/analyser | `{text, withSynthesis:false, productLabel?, brand?, productType?, addToRoutine?, productEan?}` | `AnalyseResponse + {analysisId, addedToRoutine}` | OpenAI+Mistral (parse/validate/split/typo/categorize); RPC `match_inci_batch`,`top_trigram_candidates`,`get/upsert_product_analysis`,`upsert_catalog_product` | 1 (after EAN/idempotency lookup) | Heaviest. `isCleanInciInput` fast-path. Auto-insert `analyses` + optional `routine_items`. |
| 2 | **synthesis** | POST /api/synthesis | `{analysisId}` | `{synthesis}` | OpenAI→Mistral; reads profile+restrictions+analysis | 0 | Lazy, called on detail expand. |
| 3 | **ocr-scan** | POST /api/ocr | `{image_back(b64), image_front?(b64), mimeType}` | `{found,text,uncertain,validation,front}` | OpenAI Vision (bbox-locate + OCR + 2nd pass); RPC `match_inci_batch` | 1 | **No `sharp` in Deno** → client resizes via `expo-image-manipulator` to 1600px JPEG 0.85 before upload; v1 skips server bbox-crop. |
| 4 | **product-by-barcode** | POST /api/product-by-barcode | `{barcode}` | `ProductSearchResult` | OBF+OPF v2 parallel fetch; `searchProductByBarcode` web-search last resort; `upsert_catalog_product` | 0 | IP rate-limit. `/^\d{8,14}$/` server gate. |
| 5 | **product-search** | POST /api/product-search | `{query, exclude?}` | `{results, webCandidates, normalization}` | `normalizeProductQuery`, cascade (catalog/cache/OBF/INCIDecoder/DDG+Mistral), `prevalidateCandidates` | 0 | OPENAI+MISTRAL keys; mode param can fold in product-suggest. |
| 6 | **product-suggest** | GET /api/product-suggest | `?query&page` | `{candidates, hasMore, webCandidates}` | same deps + OBF/INCIDecoder HTTP | 0 | Or merge into #5 with `mode`. Catalog+cache reads can stay client-direct via RPC. |
| 7 | **coherence-analyze** | POST /api/coherence | `{analysis_id, description}` | `{id, result}` | `detectProductType`,`extractPromisesFromDescription`,`exploreOpenPromise`,`generateConclusion`; engine deterministic | 1 (after idempotency) | Inserts `coherence_analyses`. |
| 8 | **compare-insights** | GET /api/compare/insights | `{aId, bId}` | `{portraitA,portraitB,common,howToChoose}` | `generateCompareInsights` (OpenAI→Mistral), sha256 pair cache → `ai_cache` (PROMPT_VERSION 4) | 1 | Ownership check both analyses. |
| 9 | **advisor-chat** | POST /api/advisor/chat | `{messages[]}` | **streamed** `text/plain` | OpenAI stream → Mistral stream fallback; injects profile+restrictions+routine; daily cap via `ai_logs` (30/day) + burst RPC (20/min) | 0 | Deno `ReadableStream` Response; dash-sanitize chunks. |
| 10 | **routine-suggest** | POST /api/routine/suggest | `{userId}` (reload server-side) | `{suggestions:[{text,impact?}], cached}` | `generateRoutineSuggestions`; cache by routine fingerprint | 0 | In-mem rate-limit → use RPC burst instead. |
| 11 | **ingredient-explain** | GET /api/ingredient/[slug]/explain | `{slug}` | `{text, cached}` | `explainIngredient` (OpenAI), permanent cache `ingredient_explanations` | 0 (public) | Cacheable. |
| 12 | **ingredient-exposure** | GET /api/ingredient/[slug]/exposure | `{slug}` | `{personalLine}` | none; RPC `count_ingredient_in_routine`,`count_ingredient_in_history` | 0 | Per-user; anon → null. |
| 13 | **promesse-identify** | POST /api/promesse/identify | `{inci, productLabel?, brand?, productType?}` | `{candidates[], notFound}` | `webSearchComplete`; `ai_cache` | 1 (after cache) | Optional (P5). |
| 14 | **promesse-fetch-description** | POST /api/promesse/fetch-description | `{sourceUrl, candidateName, ...}` | `{description, sourceUrl, persisted}` | `webSearchComplete`; PATCH `analyses` | 1 (after cache) | Optional (P5). |
| 15 | **deep-fetch** | POST /api/deep-fetch | `{url, label?}` | `{ok, ingredientsText, sourceUrl}` | `extractInciFromHtml` (OpenAI→Mistral) | 0 | Optional (P4 search "paste link"). |
| 16 | **ecommerce-scrape** / **incidecoder-fetch** | resp. routes | `{url}` / `{slug}` | INCI | extract (16) / none (17) | 0 | Optional. SSRF guard on ecommerce. |

### 2.3 Called directly from RN (NO Edge Function)

Via `supabase-js` (RLS/anon): `cosme_check_search`, `cosme_check_search_catalog`, `cosme_check_browse_subcategory`, `cosme_check_get_credits`, `cosme_check_consume_credit` (where charged client-side as a fallback), `cosme_check_get_ingredient`, `cosme_check_products_for_ingredient`, `daily_picks` read, `submit_feedback`/`get_feedback_status`; direct SELECT/UPDATE/DELETE on `analyses`, `routine_items`, `coherence_analyses`, `user_profiles`, `ingredients`. **Web-only ops kept on Next:** `/api/health`, `/api/indexnow`, `/api/contact`.

### 2.4 Secrets to set

`supabase secrets set OPENAI_API_KEY=… MISTRAL_API_KEY=…` (`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are auto-injected into Edge Functions). Verify exposed schema includes `cosme_check` and all listed RPCs are granted to `authenticated`/`anon` as appropriate.

---

## 3. Feature-Parity Matrix

| Web feature | Mobile status | Build to reach parity |
|---|---|---|
| **Design system** (colors/spacing/typography/shadows, NeuCard, GlassCard, ColorBadge, BackgroundGlow, Reveal, IngredientBlob, Logo) | DONE (mostly) | Add rating `ink`/gradient/blob/verdict tokens; tinted Neu/Glass variants; dark-glass CTA; gradient-text via MaskedView; bake bg-glow asset |
| **Auth** (email/pw, Google PKCE, reset) | DONE | none |
| **Onboarding** (3-step wizard + autosave) | DONE | none |
| **Dashboard greeting** (static "Bonjour {firstName} 👋") | STUB (time-based) | Replace `getGreeting()` with static; add hairline divider |
| **Dashboard wavy-underline subtitle** | MISSING | RN-SVG `<Path d="M5,11 Q100,-3 195,11 Q100,7 5,11 Z" fill="#8b5cf6">` under measured word |
| **TipCarousel** (rotating, potion img, dots, 10s autorotate) | STUB (single static tip) | Build FlatList/pager carousel; copy potion.webp; port `lib/tips.ts` |
| **LastAnalysisCard** (half-donut + "% sans pénalité" leaf pill) | STUB (full-circle MiniDonut + /20 + chip) | Wire existing `IngredientBlob` (md), PenaltyPill, remove MiniDonut/score |
| **RoutineCard** (cumulative half-donut + penalty pills) | STUB (count + avg) | Aggregate `result_json.counts` across routine items; render blob + pills |
| **Advisor / Promesses promo cards** (gradient + bleed image) | STUB (plain icon cards) | LinearGradient cards + illustrations + chips |
| **DailyPicksCard quiz** (bottom slot) | MISSING | P6/optional; needs daily-picks read (no Edge Fn) |
| **Bottom nav rose pill + active frosted pink pill** | PARTIAL (flat bar) | Rework `BottomTabBar` to floating rose-gradient pill; active = `#FFD1DC` dual-shadow pill behind icon |
| **Décode FAB** (camera + "Décode" label, white ring, opens scan) | PARTIAL (icon only, navigates to tab) | Add label + camera icon + ring; open ScanSheet modal + credits guard |
| **Floating Advisor button** (gold sparkle dark circle) | MISSING | Optional absolute View above bar, hidden on /advisor |
| **Burger drawer** (all 7 nav + credits + premium + logout) | MISSING | RN Modal + Reanimated translateX slide; reuse CreditsPill |
| **ScanSheet** (5 modes) | STUB (() => null) | @gorhom/bottom-sheet, 4 tabs (Photo/Barcode/Search/Manual) |
| **BarcodeScanner** | STUB | expo-camera CameraView + barcode gate + haptics + viewfinder; call product-by-barcode Edge Fn |
| **PhotoOcrFlow** | STUB | camera/picker + image-manipulator resize + ocr-scan Edge Fn; review TextInput; **no Tesseract fallback on RN** |
| **ManualInciInput** | STUB | multiline + live count |
| **runAnalysis / useAnalysis** | STUB (throws/"bientôt") | Implement `analyser.ts` (Edge Fn or Path B), credit refresh, storage cache |
| **lib/storage/session** | STUB (throws) | AsyncStorage pending-INCI + analyse cache TTL |
| **AnalyseResultPanel** (TitleBar, Essentiel, BigScore, RestrictionWarning, PenaltyStrip, Spectrum, Observations, Synthesis, Items) | STUB (all null) | Build all; reuse IngredientBlob; port engine.ts |
| **EssentielView** (3 cards) | STUB | Port `essentiel/engine.ts` verbatim; render verdict/positives/concerns |
| **VerdictGauge** (5-pastille) | STUB (wrong spec = numeric arc) | Build **5-pastille** to match web; discard numeric-arc spec |
| **IngredientSpectrum** (top5/top10 squares, tap-scroll) | STUB (wrong spec = segmented bar) | Build **positional squares** to match web |
| **HalfDonut** (simple stroked) | MISSING | Port fresh (separate palette) — only if a screen needs it |
| **History list** | DONE (title search only) | Add ingredient-token search; compare-select mode; rename/delete action sheet; promise CTA |
| **Analysis detail** (`analyse/[id]`) | STUB (placeholder) | Load row + enrich dbColors + render panel |
| **Ingredient detail** (`ingredient/[slug]`) | STUB (placeholder) | RPC get_ingredient + products; stat cards; ExplainIngredient (explain+exposure Edge Fns) |
| **Routine engine** (`exposure.ts`) | STUB (wrong matin/soir model) | Port `lib/routine/engine.ts` verbatim (daily/weekly/monthly) |
| **Routine CRUD** (useRoutine) | DONE | none |
| **Routine screen** (gauge, tag bars, simulation, AI, add flow) | STUB (read-only list) | Build stat cards, TagExposureBar, RoutineProductCard (swipe), AddProductModal, SimulationModal, routine-suggest Edge Fn |
| **PROMESSES list** | DONE (basic) | Recompute tenuePct on read; delete action sheet; "+ Nouvelle" |
| **PROMESSES wizard** (`nouvelle`) | STUB | 3-step RN wizard → coherence Edge Fn (+ analyser for paste branch) |
| **PROMESSES detail** (`[id]`, 8 cards) | STUB | Port types/engine/claims; build 8 cards + animated donut |
| **Beauty Advisor chat** | STUB (() => null + placeholder) | Build streaming chat (`expo/fetch` or advisor-chat Edge Fn) |
| **Compare** | STUB (placeholder) | Port `compare.ts`; ExposureBar; AI via compare-insights Edge Fn |
| **Profile edit** (BeautyProfileForm) | EXISTS but unmounted | Wire into profile screen / `/profile/edit` |
| **Restrictions add-by-search** | STUB ("Bientôt") | ilike search + family picker |
| **Credits pill / useCredits** | DONE | none |
| **Credits-exhausted modal** | MISSING | Build RN Modal triggered on 429 from Edge Fns; Premium upsell |
| **Offre page** | DONE | none |

---

## 4. Ordered Implementation Plan (Phases & Workstreams)

Each workstream (WS) is sized for one agent. Acceptance = `npm run typecheck` clean + listed unit/manual checks.

### P0 — Foundations (no dependencies; run in parallel)

- **WS-0.1 Design tokens.** Extend `colors.ts` (rating ink/soft, accentDark, blob/halfDonut/spectrum/verdict/blobShadow/blobText, textSelection); add `gradients.ts`, `motion.ts`; extend `shadows.ts`; add `pill:28` radius. Add `@react-native-masked-view/masked-view`. Bake `bg-glow.webp` from web BackgroundGlow; copy `potion.webp`.
  - *Accept:* typecheck; render a token gallery screen showing every gradient/shadow/rating chip; visual diff vs web screenshots.
- **WS-0.2 Dependency hygiene.** Add explicit deps: `@react-navigation/bottom-tabs`, `@expo/vector-icons`, `@react-native-masked-view/masked-view`. Run `npx expo install --fix`.
  - *Accept:* `npx expo-doctor` passes; `npx expo prebuild --clean` succeeds locally (or EAS build cloud).
- **WS-0.3 Pure-logic ports (shared TS).** Port to mobile `lib/`: `inciParser` (computeScore/scoreLabel), `essentiel/engine.ts`, `routine/engine.ts` (replace bad `exposure.ts`), `euAllergens`, `coherence/{types,engine,claims}.ts`, `inciCommonNames`, `categoryLabel`, `lib/tips.ts`. Implement `lib/storage/session.ts` (AsyncStorage). These are framework-agnostic.
  - *Accept:* typecheck; **unit tests** (Jest, add `jest-expo`): `computeScore` matches web fixtures (golden inputs→outputs); `computeRoutineMetrics` matches web numbers for a sample routine; `computeMetrics`/`unifiedScore` (coherence) match web fixtures; verdict tone thresholds.
- **WS-0.4 Edge Functions scaffold + secrets + `_shared`.** Create `supabase/functions/_shared/{cors,auth,gate,aiClient,sanitize}.ts`. Set `OPENAI_API_KEY`/`MISTRAL_API_KEY` secrets. Deploy a `health` test function. Verify `cosme_check` exposed + RPC grants.
  - *Accept:* `supabase functions deploy health`; `supabase.functions.invoke('health')` returns 200 from a logged-in mobile session.
- **WS-0.5 (stopgap) Bearer auth on Next routes** — *only if P1 must start before P2 functions land.* Add `Authorization: Bearer` acceptance to `/api/analyser`, `/api/ocr`, `/api/product-by-barcode`. Retire after P2.
  - *Accept:* curl with a real Supabase access token returns a valid AnalyseResponse.

### P1 — Backend access layer + analyser wiring (depends: P0.3, P0.4)

- **WS-1.1 Deploy `analyser` Edge Function** (#1). Port full pipeline.
  - *Accept:* invoke with a clean INCI list → AnalyseResponse with correct score/counts; row inserted in `analyses`; credit decremented; 429 on exhaustion returns the credits payload.
- **WS-1.2 Implement `lib/analysis/analyser.ts` + `hooks/useAnalysis.ts`.** `runAnalysis()` invokes the Edge Fn (or Path B), `getAnalysisById()` reads `analyses`, `deleteAnalysis()`. react-query mutation; on success invalidate `['credits',uid]` + cache pending INCI. Define `CreditExhaustedError/NetworkError/ApiError`.
  - *Accept:* typecheck; from a dev screen, paste INCI → returns analysisId; offline → NetworkError; exhausted → CreditExhaustedError.
- **WS-1.3 Credits-exhausted modal.** RN Modal listening to a global event/error path → "Découvrir Premium" → `/offre`.
  - *Accept:* simulate 429 → modal shows.

### P2 — Core verticals (depend: P1)

- **WS-2.1 Analyse result panel.** Build `AnalysisResultPanel` + `EssentielView` + `VerdictGauge` (5-pastille) + `IngredientSpectrum` (positional squares) + `ProductRow` + `BigScoreCard` (IngredientBlob) + `PenaltySummaryStrip` + `ObservationsCard` + `SynthesisCard` (lazy → `synthesis` Edge Fn, typewriter) + `RestrictionWarning`. Implement `analyse/[id].tsx` (load + enrich dbColors). Deploy `synthesis` Edge Fn (#2).
  - *Accept:* typecheck; render a fixture AnalyseResponse → matches web layout order; tap spectrum square scrolls to ingredient; synthesis streams; reduce-motion disables animations. Snapshot test for EssentielView from engine output.
- **WS-2.2 Scan vertical.** Deploy `ocr-scan` (#3) + `product-by-barcode` (#4). Build `ScanSheet` (bottom-sheet, 4 tabs), `BarcodeScanner`, `PhotoOcrFlow` (image-manipulator resize before upload), `ManualInciInput`. Wire `ScanFAB` → open ScanSheet modal + credits guard.
  - *Accept:* scan a real EAN → product found → analyse; photo of a back label → OCR text in review → analyse; manual paste → analyse; camera permission denied → settings CTA.
- **WS-2.3 Navigation chrome.** Rework `BottomTabBar` into floating rose-gradient pill; active frosted-pink pill behind icon; switch Routine icon → layers, Promesses → document-text/custom. Add FAB "Décode" label + ring. Build burger drawer (Modal + Reanimated slide, all 7 nav + credits + Premium + logout). Optional floating Advisor button.
  - *Accept:* visual diff vs web; drawer slides 220ms, closes on backdrop/route change; logout works; safe-area insets respected.

### P3 — Dashboard twin (depends: P0.1, P0.3, P1.2)

- **WS-3.1 Home dashboard rewrite** (`(tabs)/index.tsx`): static greeting + divider; wavy-underline subtitle (RN-SVG); TipCarousel; LastAnalysisCard (half-donut + leaf pill); RoutineCard (aggregate counts + penalty pills); gradient Advisor + Promesses promo cards. Extend routine query to sum `result_json.counts`.
  - *Accept:* visual diff vs web; blob renders md; pull-to-refresh; no time-based greeting.

### P4 — Routine + History + Ingredient + Compare (depend: P0.3, P2.1)

- **WS-4.1 Routine screen.** Use `routine/engine.ts`; stat cards (exposure gauge via IngredientBlob, produits actifs, pénalisants); `TagExposureBar`; `RoutineProductCard` (gesture-handler swipe-delete + frequency segments → useRoutine); `AddProductModal` (history pick / scan); `RoutineSimulationModal`; allergen pills; AI suggestions via `routine-suggest` Edge Fn (#10).
  - *Accept:* exposure numbers match web for a fixture routine; add/remove/frequency mutate + refetch; simulation gated on removableCount>0.
- **WS-4.2 History enhancements.** Ingredient-token search; compare-select mode (max 2, replace-oldest) → `/compare?ids=`; rename/delete action sheet (direct RLS calls); per-row promise CTA.
  - *Accept:* search by ingredient name finds rows; select 2 → navigate; rename/delete persist.
- **WS-4.3 Ingredient detail** (`ingredient/[slug]`). RPC `get_ingredient` + `products_for_ingredient` (Promise.race timeout); hero/rating chip; stat cards; breakdown bars; functions; translations; products. `ExplainIngredient` → deploy `ingredient-explain` (#11) + `ingredient-exposure` (#12), fire both in parallel.
  - *Accept:* loads a known slug; explain shows text (+ "depuis cache"); exposure callout shows when present.
- **WS-4.4 Compare screen.** Port `lib/routine/compare.ts`; ExposureBar + counts row; flagged/family grouping (primaryFunction fallback v1); hero/portraits/common/howToChoose; deploy `compare-insights` (#8); A/B highlight (blue/fuchsia) via Text spans.
  - *Accept:* two ids render side-by-side; AI block soft-fails on error; portraits highlight names.

### P5 — PROMESSES + Advisor (depend: P0.3 coherence ports, P2.1)

- **WS-5.1 PROMESSES wizard + list + detail.** Deploy `coherence-analyze` (#7). Build wizard (`nouvelle`), recompute-on-read list, 8-card detail (animated donut, bar chart, table accordions, marketing index, conclusion, position chart, keywords, out-of-scope). Use ported `coherence/{types,engine,claims}`.
  - *Accept:* run a coherence analysis → detail renders all cards; tenuePct recomputes on read; verdict colors match `verdict` tokens.
- **WS-5.2 Beauty Advisor chat.** Build `AdvisorChat` (profile gate, suggestion chips, markdown, typing dots). Streaming via **`expo/fetch`** to `advisor-chat` Edge Fn (#9) with Bearer; buffer-accumulate plain text.
  - *Accept:* streaming tokens append live; 429 daily-cap / 503 surface FR error bubble; profile-incomplete shows gate.
- **WS-5.3 (optional) Promesse identify/fetch-description** (#13/#14) + PromesseFlowModal quick-entry.

### P6 — Profile completeness + polish (depend: P0)

- **WS-6.1 Profile edit** (wire BeautyProfileForm/SkinProfileCard into profile screen). **Restrictions add-by-search** (ilike + family picker). Optional DailyPicksCard quiz on dashboard.
  - *Accept:* edit skin profile persists; add/remove restriction works.

### P7 — Store readiness (depends: all functional phases)

- **WS-7.1** App icons/splash/adaptive-icon finalization, app.json review, EAS config, builds, store metadata. (See §5.)

**Dependency graph:** P0 → {P1} → {P2, P3} → {P4, P5} → P6 → P7. P3 can start once P1.2 lands. P0 workstreams are fully parallel.

---

## 5. Store-Readiness Checklist

### app.json / config
- [ ] **Add explicit deps** `@react-navigation/bottom-tabs`, `@expo/vector-icons`, `@react-native-masked-view/masked-view` (build-breaking gap today).
- [ ] Bump `version` per release; add iOS `buildNumber` + Android `versionCode` (managed by EAS auto-increment).
- [ ] `userInterfaceStyle: "light"` ✓ (locked — matches web light-only).
- [ ] iOS `infoPlist`: `NSCameraUsageDescription` ✓, `NSPhotoLibraryUsageDescription` ✓. Add `ITSAppUsesNonExemptEncryption: false` to skip export-compliance prompt.
- [ ] Android `permissions: ["CAMERA","VIBRATE"]` ✓. Confirm no extra perms leak from libs (run `expo prebuild` and inspect `AndroidManifest.xml`); strip unused.
- [ ] `scheme: "cosmecheck"` ✓ — ensure Supabase Auth **Redirect URLs** include `cosmecheck://` and the Expo dev proxy (`https://auth.expo.io/...`) for Google OAuth.
- [ ] Add `expo-camera`, `expo-image-picker` config plugins explicitly if prebuild needs them (SDK 54 auto-links, but pin permission strings via plugin props for clarity).

### Icons / splash
- [ ] `icon.png` 1024×1024 (no alpha for iOS). Verify reconciliation with web `icon-192/icon/apple-icon`.
- [ ] `adaptive-icon.png` (Android foreground) + `backgroundColor #FAFAFA` ✓.
- [ ] `splash.png` `resizeMode: contain`, bg `#FAFAFA` ✓. Consider migrating to `expo-splash-screen` plugin config (SDK 54 prefers plugin over top-level `splash`).
- [ ] `favicon.png` (web export) ✓.

### EAS
- [ ] `eas.json` with `development`/`preview`/`production` profiles; `production` → store builds, `autoIncrement: true`.
- [ ] `eas build:configure`; iOS credentials (Apple Developer account, bundle `com.cosmecheck.app`); Android keystore (EAS-managed).
- [ ] **Env:** `EXPO_PUBLIC_*` are inlined at build time — ensure `eas build` runs with the same `.env` (or EAS env vars). Anon key is public (fine to ship); **never** ship OpenAI/Mistral keys (they live in Supabase secrets only).
- [ ] `eas submit` for both stores; TestFlight + Internal Testing track first.

### Store metadata / compliance
- [ ] Privacy policy + terms URLs (camera/photo data usage; AI processing of ingredient lists; account data). Required by both stores.
- [ ] App Privacy nutrition label (iOS): declare camera, account email, usage analytics if any.
- [ ] Google Data Safety form (Android).
- [ ] Screenshots per device class (6.7"/6.5" iPhone, 12.9" iPad if supportsTablet — currently `false`, so phone-only; Android phone).
- [ ] Age rating (likely 4+/Everyone; no UGC sharing).
- [ ] **Payments:** Offre CTA is disabled ("Bientôt") — no IAP needed yet, so no StoreKit/Billing review risk. When payments land, must use **StoreKit/Play Billing** (not external web checkout) for digital subscriptions.
- [ ] Account deletion path (Apple requirement for apps with accounts) — add a "Supprimer mon compte" action (Supabase user delete) in Profile before iOS submission.

### Pre-submit QA gates
- [ ] `npm run typecheck` clean across the repo.
- [ ] Jest unit suite green (engine parity fixtures from P0.3).
- [ ] Manual smoke on physical iOS + Android: auth → onboarding → scan (barcode + photo) → analyse → routine add → promesse → advisor → compare → ingredient detail → logout.
- [ ] Reduce-motion + large-text accessibility pass.
- [ ] Reanimated 4 / New Architecture build verified on device (not just Expo Go — use a dev client / EAS build).

---

### Critical risks flagged for agents
1. **Bearer-vs-cookie auth** is the gating blocker — resolve in P0.4 (Edge Functions) or P0.5 (stopgap) before any AI vertical.
2. **No `sharp` in Deno** — OCR resizing must happen client-side (`expo-image-manipulator`) before upload.
3. **Missing package.json deps** (`bottom-tabs`, `vector-icons`) will break EAS production builds even though Expo Go works.
4. **Two stub specs are wrong** and must be discarded: mobile `VerdictGauge` (numeric arc → use 5-pastille), mobile `IngredientSpectrum` (segmented bar → use positional squares), mobile `routine/exposure.ts` (matin/soir → use daily/weekly/monthly engine), mobile `coherence` compat types (→ port real `lib/coherence/types.ts`).
5. **RN streaming** for advisor needs `expo/fetch` (SDK 54) — default `fetch` `body.getReader()` is unreliable.

**Relevant verified paths:** mobile root `D:\MesApps\deploy\CosmeCheck-App`; web root `D:\MesApps\deploy\CosmetWiki`; new backend dir to create `D:\MesApps\deploy\CosmeCheck-App\supabase\functions\` (or co-locate in CosmetWiki repo — recommend a dedicated `supabase/` in the mobile repo to keep the mobile backend independent of the web deployment, per the stated goal).