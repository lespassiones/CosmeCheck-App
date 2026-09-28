# Direction 01 : Clinique éditorial (mode clair)

**L'idée.** Une revue scientifique grand public. Beaucoup de blanc, une serif de
titre qui donne de l'autorité, une sans-serif nette pour la donnée, et une seule
couleur chaude qui n'apparaît que là où il faut cliquer. L'app doit avoir l'air
d'un laboratoire qui sait écrire, pas d'une app de beauté.

**Mode :** clair.

---

## Système de design de cette direction

**Couleurs**
- Fond de page `#FFFFFF`, surfaces secondaires `#FAFAF8`
- Texte principal `#111111`, secondaire `#6B6B6B`, tertiaire `#9B9B9B`
- Filets et séparateurs `#ECECEC`, 1 px
- Accent unique corail `#FF5A3C`, réservé au bouton primaire et à un seul chiffre clé par écran
- Notation, désaturée et clinique : vert `#2E7D5B`, jaune `#C79A2E`, orange `#D2691E`, rouge `#C2352F`

**Typographie**
- Titres : serif éditoriale (Source Serif, Newsreader ou Tiempos), poids 600
- Corps, données, libellés : sans-serif neutre (Inter), poids 400 et 500
- Échelle : titre d'écran 30 px, sous-titre 20 px, corps 16 px, libellé 13 px, micro 11 px
- Trois niveaux typographiques maximum par écran
- Chiffres en variante tabulaire, toujours

**Formes et espace**
- Grille 8 pt, marge latérale 24 px
- Rayon de coin 4 px, presque droit
- Aucune ombre portée nulle part, on sépare avec du blanc et des filets
- Séparation entre blocs : 32 px minimum

**Iconographie**
- Traits linéaires 1,5 px, jamais pleins, jamais colorés
- 4 icônes maximum par écran, uniquement quand elles remplacent un mot
- Aucune illustration, aucun personnage, aucun dégradé

---

## Règles UX appliquées dans les 7 écrans

1. Une seule action primaire par écran, en corail. Tout le reste est secondaire.
2. Divulgation progressive : le détail est replié par défaut, l'utilisateur l'ouvre.
3. La hiérarchie doit se lire en une demi-seconde, à taille réelle.
4. Action primaire dans la zone du pouce, tiers bas de l'écran.
5. Cibles tactiles 44 x 44 px minimum.
6. Contraste texte 4,5:1 minimum.
7. Pas de carrousel horizontal sur l'accueil.

---

## Le produit, pour contexte

CosmeCheck décrypte la composition des cosmétiques. L'utilisateur scanne ou
cherche un produit, obtient une note sur 20 et un décryptage ingrédient par
ingrédient en 4 couleurs, personnalisé selon son type de peau et les ingrédients
qu'il évite. Il se construit une routine, suit la couverture de ses objectifs,
compare des produits, discute avec un conseiller IA et consulte des fiches
ingrédients.

---

## PROMPT 1/7 : Accueil

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française qui analyse la composition
des produits cosmétiques et note leur qualité sur 20.

ÉCRAN : la page d'accueil.

STYLE : direction "clinique éditorial". Fond blanc pur #FFFFFF, surfaces
secondaires #FAFAF8. Texte #111111, texte secondaire #6B6B6B. Séparateurs
#ECECEC en 1 px. UNE seule couleur d'accent, un corail #FF5A3C, utilisé
uniquement sur le bouton principal. Titres en serif éditoriale (type Source
Serif) poids 600, corps et données en sans-serif neutre (type Inter). Coins
arrondis 4 px seulement. AUCUNE ombre portée. Grille 8 pt, marges latérales
24 px. Beaucoup de blanc tournant.

CONTENU, du haut vers le bas :
- Barre d'état iOS, heure 9:41.
- Titre en serif, grande taille : "Bonjour Stela". En dessous, sur une ligne
  en gris, la date du jour en toutes lettres.
- Un bloc principal qui occupe le tiers haut : "Votre dernière analyse",
  avec une petite photo carrée de flacon de sérum, la marque "The Ordinary",
  le nom "Lotion Tonique Exfoliante à l'Acide Glycolique 7%", et la note
  "14,2" en très grande serif avec "/20" plus petit à côté, et le mot "Bien"
  en vert #2E7D5B.
- Un filet fin, puis une ligne unique : "Ma routine · 6 produits · 3 objectifs
  couverts sur 5", avec un chevron discret à droite.
- Un filet fin, puis une ligne unique : "Beauty Advisor · Posez une question
  sur vos produits", avec un chevron discret à droite.
- En bas, au-dessus de la barre d'onglets, un bouton pleine largeur corail
  #FF5A3C, texte blanc : "Scanner un produit".
