# CosmeCheck — TO-DO DE LA MORT (audit + tests d'intégration + parité + INCI-out)

Objectif : tout tester (vrais tests d'intégration, pas tsc/jest), tout évaluer, tout améliorer,
parité mobile↔web parfaite, ZÉRO INCI (sauf images pour l'instant), revert si régression.

Repos : mobile `D:\MesApps\deploy\CosmeCheck-App` · web `D:\MesApps\deploy\CosmetWiki` · admin `D:\MesApps\deploy\CosmeCheckAdmin`.
Contrainte : NE PAS saturer la DB (plan payé, pas d'upgrade). Tests = requêtes légères + mesure temps.

---

## A. BUDGET ADVISOR (priorité #1) — recommandations + intention
- [ ] A1. Cartographier le flux réel : `advisor-chat` Edge + `cosme_check_recommend_products` + détection d'intention actuelle (mots-clés ?).
- [ ] A2. **Calibrer la détection d'INTENTION** : détecteur sémantique du besoin (pas mots-clés) :
      - question générique « je veux un produit » → se baser sur le PROFIL ;
      - profil incomplet → **poser une question de clarification** (« de quoi as-tu besoin ? peau/objectif/catégorie ? ») ;
      - demande explicite de reco → recommander ;
      - discuter sans reco quand ce n'est pas demandé.
- [ ] A3. **Restrictions** : prouver que les produits recommandés ne contiennent JAMAIS un ingrédient restreint du profil. Tests avec plusieurs jeux de restrictions.
- [ ] A4. Tests pièges (intégration, mesure temps) : questions ambiguës, hors-sujet, multi-contraintes, budget, catégorie précise, « meilleur que X ».
- [ ] A5. Vérifier que les produits recommandés sont PERTINENTS (bonne catégorie, bon tier pastille, pas de placeholder/non-noté).

## B. SCAN CODE-BARRES — ultra-rapide + produit inconnu
- [ ] B1. Mesurer la latence réelle du pipeline scan (product-by-barcode → analyser) sur EAN catalogue (cache chaud/froid).
- [ ] B2. **Produit PAS en base** : enregistrer quand même l'EAN (file admin) + NE PAS laisser l'utilisateur bloqué → bouton « Re-scanner » ou « Rechercher le produit à la main ». Vérifier/implémenter côté mobile ET web.
- [ ] B3. 3 blocs IA (objectifs/peau/à surveiller) : marchent + STOCKÉS (result_json.personalBlocks) + 1 crédit une seule fois.

## C. RECHERCHE PRODUIT + COMPOSITION — ultra-rapide
- [ ] C1. Recherche par nom : latence (chaud/froid), pertinence, renvoie nos scores.
- [ ] C2. Décomposition d'un produit (analyse composition) : marche + stocke + rapide.
- [ ] C3. 3 blocs IA depuis la recherche : marchent + stockés.

## D. ANALYSE DE LA PROMESSE — fonctionnelle + raisonnablement rapide
- [ ] D1. Flux `promesse-identify` → `promesse-fetch-description` → `coherence-analyze` : marche de bout en bout.
- [ ] D2. Cache cross-user `coherence_cache` : re-analyse = ressort (crédit consommé), pas de recalcul.

## E. ZÉRO INCI (sauf images) — sweep 3 repos
- [ ] E1. Trouver TOUTE référence INCI Beauty (code, commentaires, logique, données) sur les 3 repos.
- [ ] E2. Pour chaque : remplacer par notre système OU supprimer. Aucune note/logique INCI résiduelle.
- [ ] E3. EXCEPTION : images (on garde les images incibeauty pour l'instant). Noter où, pour migration future.

## F. PARITÉ WEB (CosmetWiki) — doit marcher comme le mobile
- [ ] F1. Porter le moteur pastille (scoring produit internet) + neutraliser color cap côté web.
- [ ] F2. Vérifier que web lit nos scores (catalog.score) partout (recherche/browse/analyse/reco/promesse).
- [ ] F3. **Bug scan iPhone (web)** : iPhone/Safari n'arrive pas à scanner les QR/code-barres (flou/échec). Investiguer (getUserMedia constraints, focus, BarcodeDetector absent sur iOS → fallback lib ?) + corriger.
- [ ] F4. Redeploy Vercel après validation.

## G. RESTE + RÉGRESSIONS
- [ ] G1. Tester toutes les autres features (historique, favoris, routine, alternatives, restrictions UI, crédits, offre/paywall, légal).
- [ ] G2. Revert immédiat de toute régression détectée.
- [ ] G3. APK build = utilisateur (jamais auto).

---

## Méthode de test (RÉEL, pas unitaire)
- Edge Functions : curl avec payload réel + `-w "%{time_total}"` (mesure e2e) ; vérifier statut + forme réponse + contenu.
- RPC : `explain (analyze, timing)` + appel réel + inspection des lignes (nos scores, restrictions respectées).
- Chaud vs froid : 1er appel (froid) puis 2e (chaud) pour distinguer cache/buffer.
- Code UI (RN/web) : revue du contrat + chemins ; signaler ce qui n'est pas testable sans device/navigateur.
