# CosmeCheck App — Contexte projet

App mobile Expo / React Native qui décrypte les compositions cosmétiques (INCI). Twin mobile du web `cosme-check.com`. Backend Supabase.

---

## Stack

- **Expo SDK 54 + RN 0.81** (TS strict, alias `@/*` → racine, **typedRoutes** activé).
- **expo-router** (file-based, dossier `app/`).
- **Supabase JS 2** : auth + DB schéma `cosme_check` + Edge Functions Deno.
- **@tanstack/react-query 5.100** + **react-query-persist-client** + **query-async-storage-persister** (cache persisté AsyncStorage, 7j).
- **expo-image** pour les images produits (cache memory+disk).
- **react-native-svg** (anneaux/donuts), **react-native-reanimated** (anim).
- Style : `StyleSheet.create()` partout, tokens via `constants/*`. PAS de NativeWind.

---

## Layout

```
app/                          # expo-router
  (auth)/  (onboarding)/  (tabs)/{index,routine,scan,history,promesses}
  analyse/[id]  ingredient/[slug]  compare/  promesses/{[id],nouvelle}
  profile/{index,restrictions}  advisor/  offre/  legal/{cgu,privacy,mentions,about}
components/
  analysis/  promesses/  routine/  history/  scan/  advisor/  compare/  home/  ingredient/
  design/      # primitives (WhiteCard, NeuCard, GlassCard, BackgroundGlow, IngredientBlob)
  navigation/  shared/  onboarding/  profile/  auth/  legal/{LegalScreen}
constants/    # colors, typography, spacing, gradients, motion, routes, shadows
hooks/        # useAuth, useProfile, useCredits, useRoutine, useAnalysis
lib/
  supabase/   # client.ts (db()), types.ts (Database)
  analysis/ coherence/ essentiel/ routine/ inci/ ai/ blob/ skin/ dailyPicks/
  storage/    # session, cacheCore, queryPersist, aiCache
  credits/ categoryLabel.ts euAllergens.ts inciCommonNames.ts tips.ts
  __tests__/  # tests Jest (env node, logique pure)
supabase/
  functions/  # 16 Edge Functions Deno
  migrations/ # SQL versionné (appliqué via MCP ou Dashboard)
```

---

## Supabase (essentiel)

- Schéma **`cosme_check`** (PostgREST exposé). Accès via `db()` (= `supabase.schema('cosme_check')`) dans `lib/supabase/client.ts`.
- RPCs **publiques** appelées via `supabase.rpc(...)`, préfixées `cosme_check_*`.
- **Project ID** : `rogesnduejmqpxolhbif`.
- Env : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

### Tables clés (schéma `cosme_check`)
- `user_profiles(id, first_name, tier, preferences jsonb)` — `preferences` contient `skin`, `onboardingShown`, `restrictions`.
- `analyses(id, user_id, name, product_label, score, result_json, brand, product_type, …)`.
- `routine_items(id, user_id, analysis_id, frequency)`.
- `coherence_analyses`, `user_credits`, `daily_picks`, `idempotency`, `rate_limits`, `error_log`, `catalog`, `ingredients`, `ingredient_families`.

### Trigger inscription
`on_auth_user_created_cosmetwiki` → `cosme_check.handle_new_user()` insère `user_profiles(id, first_name)` avec ON CONFLICT DO NOTHING. **N'altère pas** `preferences` (donc `onboardingShown=false` au démarrage, correct).

### Cron jobs actifs (NE PAS recréer)
- `cosme_check_cleanup_idempotency` — **chaque heure** (TTL 24h)
- `cosme_check_cleanup_rate_limits` — chaque 15 min (TTL 1h)
- `cosme_check_cleanup_ai_logs` — 03:00 UTC (TTL 30j)
- `cosme_check_cleanup_error_log` — 03:05 UTC (TTL 14j)