- Barre d'onglets sobre à 4 entrées, texte seul ou icône linéaire très fine :
  Accueil, Routine, Historique, Profil. L'onglet actif est simplement en noir,
  les autres en gris.

INTERDIT : pas de carrousel, pas de quiz, pas de carte de conseil du jour, pas
de compteur de crédits visible, pas d'illustration, pas de dégradé, pas
d'emoji, pas plus de 4 icônes sur tout l'écran. L'écran doit paraître presque
vide, c'est voulu.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5,
très haute définition, interface nette et lisible, textes en français réels
et lisibles, pas de faux texte latin. Pas de cadre de téléphone, pas de main,
pas de perspective, pas d'ombre autour de l'écran, pas de fond de scène.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de vue multiple, pas de collage.
```

---

## PROMPT 2/7 : Scanner un produit

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : l'entrée "Scanner un produit". Une feuille de choix de méthode
remontée du bas, par-dessus la vue caméra en direct.

STYLE : direction "clinique éditorial". Feuille blanche #FFFFFF posée sur le
flux caméra assombri. Texte #111111, secondaire #6B6B6B, séparateurs #ECECEC.
Accent corail #FF5A3C sur la seule option mise en avant. Titres en serif
éditoriale, libellés en sans-serif neutre. Coins de la feuille 4 px en haut.
Aucune ombre, la feuille se détache par contraste. Marges 24 px.

CONTENU :
- Le fond est une vue caméra en direct montrant le dos d'un flacon de
  cosmétique posé sur une table claire, légèrement flou et assombri.
- Une feuille blanche couvre les deux tiers bas de l'écran.
- Petite poignée grise centrée en haut de la feuille.
- Titre en serif : "Analyser un produit".
- Une ligne de sous-titre en gris : "Choisissez votre méthode".
- Une option mise en avant, encadrée d'un filet corail 1 px, avec un point
  corail : "Scanner le code-barres" et en dessous en gris "Le plus rapide".
- Puis quatre lignes simples séparées par des filets 1 px, sans encadré,
  chacune avec un titre noir et une courte explication grise :
  "Photographier la liste INCI" / "À partir du dos du produit"
  "Coller un lien" / "Depuis un site marchand"
  "Saisir la liste à la main" / "Copier-coller le texte"
  "Chercher dans le catalogue" / "Plus de 479 000 produits"
- Chaque ligne a un chevron gris très fin à droite.
- Une croix de fermeture fine en haut à gauche de l'écran, sur le flux caméra.

INTERDIT : pas de grosses icônes colorées par méthode, pas de vignettes
carrées colorées, pas de dégradé, pas d'ombre portée, pas d'emoji. Les cinq
méthodes se distinguent par le texte et la hiérarchie, pas par la couleur.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5,
très haute définition, textes en français réels et lisibles. Pas de cadre de
téléphone, pas de main, pas de perspective, pas de fond de scène.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 3/7 : Résultat d'analyse

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : le résultat d'analyse d'un produit. C'est l'écran le plus important
de l'application. Il doit rester calme malgré la densité de l'information.

STYLE : direction "clinique éditorial". Fond blanc #FFFFFF. Texte #111111,
secondaire #6B6B6B, filets #ECECEC 1 px. Accent corail #FF5A3C uniquement sur
le bouton principal. Couleurs de notation désaturées : vert #2E7D5B, jaune
#C79A2E, orange #D2691E, rouge #C2352F. Titres en serif éditoriale, données en
sans-serif à chiffres tabulaires. Rayon 4 px, aucune ombre. Marges 24 px.

CONTENU, du haut vers le bas, avec une hiérarchie très marquée :
- Une flèche de retour fine en haut à gauche, et un point de menu à droite.
- Photo du produit, carrée, 96 px, alignée à gauche. À côté : marque "Anua" en
  gris petit, puis le nom du produit "Azelaic Acid 10 Hyaluron Redness
  Soothing Serum" en serif sur deux lignes.
- LE VERDICT, dominant, occupant beaucoup de place : le nombre "12,9" en serif
  énorme, environ 72 px, en noir, suivi de "/20" en petit gris. Juste en
  dessous, le mot "Moyen" en jaune #C79A2E, et une seule phrase d'explication
  en gris : "Formule correcte, mais deux ingrédients méritent votre attention."
- Un filet fin.
- Un bloc "Pour vous" : une ligne verte avec un discret point vert "Aucun de
  vos ingrédients évités n'est présent".
- Un filet fin.
- Un bloc "Composition" : une seule barre horizontale fine de 6 px, pleine
  largeur, segmentée en 4 couleurs proportionnelles (beaucoup de vert, un peu
  de jaune, très peu d'orange). Sous la barre, quatre libellés alignés avec
  leur compte : "28 sûrs", "7 à surveiller", "0 à éviter", "0 à risque".
- Un filet fin.
- Trois lignes repliées, chacune avec un titre et un chevron vers le bas :
  "Les 35 ingrédients en détail", "Allergènes réglementés : aucun",
  "Observations : 2 silicones détectés".
- En bas, fixés : un bouton pleine largeur corail #FF5A3C "Ajouter à ma
  routine", et sous lui un lien texte simple souligné "Voir des alternatives".

INTERDIT : pas d'anneau de score, pas de jauge circulaire, pas d'étoiles, pas
de badge coloré multiple, pas de carte à ombre, pas de dégradé, pas d'emoji.
Le détail des ingrédients reste REPLIÉ, on ne montre pas la liste complète.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, textes en français réels et lisibles, chiffres nets. Pas de
cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 4/7 : Ma routine

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Ma routine". L'utilisateur y voit ses produits et dans quelle mesure
ils couvrent les objectifs qu'il s'est fixés pour sa peau.

STYLE : direction "clinique éditorial". Fond blanc #FFFFFF. Texte #111111,
secondaire #6B6B6B, filets #ECECEC. Accent corail #FF5A3C sur le seul bouton
principal. Couleurs de notation : vert #2E7D5B, jaune #C79A2E. Titres en serif
éditoriale, données en sans-serif à chiffres tabulaires. Rayon 4 px, aucune
ombre. Marges 24 px.

CONTENU :
- Titre d'écran en serif : "Ma routine". Sous-titre gris : "6 produits".
- Un bloc "Couverture de vos objectifs" avec cinq lignes. Chaque ligne :
  le nom de l'objectif à gauche en noir, une barre horizontale très fine de
  4 px au milieu, et le pourcentage à droite en chiffres tabulaires.
  Barres pleines en vert #2E7D5B au-dessus de 70 %, en jaune #C79A2E en
  dessous. Piste de la barre en #ECECEC.
  Les cinq lignes : "Hydratation 96 %", "Barrière cutanée 94 %",
  "Peau douce 97 %", "Produits clean 67 %", "Teint lumineux 52 %".
- Sous les barres, une ligne discrète en gris avec une petite flèche de
  rechargement : "Recalculer après un changement".
- Un filet fin, puis un titre de section en serif plus petit : "Vos produits".
- Une liste de 4 produits, séparés par des filets 1 px, sans carte ni ombre.
  Chaque ligne : petite photo carrée 56 px à gauche, nom du produit en noir
  sur une ligne, marque et fréquence en gris en dessous ("Pai · Matin"),
  et la note en chiffres tabulaires à droite ("16,4") avec un point de
  couleur de 6 px correspondant.
- En bas, un bouton pleine largeur corail #FF5A3C : "Ajouter un produit".

INTERDIT : pas de graphique en anneau, pas de camembert, pas d'illustration,
pas de carte à ombre, pas de dégradé dans les barres, pas d'emoji. Les barres
sont plates et fines.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, textes en français réels et lisibles, pourcentages nets et
alignés à droite. Pas de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 5/7 : Historique

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Historique". La liste de toutes les analyses déjà faites, avec
recherche, filtres et possibilité de comparer deux produits.

STYLE : direction "clinique éditorial". Fond blanc #FFFFFF. Texte #111111,
secondaire #6B6B6B, filets #ECECEC 1 px. Accent corail #FF5A3C uniquement sur
l'élément de filtre actif. Couleurs de notation : vert #2E7D5B, jaune #C79A2E,
orange #D2691E. Titres en serif éditoriale, le reste en sans-serif. Rayon 4 px,
aucune ombre. Marges 24 px.

CONTENU :
- Titre d'écran en serif : "Historique". Sous-titre gris : "23 analyses".
- Un champ de recherche discret, fond #FAFAF8, coins 4 px, sans ombre, avec
  une loupe linéaire très fine et le texte gris "Rechercher un produit".
- Une ligne de deux filtres en texte simple séparés par un espace : "Tout" en
  noir souligné d'un filet corail de 2 px (actif), et "Favoris" en gris.
  À droite de cette ligne, un lien texte discret : "Comparer".
- La liste, séparée par des filets 1 px, sans carte ni ombre. Six lignes.
  Chaque ligne : photo carrée 56 px à gauche, nom du produit en noir sur une
  ou deux lignes, marque et date en gris en dessous ("The Ordinary · il y a
  3 jours"), et à droite la note en chiffres tabulaires de taille moyenne
  ("11,8") avec sous elle un point de 6 px à la couleur correspondante.
- Une des six lignes porte un petit marque-page linéaire fin à droite,
  indiquant un favori.
- Pas de bouton flottant, pas de bouton principal sur cet écran.

INTERDIT : pas d'anneau de score, pas de demi-donut, pas de badge coloré plein,
pas de carte à ombre, pas d'illustration, pas d'emoji. La couleur n'apparaît
que dans les petits points de notation et le soulignement du filtre actif.

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

ÉCRAN : "Beauty Advisor", une conversation avec un conseiller beauté IA qui
recommande des produits adaptés au profil de l'utilisateur.

STYLE : direction "clinique éditorial". Fond blanc #FFFFFF. Texte #111111,
secondaire #6B6B6B, filets #ECECEC. Accent corail #FF5A3C uniquement sur le
bouton d'envoi. Titre en serif éditoriale, conversation en sans-serif 16 px
avec un interligne généreux de 1,6. Rayon 4 px, aucune ombre. Marges 24 px.

CONTENU :
- Titre d'écran en serif : "Beauty Advisor". Sous-titre gris sur une ligne :
  "Conseils fondés sur votre profil et vos produits".
- La conversation, sans bulles colorées :
  - Le message de l'utilisateur est aligné à droite, sur fond #FAFAF8, coins
    4 px : "Je cherche un sérum pour les rougeurs, peau grasse."
  - La réponse du conseiller est alignée à gauche, SANS fond du tout, juste du
    texte noir sur blanc, précédé d'un petit trait vertical corail de 2 px sur
    toute la hauteur du paragraphe : "Pour une peau grasse sujette aux
    rougeurs, cherchez un actif apaisant sans alcool ni parfum. Voici deux
    formules propres de votre catalogue."
  - Sous ce paragraphe, deux cartes produit horizontales minimalistes,
    séparées par un filet, sans ombre : petite photo carrée 48 px, marque en
    gris, nom du produit en noir, note en chiffres tabulaires à droite avec un
    point de couleur.
- En bas, au-dessus du champ de saisie, deux suggestions rapides en texte
  encadré d'un filet fin 1 px, coins 4 px : "Et pour le soir ?" et
  "Compatible avec ma routine ?".
- Champ de saisie pleine largeur, fond #FAFAF8, coins 4 px, texte gris
  "Posez votre question", et à droite un petit bouton carré corail avec une
  flèche blanche vers le haut.

INTERDIT : pas de bulles de chat arrondies et colorées, pas d'avatar, pas de
visage, pas de robot, pas d'illustration, pas de dégradé, pas d'emoji. La
conversation doit ressembler à une page de texte bien composée.

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

ÉCRAN : "Profil". L'utilisateur y règle son type de peau, ses objectifs, et
surtout la liste des ingrédients qu'il veut éviter, qui personnalise toutes
les analyses.

STYLE : direction "clinique éditorial". Fond blanc #FFFFFF, surfaces #FAFAF8.
Texte #111111, secondaire #6B6B6B, filets #ECECEC 1 px. Accent corail #FF5A3C
uniquement sur le lien d'ajout. Titres en serif éditoriale, le reste en
sans-serif. Rayon 4 px, aucune ombre. Marges 24 px.

CONTENU :
- Titre d'écran en serif : "Profil".
- Une ligne d'identité sobre : initiales "SB" dans un carré gris clair #FAFAF8
  de 48 px, coins 4 px, à côté le prénom "Stela" en noir et l'adresse e-mail en
  gris plus petit.
- Un filet fin, puis section en serif plus petit : "Ma peau". Trois lignes
  séparées par des filets, chacune avec le libellé à gauche en gris et la
  valeur à droite en noir, suivie d'un chevron fin :
  "Type de peau · Grasse", "Zone du corps · Normale",
  "Objectifs · 5 sélectionnés".
- Un filet fin, puis section : "Ce que j'évite". Une phrase grise
  d'explication sur une ligne : "Ces ingrédients sont signalés dans chaque
  analyse." En dessous, des puces de texte sur deux rangées : chaque puce est
  un rectangle à coins 4 px, fond #FAFAF8, filet 1 px #ECECEC, texte noir
  13 px, avec une croix fine grise à droite. Les puces : "Parfum",
  "Phénoxyéthanol", "Silicones", "Sulfates", "Huiles essentielles".
  Après les puces, un lien texte corail : "Ajouter un ingrédient".
- Un filet fin, puis une ligne unique : "Crédits restants" à gauche en gris,
  "129" à droite en chiffres tabulaires noirs.
- Un filet fin, puis une ligne discrète en noir avec chevron : "Passer à
  Premium". Pas de bandeau promotionnel, pas de couleur, une ligne de liste.
- Tout en bas, trois liens gris très petits alignés : "Conditions",
  "Confidentialité", "Mentions légales".

INTERDIT : pas de photo de profil, pas de visage, pas de bannière Premium
colorée, pas de dégradé, pas d'illustration, pas d'emoji, pas de carte à ombre.

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
