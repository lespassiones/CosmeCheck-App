# Direction 05 : Data sobre (mode clair)

**L'idée.** L'app se comporte comme un bon tableau de bord : c'est la donnée qui
porte le design. Gris froid, un seul bleu ardoise, des chiffres tabulaires
parfaitement alignés, des barres et des anneaux très fins. Aucune décoration, et
pourtant l'écran est vivant parce que les chiffres sont bien composés.

**Mode :** clair.

---

## Système de design de cette direction

**Couleurs**
- Fond `#F6F7F9`, cartes `#FFFFFF`
- Texte principal `#14181F`, secondaire `#5B6472`, tertiaire `#8A93A1`
- Bordures `#E4E7EC` à 1 px
- Accent unique bleu ardoise `#2F5D8C`
- Notation : vert `#2E8B57`, jaune `#D2A106`, orange `#E07B39`, rouge `#C9403A`

**Typographie**
- Une seule famille sans-serif (Inter), avec chiffres tabulaires activés partout
- Titres poids 600, corps poids 400, données poids 500
- Échelle : chiffre héros 60 px, titre 26 px, sous-titre 17 px, corps 15 px, libellé 12 px
- Les unités (`/20`, `%`) sont toujours en 60 % de la taille du chiffre, en gris

**Formes et espace**
- Grille 8 pt, marge latérale 16 px, densité plus forte que les autres directions
- Rayon de coin 10 px, bordure 1 px `#E4E7EC`
- Ombre unique très légère : `0 1px 2px rgba(16,24,40,0.05)`
- Les cartes peuvent être collées les unes aux autres avec un simple filet

**Iconographie**
- Traits 1,5 px, géométriques, gris uniquement
- 3 icônes maximum par écran
- Les graphiques remplacent les icônes : barre fine, anneau 3 px, points

---

## Règles UX appliquées dans les 7 écrans

1. Une seule action primaire par écran, en bleu ardoise plein.
2. Divulgation progressive malgré la densité : le détail reste replié.
3. Tous les chiffres d'une même colonne sont alignés à droite sur leur virgule.
4. Un graphique n'apparaît que s'il dit quelque chose qu'un chiffre ne dit pas.
5. Cibles tactiles 44 x 44 px minimum.
6. Le bleu ne colore jamais une donnée, uniquement les actions.

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

ÉCRAN : la page d'accueil, conçue comme un tableau de bord sobre.

STYLE : direction "data sobre". Fond gris froid #F6F7F9, cartes blanches
#FFFFFF avec bordure 1 px #E4E7EC, coins 10 px, ombre très légère
0 1px 2px rgba(16,24,40,0.05). Texte #14181F, secondaire #5B6472. UN seul
accent, bleu ardoise #2F5D8C, réservé aux actions. Notation : vert #2E8B57,
jaune #D2A106. Sans-serif type Inter avec chiffres TABULAIRES partout. Marges
16 px. Alignement des chiffres irréprochable.

CONTENU, du haut vers le bas :
- Barre d'état iOS, heure 9:41.
- "Bonjour Stela" en 26 px poids 600, date du jour en 12 px grise dessous.
- Une carte blanche "Dernière analyse" : libellé en 12 px gris en haut, puis
  sur une ligne une vignette produit carrée 56 px coins 6 px, le nom
  "Lotion Tonique Exfoliante" en 15 px et la marque "The Ordinary" en 12 px
  grise. À droite de la carte, aligné, le chiffre "14,2" en 36 px poids 600
  avec "/20" en 14 px gris, et sous lui "Bien" en 12 px vert #2E8B57.
- Une carte blanche à trois colonnes égales séparées par des filets verticaux
  1 px #E4E7EC, chaque colonne avec un chiffre en 26 px poids 600 et son
  libellé en 12 px gris dessous, centrés : "23 / Analyses", "6 / Produits",
  "129 / Crédits".
- Une carte blanche "Couverture de vos objectifs" avec seulement DEUX lignes,
  les plus faibles : "Produits clean" avec une barre fine de 4 px remplie à
  67 % en jaune #D2A106 et "67 %" à droite, puis "Teint lumineux" à 52 % en
  jaune et "52 %" à droite. Sous les deux lignes, un lien bleu ardoise 13 px :
  "Voir les 5 objectifs".
