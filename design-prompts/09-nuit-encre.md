# Direction 09 : Nuit encre (MODE SOMBRE)

**L'idée.** Un sombre chaud et habité, pas un sombre technique. Noir légèrement
brun, typographie serif haute pour les titres, un ambre qui se pose comme une
lueur de lampe. On ne sépare pas avec des ombres (elles n'existent pas dans le
noir) mais avec des valeurs : chaque niveau de surface est un peu plus clair que
le précédent. Élégant, calme, un peu luxe.

**Mode :** SOMBRE. C'est l'une des deux directions sombres de la série.

---

## Système de design de cette direction

**Couleurs**
- Fond `#0E0E10`, surface 1 `#17171A`, surface 2 `#1F1F23`
- Texte principal `#F2F0EC`, secondaire `#9A9A9F`, tertiaire `#6B6B70`
- Filets `#262629` à 1 px
- Accent unique ambre chaud `#E0A63C`
- Notation, ajustée pour le fond sombre : vert `#5FBF8C`, jaune `#E5C15C`, orange `#E89457`, rouge `#E06B6B`

**Typographie**
- Titres : serif haute et contrastée (Canela, Playfair Display en poids léger ou Prata)
- Corps et données : sans-serif neutre (Inter), poids 400 et 500
- Échelle : chiffre héros 68 px, titre 30 px, sous-titre 19 px, corps 16 px, libellé 12 px
- Sur fond sombre, le corps de texte ne dépasse jamais le poids 400 (le gras bave)

**Formes et espace**
- Grille 8 pt, marge latérale 22 px
- Rayon de coin 16 px
- AUCUNE ombre : la hiérarchie se fait par la valeur des surfaces
- Séparation entre sections : 32 px

**Iconographie**
- Traits fins 1,25 px, en gris `#9A9A9F`, jamais en ambre sauf état actif
- 3 icônes maximum par écran
- Aucune illustration, aucune lueur diffuse, aucun halo

---

## Règles UX appliquées dans les 7 écrans

1. Une seule action primaire par écran, en ambre plein avec texte sombre.
2. Divulgation progressive : le détail est replié.
3. Contraste vérifié : texte principal au moins 12:1 sur le fond.
4. Le blanc pur est interdit, on utilise `#F2F0EC` qui fatigue moins la nuit.
5. Cibles tactiles 44 x 44 px minimum.
6. Les aplats colorés restent petits : sur fond noir, la couleur crie vite.

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
Maquette d'interface mobile en MODE SOMBRE, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française qui analyse la composition
des produits cosmétiques et note leur qualité sur 20.

ÉCRAN : la page d'accueil.

STYLE : direction "nuit encre", mode sombre chaud et élégant. Fond #0E0E10,
cartes #17171A, éléments surélevés #1F1F23. Texte #F2F0EC, secondaire #9A9A9F.
Filets #262629 en 1 px. UN seul accent, ambre chaud #E0A63C. Titres en serif
haute et contrastée type Canela ou Prata, corps en sans-serif neutre poids 400.
Coins 16 px. AUCUNE ombre, la hiérarchie vient de la valeur des surfaces.
Marges 22 px. Pas de blanc pur.

CONTENU, du haut vers le bas :
- Barre d'état iOS claire sur fond sombre, heure 9:41.
- "Bonjour Stela" en serif haute 30 px en #F2F0EC, date du jour en 12 px
  #9A9A9F dessous.
- Une carte #17171A coins 16 px, la plus haute de l'écran : libellé
  "Dernière analyse" en 12 px #9A9A9F, puis une vignette produit carrée 64 px
  coins 12 px à gauche, à côté la marque "The Ordinary" en 12 px grise et le
  nom "Lotion Tonique Exfoliante" en serif 20 px #F2F0EC. En bas de la carte,
  aligné à droite, le chiffre "14,2" en serif 44 px #F2F0EC avec "/20" en 15 px
  gris, et sous lui "Bien" en 13 px vert #5FBF8C.
