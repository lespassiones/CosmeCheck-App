# Les fiches des magasins, mot pour mot

**Ce fichier ne s’écrit pas à la main.** Il sort de
[scripts/fiches-store.mjs](../scripts/fiches-store.mjs), qui refuse de
l’écrire si un champ dépasse son plafond, contient un tiret cadratin, un prix,
une marque concurrente ou, côté Apple, le nom d’une autre plateforme.

```bash
node scripts/fiches-store.mjs              # vérifie, écrit ce fichier, montre le différentiel
node scripts/fiches-store.mjs --appliquer  # pousse sur la prochaine version App Store et sur Play
```

> ⚠️ `--appliquer` ne soumet rien à Apple et ne touche ni aux binaires ni aux
> captures. Sur Google Play, valider l’édition envoie la fiche à l’examen.

L’app est en français seulement, et le reste pour l’instant. La localisation
**fr-CA** reçoit le même texte que fr-FR : sans elle, la vitrine canadienne
n’indexe que l’anglais et le français canadiens, et nos mots-clés n’y comptent
pas. Les captures ne sont pas envoyées pour fr-CA : App Store Connect reprend
celles de la langue principale (à vérifier à l’écran avant de soumettre).

---

## Comment l’app se retrouve

| | ce qui est indexé | ce qui fait marcher « cosme check » et « cosmecheck » |
|---|---|---|
| **App Store** | le nom, le sous-titre, les mots-clés. **Pas la description** | « Cosme Check » en deux mots dans le nom ; « cosmecheck » collé dans les mots-clés |
| **Play** | le titre, la brève description, la description complète | le titre, et « aussi écrit cosmecheck » à la fin de la description |

Mots-clés Apple : pas d’espace après les virgules, aucun mot déjà présent dans
le nom ou le sous-titre (Apple les indexe déjà et les combine avec les
mots-clés), **jamais de marque concurrente**.

### Pourquoi chaque mot est là

| Mot | Pourquoi |
|---|---|
| Cosme Check (nom) | La marque, en deux mots : « cosme » et « check » sont indexés séparément, donc « cosme check » et « cosme test » (vu dans Bing) retrouvent l’app. |
| scan, cosmétique (nom) | L’intention tapée dans un magasin. « cosmétique » est la racine des requêtes les plus lourdes (produit cosmétique, cosmétique bio, cosmétique naturelle). |
| composition (sous-titre) | « composition cosmétique », 100-1k. C’est ce que l’app fait, mot pour mot. |
| INCI (sous-titre) | 1k-10k, le mot générique le plus cherché du domaine. Placé dans le sous-titre, qui pèse plus que les mots-clés. |
| skincare (sous-titre) | « routine skincare » 1k-10k : le mot qu’emploient les 18-35 ans, combiné à « routine » des mots-clés. |
| cosmecheck | La marque collée en un seul mot (cherchée, vue dans Bing). Pour un moteur, « cosmecheck » n’est pas « cosme check ». |
| routine | Avec skincare : « routine skincare ». L’app note une routine entière. |
| crème, visage | « crème visage » 1k-10k : le produit le plus scanné, et la requête la plus lourde après INCI. |
| beauté | « application beauté » 100-1k, « scanner produit beauté ». |
| peau | « analyse peau », « type de peau » 100-1k. L’app adapte la note au type de peau. |
| bio | « cosmétique bio » 1k-10k. Le mot le moins direct de la liste : l’app ne certifie pas le bio, elle montre la composition, ce que cherche quelqu’un qui hésite sur un produit bio. À retirer en premier si Apple le juge hors sujet (2.3.7). |
| naturelle | « cosmétique naturelle » 100-1k. L’app vérifie la promesse « naturel » d’un emballage. |
| allergène | « allergène cosmétique ». L’app signale les allergènes réglementés en Europe. |
| ingrédient | « ingrédients cosmétiques », « application ingrédients cosmétiques ». |
| soin | « soin visage », « application soin visage » : le mot courant pour un produit de skincare. |
| analyse | « analyse cosmétique », « analyse peau ». |
| produit | « produit cosmétique » 1k-10k, « scanner produit beauté ». |

