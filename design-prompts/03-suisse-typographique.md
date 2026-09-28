# Direction 03 : Suisse typographique (mode clair)

**L'idée.** Le style international appliqué à une app. Grille visible, gros
chiffres, typographie serrée, noir et blanc, un seul rouge. Zéro décoration :
c'est la mise en page qui fait le design. C'est la direction la plus radicale
des dix, et la plus lisible.

**Mode :** clair.

---

## Système de design de cette direction

**Couleurs**
- Fond `#FFFFFF`, texte `#000000`, secondaire `#767676`
- Filets `#000000` à 1 px, jamais gris
- Accent unique rouge `#E3000F`, sur le bouton primaire et le filtre actif
- Notation : vert `#008A4B`, jaune `#E8B000`, orange `#F06400`, rouge `#E3000F`

**Typographie**
- Une seule famille, grotesque néo (Helvetica Now, Inter Tight ou Suisse Int'l)
- Titres poids 700 avec un crénage serré de -2 %, corps poids 400
- Échelle : chiffre héros 80 px, titre 32 px, sous-titre 20 px, corps 15 px, libellé 11 px en majuscules avec interlettrage +8 %
- Les libellés de section sont en MAJUSCULES, petits, espacés

**Formes et espace**
- Grille 4 colonnes, gouttière 16 px, marge latérale 20 px
- Rayon de coin 0 px partout, aucun arrondi
- Aucune ombre, jamais
- Séparation par filets noirs 1 px pleine largeur

**Iconographie**
- 2 icônes maximum par écran, traits 1 px, géométriques
- Les chevrons sont remplacés par des flèches droites, ou supprimés

---

## Règles UX appliquées dans les 7 écrans

1. Une seule action primaire par écran, un bloc rouge plein.
2. Divulgation progressive : le détail est replié derrière une ligne.
3. Le chiffre le plus important de l'écran est le plus gros élément, de loin.
4. Action primaire en bas, pleine largeur, angles droits.
5. Cibles tactiles 44 x 44 px minimum malgré l'apparence compacte.
6. Alignement strict : tout se cale sur la grille, rien ne flotte.

---

## Le produit, pour contexte

CosmeCheck décrypte la composition des cosmétiques. L'utilisateur scanne ou
cherche un produit, obtient une note sur 20 et un décryptage ingrédient par
ingrédient en 4 couleurs, personnalisé selon son type de peau et les ingrédients
qu'il évite. Il se construit une routine, suit la couverture de ses objectifs,
compare des produits, discute avec un conseiller IA.

---

## PROMPT 1/7 : Accueil

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française qui analyse la composition
des produits cosmétiques et note leur qualité sur 20.

ÉCRAN : la page d'accueil.

STYLE : direction "suisse typographique", style international. Fond blanc pur
#FFFFFF, texte noir pur #000000, secondaire #767676. Filets noirs 1 px pleine
largeur. UNE seule couleur d'accent, rouge #E3000F. Une seule famille
grotesque néo type Helvetica, titres en poids 700 avec crénage serré -2 %.
Libellés de section en MAJUSCULES 11 px très espacées. AUCUN arrondi, rayon
0 px partout. AUCUNE ombre. Grille 4 colonnes, marges 20 px. Tout est aligné
au pixel.

CONTENU, du haut vers le bas :
- Barre d'état iOS, heure 9:41.
- En haut à gauche, le mot-symbole "COSMECHECK" en 13 px majuscules espacées.
  À droite, la date "18.09" en 13 px.
- Un filet noir pleine largeur.
- Libellé de section "DERNIÈRE ANALYSE" en majuscules 11 px grises.
- Le nom du produit "Lotion Tonique Exfoliante" en 32 px poids 700 crénage
  serré, sur deux lignes, aligné à gauche. Sous lui, "THE ORDINARY" en
  majuscules 11 px grises.
- Le chiffre "14,2" en 80 px poids 700, aligné à gauche, avec "/20" en 20 px
  juste après sur la ligne de base. À droite du chiffre, sur la même ligne,
  un carré plein de 12 px en vert #008A4B et le mot "BIEN" en majuscules 11 px.
- Un filet noir pleine largeur.
- Deux lignes de navigation, séparées par un filet noir, chacune avec le
  libellé en 20 px poids 700 à gauche et une donnée en 15 px grise à droite,
  suivie d'une flèche droite fine :
  "Ma routine" / "6 PRODUITS"
  "Beauty Advisor" / "POSER UNE QUESTION"
- Un filet noir pleine largeur.
- Un grand espace blanc vide, volontaire, qui occupe le bas de l'écran.
- Un bloc rectangulaire rouge #E3000F pleine largeur, angles droits, hauteur
  56 px, texte blanc centré en majuscules 15 px espacées : "SCANNER UN
  PRODUIT".
- Barre d'onglets en texte seul, sans icône : ACCUEIL, ROUTINE, HISTORIQUE,
  PROFIL, en 11 px majuscules. L'actif est noir, les autres gris.

INTERDIT : pas de carte, pas de coin arrondi, pas d'ombre, pas de dégradé, pas
de carrousel, pas de quiz, pas d'illustration, pas d'emoji, pas plus de 2
icônes. Le vide blanc est un élément de composition, garde-le.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, typographie nette et parfaitement lisible, textes en français
réels. Pas de cadre de téléphone, pas de main, pas de perspective, pas de fond
de scène.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 2/7 : Scanner un produit

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : l'entrée "Scanner un produit", feuille de choix de méthode par-dessus
la vue caméra.

STYLE : direction "suisse typographique". Feuille blanche #FFFFFF à angles
droits sur le flux caméra assombri. Texte noir #000000, secondaire #767676,
filets noirs 1 px. Accent rouge #E3000F. Grotesque néo, titres poids 700
crénage serré. Libellés en majuscules espacées. Rayon 0 px, aucune ombre.
Marges 20 px.

CONTENU :
- Fond : vue caméra en direct sur le dos d'un flacon cosmétique, légèrement
  flou et assombri.
- Une feuille blanche à angles droits couvre les deux tiers bas, sans poignée
  arrondie, juste un filet noir en haut.
- Libellé "MÉTHODE" en majuscules 11 px grises.
- Titre "Analyser un produit" en 32 px poids 700 crénage serré.
- Un filet noir pleine largeur.
- Cinq lignes séparées par des filets noirs 1 px, chacune numérotée en gris à
  gauche (01 à 05), le libellé en 20 px poids 700, et une explication en 13 px
  grise en dessous :
  01 "Code-barres" / "LE PLUS RAPIDE"
  02 "Photo de la liste INCI" / "À PARTIR DU DOS DU PRODUIT"
  03 "Lien" / "DEPUIS UN SITE MARCHAND"
  04 "Saisie manuelle" / "COPIER-COLLER LE TEXTE"
  05 "Catalogue" / "479 000 PRODUITS"
- La ligne 01 porte un petit carré plein rouge #E3000F de 8 px à droite,
  seule marque de couleur de l'écran.
- Une croix fine en haut à gauche sur la caméra, trait 1 px blanc.

INTERDIT : pas d'icône par méthode, pas de vignette, pas de carte arrondie,
pas d'ombre, pas de dégradé, pas d'emoji. La numérotation et les filets
suffisent à structurer.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, textes en français réels et lisibles. Pas de cadre de
téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 3/7 : Résultat d'analyse

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : le résultat d'analyse d'un produit, l'écran le plus important de
l'application.

STYLE : direction "suisse typographique". Fond blanc #FFFFFF, texte noir
#000000, secondaire #767676, filets noirs 1 px. Accent rouge #E3000F sur le
bouton primaire. Notation : vert #008A4B, jaune #E8B000, orange #F06400, rouge
#E3000F. Grotesque néo, poids 700 pour les titres et les chiffres. Rayon 0 px,
aucune ombre. Grille 4 colonnes, marges 20 px.

CONTENU :
- Flèche de retour droite et fine en haut à gauche, trois points alignés à
  droite.
- "ANUA" en majuscules 11 px espacées grises.
- Le nom "Azelaic Acid 10 Hyaluron Redness Soothing Serum" en 28 px poids 700
  crénage serré, sur trois lignes, aligné à gauche. Une photo carrée du produit
  de 72 px à angles droits, alignée à droite du bloc de titre.
- Un filet noir pleine largeur.
- LE VERDICT : le chiffre "12,9" en 96 px poids 700, aligné à gauche,
  dominant tout l'écran. "/20" en 24 px après. Sur la ligne suivante, un carré
  plein jaune #E8B000 de 14 px suivi de "MOYEN" en majuscules 13 px espacées.
  Puis une phrase en 15 px : "Formule correcte, mais deux ingrédients méritent
  votre attention."
- Un filet noir pleine largeur.
- "POUR VOUS" en majuscules 11 px grises, puis en 15 px noir : "Aucun de vos
  ingrédients évités n'est présent", précédé d'un carré vert #008A4B de 10 px.
- Un filet noir pleine largeur.
- "COMPOSITION" en majuscules 11 px grises. En dessous, une rangée de 4 blocs
  rectangulaires pleine largeur, angles droits, de hauteur 64 px, collés les
  uns aux autres sans espace, de largeur proportionnelle à leur valeur : un
  grand bloc vert #008A4B, un bloc jaune #E8B000 plus petit, puis deux bandes
  très fines pour orange et rouge à zéro. Dans chaque bloc assez large, le
  chiffre en blanc poids 700 : "28" dans le vert, "7" dans le jaune. Sous la
  rangée, quatre libellés alignés en 11 px majuscules grises : SÛRS,
  À SURVEILLER, À ÉVITER, À RISQUE.
- Un filet noir, puis trois lignes repliées séparées par des filets, chacune
  en 15 px avec une flèche vers le bas à droite : "Les 35 ingrédients en
  détail", "Allergènes réglementés : aucun", "Observations : 2 silicones".
- En bas, un bloc rouge #E3000F pleine largeur, angles droits, 56 px, texte
  blanc majuscules espacées : "AJOUTER À MA ROUTINE". Sous lui une ligne de
  texte noir souligné : "Voir des alternatives".

INTERDIT : pas d'anneau, pas de jauge circulaire, pas d'étoiles, pas de coin
arrondi, pas d'ombre, pas de dégradé, pas d'emoji. La liste d'ingrédients reste
REPLIÉE.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, typographie et chiffres parfaitement nets, textes en français
réels. Pas de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 4/7 : Ma routine

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Ma routine", les produits de l'utilisateur et la couverture de ses
objectifs de peau.

STYLE : direction "suisse typographique". Fond blanc, texte noir, filets noirs
1 px, accent rouge #E3000F. Notation : vert #008A4B, jaune #E8B000. Grotesque
néo, chiffres en poids 700, libellés en majuscules espacées. Rayon 0 px, aucune
ombre. Marges 20 px.

CONTENU :
- "MA ROUTINE" en majuscules 11 px grises, puis "6 produits" en 32 px poids
  700.
- Un filet noir pleine largeur.
- "COUVERTURE DES OBJECTIFS" en majuscules 11 px grises.
- Cinq lignes, chacune sur deux niveaux, séparées par des filets noirs fins :
  le nom de l'objectif en 15 px noir à gauche et le pourcentage en 24 px poids
  700 à droite, puis immédiatement sous le texte une barre horizontale pleine
  largeur de 3 px seulement, piste noire à 12 % et remplissage plein.
  Remplissage vert #008A4B au-dessus de 70 %, jaune #E8B000 en dessous.
  Les cinq : "Hydratation 96 %", "Barrière cutanée 94 %", "Peau douce 97 %",
  "Produits clean 67 %", "Teint lumineux 52 %".
- Une ligne grise 13 px avec une flèche circulaire fine : "Recalculer".
- Un filet noir pleine largeur.
- "VOS PRODUITS" en majuscules 11 px grises. Quatre lignes séparées par des
  filets : photo carrée 48 px à angles droits à gauche, nom en 17 px poids 700,
  marque et moment en 11 px majuscules grises dessous, et la note en 24 px
  poids 700 à droite, précédée d'un petit carré plein de couleur.
- En bas, bloc rouge #E3000F pleine largeur 56 px, texte blanc majuscules :
  "AJOUTER UN PRODUIT".

INTERDIT : pas d'anneau, pas de camembert, pas de carte arrondie, pas d'ombre,
pas de dégradé, pas d'illustration, pas d'emoji.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, chiffres parfaitement alignés à droite, textes en français
réels. Pas de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 5/7 : Historique

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Historique", la liste des analyses avec recherche, filtres et
comparaison.

STYLE : direction "suisse typographique". Fond blanc, texte noir, filets noirs
1 px, accent rouge #E3000F sur le filtre actif. Notation : vert #008A4B, jaune
#E8B000, orange #F06400. Grotesque néo. Rayon 0 px, aucune ombre. Marges 20 px.

CONTENU :
- "HISTORIQUE" en majuscules 11 px grises, puis "23 analyses" en 32 px poids
  700.
- Un champ de recherche à angles droits, simple filet noir 1 px, sans fond,
  hauteur 44 px, texte gris "Rechercher" et une petite loupe géométrique 1 px
  à droite.
- Une rangée de trois libellés de filtre en majuscules 11 px espacées, séparés
  par des espaces larges : "TOUT" en noir avec un filet rouge #E3000F de 2 px
  dessous (actif), "FAVORIS" en gris, et à l'extrême droite "COMPARER" en gris.
- Un filet noir pleine largeur.
- Six lignes d'analyse séparées par des filets noirs 1 px, sans carte :
  photo carrée 48 px à angles droits à gauche, nom du produit en 17 px poids
  700 sur une ou deux lignes, marque et date en 11 px majuscules grises
  dessous ("THE ORDINARY · IL Y A 3 JOURS"), et à droite la note en 24 px
  poids 700 précédée d'un carré plein de 10 px de la couleur correspondante.
- Une des lignes porte un petit triangle noir plein dans l'angle supérieur
  gauche de sa photo, marquant un favori.
- Pas de bouton principal.

INTERDIT : pas d'anneau, pas de demi-donut, pas de carte arrondie, pas
d'ombre, pas de dégradé, pas d'emoji.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, textes en français réels et lisibles. Pas de cadre de
téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 6/7 : Beauty Advisor

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Beauty Advisor", conversation avec un conseiller beauté IA.

STYLE : direction "suisse typographique". Fond blanc, texte noir, filets noirs
1 px, accent rouge #E3000F sur le bouton d'envoi. Grotesque néo, corps 15 px
interligne 1,5, libellés en majuscules espacées. Rayon 0 px, aucune ombre.
Marges 20 px.

CONTENU :
- "BEAUTY ADVISOR" en majuscules 11 px grises, puis "Conseils" en 32 px poids
  700.
- Un filet noir pleine largeur.
- La conversation, sans aucune bulle, composée comme une page imprimée :
  - "VOUS" en majuscules 11 px grises, puis en 17 px poids 700 noir :
    "Je cherche un sérum pour les rougeurs, peau grasse."
  - Un filet noir fin.
  - "CONSEILLER" en majuscules 11 px grises, puis en 15 px poids 400 noir,
    interligne large : "Pour une peau grasse sujette aux rougeurs, cherchez un
    actif apaisant sans alcool ni parfum. Voici deux formules propres de votre
    catalogue."
  - Deux lignes produit séparées par des filets : photo carrée 40 px, marque en
    11 px majuscules grises, nom en 15 px poids 700, note en 20 px poids 700 à
    droite avec un carré plein de couleur.
- Un filet noir, puis deux suggestions en 13 px encadrées d'un filet noir 1 px
  à angles droits : "Et pour le soir ?" et "Compatible avec ma routine ?".
- Champ de saisie pleine largeur à angles droits, filet noir 1 px, texte gris
  "Votre question", et à droite un carré plein rouge #E3000F de 44 px avec une
  flèche blanche droite vers le haut.

INTERDIT : pas de bulle arrondie, pas d'avatar, pas de visage, pas de robot,
pas d'ombre, pas de dégradé, pas d'emoji.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, textes en français réels et lisibles. Pas de cadre de
téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 7/7 : Profil et mes restrictions

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Profil", type de peau, objectifs et ingrédients évités.

STYLE : direction "suisse typographique". Fond blanc, texte noir, filets noirs
1 px, accent rouge #E3000F. Grotesque néo, libellés en majuscules espacées.
Rayon 0 px, aucune ombre. Marges 20 px.

CONTENU :
- "PROFIL" en majuscules 11 px grises, puis "Stela" en 32 px poids 700, et
  l'adresse e-mail en 13 px grise dessous. Pas d'avatar, pas de cercle.
- Un filet noir pleine largeur.
- "MA PEAU" en majuscules 11 px grises. Trois lignes séparées par des filets,
  libellé en 15 px noir à gauche, valeur en 15 px grise à droite suivie d'une
  flèche droite : "Type de peau / Grasse", "Zone du corps / Normale",
  "Objectifs / 5 sélectionnés".
- Un filet noir pleine largeur.
- "CE QUE J'ÉVITE" en majuscules 11 px grises, puis une ligne 13 px grise :
  "Signalés dans chaque analyse." En dessous, les ingrédients listés non pas en
  puces arrondies mais en lignes numérotées séparées par des filets fins,
  chacune avec son numéro gris à gauche, le nom en 15 px noir, et une croix
  fine 1 px à droite : "01 Parfum", "02 Phénoxyéthanol", "03 Silicones",
  "04 Sulfates", "05 Huiles essentielles".
  Sous la liste, une ligne en rouge #E3000F 13 px majuscules : "+ AJOUTER".
- Un filet noir pleine largeur.
- Une ligne "Crédits restants" en 15 px à gauche et "129" en 24 px poids 700 à
  droite.
- Une ligne "Passer à Premium" en 15 px avec une flèche droite à droite. Pas
  de bandeau, pas de couleur.
- Tout en bas, trois liens en 11 px majuscules grises : "CONDITIONS",
  "CONFIDENTIALITÉ", "MENTIONS LÉGALES".

INTERDIT : pas de photo de profil, pas de visage, pas de puce arrondie, pas de
bannière Premium, pas d'ombre, pas de dégradé, pas d'emoji.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, textes en français réels et lisibles. Pas de cadre de
téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## Sources UX

- [10 Mobile App Design Best Practices for 2026](https://market.gluestack.io/blog/mobile-app-design-best-practices)
- [How to Fix a Cluttered Mobile App Interface Design](https://flowmazeux.com/mobile-app-interface-design-clutter-fixes/)
- [What is Mobile User Experience (UX) Design, IxDF](https://ixdf.org/literature/topics/mobile-ux-design)
- [Minimalist Design Systems for Mobile Apps in 2026](https://www.futuristicbug.com/minimalist-design-systems-for-mobile-apps/)