- Une carte #17171A courte : "Ma routine" en 17 px, "6 produits · 3 objectifs
  sur 5" en 13 px grise, chevron fin gris à droite.
- Une carte #17171A courte : "Beauty Advisor" en 17 px, "Posez une question"
  en 13 px grise, chevron fin gris à droite.
- Un espace sombre généreux.
- En bas, un bouton pleine largeur AMBRE #E0A63C, coins 16 px, texte SOMBRE
  #0E0E10 en 17 px poids 500 : "Scanner un produit".
- Barre d'onglets #17171A avec un filet #262629 en haut, 4 entrées, icônes
  linéaires fines grises avec libellé 11 px. L'onglet actif est en ambre.

INTERDIT : pas de blanc pur, pas d'ombre, pas de halo lumineux, pas de
dégradé, pas de carrousel, pas de quiz, pas d'illustration, pas d'emoji, pas
plus de 3 cartes. La couleur ambre n'apparaît que sur le bouton et l'onglet
actif.

RENDU : capture d'écran d'application en mode sombre, à plat, plein cadre,
ratio 9:19.5, très haute définition, noirs profonds et texte parfaitement
lisible, textes en français réels. Pas de cadre de téléphone, pas de main, pas
de perspective, pas de fond de scène.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 2/7 : Scanner un produit

```
Maquette d'interface mobile en MODE SOMBRE, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : l'entrée "Scanner un produit", feuille de choix de méthode par-dessus
la vue caméra.

STYLE : direction "nuit encre", mode sombre chaud. Feuille #17171A à coins
supérieurs 20 px sur le flux caméra. Texte #F2F0EC, secondaire #9A9A9F, filets
#262629. Accent ambre #E0A63C. Titre en serif haute, reste en sans-serif poids
400. Aucune ombre. Marges 22 px.

CONTENU :
- Fond : vue caméra en direct sur le dos d'un flacon cosmétique dans une
  lumière tamisée, légèrement flou et assombri.
- Une feuille #17171A couvrant les deux tiers bas, poignée grise fine centrée.
- Titre "Analyser un produit" en serif haute 26 px.
- Une première méthode mise en avant : bloc #1F1F23 coins 14 px avec un fin
  filet ambre #E0A63C à 40 % d'opacité, une petite icône de code-barres ambre à
  gauche, "Code-barres" en 17 px et "Le plus rapide" en 13 px grise.
- Quatre méthodes en lignes simples séparées par des filets #262629, sans bloc,
  chacune avec un titre en 17 px #F2F0EC et une explication en 13 px grise :
  "Photo de la liste INCI" / "À partir du dos du produit"
  "Lien e-commerce" / "Depuis un site marchand"
  "Saisie manuelle" / "Copier-coller le texte"
  "Catalogue" / "479 000 produits"
- Un chevron fin gris à droite de chaque ligne.
- Une croix fine claire en haut à gauche sur la caméra.

INTERDIT : pas de blanc pur, pas d'icône colorée par méthode, pas de halo, pas
de dégradé, pas d'ombre, pas d'emoji. Une seule icône sur tout l'écran.

RENDU : capture d'écran d'application en mode sombre, à plat, plein cadre,
ratio 9:19.5, très haute définition, textes en français réels et lisibles. Pas
de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 3/7 : Résultat d'analyse

```
Maquette d'interface mobile en MODE SOMBRE, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : le résultat d'analyse d'un produit, l'écran le plus important de
l'application.

STYLE : direction "nuit encre", mode sombre chaud et élégant. Fond #0E0E10,
cartes #17171A, éléments surélevés #1F1F23. Texte #F2F0EC, secondaire #9A9A9F,
filets #262629. Accent ambre #E0A63C sur le bouton primaire uniquement.
Notation : vert #5FBF8C, jaune #E5C15C, orange #E89457, rouge #E06B6B. Titres
en serif haute, données en sans-serif poids 400. Coins 16 px, AUCUNE ombre.
Marges 22 px.

