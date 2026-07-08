# Routine Matin / Soir (mobile) — Implémentation

_Livré le 7 juillet 2026. Chantier rétention._

## But
La routine passe d'une liste plate à deux sections **MATIN** / **SOIR**, avec pour chaque produit : photo, position numérotée, fréquence, bascule de créneau 3 états (matin / matin+soir / soir), et réordonnancement par glisser-déposer. Bouton **Suggestions** ouvrant un chooser : « Réorganiser ma routine » (déterministe) ou « Proposer de meilleures alternatives » (deck IA existant, intact).

`time_of_day` est un axe **d'organisation** : il n'affecte PAS le modèle d'exposition (`lib/routine/engine.ts`, pondéré par fréquence uniquement).

## Base de données
Migration `supabase/migrations/20260707_routine_time_of_day_v1.sql` (appliquée en prod) :
- `routine_items.time_of_day text NOT NULL DEFAULT 'morning' CHECK IN ('morning','evening','both')`
- `routine_items.position int NOT NULL DEFAULT 0`
- backfill `position` = rang `added_at ASC` par user (0..n-1)
- RPC `public.cosme_check_reorder_routine(p_items jsonb)` : mise à jour batch atomique owner-scoped (max 100), `GRANT EXECUTE ... authenticated`.

Additif et non cassant : les inserts existants (web + mobile) continuent grâce aux defaults.

## Fichiers clés
- `lib/routine/organize.ts` (PUR) — moteur déterministe. Table de règles (1ère qui matche gagne) : nettoyant (rank 10, section inchangée), SPF→matin (90, dernier), rétinoïde→soir (60), exfoliant AHA/BHA→soir (55), vitamine C→matin (55), contour yeux (65), huile (80), hydratant (70), sérum (50), inclassable (50). SPF détecté par catégorie/nom **seulement** (jamais les tags filtre-uv seuls). `organizeRoutine`, `computePositions` (positions globales 0..n-1, item `both` = 1 position), `normalizeSectionOrder` (drag intra-section).
- `hooks/useRoutine.ts` — SELECT + `time_of_day,position,brand` ; tri `position ASC, added_at ASC` ; mutations optimistes `setTimeOfDay` et `reorderItems` (RPC) ; `addToRoutine` position = max+1.
- `components/routine/` : `RoutineSectionList` (2 sections + `reorganize()`), `RoutineSection` (drag custom Gesture.Pan sur la poignée + hauteur fixe `ROUTINE_CARD_STEP` + haptics + LinearTransition), `RoutineProductCard` (refonte : badge n°, photo via `useProductImage`, `FrequencySelect` bottom-sheet, `TimeOfDaySwitch`), `RoutineActionsRow`, `SuggestionsChooserSheet`.
- `hooks/useProductImage.ts` — photo produit (cache 3 niveaux via `lib/storage/productImageCache`).

## Décisions
- **1 seule colonne `position` globale** (pas par section) : un item `both` garde le même rang relatif matin/soir.
- **Drag custom** (pas de lib) : hauteur de ligne FIXE obligatoire (calcul d'index = `round(translationY / STEP)`), `scrollEnabled={!dragging}` sur le ScrollView parent, le `FrequencySelect` en Modal supprime l'ancien hack zIndex qui aurait combattu le geste.
- Le deck de suggestions (`openSuggestions`, `routine-smart-suggest`, `routine_suggestions`) est **inchangé**. `deckCache.routineSignature` n'inclut PAS `time_of_day` : réorganiser ne re-débite pas.
- « Réorganiser » ship derrière `flag_routine_reorganize` ; le split MATIN/SOIR ship sans flag (schéma additif).

## Tests
`lib/__tests__/routineOrganize.test.ts` + `routinePositions.test.ts` (26 tests) : règles, priorité nettoyant>exfoliant, item `both`, idempotence, permutation multiset, renumérotation sur doublons.

## Vérification
`npx tsc --noEmit` (0 erreur app) + `npx jest` (verts). QA manuelle : ajout → matin en fin, toggle 3 états (item `both` visible 2×), drag sans snap-back, réorganisation animée persistée après kill/relaunch.
