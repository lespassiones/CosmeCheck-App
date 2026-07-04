# Mettre à jour les produits sans casser la base

La base Supabase est **sous-dimensionnée** (se sature vite). Toute mise à jour de masse doit être **douce**. Voici les règles.

## Recalculer les 490k produits (après un changement de couleurs)
Ordre à respecter :
1. **Recalculer en local d'abord** (clone SQLite du catalogue), vérifier la distribution et quelques produits témoins.
2. **Pousser vers Supabase par petits lots** (ex. 1500 lignes) **avec une pause** entre chaque lot. Jamais en un seul gros UPDATE.
3. **Toujours faire un backup** de `catalog.score` avant (table `_catalog_score_backup_pre_v2`).

## ⚠️ Le piège n°1 : les triggers de `catalog`
La table `catalog` a des triggers qui, **à chaque modification du `score`**, re-construisent les index de recherche :
- `trg_sync_ingredient_index` → table `catalog_ingredient_index` (reco / advisor, produits ≥13).
- `trg_sync_category_word` → table `catalog_category_word` (browse par catégorie, ≥15).

Sur un update de masse, ces triggers re-tokenisent tout = **saturation garantie**.

**Solution** : pendant le bulk, on **désactive** ces 2 triggers, on pousse les scores par lots, puis on les **réactive** (toujours, même en cas d'erreur). Vérifier ensuite qu'ils sont bien réactivés.

## ⚠️ Le piège n°2 : resync après un bulk triggers-off
Le job de nuit (`cosme_check_nightly_maintenance`) rafraîchit **seulement** le sidecar `product_score_cap` et `product_classifications`. Il **ne reconstruit pas** les 2 index de recherche ci-dessus.

Donc après un bulk triggers-off, il faut **resynchroniser à la main, en douceur** :
- sidecar `product_score_cap` (note + couleur affichées en recherche/browse),
- `product_classifications`,
- `catalog_ingredient_index` et `catalog_category_word` : mettre à jour le score stocké + retirer les produits qui sortent des seuils (≥13 / ≥15), **sans tout re-tokeniser**.

## Bon à savoir sur Supabase
- **RPC** : les fonctions appelées par l'app sont surtout dans le schéma **`public`** (`cosme_check_search_catalog`, `cosme_check_get_product_by_ean`, `cosme_check_get_ingredient`, `cosme_check_get_alternatives`, `cosme_check_recommend_products`…). Certaines existent aussi dans `cosme_check`. Vérifier le **schéma** avant d'appeler.
- **Edge functions (Deno)** : `analyser` fait la note à la volée. Après tout changement du calcul, **redéployer** (`supabase functions deploy analyser`).
- **Deno KV est indisponible** sur l'edge Supabase : tout cache KV « best-effort » ne marche pas. Pour un cache cross-user, utiliser une **table Postgres**.
- **Nouvelle table `cosme_check`** : penser au `grant ... to authenticated` (la RLS ne suffit pas, sinon « permission denied »).
- **Recherche produit** : sacrée, ultra-rapide (index trigram). Un simple update de `catalog.score` ne touche pas le trigram, mais **ne jamais** faire de bulk sur `catalog` avec les triggers actifs.

## Vérification obligatoire après un push
Lancer une **batterie de tests d'intégration** (appels RPC réels) : vérifier que la couleur d'un produit est **identique** sur toutes les surfaces (recherche, fiche produit, browse, alternatives, reco) et que les temps de réponse restent bas.