CONTENU :
- Flèche de retour fine grise en haut à gauche, trois points gris à droite.
- Un bloc d'en-tête sans carte : vignette produit 80 px coins 12 px centrée,
  sous elle "ANUA" en 12 px espacées grises centré, puis le nom "Azelaic Acid
  10 Hyaluron Redness Soothing Serum" en serif haute 22 px centré sur deux
  lignes.
- LE VERDICT, sur le fond sombre sans carte : le chiffre "12,9" en serif haute
  68 px #F2F0EC centré, avec "/20" en 20 px gris. Sous lui, une petite pastille
  #1F1F23 coins 999 px contenant un point jaune #E5C15C de 6 px et le mot
  "Moyen" en 14 px #E5C15C. Puis une phrase centrée en 14 px grise sur deux
  lignes : "Formule correcte, mais deux ingrédients méritent votre attention."
- Une carte #17171A : un point vert #5FBF8C de 8 px et "Aucun de vos
  ingrédients évités n'est présent" en 15 px #F2F0EC.
- Une carte #17171A "Composition" : une barre horizontale unique de 8 px coins
  999 px, segmentée en 4 couleurs proportionnelles sur une piste #262629. Sous
  la barre, quatre libellés répartis sur une ligne, chacun précédé d'un point
  de 6 px de sa couleur, en 13 px : "28 sûrs", "7 à surveiller", "0 à éviter",
  "0 à risque".
- Une carte #17171A contenant trois lignes repliées séparées par des filets
  #262629, chacune en 15 px avec un chevron fin vers le bas : "Les 35
  ingrédients en détail", "Allergènes réglementés : aucun", "Observations :
  2 silicones détectés".
- En bas : bouton pleine largeur AMBRE #E0A63C coins 16 px, texte SOMBRE
  #0E0E10 : "Ajouter à ma routine". Sous lui un bouton #1F1F23 à filet #262629,
  texte #F2F0EC : "Voir des alternatives".

INTERDIT : pas de blanc pur, pas d'anneau, pas d'étoiles, pas de halo lumineux,
pas de dégradé, pas d'ombre, pas d'emoji. La liste d'ingrédients reste REPLIÉE.

RENDU : capture d'écran d'application en mode sombre, à plat, plein cadre,
ratio 9:19.5, très haute définition, noirs profonds, chiffres nets, textes en
français réels. Pas de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 4/7 : Ma routine

```
Maquette d'interface mobile en MODE SOMBRE, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Ma routine", les produits et la couverture des objectifs de peau.

STYLE : direction "nuit encre", mode sombre chaud. Fond #0E0E10, cartes
#17171A, filets #262629. Texte #F2F0EC, secondaire #9A9A9F. Accent ambre
#E0A63C. Notation : vert #5FBF8C, jaune #E5C15C. Titres en serif haute, données
en sans-serif poids 400. Coins 16 px, aucune ombre. Marges 22 px.

CONTENU :
- "Ma routine" en serif haute 30 px, "6 produits" en 13 px grise.
- Une carte #17171A "Couverture de vos objectifs" avec un libellé gris en haut
  à gauche et une petite icône de rechargement grise fine en haut à droite.
  Cinq lignes séparées par des filets #262629 : nom de l'objectif en 15 px
  #F2F0EC à gauche, barre horizontale de 6 px coins 999 px au milieu (piste
  #262629, remplissage plein sans dégradé), pourcentage en 15 px à droite.
  Remplissage vert #5FBF8C au-dessus de 70 %, jaune #E5C15C en dessous.
  Les cinq : "Hydratation 96 %", "Barrière cutanée 94 %", "Peau douce 97 %",
  "Produits clean 67 %", "Teint lumineux 52 %".
- Un titre de section en serif haute 19 px : "Vos produits".
- Quatre cartes #17171A coins 16 px séparées de 10 px : vignette 52 px coins
  10 px à gauche, nom en 16 px #F2F0EC, marque et moment en 12 px grise dessous
  ("Pai · Matin"), et à droite la note en 18 px précédée d'un point de couleur
  de 6 px.
- En bas, bouton pleine largeur AMBRE #E0A63C, texte sombre : "Ajouter un
  produit".

INTERDIT : pas de blanc pur, pas d'anneau, pas de camembert, pas de halo, pas
de dégradé dans les barres, pas d'ombre, pas d'emoji.

RENDU : capture d'écran d'application en mode sombre, à plat, plein cadre,
ratio 9:19.5, très haute définition, pourcentages alignés, textes en français
réels. Pas de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 5/7 : Historique

```
Maquette d'interface mobile en MODE SOMBRE, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Historique", la liste des analyses avec recherche, filtres et
comparaison.

