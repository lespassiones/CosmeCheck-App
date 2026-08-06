---
name: moderation-produit
description: Modération des produits soumis par les utilisateurs (table cosme_check.catalog_photo_submissions). Résout l'INCI par recherche web (ta propre WebSearch d'abord), classe dans la taxonomie 393 feuilles, calcule le score DÉTERMINISTE via le moteur prod, et publie au catalogue les produits fiables (photo liée à l'EAN). À lancer pour vider/traiter la file de soumissions produit.
---

# Modération produit — file `catalog_photo_submissions`

Tu traites les produits que les utilisateurs soumettent quand ils scannent un produit absent du catalogue (photos + EAN parfois + OCR parfois). Objectif par produit : **INCI fiable → sous-catégorie → score déterministe → publication au catalogue avec la photo liée à l'EAN**.

## Règles d'or (NE JAMAIS enfreindre)

1. **Le score est DÉTERMINISTE, jamais une IA.** Il vient du moteur prod (`pastilleTone → synthScore`, edge `admin-score-upsert`) qui lit la couleur de chaque ingrédient dans `cosme_check.ingredients`. Ton rôle = trouver le bon INCI + classer + jauger la confiance. Faire "deviner" un score à un LLM réintroduit les faux scores.
2. **INCI = source de la vérité.** Priorité de résolution : (a) **ta propre WebSearch (Claude)** d'abord, (b) OpenAI web-search en fallback SEULEMENT (clé `OPENAI_API_KEY` dans `c:/Projet/CosmeCheckAdmin/.env`), (c) l'OCR `extracted_inci` de la soumission comme recoupement.
3. **Ordre des ingrédients = critique.** Le score pondère par position (Tête×3 / Corps×2 / Queue×1). Les listes **alphabétiques** (fréquentes sur INCI Beauty, QueChoisir) faussent le score → préfère **incidecoder** (ordre réel) ou l'OCR de la vraie photo. Si seule une liste alphabétique existe → confiance MOYENNE/BASSE → brouillon.
4. **EAN scanné = clé du catalogue**, même si c'est un code revendeur/non-GS1 (pour que le re-scan retrouve le produit). Si la soumission n'a pas d'EAN → clé synthétique `cc-photo-<submission_id>`.
5. **Pas de tiret cadratin** nulle part (règle utilisateur). Virgule / point / reformulation.
6. **Publie seulement en HAUTE confiance** (voir grille). Sinon laisse en brouillon (status reste `pending`).

## Prérequis

- **Node >= 22** (le scoreur est en TS, type-stripping natif). `node --version`.
- **Supabase MCP** (`execute_sql`) pour lire la file et vérifier le catalogue. Projet `rogesnduejmqpxolhbif`.
- **`c:/Projet/CosmeCheckAdmin/.env`** : contient `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (les scripts le lisent), `OPENAI_API_KEY` (fallback web).
- **Taxonomie 393 feuilles** : `c:/Projet/Cosme-Scraper/data/taxonomy_flat.txt` (slugs `famille/sous/feuille`). Lis-la pour classer.
- Scripts fournis dans ce skill : `scripts/scorer.mts` (dry-run, lecture seule) et `scripts/commit.mts` (publie + approuve).

## Pipeline (par lot de ~9-15 produits)

### 1. Récupérer la file
```sql
select s.id, s.ean, s.brand, s.name, s.category,
       length(coalesce(s.extracted_inci,'')) as inci_len, s.extracted_inci,
       s.extracted_name, s.extracted_brand, s.photo_path_1, s.photo_path_2, s.created_at,
       (c.ingredients_text is not null and length(c.ingredients_text) > 20) as catalog_has_inci
from cosme_check.catalog_photo_submissions s
left join cosme_check.catalog c on c.ean = s.ean
where s.status = 'pending'
order by s.created_at desc;
```
- `catalog_has_inci = true` → le produit est DÉJÀ au catalogue : **ne pas re-scorer**, juste lier la photo si besoin (voir §7 "photo-only").

### 2. Résoudre l'INCI (par produit)
- **WebSearch (toi)** : `"<marque> <nom> ingredients INCI"`. Vise incidecoder (ordre réel). Récupère l'INCI complet ordonné.
- **Sans nom (EAN seul)** : reverse-lookup l'EAN sur `incibeauty.com/produit/<ean>` ou OpenBeautyFacts pour identifier le produit, puis son INCI.
- **Recoupe avec l'OCR** `extracted_inci` : si l'OCR (photo réelle) et le web divergent, note-le. L'OCR reflète l'unité physique scannée (utile si le web est une formule d'un autre marché/année). Si les deux donnent la même bande de score → confiance OK même en cas de petit écart.
- **Fallback OpenAI** (seulement si ta WebSearch échoue) : `POST https://api.openai.com/v1/chat/completions` model `gpt-4o-mini-search-preview` avec la clé `OPENAI_API_KEY`.

### 2bis. Fallback VISION (produit sans nom / EAN non résolu / aucun OCR)
Quand une soumission n'a ni nom, ni OCR, et que l'EAN ne résout rien en ligne (codes revendeur), NE la laisse PAS en brouillon avant d'avoir REGARDÉ les photos toi-même :
1. **Télécharge** les 2 photos publiques (bucket `cosmetwiki-products`) en local :
   ```bash
   BASE="https://rogesnduejmqpxolhbif.supabase.co/storage/v1/object/public/cosmetwiki-products/"
   curl -s "${BASE}<photo_path_1>" -o face.webp
   curl -s "${BASE}<photo_path_2>" -o ing.webp   # si présent (côté ingrédients)
   ```
   (Si un outil n'affiche pas le `.webp`, convertis-le : `magick face.webp face.png` ou `cwebp -o`/`dwebp`.)
2. **Lis-les en VISION** avec l'outil Read (photo de face → marque + nom ; photo de dos → liste INCI en ordre réel).
3. **Recoupe / complète par WebSearch** : cherche `"<marque lue> <nom lu> ingredients INCI"` pour confirmer l'identité et récupérer l'INCI complet ordonné (incidecoder). Si l'INCI lu sur la photo est net et complet, il fait foi (ordre réel de l'unité physique).
4. Reprends le pipeline normal (classer → scorer dry-run → publier si HAUTE confiance).
Ne reste en brouillon QUE si la photo des ingrédients est illisible/absente ET que le web ne donne rien.

### 3. Classer dans la taxonomie
Choisis LA feuille la plus précise de `taxonomy_flat.txt` (slug complet `famille/sous/feuille`). Exemples : parfum homme EDT → `parfum/parfum-pour-homme/eau-de-toilette-pour-homme` ; masque hydratant → `soin-du-corps-et-visage/masque-et-gommage/masque-creme-gel` ; déo pieds (Akileïne) → `soin-du-corps-et-visage/soin-des-pieds-et-jambes/deodorant-pour-les-pieds`.

### 4. Score dry-run (lecture seule, AUCUNE écriture)
Construis un JSON `lot.json` = `[{ "label","ean","inci" }, ...]` puis :
```bash
node .claude/skills/moderation-produit/scripts/scorer.mts lot.json
```
Sortie par produit : `identPct`, `score`, `scoreLabel`, `stars`, `nVert/nJaune/nOrange/nRouge`. `verdict:"REFUSÉ (<50% reconnus)"` = INCI illisible → brouillon.

### 5. Grille de confiance
- **HAUTE → publie** : identité certaine (EAN vérifié ou nom sans ambiguïté) + INCI **>= 90%** reconnu + ordre réel (pas alphabétique) + score non "refusé". (Un score Faible/1★ n'empêche PAS la publication s'il est honnête : c'est le vrai score.)
- **MOYENNE / BASSE → brouillon** (laisse `pending`) : identité douteuse, INCI introuvable/partiel/alphabétique, ou sources qui changeraient la bande de score.

### 6. Publier les HAUTES confiances
Construis `commit.json` = `[{ submission_id, ean, name, brand, inci, category, photo_path_1, source_url }, ...]` (mêmes produits, champs complets ; `ean` = EAN scanné ou `cc-photo-<submission_id>`) puis :
```bash
node .claude/skills/moderation-produit/scripts/commit.mts commit.json
```
Chaque ligne appelle `admin-score-upsert` (calcule le score + upsert `catalog` + `is_active`), lie `photo_path_1` comme image, et passe la soumission en `approved`. Vérifie `ok:true` par produit.

### 7. Cas particuliers
- **Déjà au catalogue** (`catalog_has_inci`) : ne republie pas. Lie juste la photo :
  ```sql
  update cosme_check.catalog set image_url =
    'https://rogesnduejmqpxolhbif.supabase.co/storage/v1/object/public/cosmetwiki-products/'||'<photo_path_1>'
  where ean = '<ean>';
  ```
  puis passe la soumission `approved`.
- **Doublons** (même EAN soumis 2×) : publie une fois, marque les autres `approved` sans republier.
- **Brouillons** : laisse `pending`, note la raison (INCI alphabétique / introuvable / EAN revendeur non résolu / produit sensible). L'admin les traitera à la main.

### 8. Bilan final
Tableau par produit : publiés (score + note + ★ + V/J/O/R) / brouillons (raison) / échecs. Rappelle le total cumulé.

## Points de vigilance connus (données réelles)
- **BHT** et **Cyclopentasiloxane** (silicone D5) sont classés **Rouge** (tags `cmr`, `perturbateur-endocrinien`). Un seul suffit à faire chuter un produit à liste courte en 1★ (ex : Vaseline, crèmes siliconées). C'est la politique voulue, pas un bug.
- **Petrolatum** = Orange (huile minérale). **Parfums** = beaucoup de jaunes (allergènes : Limonene, Linalool, Coumarin, Citral, Geraniol...) → 2★ quasi systématique.
- `admin-score-upsert` exige `inci` >= 20 caractères et **refuse** si < 50% des ingrédients reconnus (renvoie `unknown`) → ces produits restent en brouillon (jamais de note gonflée).

## Vérifier après coup
```sql
select ean, brand, name, score, score_label, count_total, count_orange, is_active, (image_url is not null) as has_image
from cosme_check.catalog where ean in ('<ean1>','<ean2>');
```
