# Export catalogue → CSV / Excel

Exporte les ~491 000 produits du catalogue dans un fichier CSV (ouvrable dans
Excel / Google Sheets). **Aucune image téléchargée** : le fichier contient
`image_url` + `nom_fichier_image` (= `<code-barre>.<ext>`) pour un éventuel
téléchargement ultérieur.

Source : la vue `cosme_check.catalog_export` (créée en base). Colonnes :

| Colonne | Contenu |
|---|---|
| `code_barre` | EAN |
| `nom`, `marque` | |
| `categorie_fil_ariane` | chemin complet (`l1/l2/l3`) |
| `categorie_niveau1/2/3` | fil d'Ariane éclaté |
| `inci` | liste des ingrédients |
| `nb_ingredients_reconnus`, `nb_orange`, `nb_rouge` | |
| `note_brute_sur_20` | note moteur |
| `note_affichee_sur_20` | note **plafonnée** (celle vue par l'utilisateur) |
| `note_label`, `note_couleur` | Très bien/Bien/Moyen/Faible · vert/jaune/orange/rouge |
| `image_url`, `nom_fichier_image` | |
| `source_url`, `is_active` | |

⚡ **Charge base** : négligeable. Méthode psql = 1 seule lecture séquentielle ;
méthode Node = pagination par index (pause 40 ms entre pages). Rien à voir avec
des écritures (aucun trigger).

---

## Méthode 1 — psql (la plus rapide, recommandée)

```bash
# DATABASE_URL : Supabase Dashboard → Project Settings → Database →
# Connection string → URI (préfère la connexion DIRECTE, port 5432).
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/catalog-export/export.sql > catalog.csv

# Accents Excel (ajoute un BOM UTF-8) :
printf '\xEF\xBB\xBF' | cat - catalog.csv > catalog_excel.csv
```

## Méthode 2 — Node (portable, sans psql)

Ajoute déjà le BOM UTF-8 (accents OK dans Excel), pagine tout seul.

```bash
export SUPABASE_URL="https://rogesnduejmqpxolhbif.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<clé service_role : Dashboard → Settings → API>"
node scripts/catalog-export/export-catalog.mjs
# → catalog.csv (~300 Mo)
```

---

## Ouvrir dans Excel

- 491k lignes < la limite Excel (1 048 576) : ça tient sur une feuille, mais
  c'est lourd — préfère **Google Sheets** ou **Données → À partir d'un CSV** dans
  Excel (choisir l'origine **UTF-8**).
- Pour un `.xlsx` natif, réimporte le CSV et « Enregistrer sous → Classeur Excel ».

## (Plus tard) télécharger les images

Chaque ligne a `image_url` et `nom_fichier_image` (`<ean>.<ext>`). Un script de
téléchargement rate-limité peut lire le CSV et enregistrer chaque image dans un
dossier `images/`. Volume attendu : **~15-40 Go** (490k fichiers). À demander si
besoin.