### Ce qui n’a pas été retenu

| Mot | Pourquoi |
|---|---|
| yuka, inci beauty, et toute autre marque | Marques concurrentes : motif de rejet (2.3.7) et risque de plainte. Jamais dans le nom, le sous-titre, les mots-clés ni la description. |
| app, application, gratuit | Ignorés ou déjà couverts par Apple : chaque caractère serait perdu. |
| shampooing, acné, dermo, label (anciens mots-clés) | Remplacés par des mots à volume mesuré (crème, visage, soin, produit). « acné » et « dermo » tirent vers le registre médical, qu’on évite. |
| perturbateur, endocrinien | Volume faible (10-100) et 22 caractères ; vocabulaire de santé qui demande des précautions. |

### Les volumes mesurés

Google Keyword Planner, France, toutes langues, recherches mensuelles
moyennes, relevé du 19/10/2026. C’est la recherche web, pas celle des
magasins (qui ne publient aucun volume), mais c’est le meilleur indicateur
disponible. Bing montre en plus que la marque est cherchée (« cosmecheck »,
« cosme test »).

| Requête | Volume | Où elle est couverte |
|---|---|---|
| inci beauty | 10k-100k | marque concurrente : JAMAIS dans nos champs |
| inci | 1k-10k | sous-titre |
| routine skincare | 1k-10k | skincare (sous-titre) + routine (mots-clés) |
| crème visage | 1k-10k | crème + visage (mots-clés) |
| produit cosmétique | 1k-10k | cosmétique (nom) + produit (mots-clés) |
| cosmetique bio | 1k-10k | cosmétique (nom) + bio (mots-clés) |
| composition cosmétique | 100-1k | composition (sous-titre) + cosmétique (nom) |
| application cosmétique | 100-1k | cosmétique (nom) ; « application » est ignoré par Apple |
| application beauté | 100-1k | beauté (mots-clés) |
| analyse peau | 100-1k | analyse + peau (mots-clés) |
| type de peau | 100-1k | peau (mots-clés), dans la description Play |
| cosmétique naturelle | 100-1k | cosmétique (nom) + naturelle (mots-clés) |
| yuka cosmétique | 100-1k | marque concurrente : JAMAIS |
| scan cosmétique | 10-100 | nom, tel quel |
| scanner produit beauté | 10-100 | scan (nom) + produit + beauté (mots-clés) |
| analyse cosmétique | 10-100 | analyse (mots-clés) + cosmétique (nom) |
| allergène cosmétique | 10-100 | allergène (mots-clés) |
| ingrédients cosmétiques | 10-100 | ingrédient (mots-clés) + cosmétique (nom) |
| application ingrédients cosmétiques | 10-100 | idem |
| application skincare | 10-100 | skincare (sous-titre) |
| perturbateurs endocriniens cosmétiques | 10-100 | non retenu : volume faible, et mot de santé à manier avec soin |
| application scan cosmétique, application soin visage, scanner crème, déchiffrer composition | aucun | couverts quand même par les mots du nom, du sous-titre et des mots-clés |

À relire dans 14 jours après la mise en vente : conversion de la fiche, et
requêtes de recherche dans App Store Connect (Analyse > Sources).

---

## App Store Connect, fr-FR (et fr-CA, identique)

### Nom  ·  28 / 30

```
Cosme Check: scan cosmétique
```

### Sous-titre  ·  27 / 30

```
Composition INCI & skincare
```

### Mots-clés  ·  99 / 100

```
cosmecheck,routine,crème,visage,beauté,peau,bio,naturelle,allergène,ingrédient,soin,analyse,produit
```

### Texte promotionnel (modifiable sans vérification)  ·  140 / 170

```
Une crème, un shampoing, un déo : scanne-le, lis sa composition INCI en clair, et vois s'il convient à ta peau et si ses promesses tiennent.
```

### Nouveautés de la 1.0.4 (à relire)  ·  331 / 4000

```
Des notes plus cohérentes, et un quiz du jour bien plus riche.

• Le quiz du jour passe à 1 000 questions sur la peau et les soins, et il fonctionne même sans connexion.
• La note d'un produit est calculée de la même façon dans le catalogue, dans ton analyse et dans tes alternatives.
• Corrections et améliorations de performance.
```

