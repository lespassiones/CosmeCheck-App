# Handoff web (CosmetWiki) — état d'avancement détaillé + nouveautés

But de ce document : donner au dev de l'app web **toutes** les infos d'avancement pour
mettre la webapp au niveau du mobile. Il couvre : comment chaque fonctionnalité est
construite, ce qui existe côté Supabase (signatures exactes), comment le mobile s'y
branche, les pièges (dos & don'ts), et les batteries de tests de non-régression.

Règles transverses (rappel, valables PARTOUT, y compris le code et les prompts) :
1. JAMAIS de tiret cadratin « U+2014 » dans un texte visible. Virgule, deux-points,
   parenthèses ou phrase coupée.
2. Côté utilisateur : pas de note « X/20 », uniquement un BADGE (pastille couleur +
   libellé). Seuils internes (17 / 13 / 9), ne pas les afficher.
3. Ne pas dévoiler l'algorithme de notation.

---

## 0. Architecture : web vs mobile (À LIRE EN PREMIER)

- **Base Supabase PARTAGÉE** : projet `rogesnduejmqpxolhbif`, schéma `cosme_check`.
  Tout ce qui est listé « déjà en place » EXISTE en prod, ne rien recréer.
- **Le mobile** exécute sa logique dans des **Edge Functions Deno** (`coherence-analyze`,
  `synthesis`, `validate-suggestions`, `analyser`, etc.).
- **Le web** a son **propre pipeline Next.js** (`app/api/*`, `lib/coherence/*`,
  `lib/ai/*`). Conséquence IMPORTANTE : quand on change une Edge Function côté mobile,
  ça NE se propage PAS au web. Il faut **porter la logique** dans le pipeline Next.js,
  OU appeler directement l'Edge Function partagée.
- **Recommandation** : pour les briques lourdes et qui doivent rester identiques entre
  plateformes (cohérence des promesses, synthèse, garde-fou suggestions), le plus sûr
  est d'**appeler les Edge Functions partagées** (`POST {SUPABASE_URL}/functions/v1/<fn>`
  avec le Bearer user) plutôt que de maintenir deux copies qui divergent. Si tu gardes
  ton pipeline Next.js, il faut le tenir en PARITÉ STRICTE (mêmes barèmes, mêmes
  versions de cache).

