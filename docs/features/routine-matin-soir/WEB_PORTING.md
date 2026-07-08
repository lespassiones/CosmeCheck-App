# Routine Matin / Soir — Portage web (CosmetWiki)

La migration DB est **partagée** (déjà en prod) : `routine_items.time_of_day` + `position` + RPC `cosme_check_reorder_routine`. Rien à réappliquer.

## Réutilisable tel quel
- **`lib/routine/organize.ts`** : module pur, zéro dépendance RN. Copier à l'identique côté web. Toute la table de règles + `computePositions` + `normalizeSectionOrder` sont portables.
- RPC `cosme_check_reorder_routine(p_items jsonb)` : appelable directement depuis le client web (owner-scoped).

## À réimplémenter côté web
- Les deux sections MATIN/SOIR (composants React web).
- Le drag-reorder : côté web, utiliser `@dnd-kit` (au lieu du Gesture.Pan RN) ; brancher son `onDragEnd` sur `normalizeSectionOrder` puis la RPC.
- Le `TimeOfDaySwitch` et le `FrequencySelect` (équivalents web).
- Le chooser Suggestions.

## Garanties de parité
- Le moteur d'exposition n'est PAS modifié : le web et le mobile calculent la même exposition (pondérée par fréquence).
- Les defaults DB garantissent que le web actuel continue d'insérer des `routine_items` sans changement.
- `flag_routine_reorganize` gate la réorganisation des deux côtés (colonne `app_config`, exposée par `cosme_check_get_app_config`).