- Une carte blanche courte : "Beauty Advisor" en 15 px, "Posez une question"
  en 12 px gris, chevron gris à droite.
- En bas, bouton pleine largeur bleu ardoise #2F5D8C, coins 10 px, texte blanc
  16 px : "Scanner un produit".
- Barre d'onglets blanche, 4 entrées, icônes géométriques fines grises avec
  libellé 11 px. L'onglet actif est en bleu ardoise.

INTERDIT : pas de carrousel, pas de quiz, pas d'illustration, pas de dégradé,
pas d'emoji, pas de graphique circulaire. La couleur ne sert qu'à la notation
et au bouton.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, chiffres parfaitement alignés et lisibles, textes en français
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

STYLE : direction "data sobre". Feuille blanche #FFFFFF coins supérieurs 14 px
sur le flux caméra assombri. Texte #14181F, secondaire #5B6472, bordures
#E4E7EC. Accent bleu ardoise #2F5D8C. Sans-serif type Inter. Ombre très légère.
Marges 16 px.

CONTENU :
- Fond : vue caméra en direct sur le dos d'un flacon cosmétique, légèrement
  flou et assombri.
- Feuille blanche couvrant les deux tiers bas, poignée grise fine centrée.
- Titre "Analyser un produit" en 22 px poids 600, sous-titre 13 px gris
  "Choisissez votre méthode".
- Cinq lignes de liste séparées par des filets 1 px #E4E7EC, sans carte
  individuelle, chacune avec à gauche une petite icône géométrique grise 20 px,
  au milieu le libellé en 15 px et son explication en 12 px grise, à droite un
  chevron gris fin :
  "Code-barres" / "Le plus rapide"
  "Photo de la liste INCI" / "À partir du dos du produit"
  "Lien e-commerce" / "Depuis un site marchand"
  "Saisie manuelle" / "Copier-coller le texte"
  "Catalogue" / "479 000 produits"
