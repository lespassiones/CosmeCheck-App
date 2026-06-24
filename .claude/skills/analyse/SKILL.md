---
name: analyse
description: Bilan de santé complet de l'app CosmeCheck et de la base Supabase, orienté performance à grande échelle (charge, rapidité, scalabilité 1000 users, goulots d'étranglement, parallelisme, vitesse de chaque feature, santé DB, cohérence des données, normalisation des scores avec plafond couleur, qualité des fonctions de recherche). À lancer via /analyse. Produit un état complet avec notes par domaine et un plan d'amélioration priorisé.
---

# /analyse — Bilan de santé CosmeCheck

Tu es l'auditeur de santé de CosmeCheck (app Expo/RN + Supabase, project `rogesnduejmqpxolhbif`).
Objectif : produire un **état complet** de l'app et de la base, orienté **performance à 1000 utilisateurs simultanés**, avec un diagnostic honnête (ce qui est bien / mauvais) et un plan d'amélioration **simple et priorisé**.

## Principes

- **Mesure, ne devine pas.** Lance des requêtes réelles (`EXPLAIN ANALYZE`, `pg_stat_*`), lis le code réel. Ne te fie pas aux notes du CLAUDE.md sans les vérifier — elles peuvent être périmées.
- **Vérifie ce qui a déjà été optimisé** (la mémoire et le CLAUDE.md décrivent des optims passées : RPC trigram, sidecar score cap, caches React Query). Confirme qu'elles tiennent toujours.
- **Note chaque domaine A→F** avec une justification chiffrée.
- **Termine par un plan d'action trié par impact/effort** (quick wins d'abord). Pas de blabla : des actions concrètes.
- Respecte les préférences : **jamais de tiret cadratin (—)** dans le rapport final. **Ne build JAMAIS l'APK** de toi-même.
- Sois sceptique : si un index existe mais n'est pas utilisé, dis-le. Si une RPC est rapide à chaud mais lente à froid, distingue-le.

## Déroulé de l'audit

Travaille les 7 sections ci-dessous. Tu peux paralléliser les lectures (sous-agents Explore + requêtes MCP indépendantes), mais **synthétise toi-même** le rapport final.

### 1. Santé de l'instance Supabase (capacité brute)
Via Supabase MCP (`execute_sql`) :
- `max_connections`, `shared_buffers`, `effective_cache_size`, `work_mem` (`SHOW` ou `pg_settings`).
- Cache hit ratio global : `pg_stat_database` (`blks_hit / (blks_hit + blks_read)`). Cible > 99%.
- Taille de la base et working set : `pg_database_size`, top tables via `pg_total_relation_size`.
- Connexions actives vs max : `pg_stat_activity` (count par state). À 1000 users, `max_connections` (souvent 60 sur petite instance) est le **premier mur** sans pgBouncer/pooler.
- Vérifie l'usage du **connection pooler** (Supavisor) côté client : l'app utilise-t-elle l'URL poolée ? Sinon, c'est un goulot critique.

### 2. Santé des tables et index
- `list_tables` (schéma `cosme_check`) pour la structure.
- Index inutilisés : `pg_stat_user_indexes` où `idx_scan = 0` (sur les grosses tables). Index manquants : `pg_stat_user_tables` avec `seq_scan` élevé et `seq_tup_read` énorme sur `catalog`, `product_analyses`, `analyses`, `ingredients`.
- Bloat / dead tuples : `pg_stat_user_tables` (`n_dead_tup`, dernier autovacuum).
- Tailles TOAST des grosses colonnes JSONB (`result_json`, `product_analyses`) — le détoasting est un coût caché (cf. mémoire sidecar score cap).
- `get_advisors` type `security` ET `performance` : remonte tout (RLS désactivée, search_path mutable, index manquants suggérés).

### 3. Performance des fonctions de recherche (priorité user)
C'est un point sensible : le user veut que **chaque recherche soit excellente et extrêmement rapide**.
Pour chaque RPC de recherche, fais un `EXPLAIN (ANALYZE, BUFFERS)` avec un terme réaliste et vérifie : index trigram utilisé (pas de Seq Scan), temps à chaud < ~50 ms, pas de tri d'un gros volume avant LIMIT.
- `cosme_check_search_catalog(p_query, p_limit, p_offset)` — doit utiliser `catalog_search_unaccent_trgm`. Vérifie casse/accents/ordre insensibles.
- `cosme_check_browse_subcategory`, `cosme_check_get_category_counts`, `cosme_check_get_category_*`.
- `cosme_check_alternatives_by_category_exact` — vérifie que l'index matche l'ORDER BY (piège connu : NULLS ordering, sinon scan+tri 23k lignes).
- `cosme_check_recommend_products` (advisor, index inversé mot→produit).
- Vérifie le **cache classement** `catalog_search_cache` (top EAN/terme, TTL 1h) : existe-t-il, est-il alimenté, sert-il ?
- Côté client : `lib/catalog/searchCache.ts` (normalisation + dédoublonnage fetchQuery) — confirme que la recherche retapée = 0 appel DB.

