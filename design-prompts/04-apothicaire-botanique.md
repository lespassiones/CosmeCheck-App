# Direction 04 : Apothicaire botanique (mode clair)

**L'idée.** Une herboristerie savante. Fond crème, vert sauge, une serif de
labeur pour les titres, des filets fins comme sur une étiquette de pharmacie
ancienne. Le végétal est suggéré par la couleur et la typographie, jamais par
des feuilles dessinées partout. Chaleureux sans être mièvre, sérieux sans être
froid.

**Mode :** clair.

---

## Système de design de cette direction

**Couleurs**
- Fond crème `#F7F3EC`, cartes `#FFFDF9`
- Texte principal `#2B2A26`, secondaire `#6E6A61`, tertiaire `#9C978C`
- Bordures `#E6DFD3` à 1 px
- Accent primaire vert sauge `#6E8B6B`, accent secondaire terracotta `#C98A6B`
- Notation : vert `#5F8459`, jaune `#C4A24A`, orange `#C07A4A`, rouge `#A85647`

**Typographie**
- Titres : serif de labeur (Lora, Freight Text ou Source Serif), poids 500 et 600
- Données, libellés : sans-serif discrète (Inter), poids 400 et 500
- Petites capitales pour les libellés de section, interlettrage +6 %
- Échelle : titre 28 px, chiffre héros 56 px, sous-titre 18 px, corps 16 px, libellé 12 px

**Formes et espace**
- Grille 8 pt, marge latérale 22 px
- Rayon de coin 12 px, bordure 1 px `#E6DFD3` sur les cartes
- Aucune ombre, la bordure suffit à détacher
- Une seule ligne décorative par écran maximum : un filet double très fin sous un titre de section

**Iconographie**
- Traits fins 1,25 px, style gravure
- 3 icônes maximum par écran
- Aucune feuille, aucune plante dessinée, aucune illustration

---

## Règles UX appliquées dans les 7 écrans

1. Une seule action primaire par écran, en vert sauge plein.
2. Divulgation progressive : le détail est replié derrière une ligne.
3. Le terracotta ne sert qu'aux alertes et aux favoris, jamais aux boutons.
4. Action primaire dans le tiers bas.
5. Cibles tactiles 44 x 44 px minimum.
6. Le fond crème ne devient jamais blanc : la carte est plus claire que la page.

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

STYLE : direction "apothicaire botanique". Fond crème #F7F3EC, cartes #FFFDF9
avec une bordure 1 px #E6DFD3 et des coins 12 px, AUCUNE ombre. Texte #2B2A26,
secondaire #6E6A61. Accent vert sauge #6E8B6B, accent secondaire terracotta
#C98A6B. Titres en serif de labeur type Lora poids 500, données en sans-serif
discrète. Libellés de section en petites capitales espacées. Marges 22 px.
Chaleureux, sobre, savant.

CONTENU, du haut vers le bas :
- Barre d'état iOS, heure 9:41.
- "Bonjour Stela" en serif 28 px, et en dessous la date du jour en toutes
  lettres en 13 px gris.
- Une carte principale crème claire à bordure fine : en petites capitales
  vertes "DERNIÈRE ANALYSE", sous un filet double très fin vert sauge. Puis
  une photo de flacon en vignette 72 px à coins 8 px à gauche, à côté la marque
  "The Ordinary" en 12 px gris et le nom "Lotion Tonique Exfoliante" en serif
  18 px. En bas de la carte, aligné à droite, le chiffre "14,2" en serif 40 px
  avec "/20" en 14 px, et sous lui le mot "Bien" en 13 px vert #5F8459.
- Une carte courte : en petites capitales "MA ROUTINE", puis "6 produits,
  3 objectifs couverts sur 5" en 15 px, et un chevron fin gravé à droite.
- Une carte courte : en petites capitales "BEAUTY ADVISOR", puis "Posez une
  question sur vos produits" en 15 px, et un chevron fin à droite.
- En bas, un bouton pleine largeur coins 12 px, fond vert sauge #6E8B6B, texte
  crème 16 px : "Scanner un produit".