État actuel (d'après ton récap) : tu as implémenté Features 1 à 6 dans le pipeline
Next.js. Bien. Ce document confirme ce qui est aligné, corrige quelques points, et
détaille les NOUVEAUTÉS arrivées après.

---

## 1. Cohérence des promesses (Feature 1) — aligné, 2 précisions

Ton implémentation (algo v3, `gradeEffect` doc/supportive, règle « Présence : X »,
absence déterministe) est conforme. Deux points à vérifier :

- **Cache `algo_version`** : le mobile lit ET écrit `coherence_cache` en `algo_version
  = 'v3'`. Vérifie que ton `COHERENCE_ALGO_VERSION = 'v3'` est utilisé À LA FOIS au
  `read` (filtre `.eq('algo_version','v3')`) ET au `write` (upsert). Sinon le web et le
  mobile ne partagent pas le cache et peuvent resservir un ancien format.
- **Nuance allergène bi-fonction** (Feature 1.B) : pour une promesse « sans allergène
  parfumant » dont les SEULS fautifs sont des molécules bi-fonction (slug
  `benzyl-alcohol`, souvent conservateur), le verdict doit être `partielle` (score 50,
  « à nuancer »), PAS `contredite`. L'ingrédient reste signalé (`contradictingActives`).
  Un vrai allergène (Limonene, Linalool) garde `contredite`. Vérifie que ton port le
  fait, sinon tu seras plus sévère que le mobile sur ces produits.

Le reste (barème `gradeEffect`, forme du `result_json`, agrégats) : voir le prompt de
sync précédent, inchangé.

---

## 2. NOUVEAUTÉ MAJEURE — Suggestions intelligentes : refonte PERTINENCE + garde-fou IA

C'est le plus gros écart. Ta Feature 3 actuelle appelle
`cosme_check_get_alternatives_by_category` (matching par MOTS de la catégorie). Ce RPC
**déborde entre sous-catégories** : un vernis proposait un crayon, un parfum proposait
des lingettes, un autobronzant proposait un « tatouage temporaire ». À remplacer par la
chaîne ci-dessous.

### 2.1 Le problème de fond
La catégorie d'un produit pilote la recherche d'alternatives. Or :
- Le `get_alternatives_by_category` tokenise la catégorie en mots → débordement entre
  catégories sœurs partageant un mot (tout « maquillage », etc.).
- Le `catalog.category` lui-même est FAUX pour 5 à 16 % des produits (imports OBF).
  Ex. un autobronzant et un highlighter étaient rangés en
  `maquillage/encre-et-peinture-corporelle` → alternative = tatouage.

### 2.2 La chaîne CORRECTE (mobile), à porter
Pour chaque produit « à optimiser » de la routine :

1. **Résoudre la catégorie précise** (chemin taxonomique complet du catalogue) :
   - d'abord EAN → `catalog.category` (rapide, indexé) ;
   - sinon **classifieur** : `cosme_check_classify_product_category(p_query)` avec le
     NOM du produit (voir 2.4).
2. **Chercher les alternatives en MATCH EXACT** de ce chemin :
   `cosme_check_alternatives_by_category_exact(p_category, p_limit, p_offset)` (voir 2.4).
   Un vernis ne renvoie QUE des vernis. INNER JOIN `product_analyses` intégré = garde-fou
   (on ne propose que des produits dont on sait calculer le plafond couleur).
3. **Filtrer restrictions** (familles/ingrédients exclus du profil) + ne garder que les
   alternatives au **score PLAFONNÉ strictement meilleur** (> score_produit + 0.5),
   triées par score plafonné. La meilleure par produit.
4. **GARDE-FOU IA** (avant tout débit/affichage), voir 2.3.
5. Débit `cosme_check_consume_credit('routine_suggest')` SEULEMENT s'il reste des
   suggestions après le garde-fou.

### 2.3 Garde-fou IA (`validate-suggestions`) — IMPORTANT
Même avec le match exact, le `catalog.category` peut être faux pour le produit
lui-même. Donc, AVANT d'afficher, on demande au LLM de valider chaque paire.

- Edge Function partagée **`validate-suggestions`** :
  - `POST { items: [{ product: string, alternative: string }] }`
  - `→ { results: [{ logical: boolean, product_type: string }] }` (même ordre).
  - Auth Bearer, AUCUN crédit. Dégrade en `logical:true` partout si pas d'IA (ne bloque
    jamais l'affichage).
  - `logical` = l'alternative est-elle le MÊME type de produit que le produit (un
    remplaçant logique). `product_type` = le type RÉEL du produit en français court
    (« autobronzant », « enlumineur visage », « shampoing »…).