### 4. Normalisation des scores + plafond couleur (cohérence métier, priorité user)
Le user veut la garantie que **les scores produits sont normalisés avec le blocus des couleurs**.
- Confirme la source de vérité : `catalog.score` = vrai score INCI Beauty (cf. mémoire `catalog-score-is-incibeauty`). Vérifie qu'aucun écran ne montre `result_json.score` (calculé, décalage ~15%) là où il devrait montrer le score plafonné.
- Vérifie le **sidecar** `product_score_cap` (compteurs + score plafonné précomputés) : est-il à jour ? Les 7 RPC catalogue le lisent-elles au lieu de détoaster `product_analyses` ?
- Vérifie `applyColorCap` côté client + `count_orange`/`count_rouge` renvoyés par les RPC search/browse (le badge ne doit pas montrer le score brut vert quand l'analyse plafonne en orange/rouge).
- Cohérence : combien de produits ont `score NULL` (pas encore découvrables) ? Cache EAN empoisonné (cf. mémoire `product-analyses-poisoned-cache`) toujours sain ?

### 5. Performance des features (Edge Functions + écrans)
- Liste les Edge Functions (`list_edge_functions`) et repère les chemins chauds : `analyser`, `synthesis`, `coherence-analyze`, `advisor-chat`, `product-by-barcode`, `ocr-scan`.
- `get_logs` (service `edge-function` et `postgres`) pour repérer erreurs récentes, timeouts, requêtes lentes.
- Rappel goulot connu : **Deno KV indisponible sur Supabase Edge** → tout cache KV est un no-op. Repère le code qui croit cacher mais ne cache pas (`product-by-barcode` X-Cache HIT factice).
- Coûts IA (cf. mémoire `ai-cost-model`) : web-search non loggé, sous-estimation. Vérifie si pertinent.
- Côté app : vérifie les caches React Query (staleTime/gcTime, blacklist persister), les dérivations client-side (pas de double fetch routine), `CacheJanitor`.

### 6. Scalabilité à 1000 users (le scénario du user)
Raisonne explicitement sur le scénario de charge :
- Combien d'appels DB par session active typique ? (boot, scan, analyse, recherche).
- Quelles RPC sont CPU-bound (tri de grosses tables) et exploseraient sous concurrence ? (cf. recherche texte sur termes courants).
- `max_connections` + absence de pooler = saturation. pgBouncer/Supavisor en mode transaction recommandé.
- Rate limits Edge Functions et quotas API externes (OpenAI/Mistral/OBF) : tiennent-ils à 1000 users ? (cf. recherche approfondie passée en manuelle + 1 crédit pour protéger les quotas).
- Identifie le **top 3 des goulots** qui casseraient en premier à 1000 users simultanés.

### 7. Parallélisme et redondance
- Requêtes séquentielles qui pourraient être parallèles (boot, écran d'analyse).
- Fetch redondants (même donnée chargée 2x).
- Travail synchrone bloquant le rendu (synthèse, image resolve).

## Format du rapport final

```
# Bilan de santé CosmeCheck — <date>

## Note globale : <A-F> (<une phrase>)

## Tableau de bord
| Domaine                | Note | Constat clé chiffré |
|------------------------|------|---------------------|
| Capacité instance      | ...  | ... |
| Index & tables         | ...  | ... |
| Fonctions de recherche | ...  | ... |
| Scores & plafond couleur| ... | ... |
| Features / Edge        | ...  | ... |
| Scalabilité 1000 users | ...  | ... |
| Parallélisme           | ...  | ... |

## Ce qui est bien (confirmé par mesure)
- ...

## Ce qui est mauvais / risqué
- 🔴 critique  / 🟠 important / 🟡 mineur, chacun avec preuve chiffrée

## Goulots d'étranglement à 1000 users (top 3)
1. ...

## Plan d'amélioration priorisé (impact / effort)
### Quick wins (fort impact, faible effort)
- [ ] ...
### Moyen terme
- [ ] ...
### Fondations (gros effort)
- [ ] ...
```

Chaque ligne du plan doit être **actionnable** (quelle table, quel index, quelle RPC, quel fichier). Pas de généralités.
À la fin, propose au user de creuser un point précis ou d'appliquer un quick win, mais **n'applique rien sans accord** et **ne build pas l'APK**.
