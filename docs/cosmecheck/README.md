# CosmeCheck — Le dossier « tout savoir »

Ce dossier explique **comment CosmeCheck fonctionne**, de façon claire et directe (pas trop technique). Il est **identique dans les deux apps** (mobile `CosmeCheck-App` et web `CosmetWiki`) car elles partagent le même cerveau (base Supabase + moteur de notation).

## À quoi sert CosmeCheck
Décrypter la composition des cosmétiques : on lit la liste d'ingrédients (INCI), on donne à chaque ingrédient une **couleur** (vert/jaune/orange/rouge), et on en déduit une **pastille** et une note pour le produit. On analyse aussi la cohérence entre la **promesse marketing** et la composition réelle.

## Les fichiers de ce dossier
1. **[classification-ingredients.md](./classification-ingredients.md)** — comment on classe les ingrédients et **sur quoi on se base** pour les couleurs.
2. **[calcul-scores-produits.md](./calcul-scores-produits.md)** — comment on calcule la pastille et la note d'un produit.
3. **[push-produits-supabase.md](./push-produits-supabase.md)** — comment mettre à jour les produits **sans saturer la base**, et les pièges Supabase (triggers, edge functions, RPC).
4. **[fonctionnalites.md](./fonctionnalites.md)** — la liste de **toutes** les fonctionnalités de l'app.
5. **[architecture-mobile-web.md](./architecture-mobile-web.md)** — comment mobile et web communiquent, ce qu'ils **partagent**, cahier des charges.

## Principe fondateur
La notation est **100 % propriétaire CosmeCheck**, dérivée de **sources publiques** (réglementation cosmétique européenne + données de sécurité officielles). Elle ne dépend d'aucune note d'un service tiers.

> ⚠️ **Seule exception temporaire** : certaines **photos produit** sont encore hébergées sur un domaine externe. Migration vers notre propre stockage (Supabase) prévue. C'est la seule chose restante à internaliser.