- Côté app : pour chaque suggestion,
  - si `logical` → on garde ;
  - si NON → on **re-route** : `cosme_check_classify_product_category(product_type)`
    (le type court de l'IA, pas le nom bruité) → nouveau chemin → on relance la
    recherche d'alternatives sur ce chemin ; si rien de bon → on RETIRE la suggestion
    (jamais d'alternative absurde affichée).
- Coût : 1 appel LLM par construction de deck (rare, car le résultat est mis en cache
  local côté mobile). Le web peut soit appeler l'Edge `validate-suggestions`, soit
  refaire la même chose dans une route Next.js.

### 2.4 Supabase déjà en place (Feature « Suggestions »)
- **`cosme_check_classify_product_category(p_query text, p_min_sim real default 0)`**
  → `TABLE(category text, votes int, avg_sim real)`.
  Implémentation : réutilise `cosme_check_search_catalog(p_query, 40, 0)` et VOTE la
  catégorie majoritaire des meilleurs résultats. RAPIDE (~200 ms). Renvoie le chemin
  complet de catégorie gagnant (ou rien si aucun match fiable).
- **`cosme_check_alternatives_by_category_exact(p_category text, p_limit int default 30,
  p_offset int default 0)`** → `TABLE(ean, brand, name, category, image_url, score
  double precision, score_label, score_tone, count_total int, ingredients_text,
  count_orange int, count_rouge int)`. MATCH EXACT `catalog.category = p_category`, INNER
  JOIN `product_analyses` (garde-fou), trié par score, plafond couleur calculé sur le
  lot (≤ p_limit).
- Edge `validate-suggestions` (voir 2.3).
- (L'ancien `cosme_check_get_alternatives_by_category` existe encore mais NE PLUS
  l'utiliser pour les suggestions : il déborde.)

### 2.5 PIÈGE de perf à NE PAS refaire (vécu)
- Un classifieur en `ORDER BY similarity(nom, requête) DESC LIMIT 25` = **3 à 13 s** sur
  des mots courants (recalcul de similarité par ligne). NON scalable. C'est pour ça que
  `classify` réutilise `search_catalog` (index GIN, tokens positifs).
- Tenté ensuite un index **GiST trigram + ORDER BY <-> (kNN)** : l'index est bien
  utilisé MAIS reste à **6,9 s** (le `<->` trigram est lent sur noms longs). ABANDONNÉ.
  => Ne pas refaire ces deux approches. Le `classify` via `search_catalog` est la bonne.

---

## 3. NOUVEAUTÉ — Synthèse PERSONNALISÉE (conseiller / pharmacien)

La synthèse doit se comporter comme un conseiller pour CHAQUE utilisateur, pas une liste
générique. Si la webapp a une synthèse (lib/ai/synthesis ou équivalent), aligne-la.

Ce qui change (mobile, `synthesis` Edge, `SYNTH_PROMPT_VERSION = 13`) :
- Le BLOC 2 (puces) **commence par « BON POUR TOI »** (1 à 2 puces) : on met en avant
  les ingrédients VERTS dont le rôle répond à une **préoccupation / objectif / type de
  peau** du profil (« bon pour ta peau sèche », « intéressant pour tes imperfections »),
  SANS inventer de bénéfice. Si aucun vert ne matche le profil → 1 puce « Bon à savoir »
  sur un vert notable. Profil vide → idem générique + invitation à remplir le profil.
- PUIS les alertes (rouge/orange/jaune), **reliées à la peau** quand pertinent (« sur ta
  peau réactive, ... »), restrictions signalées inline.
- Données passées au LLM : profil (type de peau visage/corps, préoccupations,
  objectifs), restrictions, et chaque item ENRICHI (couleur, fonction, tag,
  `restriction_reason`). Plus la liste des VERTS avec leur fonction (pour le « bon pour
  toi »).
- **Régénération** : la version du prompt entre dans la clé de cache persistée
  (`synthesisRestrictionsKey = '<restrictions>|v13'`). Bumper la version régénère les
  synthèses déjà stockées au prochain affichage. Aligne ta version sur la même clé si tu
  partages la table.
- Surlignage : les noms INCI en **gras** restent cliquables vers la fiche ingrédient.

Supabase : Edge `synthesis` (POST `{ analysisId }` → `{ synthesis }`, 0 crédit, auth
Bearer). Le web peut l'appeler directement, ou porter le prompt.

---

## 4. NOUVEAUTÉ — Carte « Ce qui est bien » simplifiée (fonctions au lieu de verbes)

Sur l'écran d'analyse, la carte « Ce qui est bien » (bloc « essentiel ») affichait
auparavant les 3 verts via une grosse table de verbes contextuels (casse-tête à
maintenir). Nouveau comportement (déterministe, côté client) :
- On prend les **3 ingrédients verts les mieux placés** (par position INCI),
  **seule l'eau est exclue** (Aqua/Water/Eau), tout le reste est gardé.
- On affiche leurs **fonctions réelles** (1 à 3), telles quelles, dédoublonnées, en
  ignorant « Non classé ». Un vert sans fonction documentée est sauté.
- Affichage : « Nom de l'ingrédient -> Fonction1 · Fonction2 · Fonction3 ». Plus de table
  de verbes, plus de logique de famille.
- Source du nom affiché : traduction FR de la base → nom commun grand public → INCI brut.

Aucune ressource Supabase nouvelle (les fonctions viennent déjà des items de l'analyse).

---

## 5. CORRECTIF — Plafond couleur sur le BROWSE par catégorie

Feature 5 (badge plafonné) : tu l'as faite sur `catalog-search`. Attention au **browse
par catégorie** (drill-down) :
- Le mobile appelle **`cosme_check_browse_subcategory`**, qui ne renvoyait PAS
  `count_orange`/`count_rouge` (contrairement à `search_catalog`) → le browse affichait
  la couleur BRUTE (vert) alors que l'analyse plafonne (orange/rouge). Bug réel signalé
  par une testeuse.
- **Corrigé** : `cosme_check_browse_subcategory` renvoie désormais
  `…, count_orange int, count_rouge int` (calculés via LEFT JOIN `product_analyses` sur
  le lot, comme `search_catalog`). Signature à jour :
  `cosme_check_browse_subcategory(p_subcategory text, p_limit int default 24, p_offset
  int default 0)` → `TABLE(ean, brand, name, image_url, score double precision,
  score_label, score_tone, ingredients_text, count_orange int, count_rouge int)`.
- Action web : si tu as une vue de navigation par catégorie qui consomme ce RPC (ou un
  équivalent), applique `applyColorCap(score, count_orange, count_rouge)` au badge,
  EXACTEMENT comme sur la recherche. Sinon tu auras le même bug (vert en liste, orange à
  l'ouverture). Vérifie aussi que ta route catalog-search applique bien le cap (tu l'as
  fait, ok).

Rappel `applyColorCap` (identique partout) :
```
if (countRouge >= 1 || countOrange >= 3) return Math.min(score, 8.9)  // À éviter
if (countOrange >= 1)                     return Math.min(score, 12.9) // Moyen
return score
// libellé : >=17 "Très bien", >=13 "Bien", >=9 "Moyen", <9 "À éviter"
```
ET l'écran d'analyse doit utiliser la MÊME base : `catalog.score` (notation propriétaire CosmeCheck) résolu
par marque+nom si dispo, sinon le score calculé, PLAFONNÉ avec les mêmes seuils. Sinon
décalage liste vs détail.

---

## 6. EN COURS — Noms d'ingrédients simplifiés (grand public)

Couverture FR de la base `ingredients` (15 723 lignes) : seulement ~23 % ont une
traduction, et souvent littérale-scientifique. Pipeline en cours :
1. Export CSV de tous les ingrédients (`name`, `fonction_1..11`, `nom_simplifie` vide).
2. Une IA externe remplit `nom_simplifie` (nom FR court, jamais l'INCI, jamais de
   bénéfice inventé).
3. À l'import : table `cosme_check.ingredient_simple_name` (à créer) + priorité
   d'affichage **nom simplifié → traduction FR → INCI** (carte « Ce qui est bien »,
   liste d'ingrédients, synthèse).
Statut : pas encore en base. Quand ce sera fait, le web pourra lire la même table.

---

## 7. Référence Supabase (signatures exactes, déjà en place)

RPC publiques (`public`, préfixe `cosme_check_`, appelées en `.rpc(...)`) :
- `cosme_check_search_catalog(p_query text, p_limit int=50, p_offset int=0)`
  → ean, brand, name, category, image_url, source_url, score real, score_label,
  score_tone, count_total int, ingredients_text, count_orange int, count_rouge int.
- `cosme_check_browse_subcategory(p_subcategory text, p_limit int=24, p_offset int=0)`
  → ean, brand, name, image_url, score, score_label, score_tone, ingredients_text,
  count_orange int, count_rouge int. (compteurs AJOUTÉS, voir §5.)
- `cosme_check_get_category_counts()` → category, subcategory, cnt. (grille, cacher ~1h.)
- `cosme_check_classify_product_category(p_query text, p_min_sim real=0)`
  → category text, votes int, avg_sim real. (NOUVEAU, voir §2.4.)
- `cosme_check_alternatives_by_category_exact(p_category text, p_limit int=30,
  p_offset int=0)` → voir §2.4. (NOUVEAU.)
- `cosme_check_get_alternatives_by_category(...)` : ANCIEN, ne plus utiliser pour les
  suggestions (débordement).
- `cosme_check_recommend_products(p_terms text[], p_form text=null, p_min_score real=15,
  p_limit int=24, p_exclude_families text[]='{}', p_exclude_ingredients text[]='{}')`
  → ean, brand, name, category, image_url, score real, score_label, score_tone,
  count_total int, ingredients_text, match_count int. (Beauty Advisor reco.)
- `cosme_check_consume_credit(p_feature text)` → jsonb `{ "ok": true|false }`. Débiter
  AVANT l'action. Features : 'coherence', 'routine_suggest', 'compare', advisor (1/msg).
- `cosme_check_get_credits()` → jsonb (solde du jour, fallback 60). Toujours frais.
- `cosme_check_category_score_stats(p_category text)` → avg_score real, product_count int.

Edge Functions partagées (POST `{SUPABASE_URL}/functions/v1/<fn>`, Bearer user) :
- `coherence-analyze` : `{ analysis_id, description, cacheable? }` → `{ id, result }`.
  algo v3, débit 1 crédit 'coherence' après lookup idempotent.
- `synthesis` : `{ analysisId }` → `{ synthesis }`. 0 crédit. Perso (v13).
- `validate-suggestions` : `{ items:[{product,alternative}] }` → `{ results:[{logical,
  product_type}] }`. 0 crédit. (NOUVEAU.)
- `analyser` : pipeline d'analyse INCI (parse LLM + matching + score). Résolution EAN
  auto + classification taxonomie en tâche de fond (Feature 6).

Tables (schéma `cosme_check`, RLS par utilisateur sur les tables user) :
- `analyses(... , favori boolean, category text, category_precise text, ean text,
  result_json jsonb, score)`.
- `coherence_cache(inci_hash, description_hash, result_json, product_type, algo_version,
  computed_at, updated_at)` — conflit/upsert (inci_hash, description_hash).
- `coherence_analyses(...)` — historique des analyses de promesse.
- `advisor_conversations(id, user_id, title, created_at, updated_at)`.
- `advisor_messages(id, conversation_id, user_id, role, content, products jsonb,
  reco_criteria jsonb, created_at)`.
- `catalog(ean, brand, name, category, image_url, source_url, score real, score_label,
  score_tone, count_total int, ingredients_text, is_active, has_penalizing,
  count_orange int, count_rouge int)`. `count_orange/rouge` existent mais sont peu
  peuplés (~1700) ; les vrais compteurs se calculent via `product_analyses` (cf. RPC).
- `product_analyses(ean, result_json jsonb, score real, score_label, score_tone,
  algo_version, computed_at, updated_at)` — cache d'analyse cross-user par EAN
  (~371k lignes). Source des `colorRating` par ingrédient (pour le plafond couleur).
- `product_classifications(ean, subcategory, ...)` — sert au browse.
- `ingredients(slug, name, color_rating, functions jsonb, tags, translations jsonb, ...)`
  — 15 723 lignes.
- `web_products(...)` — file des produits internet non résolus (Feature 6).

---

## 8. DOS & DON'TS (pièges vécus)

DON'T :
- NE PAS faire de **bulk UPDATE sur `catalog`** : il porte un index GIN trigram, chaque
  UPDATE est non-HOT et réécrit le GIN (~30 ms/ligne → des heures sur 405k, bloque la
  prod). On a tenté de dénormaliser `category_precise`/`score_capped` → annulé.
- NE PAS classer par `ORDER BY similarity()` ni par GiST `<->` kNN (3 à 13 s). Utiliser
  le `classify` basé sur `search_catalog`.
- NE PAS faire confiance aveuglément à `catalog.category` (5 à 16 % faux). D'où le
  classifieur kNN + le garde-fou IA.
- NE PAS afficher de note /20 ni dévoiler l'algo. Badges seulement.
- NE PAS recalculer la note d'un produit catalogue depuis les ingrédients :
  `catalog.score` est la source de vérité (score propriétaire CosmeCheck). Le score calculé diffère ~15 %.

DO :
- Toujours appliquer `applyColorCap` AVANT de choisir la couleur d'un badge de LISTE, et
  la MÊME base (catalog.score) que l'écran de détail.
- Préférer appeler les Edge Functions partagées pour la cohérence/synthèse/validation,
  pour éviter la divergence de logique entre web et mobile.
- Garder le `algo_version` aligné (v3 cohérence, v13 synthèse) si tu partages les caches.
- Débiter les crédits AVANT l'action ; si `ok:false` → paywall.

---

## 9. Batteries de tests (non-régression)

Côté mobile, suite Jest (env node, logique pure) : `npx jest --config jest.config.js
--no-coverage` → **40 suites, 377 tests verts**. Le web devrait porter des tests
équivalents sur sa logique pure. Couverture clé :

- `coherenceEngine.test.ts` : `resolveOpenPromise` (barème `gradeEffect` doc/supportive :
  1 supportif → partielle 55, 2 supportifs → tenue 72, 1 documenté → 80, doc+sup → 85,
  trace → 35, visuel → 30, rien → 0), anti-hallucination (ingrédient absent → supprimé →
  0), `resolveAbsencePromise` (sans X tenue 100 / contredite 0), `computeMetrics`.
- `coherenceGolden.test.ts` : produits réels (Phitofilos botanique → hydratation tenue ;
  présence vraie/fausse ; The Ordinary ; produit dangereux sulfate contredite ; nuance
  allergène Benzyl Alcohol → partielle 50 vs Limonene → contredite).
- `essentielEngine.test.ts` : tons de verdict + « Ce qui est bien » affiche les FONCTIONS
  (eau exclue, max 3 fonctions, « Non classé » ignoré) + concerns par tag.
- `scoreCap.test.ts` : `applyColorCap` (≥1 rouge ou ≥3 orange → 8.9 ; ≥1 orange → 12.9).
- `routineOptimize.test.ts` : sélection à-optimiser (score plafonné < 13 ou restriction),
  tri par sévérité, badge couleur ALIGNÉ sur le tier du produit (pas sur l'ingrédient).
- `alternativesFilter.test.ts` : filtre restrictions des alternatives.
- `filterHistory.test.ts` : filtre Tout/Favoris.
- `advisorApiMessages.test.ts`, `advisorRoutineNormalize.test.ts` : advisor.
- `catalogSearchCache.test.ts` : normalisation clé de recherche.

Vérifications manuelles faites côté mobile (à refaire côté web) :
- Pertinence des suggestions : vernis → vernis only (vs 4 catégories avant), autobronzant
  → autobronzants, enlumineur → enlumineurs, dentifrice → dentifrices. Le tatouage a
  disparu grâce au garde-fou IA + classifieur.
- Plafond couleur sur 6 catégories de browse : 4 à 28 % des produits du top-100 étaient
  « vert » brut mais plafonnés (ex. déodorants 28 %). Maintenant cohérents avec l'analyse.
- Synthèse : sur un profil rempli, la synthèse cite un actif vert « bon pour ton teint »
  et relie une alerte « sur ta peau réactive ».
- Perf : `classify` ~200 ms, `alternatives_by_category_exact` ~50 ms, scalable 10k+ users
  (cache local du deck + requêtes indexées + 1 LLM bon marché par build rare).

---

## 10. Récapitulatif des actions web prioritaires

1. **Suggestions** : remplacer `get_alternatives_by_category` par la chaîne classify +
   `alternatives_by_category_exact` + garde-fou `validate-suggestions` + re-route. (§2)
2. **Synthèse** : passer à la synthèse personnalisée « conseiller » (§3), aligner
   `SYNTH_PROMPT_VERSION`.
3. **Browse cap** : appliquer `applyColorCap` sur la navigation par catégorie (§5).
4. **Cohérence** : vérifier `algo_version v3` au read+write et la nuance allergène (§1).
5. **Ce qui est bien** : afficher les fonctions, pas les verbes (§4).
6. **Noms simplifiés** : à brancher quand la table sera prête (§6).

Pour toute brique lourde, le plus robuste reste d'appeler l'Edge Function partagée
(`coherence-analyze`, `synthesis`, `validate-suggestions`) plutôt que de maintenir une
2e implémentation.
