# Architecture : mobile & web, ce qu'ils partagent (cahier des charges)

## Les deux apps sont des jumelles
- **Mobile** : `CosmeCheck-App` (Expo / React Native).
- **Web** : `CosmetWiki` (Next.js, déployé sur Vercel) = le site `cosme-check.com`.
- **Admin** : app web séparée (Next.js) pour l'administration.

Les trois pilotent **la même base Supabase** (projet `rogesnduejmqpxolhbif`, schéma `cosme_check`). Le « cerveau » est donc **commun** ; seules les interfaces diffèrent.

## Ce qui est PARTAGÉ (le socle commun)
Tout ce qui suit vit dans Supabase et est appelé **de la même façon** par mobile et web :
- **Base** : `catalog` (produits + note), `ingredients` (couleurs), `product_score_cap` (sidecar note/couleur pour recherche/browse), `analyses`, `routine_items`, `coherence_analyses`, `user_profiles`, `user_credits`, etc.
- **RPC** (surtout schéma `public`, préfixe `cosme_check_*`) : recherche catalogue, produit par EAN, fiche ingrédient, alternatives, recommandations, browse par catégorie, crédits…
- **Edge functions (Deno)** : `analyser` (la note), `advisor-chat`, `coherence-analyze`, `synthesis`, `ocr-scan`, `ecommerce-scrape`, `product-by-barcode`, etc.
- **Le moteur de notation** : couleurs d'ingrédients → pastille → note. La logique de calcul est dupliquée à l'identique côté mobile, edge et web (voir [calcul-scores-produits.md](./calcul-scores-produits.md)).

➡️ Conséquence : **une même requête donne le même résultat** sur mobile et web. La couleur d'un produit ou d'un ingrédient est identique partout, par construction, tant que le barème couleur reste unique (≥13 vert) dans les 3 copies + la base.

## Ce qui DIFFÈRE (juste la présentation)
- L'UI (React Native vs Next.js) et les **caches** locaux (AsyncStorage côté mobile, cache navigateur/React Query côté web).
- Le mobile a besoin d'un **rebuild APK** pour prendre un changement de code client ; le web se **redéploie** sur Vercel. L'edge (serveur) est commune et se déploie une fois.

## Points de vigilance de cohérence
- **Barème couleur unique** : `≥13 vert / ≥9 jaune / ≥5 orange / <5 rouge`, à respecter dans mobile + edge + web + base (`f_score_tone`). Un écart ici = « même produit, couleur différente ».
- **Produit connu** : la note vient de `catalog.score` (source de vérité), pas d'un recalcul local.
- **Après un changement de couleurs ou de calcul** : recalculer le catalogue et resynchroniser (voir [push-produits-supabase.md](./push-produits-supabase.md)), redéployer edge + web, rebuild APK.

## Données de référence
- La liste des ingrédients avec leur couleur est fournie dans **`ingredients-couleurs.csv`** (dans ce dossier) — l'export de la classification en vigueur.
