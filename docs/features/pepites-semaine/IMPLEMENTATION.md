# Pépites de la semaine — Implémentation

_Livré le 7 juillet 2026._

> **Mise à jour 17 juillet 2026 — rotation QUOTIDIENNE + plancher santé.**
> Les picks ne sont plus figés à la semaine ISO mais **tournent chaque jour**
> (clé `localDayKey`, ex. `2026-07-17`). La graine, la clé React Query, le
> `staleTime` (24 h) et la rotation des needs par défaut passent tous du
> `weekKey` au `dayKey` → produits différents chaque jour, toujours
> déterministes dans la journée. Ajout d'un **plancher santé**
> `minCappedScore = 13` dans `selectWeeklyPicks` (via `useWeeklyPicks`) : seules
> les pastilles VERTES (feuille ≥13 « Bien » 4★, cœur ≥17 « Très bien » 5★)
> passent, sur la note PLAFONNÉE (un score stocké haut mais ≥2 rouges est
> écarté). Titre UI → « PÉPITES DU JOUR ». Les fichiers gardent le nom
> `weeklyPicks` / `useWeeklyPicks` (comportement quotidien, nom historique).
> Le pool prod (`weekly_picks_pool`, 40/need) est déjà 100 % score ≥17, le
> plancher ne fait qu'écarter les rares notes plafonnées.

## But
Section « Pépites de la semaine » sur le dashboard (sous le score de peau) : 4-6 produits catalogue sélectionnés pour le profil, rafraîchis **une fois par semaine ISO**, **déterministes** (0 IA runtime, 0 crédit). Le quiz « Daily Picks » existant est conservé en dessous. Gate `flag_weekly_picks`.

## Base de données (migration en prod)
`20260707_weekly_picks_candidates_rpc_v1.sql` : RPC `cosme_check_weekly_picks_candidates(p_needs text[], p_per_need int)` — batch multi-needs sur `product_intent_mapping` + `catalog`, retourne la forme carte (image_url, ingredients_text, sub_category via join `product_classifications`, counts). SECURITY DEFINER.

**Piège corrigé** : `catalog.score` est sur 0-20 mais `product_intent_mapping.min_score` contient des valeurs héritées jusqu'à 50 → la RPU **borne** le seuil dans [0,20] (`LEAST(min_score,15)`) pour ne jamais renvoyer 0 candidat. La table `product_intent_mapping` n'est PAS modifiée (l'advisor s'appuie dessus).

## Modules purs
- `lib/weeklyPicks/needsMap.ts` : mapping 10 concerns + 18 goals + 6 hairConcerns → 15 intent needs (poids). `DEFAULT_ROTATION` pour profil vide. `pickNeedsForUser(skin, weekKey)` = top 3 déterministe.
- `lib/weeklyPicks/select.ts` : dédup EAN → `filterAlternatives` (sécurité restrictions) → round-robin par need avec `orderByTierShuffled(seed = userId:weekKey:restrictionsKey + need)` → garde diversité max 2/sous-catégorie → 6 picks.
- `hooks/useWeeklyPicks.ts` : queryKey `['weeklyPicks', userId, weekKey, restrictionsSig]` staleTime 7j persistée ; restrictions changées en semaine = nouveaux picks (sécurité > stabilité) ; prefetch analyses EAN.

## UI
- `components/shared/ProductMiniCard.tsx` : carte produit extraite de l'AltCard d'`AlternativesCarousel` (refactoré pour déléguer, zéro changement visuel). Pastille only, jamais de note chiffrée.
- `components/home/WeeklyPicksCard.tsx` : carrousel, skeletons, état profil vide (CTA profil), état filtré vide.
- Câblé dans `app/(tabs)/index.tsx` (gate `config.flag_weekly_picks`).

## Limite connue (à traiter avant activation prod)
`product_intent_mapping` a des `category_patterns` en **anglais** (serum, cream, moisturizer) alors que `catalog.category` est en **français** (creme, hydratant). La couverture est donc partielle sur certains needs. Curation recommandée (patterns FR + échelle min_score 0-20) avant d'activer `flag_weekly_picks` en prod — elle bénéficierait aussi à l'advisor.

## Tests
`lib/__tests__/needsMap.test.ts` + `weeklyPicksSelect.test.ts` (36) : exhaustivité mapping, déterminisme (W28 ≠ W29), sécurité restrictions (token-exact + freeform), dédup, round-robin, diversité, tiers. RPC smoke : 12 candidats/need (top produits score 20).