### Description  ·  2263 / 4000

```
Tu dépenses parfois des dizaines d'euros dans une crème... sans savoir si elle est vraiment faite pour ta peau. Cosme Check scanne ton cosmétique et te dit en quelques secondes ce qu'il contient, s'il convient à ton type de peau et s'il tient les promesses de son emballage.

CE QUE COSME CHECK T'APPORTE

• Décrypte la composition INCI
Chaque ingrédient de la liste INCI est expliqué simplement : à quoi il sert, et pourquoi il compte pour toi. Les allergènes réglementés en Europe et les ingrédients que tu veux éviter sont signalés.

• Un score de compatibilité avec ta peau
Type de peau, sensibilités, préférences : la note tient compte de ton profil, pas d'une moyenne.

• Vérifie les promesses
Hydratant, anti-âge, sans sulfates, naturel... Cosme Check regarde si la composition tient ce que la marque affiche. Tu ne paies plus pour du marketing.

• Note toute ta routine skincare
Ajoute tes soins visage, corps et cheveux : tu vois ce à quoi ta peau est exposée au total, les produits qui se contredisent, et ta progression vers tes objectifs beauté.

• Trouve mieux, dans la même catégorie
Une crème te convient peu ? Cosme Check te propose des alternatives mieux notées et de la même forme : une crème pour une crème, un shampoing pour un shampoing.

• Perle, ta conseillère beauté
Pose tes questions sur tes produits et ta routine, et reçois des réponses adaptées à ton profil.

3 FAÇONS D'ANALYSER UN PRODUIT
• Scan du code-barres, en magasin ou chez toi
• Recherche dans le catalogue
• Photo ou copier-coller de la liste d'ingrédients

GRATUIT ET PREMIUM
Cosme Check s'utilise gratuitement. L'abonnement Premium, mensuel ou annuel, débloque l'usage illimité des scans et le score de compatibilité détaillé. Son tarif s'affiche dans l'app avant tout achat. L'abonnement se renouvelle automatiquement sauf résiliation au moins 24 heures avant la fin de la période en cours. Il se gère et se résilie à tout moment dans les réglages de ton compte App Store.
Conditions d'utilisation : https://cosme-check.com/cgu
Politique de confidentialité : https://cosme-check.com/privacy

Cosme Check est un outil d'information sur la composition des cosmétiques. Il ne pose aucun diagnostic et ne remplace pas l'avis d'un dermatologue ou d'un professionnel de santé.
```

> ⚠️ **Aucun prix dans la description.** Les prix vivent dans les magasins et
> changent sans republication ; un montant recopié finit faux. La règle 3.1.2
> demande le prix et la durée **dans l’app avant l’achat** (l’écran d’offre les
> lit chez RevenueCat), le renouvellement automatique, et les liens vers les
> conditions et la confidentialité : ces trois-là restent dans la description.

> ⚠️ **Règle 2.3.10.** Aucune autre plateforme n’est nommée dans un texte
> Apple. C’est vérifié par le script.

---

## Google Play, fr-FR

### Titre  ·  28 / 30

```
Cosme Check: scan cosmétique
```

### Brève description  ·  79 / 80

```
Scanne tes cosmétiques : composition INCI, allergènes, routine skincare et peau
```

### Description complète  ·  2279 / 4000