### RPCs maison utilisées par l'app
- `cosme_check_get_credits` — retourne le solde du jour (latest `daily_limit` de `user_credits`, fallback 60).
- `cosme_check_consume_credit(p_feature)` — débit.
- `cosme_check_get_routine_tags(p_limit)` — **NEW juin 2026** : projection routine compacte pour `advisor-chat` (évite 360 KB de `result_json`). Guard `jsonb_typeof = 'array'` obligatoire (v2 après bug "cannot extract from scalar").
- `cosme_check_search_catalog(p_query, p_limit, p_offset)` — **réécrite 11 juin 2026** : plpgsql, prédicats positifs `LIKE '%token%'` par token (un AND par mot) servis par l'index GIN trigram `catalog_search_unaccent_trgm` sur `lower(f_unaccent(brand||' '||name))`. **Insensible casse + accents + ordre** (wrapper immuable `cosme_check.f_unaccent`). Tri `score DESC, count_total DESC` (le `word_similarity` a été retiré : il recalculait par ligne → +1–1,4 s sur les requêtes larges). **~40 ms à chaud vs 2 224 ms avant** (seq scan). NE garder qu'UNE surcharge 3-args. Retourne `ingredients_text` (utilisé direct par la sélection produit pour éviter un 2ᵉ fetch).
- `cosme_check_get_ingredient(p_slug)`, `cosme_check_products_for_ingredient`, `cosme_check_upsert_catalog_product`, `cosme_check_check_rate_limit`, etc.

### Edge Functions Deno (`supabase/functions/`)
analyser, advisor-chat, coherence-analyze, compare-insights, deep-fetch, ecommerce-scrape, health, ingredient-explain, ingredient-exposure, ocr-scan, product-by-barcode, product-search, product-suggest, promesse-fetch-description, promesse-identify, routine-suggest, synthesis.

---

## Auth (audité juin 2026, fonctionnel)

- **Email + password** : `lib/auth/session.ts:signUp/signIn` → trigger DB crée le profil → `SignUpForm` route vers ONBOARDING.
- **Google OAuth (PKCE)** : `lib/auth/google.ts` via `expo-web-browser` + `signInWithOAuth({provider:'google'})`. Redirect URL `cosmecheck://`. **22 users prod en Google sur 43 total** (preuve fonctionnement).
- **Confirm email = OFF** côté Supabase (V1, simplification). Le bug `emailRedirectTo` pointant vers `/reset-password` est inerte tant que c'est désactivé.
- **Redirect URLs Supabase** : `cosmecheck://`, `cosmecheck://**` ✓ + URLs web pour `cosme-check.com`.
- **Google Cloud OAuth Client (Web)** : `https://rogesnduejmqpxolhbif.supabase.co/auth/v1/callback` autorisé ✓.
- **Distinction nouveau/existant** : `needsOnboarding = !onboardingShown && !isProfileComplete` (`_layout.tsx`). Marche pour les 2 providers.
- ⚠️ **Apple Sign-In MANQUANT** — Apple Guideline 4.8 exige Apple Sign-In dès qu'il y a Google. **Bloqueur App Store** (Play OK).

---

## Performance — caches actifs (NE PAS doublonner)

### AsyncStorage local — purge auto au boot via `CacheJanitor` (`app/_layout.tsx`)
| Clé | Contenu | TTL |
|---|---|---|
| `cosmecheck:analysis_cache` | `AnalyseResponse` keyed by id | 24h |
| `cosmecheck:analysis_row_cache` | `AnalysisRow` complet | 24h |
| `cosmecheck:ai-cache:ingredient-explain` | texte LLM explain | **30j** |
| `cosmecheck:ai-cache:ingredient-exposure` | ligne perso | 1h |
| `cosmecheck:ai-cache:compare-insights` | insights couple A→B | **30j** |
| `cosmecheck:ai-cache:routine-suggest` | suggestions IA, clé = hash routine | 24h |
| `cosmecheck:react-query-cache` | persister RQ | 7j |
| `cosmecheck:pending_inci/source/product_name` | INCI en attente (resume après crash) | — |
| `cosmecheck:last_analysis_id` | shortcut dashboard | — |
| `cw:dailyPicks:<YYYY-MM-DD>` | progrès quotidien quiz | rotation journalière |

