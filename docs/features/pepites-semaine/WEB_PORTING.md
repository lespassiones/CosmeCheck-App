# Pépites de la semaine — Portage web

## Réutilisable tel quel
- `lib/skin/week.ts`, `lib/weeklyPicks/needsMap.ts`, `lib/weeklyPicks/select.ts` : purs, copier à l'identique.
- RPC `cosme_check_weekly_picks_candidates` et table `product_intent_mapping` : **partagées**, déjà en prod.
- `flag_weekly_picks` : colonne `app_config` partagée.

## À réimplémenter côté web
- La carte carrousel (équivalent web de `WeeklyPicksCard` + `ProductMiniCard`).
- Le hook `useWeeklyPicks` (React Query web) : même queryKey `['weeklyPicks', userId, weekKey, restrictionsSig]`, même pipeline (needs → RPC → filterAlternatives → select).

## Avant activation (les deux plateformes)
Curer `product_intent_mapping` : patterns de catégories en français + `min_score` ramené sur l'échelle 0-20. La RPC borne déjà le seuil, mais des patterns FR amélioreraient nettement la pertinence (et l'advisor en profiterait aussi).