STYLE : direction "nuit encre", mode sombre chaud. Fond #0E0E10, cartes
#17171A, champs #1F1F23, filets #262629. Texte #F2F0EC, secondaire #9A9A9F.
Accent ambre #E0A63C sur le filtre actif. Notation : vert #5FBF8C, jaune
#E5C15C, orange #E89457. Titres en serif haute. Coins 16 px, aucune ombre.
Marges 22 px.

CONTENU :
- "Historique" en serif haute 30 px, "23 analyses" en 13 px grise.
- Un champ de recherche #1F1F23 coins 14 px hauteur 44 px, loupe fine grise à
  gauche, texte gris "Rechercher un produit".
- Une rangée de pastilles coins 999 px : "Tout" en fond ambre #E0A63C avec
  texte sombre #0E0E10 (actif), "Favoris" en fond #1F1F23 avec texte gris. À
  droite, une pastille #1F1F23 à filet #262629 : "Comparer".
- Six cartes #17171A coins 16 px séparées de 10 px : vignette 52 px coins 10 px
  à gauche, nom du produit en 16 px #F2F0EC sur une ou deux lignes, marque et
  date en 12 px grise dessous ("The Ordinary · il y a 3 jours"), et à droite la
  note en 18 px précédée d'un point de couleur de 6 px.
- Une des cartes porte un petit marque-page ambre fin dans son coin supérieur
  droit.
- Pas de bouton principal.

INTERDIT : pas de blanc pur, pas d'anneau, pas de demi-donut, pas de halo, pas
de dégradé, pas d'ombre, pas d'emoji.

RENDU : capture d'écran d'application en mode sombre, à plat, plein cadre,
ratio 9:19.5, très haute définition, textes en français réels et lisibles. Pas
de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 6/7 : Beauty Advisor

