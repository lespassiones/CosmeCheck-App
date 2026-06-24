---
name: perf
description: Suivi de performance CosmeCheck. Re-mesure uniquement les points chauds (temps des recherches catalogue, cache hit ratio, connexions DB, fraîcheur + couverture du plafond couleur, poids et stats de product_analyses, nombre d'advisors) et COMPARE à la dernière exécution pour dire ce qui s'améliore ou régresse. À lancer via /perf. Léger et répétable, contrairement à /analyse qui fait l'audit complet.
---

# /perf — Suivi de performance CosmeCheck

Skill de **monitoring léger et répétable**. Il ne refait PAS l'audit complet (ça, c'est `/analyse`). Il prend un jeu de mesures fixes, l'enregistre dans un snapshot horodaté, et le **compare au snapshot précédent** pour montrer l'évolution (vert = amélioré, rouge = régressé, gris = stable).

Project Supabase : `rogesnduejmqpxolhbif`. Schéma data : `cosme_check`. Les RPC catalogue sont en schéma `public` (préfixe `cosme_check_*`).

## Règles

- **Mesures FIGÉES.** N'altère jamais les requêtes ci-dessous entre deux runs, sinon la comparaison n'a aucun sens. Si tu dois ajouter une métrique, ajoute-la sans toucher aux existantes.
- **Read-only.** Ce skill ne fait que des `SELECT` / `EXPLAIN ANALYZE`. Aucun DDL, aucune écriture, jamais de build APK.
- Pour les recherches, mesure **à froid puis à chaud** (lance 2x la même requête) : le 1er run = pire cas (cache-miss / buffers froids), le 2e = régime établi. Reporte les deux.
- Termes de test fixes : `creme` (terme dense, ~35k matches, le pire cas historique), `serum` (~15k), `phitofilos` (terme rare). Ne pas les changer.
- Jamais de tiret cadratin dans la sortie.

## Étape 1 — Charger les outils

Via ToolSearch : `select:mcp__supabase__execute_sql`. (Et `mcp__supabase__get_advisors` si tu veux le compte d'advisors.)

## Étape 2 — Prendre les mesures (requêtes figées)

### A. Recherches (EXPLAIN ANALYZE, lire « Execution Time »)
Lancer chaque requête DEUX fois, garder les deux temps (froid, chaud) :
```sql
explain (analyze, buffers) select * from public.cosme_check_search_catalog('creme', 20, 0);
explain (analyze, buffers) select * from public.cosme_check_search_catalog('serum', 20, 0);
explain (analyze, buffers) select * from public.cosme_check_search_catalog('phitofilos', 20, 0);
explain (analyze, buffers) select * from public.cosme_check_browse_subcategory('Soin du visage', 24, 0);
```
Note : tant que la RPC garde son cache 1h, le 1er « froid » peut déjà être chaud si quelqu'un a cherché récemment. Le préciser dans la sortie.

### B. Santé serveur + cohérence (une seule requête)
```sql
select
  -- cache hit ratio global (cible > 99)
  (select round(sum(blks_hit)*100.0/nullif(sum(blks_hit)+sum(blks_read),0),2)
     from pg_stat_database where datname = current_database()) as cache_hit_pct,
  -- connexions (mur = max_connections, 60 sans pooler)
  (select count(*) from pg_stat_activity) as conns_now,
  (select setting::int from pg_settings where name='max_connections') as conns_max,
  -- poids product_analyses + stats
  pg_size_pretty(pg_total_relation_size('cosme_check.product_analyses')) as product_analyses_size,
  (select last_autovacuum from pg_stat_user_tables
     where schemaname='cosme_check' and relname='product_analyses') as pa_last_autovacuum,
  -- couverture + fraîcheur du plafond couleur
  (select count(*) from cosme_check.catalog) as catalog_rows,
  (select count(*) from cosme_check.catalog where score is null) as catalog_score_null,
  (select count(*) from cosme_check.product_score_cap) as score_cap_rows,
  ((select count(*) from cosme_check.catalog) - (select count(*) from cosme_check.product_score_cap)) as cap_missing,
  (select max(computed_at) from cosme_check.product_score_cap) as cap_last_computed;
```

### C. (optionnel) Compte d'advisors
`get_advisors` type `security` et `performance` : ne garder que le **nombre** de lints par niveau (ERROR/WARN/INFO), pas le détail. Si la sortie sécurité est trop grosse, déléguer le comptage à un sous-agent.

## Étape 3 — Enregistrer le snapshot

Écrire un fichier JSON dans `.claude/perf-snapshots/` nommé par la date du jour (ex. `2026-06-23.json`), contenant toutes les mesures de l'étape 2. Structure suggérée :
```json
{
  "date": "2026-06-23",
  "search": { "creme": {"cold_ms": 4050, "warm_ms": 92}, "serum": {...}, "phitofilos": {...}, "browse": {...} },
  "server": { "cache_hit_pct": 80.1, "conns_now": 17, "conns_max": 60 },
  "product_analyses": { "size": "1937 MB", "last_autovacuum": null },
  "color_cap": { "catalog_rows": 405872, "score_null": 137, "cap_rows": 370982, "cap_missing": 34890, "last_computed": "2026-06-18T23:15:50Z" },
  "advisors": { "security": {"error": 7, "warn": 114, "info": 9}, "performance": {"warn": 4, "info": 21} }
}
```
Créer le dossier `.claude/perf-snapshots/` au besoin (Write le crée tout seul).

## Étape 4 — Comparer au snapshot précédent

Lister les fichiers de `.claude/perf-snapshots/`, prendre le plus récent AVANT celui qu'on vient d'écrire. S'il n'en existe aucun, le dire (« première exécution, pas de comparaison ») et ne montrer que les valeurs absolues.

Sinon, produire un tableau de delta. Convention : 🟢 amélioré, 🔴 régressé, ⚪ stable (variation < 5% ou non significative). Pour les temps de recherche, « amélioré » = plus rapide. Pour cache_hit, plus haut = mieux. Pour cap_missing, plus bas = mieux.

## Format de sortie

```
# Suivi perf CosmeCheck — <date> (vs <date snapshot précédent>)

## Recherches (Execution Time)
| Terme | Froid | Δ | Chaud | Δ |
|-------|-------|---|-------|---|
| creme | ... | 🟢/🔴/⚪ | ... | ... |
| serum | ... | ... | ... | ... |
| phitofilos | ... | ... | ... | ... |
| browse | ... | ... | ... | ... |

## Serveur & cohérence
| Métrique | Maintenant | Avant | Δ |
|----------|-----------|-------|---|
| Cache hit % | ... | ... | 🟢/🔴/⚪ |
| Connexions | n/60 | ... | ... |
| product_analyses | ... | ... | ... |
| Plafond couleur manquant | ... | ... | ... |
| Score cap recalculé le | ... | ... | (âge en jours) |
| Advisors ERROR / WARN | ... | ... | ... |

## Verdict en une ligne
<ce qui a bougé dans le bon/mauvais sens depuis la dernière fois, et le point chaud à surveiller>
```

Rester factuel et bref. Si une cible n'est pas atteinte (cache hit < 99, recherche froide > 100 ms, cap_missing > 0, score cap > 2 jours), le signaler en fin de verdict avec le levier connu (voir `/analyse` pour le détail des solutions). Ne pas reproposer tout le plan d'action : ce skill mesure, il ne corrige pas.
```