- Barre d'onglets sur fond crème, 4 entrées, icônes gravées très fines avec
  libellé en 11 px. L'onglet actif est en vert sauge.

INTERDIT : pas de feuille ni de plante dessinée, pas d'illustration, pas de
carrousel, pas de quiz, pas de dégradé, pas d'ombre, pas d'emoji, pas plus de
3 cartes. Le végétal vient de la couleur, pas du dessin.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, textes en français réels et lisibles. Pas de cadre de
téléphone, pas de main, pas de perspective, pas de fond de scène.

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

STYLE : direction "apothicaire botanique". Feuille crème #F7F3EC à coins
supérieurs 16 px sur le flux caméra assombri. Cartes #FFFDF9 à bordure 1 px
#E6DFD3. Texte #2B2A26, secondaire #6E6A61. Accent vert sauge #6E8B6B. Serif
de labeur pour le titre, sans-serif pour le reste, petites capitales pour les
libellés. Aucune ombre. Marges 22 px.

CONTENU :
- Fond : vue caméra en direct sur le dos d'un flacon cosmétique posé sur du
  bois clair, légèrement flou et assombri.
- Feuille crème couvrant les deux tiers bas, petite poignée beige centrée.
- Titre en serif 24 px : "Analyser un produit".
- Un filet double très fin vert sauge sous le titre.
- Une première méthode mise en avant, carte à bordure 1 px vert sauge et fond
  vert très pâle (#6E8B6B à 8 %) : petite icône gravée de code-barres en vert,
  "Scanner le code-barres" en 16 px, "Le plus rapide" en 12 px gris.
- Quatre méthodes en cartes crème claires à bordure #E6DFD3, coins 12 px,
  séparées de 10 px, sans icône :
  "Photographier la liste INCI" / "À partir du dos du produit"
  "Coller un lien" / "Depuis un site marchand"
  "Saisir la liste à la main" / "Copier-coller le texte"
  "Chercher dans le catalogue" / "Plus de 479 000 produits"
- Un chevron fin gravé à droite de chaque carte.
- Une croix fine en haut à gauche sur la caméra.

INTERDIT : pas de feuille dessinée, pas d'icône colorée par méthode, pas
d'ombre, pas de dégradé, pas d'emoji. Une seule icône sur tout l'écran.

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
l'application. Il doit avoir l'allure d'une fiche de pharmacopée.

STYLE : direction "apothicaire botanique". Fond crème #F7F3EC, cartes #FFFDF9
bordure 1 px #E6DFD3 coins 12 px, aucune ombre. Texte #2B2A26, secondaire
#6E6A61. Accent vert sauge #6E8B6B sur le bouton primaire, terracotta #C98A6B
pour les alertes. Notation : vert #5F8459, jaune #C4A24A, orange #C07A4A, rouge
#A85647. Titres en serif de labeur, données en sans-serif, libellés de section
en petites capitales espacées. Marges 22 px.

CONTENU :
- Flèche de retour gravée fine en haut à gauche, trois points à droite.
- Une carte d'en-tête : photo du produit en vignette 80 px coins 8 px à
  gauche, à côté "ANUA" en petites capitales grises et le nom "Azelaic Acid 10
  Hyaluron Redness Soothing Serum" en serif 18 px sur deux lignes.
- Une carte verdict, plus haute : en petites capitales vertes "NOTE GLOBALE",
  filet double fin, puis le chiffre "12,9" en serif 56 px centré avec "/20" en
  16 px, sous lui le mot "Moyen" en 15 px #C4A24A, et une phrase centrée en
  14 px grise sur deux lignes : "Formule correcte, mais deux ingrédients
  méritent votre attention."
- Une carte courte : petit cercle vert #5F8459 de 8 px, puis "Aucun de vos
  ingrédients évités n'est présent" en 15 px.
- Une carte "COMPOSITION" en petites capitales : quatre lignes, chacune avec
  un petit carré de couleur de 10 px à gauche, le libellé en 15 px au milieu et
  le nombre en 18 px à droite, séparées par des filets #E6DFD3 :
  "Sûrs 28", "À surveiller 7", "À éviter 0", "À risque 0". Sous les quatre
  lignes, une barre horizontale fine de 6 px segmentée en proportions.
- Une carte contenant trois lignes repliées, séparées par des filets, chacune
  avec un chevron vers le bas : "Les 35 ingrédients en détail", "Allergènes
  réglementés : aucun", "Observations : 2 silicones détectés".
- En bas : bouton pleine largeur vert sauge #6E8B6B coins 12 px, texte crème
  "Ajouter à ma routine". Sous lui un bouton à bordure vert sauge 1 px et texte
  vert : "Voir des alternatives".

INTERDIT : pas d'anneau de score, pas d'étoiles, pas de feuille dessinée, pas
d'ombre, pas de dégradé, pas d'emoji. La liste d'ingrédients reste REPLIÉE.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, textes en français réels et lisibles. Pas de cadre de
téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 4/7 : Ma routine

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Ma routine", les produits et la couverture des objectifs de peau.

STYLE : direction "apothicaire botanique". Fond crème #F7F3EC, cartes #FFFDF9
bordure 1 px #E6DFD3 coins 12 px, aucune ombre. Accent vert sauge #6E8B6B.
Notation : vert #5F8459, jaune #C4A24A. Titres en serif de labeur, libellés en
petites capitales espacées. Marges 22 px.

CONTENU :
- "Ma routine" en serif 28 px, "6 produits" en 13 px gris.
- Une carte "COUVERTURE DE VOS OBJECTIFS" en petites capitales vertes, filet
  double fin dessous, puis cinq lignes séparées par des filets #E6DFD3. Chaque
  ligne : nom de l'objectif en 15 px à gauche, barre horizontale fine de 5 px à
  coins carrés au milieu (piste beige #E6DFD3, remplissage plein), pourcentage
  en 15 px à droite. Remplissage vert #5F8459 au-dessus de 70 %, jaune #C4A24A
  en dessous.
  Les cinq : "Hydratation 96 %", "Barrière cutanée 94 %", "Peau douce 97 %",
  "Produits clean 67 %", "Teint lumineux 52 %".
  En bas de carte, une ligne 13 px grise avec une petite flèche circulaire
  gravée : "Recalculer après un changement".
- "VOS PRODUITS" en petites capitales grises.
- Quatre cartes produit crème à bordure fine, coins 12 px, séparées de 10 px :
  vignette 52 px coins 8 px à gauche, nom en serif 16 px, marque et moment en
  12 px gris dessous ("Pai · Matin"), note en 18 px à droite précédée d'un
  petit carré de couleur.
- En bas, bouton pleine largeur vert sauge #6E8B6B : "Ajouter un produit".

INTERDIT : pas d'anneau, pas de camembert, pas de feuille dessinée, pas
d'ombre, pas de dégradé, pas d'emoji.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, textes en français réels et lisibles, pourcentages alignés.
Pas de cadre de téléphone, pas de main, pas de perspective.

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

STYLE : direction "apothicaire botanique". Fond crème #F7F3EC, cartes #FFFDF9
bordure 1 px #E6DFD3 coins 12 px, aucune ombre. Accent vert sauge #6E8B6B sur
le filtre actif, terracotta #C98A6B pour le favori. Notation : vert #5F8459,
jaune #C4A24A, orange #C07A4A. Serif de labeur pour les titres. Marges 22 px.

CONTENU :
- "Historique" en serif 28 px, "23 analyses" en 13 px gris.
- Un champ de recherche crème clair à bordure #E6DFD3, coins 12 px, hauteur
  44 px, petite loupe gravée à gauche, texte gris "Rechercher un produit".
- Une rangée de trois pastilles à coins 999 px et bordure fine : "Tout" en fond
  vert sauge #6E8B6B et texte crème (actif), "Favoris" en fond crème et texte
  gris, et à droite "Comparer" en fond crème avec bordure en pointillés fins.
- Six cartes d'analyse crème à bordure fine, séparées de 10 px : vignette
  52 px coins 8 px à gauche, nom du produit en serif 16 px sur une ou deux
  lignes, marque et date en 12 px gris dessous ("The Ordinary · il y a 3
  jours"), et à droite la note en 18 px précédée d'un petit carré de couleur.
- Une des cartes porte un petit marque-page terracotta #C98A6B plein dans son
  coin supérieur droit.
- Pas de bouton principal.

INTERDIT : pas d'anneau, pas de demi-donut, pas de feuille dessinée, pas
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

STYLE : direction "apothicaire botanique". Fond crème #F7F3EC, cartes #FFFDF9
bordure 1 px #E6DFD3. Texte #2B2A26, secondaire #6E6A61. Accent vert sauge
#6E8B6B. Titre en serif de labeur, conversation en sans-serif 16 px interligne
1,6, libellés en petites capitales espacées. Coins 12 px, aucune ombre. Marges
22 px.

CONTENU :
- "Beauty Advisor" en serif 28 px, sous-titre 13 px gris : "Conseils fondés
  sur votre profil et vos produits".
- La conversation, composée comme une correspondance :
  - "VOUS" en petites capitales grises, puis le message en 16 px noir dans une
    carte crème à bordure fine, alignée à droite et occupant 80 % de la
    largeur : "Je cherche un sérum pour les rougeurs, peau grasse."
  - "CONSEILLER" en petites capitales vertes, puis la réponse en 16 px noir
    SANS carte, simplement précédée d'un filet vertical vert sauge de 2 px :
    "Pour une peau grasse sujette aux rougeurs, cherchez un actif apaisant sans
    alcool ni parfum. Voici deux formules propres de votre catalogue."
  - Deux cartes produit crème compactes à bordure fine : vignette 44 px, marque
    en 12 px gris, nom en serif 15 px, note en 16 px à droite avec un carré de
    couleur.
- Deux suggestions en pastilles crème à bordure fine, coins 999 px, texte 13 px :
  "Et pour le soir ?" et "Compatible avec ma routine ?".
- Champ de saisie crème pleine largeur à bordure #E6DFD3, coins 12 px, texte
  gris "Posez votre question", et à droite un carré vert sauge #6E8B6B de
  40 px coins 8 px avec une flèche crème vers le haut.

INTERDIT : pas d'avatar, pas de visage, pas de robot, pas de feuille dessinée,
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

STYLE : direction "apothicaire botanique". Fond crème #F7F3EC, cartes #FFFDF9
bordure 1 px #E6DFD3 coins 12 px, aucune ombre. Accent vert sauge #6E8B6B,
terracotta #C98A6B pour les puces d'ingrédients évités. Titres en serif de
labeur, libellés en petites capitales espacées. Marges 22 px.

CONTENU :
- "Profil" en serif 28 px.
- Une carte d'identité : un cercle de 52 px à fond vert très pâle avec les
  initiales "SB" en vert sauge serif, à côté "Stela" en serif 18 px et
  l'adresse e-mail en 12 px grise.
- Une carte "MA PEAU" en petites capitales vertes, filet double fin dessous,
  puis trois lignes séparées par des filets #E6DFD3, libellé gris à gauche et
  valeur noire à droite avec un chevron gravé : "Type de peau · Grasse",
  "Zone du corps · Normale", "Objectifs · 5 sélectionnés".
- Une carte "CE QUE J'ÉVITE" en petites capitales : une ligne grise
  "Signalés dans chaque analyse.", puis des puces à coins 999 px sur deux
  rangées, fond terracotta très pâle (#C98A6B à 12 %), bordure 1 px terracotta,
  texte terracotta foncé 13 px, avec une petite croix fine à droite :
  "Parfum", "Phénoxyéthanol", "Silicones", "Sulfates", "Huiles essentielles".
  Après les puces, une puce à bordure verte en pointillés : "+ Ajouter".
- Une carte à deux lignes séparées par un filet : "Crédits restants" à gauche
  en gris et "129" à droite en 18 px, puis "Passer à Premium" avec un chevron.
- Tout en bas, trois liens gris 11 px en petites capitales : "Conditions",
  "Confidentialité", "Mentions légales".

INTERDIT : pas de photo de profil, pas de visage, pas de feuille dessinée, pas
de bannière Premium colorée, pas d'ombre, pas de dégradé, pas d'emoji.

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