### React Query persister
- Module `lib/storage/queryPersist.ts` : predicate `shouldDehydrateQuery` filtre `success` only + blacklist `['profile','credits','ingredient-explain','compare-insights','routine-suggest','catalog-search']`. (`catalog-search` = résultats recherche, transients staleTime 60 s, ajouté 11 juin 2026.)
- `QUERY_PERSIST_MAX_AGE_MS = 7j`, `QUERY_PERSIST_BUSTER = 'cosmecheck-rq-v1'` (bumper si types changent).
- `gcTime` du QueryClient aligné sur `MAX_AGE_MS` (sinon caches GC'd avant rechargement).

### Cache serveur (Edge Functions)
- ⚠️ **`Deno.openKv()` est INDISPONIBLE sur le runtime Supabase Edge** (prouvé 11 juin 2026 : `typeof Deno.openKv !== 'function'`). Tout le code KV best-effort (`product-by-barcode/lib/barcodeCache.ts`) **dégrade silencieusement → 0 cache, toujours MISS**. Le `X-Cache: HIT` de `product-by-barcode` **ne se déclenche jamais** en réalité. Pour un vrai cache cross-user : table Postgres, PAS Deno KV.
- `catalog` table — upsert depuis OBF/OPF (cache cross-instance permanent).
- `idempotency` table — TTL 24h, purge cron.
- **Recherche catalogue** : pas de cache serveur dédié — la RPC trigram (~40 ms) + le **buffer cache Postgres** (garde les requêtes populaires chaudes en RAM, partagé entre users) suffisent. Edge Function `catalog-search` testée puis ABANDONNÉE (KV indispo, voir ci-dessus).

### Dérivations client-side (au lieu de fetch)
- Dashboard `RoutineSummary` : dérivé de `useRoutine()` via `summarizeRoutine(items)`. Pas de 2e select sur `routine_items`.
- Compare `routineOverlapSlugs` : dérivé de `useRoutine()`. Plus de fetch routine dans `load()`.
- `daily_picks` : `queryKey: ['dailyPicksCatalog']` (stable, sans date) + `select: pickTodaysItems(rows)` — catalogue persisté 24h, rotation pure client.

### Patterns React Query par écran
- Profil : `staleTime 10 min`
- Routine, dashboard last-analysis, history : `60s` (refetch onMount, ok)
- Crédits : `60s` (blacklist persister, toujours frais)
- Ingrédient (fiche INCI) : `staleTime 24h, gcTime 24h`
- Ingredient products : `staleTime 1h, gcTime 1h`

---

## Légal / compliance stores (juin 2026)

### Éditeur (rempli dans le code)
- **Brian-Clarky BIENDOU**, Entrepreneur individuel
- Adresse : 5 Bis rue Vestrepain, 31100 Toulouse
- SIRET : 919 153 189 00015 | SIREN : 919 153 189
- RCS Toulouse : 919 153 189
- TVA intra : FR33919153189
- Code APE/NAF : 8559B
- Email : contact@cosme-check.com

### Écrans légaux (`app/legal/`)
- `cgu.tsx`, `privacy.tsx`, `mentions.tsx`, `about.tsx` (avec avertissement médical + version app via `expo-constants`).
- Composant partagé : `components/legal/LegalScreen.tsx`.
- Routes : `ROUTES.LEGAL.{CGU,PRIVACY,MENTIONS,ABOUT}`.
- Liens depuis `app/profile/index.tsx` (section "Informations légales" + disclaimer médical inline).

### app.json — permissions OK
- iOS : `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `ITSAppUsesNonExemptEncryption: false`.
- Android : `CAMERA`, `VIBRATE`.
- Plugins `expo-camera` + `expo-image-picker` avec strings FR.

### Bloqueurs avant submission
- 🔴 **Apple Sign-In** à implémenter (Guideline 4.8 — Apple uniquement).
- 🟠 Privacy Policy hostée publiquement sur `cosme-check.com/privacy` (Apple Connect exige URL en plus de l'in-app).
- 🟠 Domaine `cosme-check.com` à acheter si pas fait + email `contact@` actif.
- 🟠 D-U-N-S Number gratuit pour s'inscrire Apple Developer en "Organization" (recommandé pour afficher "Cosme Check" comme éditeur store) — https://developer.apple.com/enroll/duns-lookup/.

---

## RevenueCat (en cours, SDK pas encore branché)

- Project "Cosme Check" créé.
- **Framework à choisir** : Expo (pas React Native).
- **Install** : `npx expo install react-native-purchases` (PAS `-ui`).
- **Entitlement** : renommer `Cosme Check Pro` → **`premium`** dans le dashboard RC pour matcher `user_profiles.tier`.
- **Paywall** : garder `app/offre/index.tsx` (UI custom, matche design system), NE PAS utiliser `RevenueCatUI.presentPaywall()`.
- Sandbox API key déjà fournie.
- **Encore à faire** :
  1. `Purchases.configure({apiKey})` au boot dans `_layout.tsx`.
  2. Brancher CTA du paywall sur `Purchases.purchasePackage(pkg)`.
  3. Edge Function webhook RC → flip `user_profiles.tier = 'premium'` quand `INITIAL_PURCHASE`/`RENEWAL`/`CANCELLATION`.
  4. Côté `offre/index.tsx` : lire `?fromOnboarding=1`, afficher bouton "Plus tard" → `TABS.HOME`. **Paywall obligatoire skippable** (Apple §3.1.1).

---

## Design system

- Tokens dans `constants/*` uniquement. Pas de couleurs hardcodées.
- Inter (`fontFamilies.{regular,medium,semiBold,bold}`), `typography.h1..h4`, body, small, xs, button.
- Cartes :
  - **`WhiteCard`** = défaut nouvelles UI (analyse, offre, legal). Fond blanc opaque + drop shadow.
  - `NeuCard` : neumorphisme (routine, dashboard original).
  - `GlassCard` : glassmorphisme — **plus utilisé** dans `components/analysis/*`.
- Couleurs clés : `rose` (#F43F5E), `roseDeep` (#E11D48), `accent` (#8B5CF6 — **éviter** en hero premium, fait "AI"), `rating.{vert,jaune,orange,rouge}.{DEFAULT,bg,text,ink}`.
- Hero offre Premium : fond crème uni `#FDF6EC` + badge blanc bordure rose. **PAS** de gradient rose→violet.

---

## Patterns récurrents

### En-tête commun des 4 onglets
`components/shared/ScreenHeader.tsx` : titre h3 + `CreditsPill` à droite + filet `#c5ccd6`. `paddingRight: 36` réserve la place du menu 3-points. **Sticky** hors ScrollView.

### Menu hamburger
`components/navigation/BurgerMenu.tsx` : 3 points verticaux (icône `MoreVerticalIcon`), drawer droite, CreditsPill + upsell Premium + sign-out.

### Restrictions
`RestrictionWarning` (rose) et `RestrictionsOkBadge` (vert) basculés dans `AnalysisResultPanel` selon `restrictedItems.length`.

### Promesses (onglet `/promesses`)
Anneau circulaire SVG (rayon 23, stroke 5, rotation -90°). Seuils : ≥80 vert, ≥60 orange, ≥35 ambre, <35 rose. Long-press 350 ms → suppression.

### Flow Scan (refactor majeur — pas de tabs, chaque mode = UI dédiée)
1. FAB dans `BottomTabBar` → `ScanMethodSheet` (bottom sheet, 5 options : barcode, photo, manual, link badge NEW, search).
2. → `navigation.navigate('scan', { mode })` → `app/(tabs)/scan.tsx` route DIRECTEMENT vers la bonne UI plein écran (PAS de tabs segmentées en haut).
3. Chrome partagé : **`components/scan/ScanFrame.tsx`** (X close gauche + titre centré, thèmes `light` ou `dark`).
4. Mapping :
   - `barcode` → `BarcodeScanner` caméra plein écran (close X blanc semi-transparent overlay).
   - `photo` → `PhotoOcrFlow` dans `ScanFrame theme="dark"` (#0B0B0F). 2 photos Devant (option) + Dos. `ocr-scan` reçoit `image_back` + optional `image_front`, renvoie texte INCI + metadata front (marque/nom auto pré-remplis).
   - `link` → `PasteLinkFlow` dans `ScanFrame` light. 4 étapes : input URL → fetching → preview (image/marque/nom/INCI) → confirm. Edge Function `ecommerce-scrape`.
   - `manual` → `ManualInciInput` dans `ScanFrame` light. Textarea + nom + compteur live `parseInciList`.
   - `search` → `ProductSearchMode` dans `ScanFrame` light (voir ci-dessous).
5. Tous aboutissent à `launch(source, inci, extra?)` → `runAnalysis()` → `router.replace('/analyse/[id]')`.
6. **`RunAnalysisParams.source`** = `'barcode' | 'ocr' | 'search' | 'manual' | 'link'`. `RunAnalysisParams.sourceUrl` + `imageUrl` propagés pour link et search.

### ProductSearchMode (catégories + recherche + recherche approfondie)
`components/scan/ProductSearchMode.tsx` — 4 vues dans un seul composant :
1. **Grille catégories** (défaut) : 12 catégories du catalogue, icônes Ionicons monochrome (Coiffure→`cut-outline`, Maquillage→`color-palette-outline`, …). RPC `cosme_check_get_category_counts` cachée 1h.
2. **Sous-catégories** (tap sur catégorie) : tri par count décroissant.
3. **Browse produits** (tap sur sous-catégorie) : grille paginée 24/page via `cosme_check_browse_subcategory`.
4. **Search results** (`query.length ≥ 2`, debounce 350 ms) : RPC `cosme_check_search_catalog` (trigram indexé, insensible casse/accents/ordre) **wrappée dans `queryClient.fetchQuery`** (clé normalisée via `lib/catalog/searchCache.ts`, `staleTime 60s`) → recherche équivalente retapée = 0 appel DB côté appareil.

**Recherche approfondie internet (MANUELLE, 1 crédit) — 11 juin 2026** : on ne lance PLUS la cascade `product-suggest` (OBF/INCIDecoder/OpenAI/DDG) automatiquement (protège les quotas API à grande échelle). Quand le catalog est vide → bouton « 🌐 Recherche approfondie sur internet ». Au tap : `cosme_check_consume_credit('deep_search')` → si `ok` appelle `product-suggest` + invalide `['credits']` ; si épuisé → carte upsell Premium (`/offre`). Machine à états `DeepState` = `idle → running → done | no_credit | error`. Section résultats "**TROUVÉ SUR INTERNET**" (badge globe, fond violet pastel) inchangée.

Breadcrumb "Catégories › X › Y", barre recherche sticky en haut.

### PromesseFlowModal — flow auto "Analyser la promesse"
`components/promesses/PromesseFlowModal.tsx` — `Modal presentationStyle="pageSheet"` ouverte au tap "Voir l'analyse de la promesse" depuis `/analyse/[id]`. State machine :
1. `identifying` → `promesse-identify` (LLM trouve candidats produits internet).
2. `pickCandidate` → liste avec marque/nom/hostname/% confiance.
3. `fetchingDescription` → `promesse-fetch-description` (scrape + LLM extrait promesse).
4. `manualPromise` (fallback si notFound) → textarea min 30 / max 4000 chars.
5. `runningCoherence` → `coherence-analyze` `{ analysis_id, description }` → `{ id, result }`.
6. `redirecting` → `router.push('/promesses/[id]')`.
7. `error` → retry + fallback wizard manuel `/promesses/nouvelle`.

### Synthèse IA — lazy (au tap "Voir l'analyse complète")
- `lib/analysis/analyser.ts` envoie `withSynthesis: false` par défaut → analyser ne génère PAS la synthèse.
- `AnalysisResultPanel` reçoit `analysisId` en prop. `useEffect` : quand `detailsExpanded` passe à `true` ET `result.synthesis` est null ET non-tenté → invoke `synthesis` Edge Function.
- `SynthesisCard` affiche spinner + "Génération de la synthèse personnalisée…" pendant l'appel.
- Edge Function persiste dans `result_json.synthesis` → re-visite = instant.
- **Crédit : 0** côté Edge Function (à revoir si on veut faire payer).

### Image produit (cache 3 niveaux — pas de colonne DB)
- `lib/storage/productImageCache.ts` :
  - `cacheProductImage(analysisId, url)` — TTL 30j, max 500 entrées.
  - `getProductImage(analysisId)` — instant.
  - `resolveAndCacheProductImage(analysisId, brand, name)` — fallback catalog : si miss → 1 appel RPC `cosme_check_search_catalog` (trigram indexé) → cache → 0 appel ensuite.
- Propagation `imageUrl` depuis `ProductSearchMode` / `PasteLinkFlow` jusqu'au cache après `runAnalysis` succès.
- `AnalyseDetailScreen` lit via `resolveAndCacheProductImage(id, state.brand, state.productLabel)` au montage → pass à `AnalysisResultPanel.productImageUrl` → `BigScoreCard.imageUrl`.
- `expo-image cachePolicy="memory-disk"` sur le rendu → binaire local persistant.

### Cache row analyse
`AnalyseDetailScreen` lit `getCachedAnalysisRow(id)` d'abord, fallback `getAnalysisById(id)`, puis `cacheAnalysisRow(row)`. Invalidé par `invalidateCachedAnalysisRow(id)` après rename/delete dans `history.tsx`.

---

## Tests

- **286 tests, 27 suites** (au 11 juin 2026). Lancer : `npx jest --config jest.config.js --no-coverage`.
- Env **node** (pas RN). Tests dans `lib/__tests__/`.
- Logique pure extraite pour testabilité :
  - `lib/storage/cacheCore` (TTL, purge)
  - `lib/storage/queryPersist` (predicate persister)
  - `lib/catalog/searchCache` (normalisation clé casse/accents/ordre + dédoublonnage fetchQuery)
  - `lib/storage/aiCache` (hash routine, namespaces, round-trip via AsyncStorage mocké)
  - `lib/routine/summary` (dashboard)
  - `lib/routine/compareOverlap` (compare)
  - `lib/dailyPicks/select` (déterminisme rotation)
  - `components/ingredient/loadState` (dérivation état IngredientDetail)
  - `supabase/functions/advisor-chat/routineNormalize` (forme RPC ↔ legacy)
- Mocks `AsyncStorage` via `jest.mock('@react-native-async-storage/async-storage', ...)`.

---

## Commands

```bash
npx tsc --noEmit                                   # typecheck (doit être 0 erreur)
npx jest --config jest.config.js --no-coverage     # tests
npx expo install <pkg>                             # ajouter dep (versions Expo-compatibles)
npx expo run:ios                                   # dev natif (requis pour RC, expo-image, etc.)
supabase functions deploy <name>                   # deploy edge function spécifique
```

Migrations DB : via Supabase MCP `apply_migration` (avec `name` snake_case + `query`). Toujours `list_migrations` + `list_tables` avant DDL.

---

## Outils MCP

- **Supabase MCP** : `execute_sql` (lecture), `apply_migration` (DDL), `get_advisors` (security/perf), `list_migrations`, `list_tables`. Project `rogesnduejmqpxolhbif` = prod ; toujours confirmer avant DDL.

---

## Avertissements DB connus (advisors Supabase, juin 2026)

- 🔴 RLS désactivée sur `rate_limits`, `idempotency`, `error_log` — **intentionnel** (accès server-role uniquement). Si on veut nettoyer l'advisor : `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` sans policy (deny-all équivalent à l'état actuel).
- 🟠 `cleanup_*` functions executables par anon/authenticated — à `REVOKE EXECUTE FROM anon, authenticated` (cron tourne en `postgres`, ça ne casse rien).
- Beaucoup d'autres WARN sur `search_path` mutable et SECURITY DEFINER exposés — pré-existants, à traiter en lot à part.

---

## Historique récent (juin 2026)

### Optimisation recherche produits — scalabilité 10k users (11 juin)
- **Phase 1 — Index SQL (déployé prod)** : `cosme_check_search_catalog` faisait un **Parallel Seq Scan sur 405k lignes = 2 224 ms** (index trigram inutilisé : construit sans `lower()` + prédicat `NOT EXISTS(... NOT LIKE)` non-indexable). Réécrite en plpgsql avec prédicats positifs `LIKE '%token%'` par token, index GIN `catalog_search_unaccent_trgm` sur `lower(f_unaccent(brand||' '||name))` → **insensible casse/accents/ordre**, **~40 ms à chaud**. `word_similarity` retiré du tri (recalcul par ligne = +1–1,4 s sur requêtes larges) → tri `score DESC, count_total DESC`. Surcharge 2-args supprimée. Index trigram aussi ajouté sur `product_inci_cache`. Migrations : `search_catalog_use_trgm_index_phase1`, `search_catalog_drop_word_similarity_sort`, `search_catalog_accent_insensitive`.
- **Phase 2 — React Query (client)** : recherche wrappée dans `queryClient.fetchQuery` (`staleTime 60s`), clé normalisée `lib/catalog/searchCache.ts` (casse/accents/ordre). `catalog-search` ajouté au blacklist persister. Tests `lib/__tests__/catalogSearchCache.test.ts` (15, dont preuve dédoublonnage réel).
- **Phase 3 — Recherche approfondie manuelle** : suppression du déclenchement AUTO de `product-suggest`. Bouton manuel + débit 1 crédit (`deep_search`) + upsell Premium si épuisé. Protège les API externes du rate-limit fournisseur.
- **Phase 4 — Cache cross-user** : **Deno KV indisponible sur Supabase Edge** (découverte). Edge Function `catalog-search` testée (rate-limit 30/min OK, mais cache KV = no-op) puis ABANDONNÉE. On reste sur la RPC directe + buffer cache Postgres (cross-user gratuit). Cf. note ⚠️ section "Cache serveur".
- Test obsolète `barcodeFlag.test.ts` corrigé (mode catalog-only). Suite : **286 tests, 27 suites**.

### Refonte scan + UX (3 juin)
- **Scan refactor majeur** : `ScanSheet.tsx` supprimé. `scan.tsx` route directement vers chaque méthode plein écran via `?mode=X`. Pas de tabs segmentées en haut.
- **Nouveau `ScanFrame`** : chrome partagé (X close + titre + thèmes light/dark).
- **`PhotoOcrFlow`** : thème dark sur mobile (#0B0B0F). 2 photos Devant (option, marque/nom) + Dos (obligatoire, INCI). Propagation `brand` + `productName` détectés.
- **`PasteLinkFlow`** : nouveau composant 4 étapes (input/fetching/preview/error). Source `'link'` ajoutée à `RunAnalysisParams.source` + `AnalysisSource` (storage).
- **Edge Function `ecommerce-scrape`** : portée depuis le web (SSRF guard, JSON-LD, meta-tags, LLM extract via GPT primary / Mistral fallback). Cache via `ai_cache` (préfixe `ecommerce-scrape:v1:`). **Déployée en prod** (id `30c77561-…`, version 1).
- **`ProductSearchMode`** : récriture complète. Grille catégories (12 catégories, icônes Ionicons monochrome) + drill-down sous-catégories + browse paginé + fallback internet auto via `product-suggest` avec badge "Trouvé sur internet".
- **`PromesseFlowModal`** : implémentation complète (était un stub spec). Flux auto `promesse-identify` → `promesse-fetch-description` → `coherence-analyze` → redirect. Lié depuis `app/analyse/[id].tsx` au tap "Voir l'analyse de la promesse".
- **Synthèse lazy** : `analyser` envoie `withSynthesis: false`. Génération via `synthesis` Edge Function au tap "Voir l'analyse complète" (avec spinner). Persistée dans `result_json.synthesis` → instant ensuite.
- **Image produit dans BigScoreCard** : nouveau `lib/storage/productImageCache.ts` (AsyncStorage + fallback RPC catalog). Slot 110×110 à gauche, demi-donut 160px à droite. Score numérique et libellé tonal RETIRÉS (à la demande user).
- **`AnalysisResultPanel`** : réorganisation — Synthèse remontée, Liste ingrédients devenue preview qui ouvre une Modal dédiée (avec filtres). Nouvelle prop `analysisId` pour lazy synthesis + `productImageUrl`.
- **Écran d'analyse** : pilule blanche "← Retour" en haut. Titre + chip catégorie pleine largeur. 2 CTA "Voir l'analyse de la promesse" (vert) / "Ajouter à ma routine" (rose). Pilule blanche "Partager + jauge 5 pastilles" plus bas.
- **`VerdictGauge`** : pastilles agrandies (40→52 active, 28→32 inactive), réparties via `flex: 1 + space-between`.
- **`DailyPicksCard`** : quizz/idée reçue du jour sur dashboard. Sélection déterministe (`pickTodaysItems`), progrès AsyncStorage `cw:dailyPicks:YYYY-MM-DD`.
- **Bottom tab bar** : fond blanc opaque (plus de blur/gradient rose), item actif = bulle ronde 40px ombre douce.
- **`WhiteCard`** étendu à : dashboard (TipCarousel, LastAnalysis, Routine), routine (toutes stats), history rows, promesses list, ingredient stats, 9 cartes promesse detail (GlassCard supprimé partout dans analyse + promesse + ingredient/StatCard + home).
- **`SearchBar`** restylée : pilule blanche, drop shadow doux, focus rose, hauteur 48.
- **Historique** : layout reorganisé avec demi-donut 88px + titre + date top-right + CTA outlined "Analyser la promesse" + kebab. Badge score `ColorBadge` retiré (sur demande).
- **Cartes Promesses** : conversion ScrollView (pour section "Trouvé internet" + résultats catalog dans une vue).
- **Pipeline INCI parser confirmé conforme** : Mistral primary → GPT fallback → traditional `parseInciList` → rescue split GPT-4o-mini. Aucune modif nécessaire.
- **Code-barres audit** : déjà 100% conforme web, indépendant cosme-check.com via `product-by-barcode` Edge Function. Pas encore `imageUrl` (à propager côté Edge).

### Audit perf + optimisations (2 juin)
- Cache local `analysis_row_cache` lu par `AnalyseDetailScreen` (TTL 24h, +invalidation rename/delete).
- React Query persister (AsyncStorage, 7j, blacklist `credits`+IA).
- Cache AsyncStorage pour Edge Functions IA : `ingredient-explain` (30j), `ingredient-exposure` (1h), `compare-insights` (30j), `routine-suggest` (24h, clé = hash routine).
- `IngredientDetailScreen` migré vers `useQuery` (staleTime 24h ingrédient + 1h produits).
- Dashboard : `RoutineSummary` dérivé du cache `useRoutine` (suppression 2e select).
- `daily_picks` : queryKey stable `['dailyPicksCatalog']` + `select: pickTodaysItems` client-side.
- Compare : `routineOverlapSlugs` + `buildCompareBonASavoir` purs, branchés sur `useRoutine`.
- `<Image>` RN → `expo-image` sur `BigScoreCard` + `IngredientProductRow` (`cachePolicy="memory-disk"`).
- `CacheJanitor` au démarrage (`clearExpiredCache` + `clearExpiredAiCache` non-bloquants).
- Migration `routine_tags_rpc` appliquée (v2 avec garde `jsonb_typeof`). `advisor-chat` utilise la RPC avec fallback gracieux.
- `product-by-barcode` : cache Deno KV TTL 12h (incluant NOT_FOUND).
- **Skip** : `tips.ts` externalize (gain 5KB sur 10MB, ROI nul). `coherence-analyze` overfetch — false positive (utilisé via `parent.items`).

### Compliance & légal (2 juin)
- 4 écrans légaux créés + composant `LegalScreen` partagé.
- Section "Informations légales" + disclaimer médical inline dans `Profil`.
- Routes `ROUTES.LEGAL.*` ajoutées + screens registered dans `_layout.tsx`.
- Données éditeur réelles injectées (BIENDOU Brian-Clarky, SIRET, RCS, TVA).
- `app.json` permissions caméra/photos déjà conformes (Apple/Play).

### Audit auth (2 juin)
- Flow email + Google validé en prod (43 users, 22 Google).
- Trigger DB confirmé (`handle_new_user`).
- Apple Sign-In identifié comme bloqueur App Store (à faire avant submission iOS).

### Antérieur (mai-juin 2026)
- Headers des 4 onglets harmonisés via `ScreenHeader`.
- Burger menu rond → 3 points verticaux.
- RPC `cosme_check_get_credits` fix (latest `daily_limit`).
- Promesses : refonte cartes anneau SVG.
- Analysis : `GlassCard/NeuCard` → `WhiteCard` partout.
- Hero Premium : gradient rose→violet → fond crème uni.
- Scan FAB → `ScanMethodSheet` bottom sheet.
- Ajout `RestrictionsOkBadge`.