- La première ligne a son libellé en bleu ardoise #2F5D8C et un fond bleu très
  pâle (#2F5D8C à 6 %), c'est la seule mise en avant.
- Une croix fine en haut à gauche sur la caméra.

INTERDIT : pas d'icône colorée, pas de vignette saturée, pas de dégradé, pas
d'emoji. Les icônes restent grises sauf celle de la ligne mise en avant.

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

ÉCRAN : le résultat d'analyse d'un produit, présenté comme une fiche de
données.

STYLE : direction "data sobre". Fond #F6F7F9, cartes blanches bordure 1 px
#E4E7EC coins 10 px, ombre très légère. Texte #14181F, secondaire #5B6472.
Accent bleu ardoise #2F5D8C sur le bouton primaire. Notation : vert #2E8B57,
jaune #D2A106, orange #E07B39, rouge #C9403A. Sans-serif Inter, chiffres
TABULAIRES. Marges 16 px.

CONTENU :
- Flèche de retour fine à gauche, trois points à droite.
- Une carte d'en-tête compacte : vignette produit 64 px coins 6 px à gauche,
  "Anua" en 12 px gris, nom "Azelaic Acid 10 Hyaluron Redness Soothing Serum"
  en 16 px poids 500 sur deux lignes.
- Une carte verdict : à gauche, un anneau de progression très fin de 3 px
  d'épaisseur et 88 px de diamètre, rempli aux deux tiers en jaune #D2A106, avec
  au centre "12,9" en 26 px poids 600 et "/20" en 12 px gris dessous. À droite
  de l'anneau, empilés : "Moyen" en 17 px poids 600 jaune #D2A106, et une
  phrase en 13 px grise sur trois lignes : "Formule correcte, mais deux
  ingrédients méritent votre attention."
- Une carte "Vos restrictions" : un point vert #2E8B57 de 8 px et le texte
  "Aucun ingrédient évité détecté" en 14 px, avec "0 / 5" aligné à droite en
  chiffres tabulaires.
- Une carte "Répartition des ingrédients" : quatre lignes de barres
  horizontales fines empilées, chacune avec le libellé en 13 px à gauche sur
  une largeur fixe, une barre de 6 px au milieu dont la longueur est
  proportionnelle, et le compte en 15 px à droite :
  "Sûrs" barre verte longue "28", "À surveiller" barre jaune courte "7",
  "À éviter" barre vide "0", "À risque" barre vide "0".
  Sous les barres, une ligne grise 12 px : "35 ingrédients identifiés sur 35".
- Une carte contenant trois lignes repliées séparées par des filets, chacune
  avec un chevron vers le bas à droite : "Les 35 ingrédients en détail",
  "Allergènes réglementés · 0", "Observations · 2".
- En bas : bouton pleine largeur bleu ardoise #2F5D8C "Ajouter à ma routine",
  et sous lui un bouton à bordure 1 px #E4E7EC fond blanc texte bleu ardoise :
  "Voir des alternatives".

INTERDIT : pas d'étoiles, pas de dégradé, pas d'emoji, pas d'illustration. La
liste d'ingrédients reste REPLIÉE. Un seul graphique circulaire sur l'écran, et
il est fin.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, chiffres parfaitement alignés, textes en français réels. Pas
de cadre de téléphone, pas de main, pas de perspective.

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
C'est l'écran le plus chiffré de l'application.

STYLE : direction "data sobre". Fond #F6F7F9, cartes blanches bordure 1 px
#E4E7EC coins 10 px, ombre très légère. Accent bleu ardoise #2F5D8C. Notation :
vert #2E8B57, jaune #D2A106. Sans-serif Inter, chiffres TABULAIRES. Marges
16 px.

CONTENU :
- "Ma routine" en 26 px poids 600, "6 produits · mis à jour aujourd'hui" en
  12 px gris.
- Une carte "Couverture de vos objectifs" avec un petit libellé gris en haut à
  gauche et, en haut à droite, une icône de rechargement grise fine de 16 px.
  Cinq lignes : nom de l'objectif en 14 px à gauche sur une largeur fixe, barre
  horizontale de 6 px coins carrés au milieu (piste #E4E7EC, remplissage plein),
  pourcentage en 15 px poids 500 aligné à droite sur trois caractères.
  Remplissage vert #2E8B57 au-dessus de 70 %, jaune #D2A106 en dessous.
  Les cinq : "Hydratation 96 %", "Barrière cutanée 94 %", "Peau douce 97 %",
  "Produits clean 67 %", "Teint lumineux 52 %".
  Sous les lignes, un filet puis une ligne de synthèse en 13 px : "Moyenne
  générale" à gauche et "81 %" en poids 600 à droite.
- Une carte "Vos produits" contenant quatre lignes séparées par des filets 1 px :
  vignette 44 px coins 6 px, nom en 14 px, marque et moment en 12 px gris
  dessous, et à droite la note en 16 px poids 500 avec un point de couleur de
  6 px juste avant.
- En bas, bouton pleine largeur bleu ardoise #2F5D8C : "Ajouter un produit".

INTERDIT : pas de camembert, pas de graphique 3D, pas de dégradé dans les
barres, pas d'illustration, pas d'emoji.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, pourcentages parfaitement alignés à droite, textes en
français réels. Pas de cadre de téléphone, pas de main, pas de perspective.

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

STYLE : direction "data sobre". Fond #F6F7F9, carte blanche unique contenant
toute la liste, bordure 1 px #E4E7EC coins 10 px. Accent bleu ardoise #2F5D8C
sur le filtre actif. Notation : vert #2E8B57, jaune #D2A106, orange #E07B39.
Sans-serif Inter, chiffres TABULAIRES. Marges 16 px.

CONTENU :
- "Historique" en 26 px poids 600, "23 analyses" en 12 px gris.
- Un champ de recherche blanc, bordure 1 px #E4E7EC, coins 10 px, hauteur
  40 px, loupe grise fine à gauche, texte gris "Rechercher un produit".
- Une rangée de segments accolés formant un seul contrôle segmenté à bordure
  #E4E7EC et coins 8 px : "Tout" sur fond bleu ardoise #2F5D8C texte blanc
  (actif), "Favoris" sur fond blanc texte gris. À droite, séparé, un bouton
  texte bleu ardoise 13 px : "Comparer".
- UNE seule carte blanche contenant six lignes séparées par des filets 1 px
  #E4E7EC : vignette 44 px coins 6 px à gauche, nom du produit en 14 px sur une
  ligne tronquée proprement, marque et date en 12 px gris dessous
  ("The Ordinary · 15 sept."), et à droite la note en 16 px poids 500 précédée
  d'un point de couleur de 6 px.
- Une des lignes a un petit marque-page gris plein à droite de sa note.
- Pas de bouton principal.

INTERDIT : pas d'anneau, pas de demi-donut, pas de carte par ligne, pas
d'illustration, pas d'emoji, pas de dégradé. Une seule carte contient toute la
liste.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, notes alignées à droite, textes en français réels. Pas de
cadre de téléphone, pas de main, pas de perspective.

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

STYLE : direction "data sobre". Fond #F6F7F9, cartes blanches bordure 1 px
#E4E7EC coins 10 px. Texte #14181F, secondaire #5B6472. Accent bleu ardoise
#2F5D8C. Sans-serif Inter, corps 15 px interligne 1,55. Marges 16 px.

CONTENU :
- "Beauty Advisor" en 26 px poids 600, sous-titre 12 px gris : "Fondé sur
  votre profil et vos 6 produits".
- La conversation :
  - Message utilisateur, aligné à droite, carte à fond bleu très pâle
    (#2F5D8C à 8 %), bordure 1 px bleu à 20 %, coins 10 px, texte #14181F :
    "Je cherche un sérum pour les rougeurs, peau grasse."
  - Réponse du conseiller, alignée à gauche, carte blanche bordure #E4E7EC
    coins 10 px : texte en 15 px, puis un petit filet gris, puis DEUX lignes
    produit intégrées dans la même carte, séparées par un filet : vignette
    36 px, nom en 13 px, note en 14 px poids 500 à droite avec un point de
    couleur.
    Texte de la réponse : "Pour une peau grasse sujette aux rougeurs, cherchez
    un actif apaisant sans alcool ni parfum. Deux formules propres de votre
    catalogue correspondent."
- Deux suggestions rapides en boutons à bordure 1 px #E4E7EC, fond blanc, coins
  8 px, texte bleu ardoise 13 px : "Et pour le soir ?" et "Compatible avec ma
  routine ?".
- Champ de saisie blanc pleine largeur, bordure #E4E7EC, coins 10 px, texte
  gris "Posez votre question", et à droite un carré bleu ardoise #2F5D8C de
  32 px coins 8 px avec une flèche blanche vers le haut.

INTERDIT : pas d'avatar, pas de visage, pas de robot, pas de bulle arrondie de
messagerie, pas de dégradé, pas d'emoji.

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

STYLE : direction "data sobre". Fond #F6F7F9, cartes blanches bordure 1 px
#E4E7EC coins 10 px, ombre très légère. Accent bleu ardoise #2F5D8C. Sans-serif
Inter, chiffres TABULAIRES. Marges 16 px.

CONTENU :
- "Profil" en 26 px poids 600.
- Une carte d'identité compacte : carré gris clair #F6F7F9 de 44 px coins 8 px
  avec les initiales "SB" en gris foncé, à côté "Stela" en 15 px et l'adresse
  e-mail en 12 px grise. À droite, un chevron.
- Une carte "Ma peau" avec un libellé gris en haut, puis trois lignes séparées
  par des filets 1 px : libellé en 14 px gris à gauche, valeur en 14 px poids
  500 noire à droite avec un chevron : "Type de peau · Grasse",
  "Zone du corps · Normale", "Objectifs · 5".
- Une carte "Ce que j'évite" : une ligne grise 12 px "Signalés dans chaque
  analyse", puis cinq lignes séparées par des filets, chacune avec le nom en
  14 px à gauche et, à droite, le nombre de produits concernés en 13 px gris
  suivi d'une croix fine :
  "Parfum · 4 produits", "Phénoxyéthanol · 2 produits", "Silicones · 3
  produits", "Sulfates · 0 produit", "Huiles essentielles · 1 produit".
  Sous la liste, un lien bleu ardoise 13 px : "Ajouter un ingrédient".
- Une carte à deux lignes : "Crédits restants" à gauche en 14 px et "129" à
  droite en 17 px poids 600, puis "Passer à Premium" avec un chevron.
- Tout en bas, trois liens gris 11 px : "Conditions", "Confidentialité",
  "Mentions légales".

INTERDIT : pas de photo de profil, pas de visage, pas de puce arrondie
colorée, pas de bannière Premium, pas de dégradé, pas d'emoji.

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