```
Tu dépenses parfois des dizaines d'euros dans une crème... sans savoir si elle est vraiment faite pour ta peau. Cosme Check scanne ton cosmétique et te dit en quelques secondes ce qu'il contient, s'il convient à ton type de peau et s'il tient les promesses de son emballage.

CE QUE COSME CHECK T'APPORTE

• Décrypte la composition INCI
Chaque ingrédient de la liste INCI est expliqué simplement : à quoi il sert, et pourquoi il compte pour toi. Les allergènes réglementés en Europe et les ingrédients que tu veux éviter sont signalés.

• Un score de compatibilité avec ta peau
Type de peau, sensibilités, préférences : la note tient compte de ton profil, pas d'une moyenne.

• Vérifie les promesses
Hydratant, anti-âge, sans sulfates, naturel... Cosme Check regarde si la composition tient ce que la marque affiche. Tu ne paies plus pour du marketing.

• Note toute ta routine skincare
Ajoute tes soins visage, corps et cheveux : tu vois ce à quoi ta peau est exposée au total, les produits qui se contredisent, et ta progression vers tes objectifs beauté.

• Trouve mieux, dans la même catégorie
Une crème te convient peu ? Cosme Check te propose des alternatives mieux notées et de la même forme : une crème pour une crème, un shampoing pour un shampoing.

• Perle, ta conseillère beauté
Pose tes questions sur tes produits et ta routine, et reçois des réponses adaptées à ton profil.

3 FAÇONS D'ANALYSER UN PRODUIT
• Scan du code-barres, en magasin ou chez toi
• Recherche dans le catalogue
• Photo ou copier-coller de la liste d'ingrédients

GRATUIT ET PREMIUM
Cosme Check s'utilise gratuitement. L'abonnement Premium, mensuel ou annuel, débloque l'usage illimité des scans et le score de compatibilité détaillé. Son tarif s'affiche dans l'app avant tout achat. L'abonnement se renouvelle automatiquement sauf résiliation avant la fin de la période en cours. Il se gère et se résilie à tout moment dans Google Play, rubrique Abonnements.
Conditions d'utilisation : https://cosme-check.com/cgu
Politique de confidentialité : https://cosme-check.com/privacy

Cosme Check est un outil d'information sur la composition des cosmétiques. Il ne pose aucun diagnostic et ne remplace pas l'avis d'un dermatologue ou d'un professionnel de santé.

Cosme Check, aussi écrit cosmecheck.
```

---

## Les captures

Seules les trois premières se voient dans les résultats de recherche, sans
ouvrir la fiche. Elles doivent répondre à « qu’est-ce que ça fait » avant
« qu’est-ce que ça m’apporte en plus ». Rien n’est modifié par le script.

### App Store (iPhone 6,5 pouces, 9 captures)

| Place | Aujourd’hui | Proposé |
|---|---|---|
| 1 | 01 Est-il vraiment fait pour toi ? | 01 Est-il vraiment fait pour toi ? |
| 2 | 06 Atteins tes objectifs beauté | 03 Analyse un produit en 3 secondes |
| 3 | 07 Toute ta routine, notée | 04 Tient-il vraiment ses promesses ? |
| 4 | 05 Le meilleur choix pour ta peau | 05 Le meilleur choix pour ta peau |
| 5 | 04 Tient-il vraiment ses promesses ? | 08 Ce à quoi ta peau est exposée |
| 6 | 09 On vérifie chaque promesse | 07 Toute ta routine, notée |
| 7 | 08 Ce à quoi ta peau est exposée | 06 Atteins tes objectifs beauté |
| 8 | 03 Analyse un produit en 3 secondes | 02 Tout pour décrypter tes cosmétiques |
| 9 | 02 Tout pour décrypter tes cosmétiques | 09 On vérifie chaque promesse |

Pourquoi : « Est-il vraiment fait pour toi ? » reste en tête, c’est la
promesse. « Analyse un produit en 3 secondes » remonte de la 8e à la 2e place :
c’est le geste (scanner), et c’est ce que cherche quelqu’un qui a tapé « scan
cosmétique ». « Tient-il vraiment ses promesses ? » en 3e : c’est ce qui
distingue l’app. « On vérifie chaque promesse » répète la 3e et part en
dernier.

### Google Play (8 captures)

L’ordre actuel est déjà le bon (fait pour toi, tout pour décrypter, 3 secondes,
promesses, meilleur choix, objectifs, routine, exposition). Une seule
suggestion : passer « Analyse un produit en 3 secondes » en 2e, devant « Tout
pour décrypter tes cosmétiques », pour la même raison que sur iOS.

> ⚠️ Les captures Play montrent un iPhone (cadre et îlot dynamique). Google
> le tolère, mais ce n’est pas l’appareil de la personne qui regarde : à
> refaire sur un cadre Android à la prochaine série.