```
Maquette d'interface mobile en MODE SOMBRE, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Beauty Advisor", conversation avec un conseiller beauté IA.

STYLE : direction "nuit encre", mode sombre chaud. Fond #0E0E10, surfaces
#17171A et #1F1F23, filets #262629. Texte #F2F0EC, secondaire #9A9A9F. Accent
ambre #E0A63C. Titre en serif haute, conversation en sans-serif 16 px poids 400
avec interligne 1,6. Coins 16 px, aucune ombre. Marges 22 px.

CONTENU :
- "Beauty Advisor" en serif haute 30 px, sous-titre 13 px grise : "Conseils
  fondés sur votre profil et vos produits".
- La conversation :
  - Message utilisateur aligné à droite, bloc #1F1F23 coins 16 px, texte
    #F2F0EC : "Je cherche un sérum pour les rougeurs, peau grasse."
  - Réponse du conseiller alignée à gauche, SANS bloc, simplement du texte
    #F2F0EC sur le fond sombre, précédé d'un filet vertical ambre #E0A63C de
    2 px courant sur toute la hauteur du paragraphe : "Pour une peau grasse
    sujette aux rougeurs, cherchez un actif apaisant sans alcool ni parfum.
    Voici deux formules propres de votre catalogue."
  - Sous ce paragraphe, deux cartes produit #17171A coins 14 px : vignette
    44 px, marque en 12 px grise, nom en 15 px #F2F0EC, note en 16 px à droite
    avec un point de couleur.
- Deux suggestions rapides en pastilles #1F1F23 à filet #262629, coins 999 px,
  texte 13 px #F2F0EC : "Et pour le soir ?" et "Compatible avec ma routine ?".
- Champ de saisie #1F1F23 pleine largeur coins 999 px, texte gris "Posez votre
  question", et à droite un bouton rond AMBRE #E0A63C de 36 px avec une flèche
  SOMBRE vers le haut.

INTERDIT : pas de blanc pur, pas d'avatar, pas de visage, pas de robot, pas de
halo lumineux, pas de dégradé, pas d'ombre, pas d'emoji.

RENDU : capture d'écran d'application en mode sombre, à plat, plein cadre,
ratio 9:19.5, très haute définition, textes en français réels et lisibles. Pas
de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 7/7 : Profil et mes restrictions

```
Maquette d'interface mobile en MODE SOMBRE, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Profil", type de peau, objectifs et ingrédients évités.

STYLE : direction "nuit encre", mode sombre chaud. Fond #0E0E10, cartes
#17171A, éléments #1F1F23, filets #262629. Texte #F2F0EC, secondaire #9A9A9F.
Accent ambre #E0A63C. Titres en serif haute. Coins 16 px, aucune ombre. Marges
22 px.

CONTENU :
- "Profil" en serif haute 30 px.
- Une carte #17171A d'identité : cercle #1F1F23 de 52 px contenant "SB" en
  ambre #E0A63C en serif, à côté "Stela" en 18 px #F2F0EC et l'adresse e-mail
  en 12 px grise.
- Une carte #17171A "Ma peau" : trois lignes séparées par des filets #262629,
  libellé gris à gauche, valeur #F2F0EC à droite avec un chevron fin :
  "Type de peau · Grasse", "Zone du corps · Normale", "Objectifs · 5
  sélectionnés".
- Une carte #17171A "Ce que j'évite" : une ligne grise 13 px "Signalés dans
  chaque analyse.", puis des puces coins 999 px sur deux rangées, fond #1F1F23,
  filet #262629, texte #F2F0EC 13 px, avec une petite croix grise à droite :
  "Parfum", "Phénoxyéthanol", "Silicones", "Sulfates", "Huiles essentielles".
  Après les puces, une puce à filet ambre en pointillés et texte ambre :
  "+ Ajouter".
- Une carte #17171A à deux lignes séparées par un filet : "Crédits restants" à
  gauche en gris et "129" à droite en 18 px #F2F0EC, puis "Passer à Premium"
  en #F2F0EC avec un chevron fin.
- Tout en bas, trois liens gris 11 px : "Conditions", "Confidentialité",
  "Mentions légales".

INTERDIT : pas de blanc pur, pas de photo de profil, pas de visage, pas de
bannière Premium colorée, pas de halo, pas de dégradé, pas d'ombre, pas
d'emoji.

RENDU : capture d'écran d'application en mode sombre, à plat, plein cadre,
ratio 9:19.5, très haute définition, textes en français réels et lisibles. Pas
de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## Sources UX

- [10 Mobile App Design Best Practices for 2026](https://market.gluestack.io/blog/mobile-app-design-best-practices)
- [How to Fix a Cluttered Mobile App Interface Design](https://flowmazeux.com/mobile-app-interface-design-clutter-fixes/)
- [What is Mobile User Experience (UX) Design, IxDF](https://ixdf.org/literature/topics/mobile-ux-design)
- [Minimalist Design Systems for Mobile Apps in 2026](https://www.futuristicbug.com/minimalist-design-systems-for-mobile-apps/)
