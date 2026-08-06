# Modération produit — process et organisation

Ce document décrit comment on traite la file des produits soumis par les utilisateurs
(scan d'un produit absent du catalogue → photos + EAN/OCR envoyés dans
`cosme_check.catalog_photo_submissions`). Le skill `/moderation-produit` automatise
exactement ce process.

## But

Pour chaque soumission : obtenir un **INCI fiable**, la **sous-catégorie** exacte, un
**score déterministe**, et **publier** le produit au catalogue (`cosme_check.catalog`)
avec la **photo liée à l'EAN scanné**, pour que le prochain scan retrouve le produit.

## Principe central : IA pour identifier, moteur déterministe pour noter

- L'IA (recherche web + lecture) sert à **trouver le bon INCI**, **identifier** le produit
  et **classer** dans la taxonomie. Elle NE calcule JAMAIS le score.
- Le **score** vient du moteur prod exact (`analyser/score.ts` : `pastilleTone → synthScore`),
  via l'edge `admin-score-upsert`. Il lit la couleur (Vert/Jaune/Orange/Rouge) de chaque
  ingrédient dans `cosme_check.ingredients` (dérivée des règlements CE 1223/2009, CMR,
  perturbateurs endocriniens, 26 allergènes UE). Ainsi la note d'un produit publié est
  IDENTIQUE à ce que l'app calcule en live.

## Les 4 étapes par produit

1. **Résoudre l'INCI** — WebSearch (Claude) en premier (viser incidecoder, ordre réel),
   OpenAI web-search en fallback, OCR de la photo en recoupement. Reverse-lookup de l'EAN
   pour les soumissions sans nom.
2. **Classer** — une des 393 feuilles de `Cosme-Scraper/data/taxonomy_flat.txt`.
3. **Scorer (dry-run, lecture seule)** — `scorer.mts` importe le vrai `parse.ts` + `score.ts`
   du repo (zéro dérive), appelle la RPC couleur, sort score + étoiles + V/J/O/R sans écrire.
4. **Publier si HAUTE confiance** — `commit.ts` appelle `admin-score-upsert` (score + upsert
   catalogue + photo), puis passe la soumission en `approved`.

## Grille de confiance

- **HAUTE → publie** : identité certaine (EAN ou nom sans ambiguïté), INCI >= 90% reconnu,
  ordre réel (pas alphabétique), score non refusé. Un score Faible/1★ honnête se publie.
- **MOYENNE / BASSE → brouillon** : identité douteuse, INCI introuvable/partiel/alphabétique,
  ou conflit de sources qui changerait la bande. Reste `pending` pour validation manuelle.

## Pièges à connaître

- **Ordre des ingrédients** : le score pondère par position. Les listes alphabétiques
  (INCI Beauty, QueChoisir) faussent le score → préférer incidecoder ou l'OCR de la photo.
- **EAN** : garder l'EAN SCANNÉ comme clé (même code revendeur) ; sinon `cc-photo-<id>`.
- **BHT** et **cyclopentasiloxane** = Rouge (CMR/perturbateur endocrinien) → un seul écrase
  une liste courte en 1★ (Vaseline, crèmes siliconées). Politique voulue, pas un bug.
- **Parfums** : 30+ allergènes jaunes → 2★ quasi systématique. Honnête.
- `admin-score-upsert` refuse si < 50% reconnus ou INCI < 20 car. → brouillon (pas de note gonflée).

## Outils

- Skill : `.claude/skills/moderation-produit/` (SKILL.md + `scripts/scorer.mts` + `scripts/commit.mts`).
- Env / clés : `c:/Projet/CosmeCheckAdmin/.env` (URL, service role key, OpenAI key).
- Moteur de score : edge `admin-score-upsert` (repo `CosmeCheck-App/supabase/functions`).
- Écriture : RPC `cosme_check_upsert_catalog_product` → table `cosme_check.catalog`.

## Lancer

Dans Claude Code (repo CosmeCheck-App) : `/moderation-produit`. Il récupère la file,
traite par lots, publie les fiables, laisse le reste en brouillon, et fait un bilan.

## État au 6 août 2026

- **25 produits publiés** (pilote 3 : Garnier, Clarins, Yves Rocher Monoï ; Lot A 7 ;
  Lot B 15).
- **2 brouillons** : Monsavon anti-transpirant (INCI web alphabétique + variante ambiguë),
  Mixa Intensif (INCI web incomplet).
- **~16 soumissions restantes** (surtout "EAN seul sans nom" et marques obscures ;
  certaines finiront en brouillon).
- **3 déjà au catalogue** (DR.JART+, Avène Cleanance, Topicrem Ultra) : à photo-approve seulement.
