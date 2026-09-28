# Notes, alternatives et analyse par zone : preuves en images (28 septembre 2026)

Émulateur **Pixel 9 Pro** (Android), app CosmeCheck branchée sur la **production**
(base Supabase et fonctions edge déployées le 28 septembre), code de l'app de la
branche `release/build-26` chargé par Metro. Compte de test éphémère « Stela »
créé pour l'occasion (profil : peau du visage grasse, acnéique et sensible, peau
du corps sèche, cheveux secs, 1 restriction : méthylisothiazolinone), supprimé
après les captures.

Les retours d'origine sont ceux de Stela (captures WhatsApp) : une alternative
« Très bien » qui devient 2 étoiles une fois ouverte, une crème capillaire jugée
comme un soin visage, des alternatives qui ne respectent pas la composition, et
une exposition cumulée qui ne bouge pas.

## 01. Une seule note partout : le cas « pielsana gel de ducha »

| Capture | Ce qu'on voit |
|---|---|
| `01-recherche-triangle-orange.png` | Recherche « pielsana » : le produit affiche le triangle orange (7,44, « Faible »), comme le vrai gel douche Pielsana juste en dessous. Avant : cœur vert « Très bien » (17,34). |
| `02-fiche-2-etoiles-orange.png` | Sa fiche : 2 étoiles orange, la même note. La restriction (méthylisothiazolinone) est détectée, compatibilité 21 % « Pas adapté ». |

Cause : la note du catalogue venait de l'ancien outil d'import, qui n'avait lu
que 5 ingrédients sur une photo OCR en espagnol. Le moteur de l'app, lui, en
lisait 16 dont 2 rouges (MIT, MCI) et 3 orange. Désormais la note est celle du
moteur sur les ingrédients affichés, et la base se réaligne toute seule.

## 02. Alternatives : même type de formule, et la carte == la fiche

| Capture | Ce qu'on voit |
|---|---|
| `01-gel-douche-alternatives-liquides.png` | Alternatives du gel douche : uniquement des bases lavantes liquides (savon d'Alep liquide, huile savonneuse). Plus de savon solide. |
| `02-alternative-tapee-5-etoiles.png` | La carte « Très bien » ouverte : 5 étoiles vertes, identique à la carte. |
| `03-creme-alternatives-emulsions.png` | Alternatives d'une crème visage et corps (émulsion eau + huile) : une crème, un lait, une base crème. Aucune huile ni aucun baume. |
| `04-alternative-bien-4-etoiles.png` | La carte « Bien » ouverte : 4 étoiles vertes. |

## 03. Analyse sans code-barres : sa propre note

| Capture | Ce qu'on voit |
|---|---|
| `01-deodorant-fa-sa-propre-note.png` | « Déodorant Fa » saisi à la main : 2 étoiles orange (7,08), la note de SES ingrédients. Avant : la fiche empruntait la note 20 d'un autre déodorant trouvé par le nom (43 fiches concernées en base). |

## 04. Pépites du jour

| Capture | Ce qu'on voit |
|---|---|
| `01-carte-pepites-accueil.png` | Les Pépites « Très bien ». |
| `02-fiche-pepite-5-etoiles.png` | La Pépite ouverte : 5 étoiles vertes. Les notes des Pépites ne sont plus arrondies à l'entier (71 cœurs « Très bien » étaient faux : 16,6 devenait 17). |

## 05. Crème capillaire : jugée comme un soin cheveux

| Capture | Ce qu'on voit |
|---|---|
| `01-masque-capillaire-compatibilite.png` | Masque capillaire Weleda, profil au visage gras, acnéique et sensible : 87 % « Très compatible », « répond à tes cheveux secs ». Aucune règle de peau appliquée. |
| `02-ce-quil-faut-retenir-cheveux.png` | Les 3 blocs IA parlent des cheveux (« Masque nourrissant pour cheveux secs »), pas de la peau du visage. |

## 06. Exposition cumulée : la moyenne expliquée

| Capture | Ce qu'on voit |
|---|---|
| `01-routine-1-produit.png` | 1 produit : « Note de ton produit ». |
| `02-ajout-deodorant-evolution.png` | Ajout d'un produit moins bien noté : « Moyenne de tes 2 produits, selon leur fréquence » et « -4,6 depuis ta dernière modification ». |
| `03-ajout-proche-moyenne-inchangee.png` | Ajout d'un produit proche de la moyenne (le cas de Stela) : « Inchangée : tes ajouts ont une note proche de ta moyenne. » |

## Vérifications automatiques (même jour, sur la production)

`node scripts/note-unique-e2e.ts` : compte éphémère créé puis supprimé, tout vert.
- 13 produits réels : note identique sur les 6 surfaces (note servie par
  l'analyse, catalogue, fiche, recherche, cache de fiche, historique).
- Analyse sans code-barres : sa propre note, jamais celle du produit trouvé par le nom.
- 200 Pépites : note égale au catalogue.
- Alternatives d'une crème : aucune forme opposée, carte == fiche == cache.
- Masque capillaire : aucune pénalité de peau dans la compatibilité.

Tests Jest : 93 suites, 1 331 tests, tout vert. E2E relancé après le
réalignement de la base : tout vert sur un nouvel échantillon.

## Réalignement de la base (production, même jour)

Sauvegardes complètes avant écriture (`cosme_check._catalog_score_backup_20260928`,
`_analyses_score_backup_20260928`, `_score_cap_backup_20260928`,
`_pa_refresh_backup_20260928`, `_pa_stale_drop_backup_20260928`).

| Étape | Lignes |
|---|---|
| Notes catalogue alignées sur les ingrédients affichés | 28 141 (dont 1 058 changements d'étoiles : 271 baisses, 787 hausses) |
| Compteurs rouge/orange du catalogue corrigés | 143 088 |
| Caches de fiche périmés (juillet) recalculés avec le moteur actuel | 27 667 |
| Caches périmés non recalculables, supprimés (recalcul au prochain scan) | 142 |
| Produits jamais scannés à liste propre : fiche créée sans IA (identique à un vrai scan) | 123 955 (15 988 notes corrigées, dont 1 093 changements d'étoiles) |

Contrôle final sur les 258 791 produits analysés : la note du catalogue est
exactement celle calculée sur les ingrédients affichés pour 100 % d'entre eux,
hors 134 produits dont moins de la moitié des ingrédients est reconnue (le
catalogue garde alors sa note, règle voulue).
