# Direction 10 : Nocturne clinique (MODE SOMBRE)

**L'idée.** Le pendant sombre de la direction data. Bleu nuit profond, un cyan
doux qui sert d'unique accent, des anneaux et des barres très fins qui semblent
tracés au laser. Précis, technique, mais pas froid, parce que le bleu nuit reste
plus doux qu'un noir pur. C'est la direction qui met le mieux en valeur les
chiffres de l'app.

**Mode :** SOMBRE. C'est la seconde des deux directions sombres de la série.

---

## Système de design de cette direction

**Couleurs**
- Fond bleu nuit `#0B1220`, surface 1 `#121C2E`, surface 2 `#1A2740`
- Texte principal `#E6EDF7`, secondaire `#8FA0B8`, tertiaire `#5E6E86`
- Filets `#22304A` à 1 px
- Accent unique cyan doux `#5CC8D8`
- Notation, ajustée pour le fond sombre : vert `#4FC08D`, jaune `#E3BE5A`, orange `#E8975A`, rouge `#E06A72`

**Typographie**
- Une seule famille sans-serif (Inter), chiffres tabulaires activés partout
- Titres poids 600, corps poids 400, données poids 500
- Échelle : chiffre héros 62 px, titre 27 px, sous-titre 18 px, corps 15 px, libellé 12 px
- Les unités sont toujours en 55 % de la taille du chiffre, en `#5E6E86`

**Formes et espace**
- Grille 8 pt, marge latérale 18 px
- Rayon de coin 12 px
- AUCUNE ombre : les surfaces se distinguent par la valeur
- Les traits de données (anneaux, barres) font 2 à 3 px, jamais plus

**Iconographie**
- Traits 1,5 px, géométriques, en `#8FA0B8`
- 3 icônes maximum par écran
- Aucune illustration, aucun halo, aucune lueur diffuse

---

## Règles UX appliquées dans les 7 écrans

1. Une seule action primaire par écran, en cyan plein avec texte bleu nuit.
2. Divulgation progressive malgré la densité de chiffres.
3. Tous les chiffres d'une colonne sont alignés à droite sur leur virgule.
4. Le cyan ne colore jamais une donnée, uniquement les actions et l'état actif.
5. Cibles tactiles 44 x 44 px minimum.
6. Contraste du texte principal au moins 11:1 sur le fond.

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

ÉCRAN : la page d'accueil, conçue comme un tableau de bord nocturne.

STYLE : direction "nocturne clinique", mode sombre bleu nuit. Fond #0B1220,
cartes #121C2E, éléments surélevés #1A2740, filets #22304A en 1 px. Texte
#E6EDF7, secondaire #8FA0B8. UN seul accent, cyan doux #5CC8D8, réservé aux
actions. Notation : vert #4FC08D, jaune #E3BE5A. Sans-serif type Inter avec
chiffres TABULAIRES partout. Coins 12 px. AUCUNE ombre, AUCUN halo lumineux.
Marges 18 px.

CONTENU, du haut vers le bas :
- Barre d'état iOS claire sur fond sombre, heure 9:41.
- "Bonjour Stela" en 27 px poids 600 #E6EDF7, date du jour en 12 px #8FA0B8.
- Une carte #121C2E "Dernière analyse" : libellé en 12 px #8FA0B8 en haut, puis
  sur une ligne une vignette produit 56 px coins 8 px, le nom "Lotion Tonique
  Exfoliante" en 15 px #E6EDF7 et la marque "The Ordinary" en 12 px #8FA0B8.
  À droite, un anneau très fin de 2 px et 56 px de diamètre, rempli aux trois
  quarts en vert #4FC08D sur une piste #22304A, avec "14,2" en 17 px poids 600
  au centre.
- Une carte #121C2E à trois colonnes séparées par des filets verticaux #22304A,
  chaque colonne avec un chiffre en 24 px poids 600 #E6EDF7 et son libellé en
  12 px #8FA0B8 dessous, centrés : "23 / Analyses", "6 / Produits",
  "129 / Crédits".
- Une carte #121C2E "À surveiller" contenant seulement les deux objectifs les
  plus faibles : "Produits clean" avec une barre de 4 px remplie à 67 % en
  jaune #E3BE5A et "67 %" à droite, puis "Teint lumineux" à 52 % en jaune et
  "52 %" à droite. Sous les deux lignes, un lien cyan #5CC8D8 en 13 px :
  "Voir les 5 objectifs".
- Une carte #121C2E courte : "Beauty Advisor" en 15 px, "Posez une question" en
  12 px #8FA0B8, chevron fin à droite.
- En bas, un bouton pleine largeur CYAN #5CC8D8, coins 12 px, texte BLEU NUIT
  #0B1220 en 16 px poids 600 : "Scanner un produit".
- Barre d'onglets #121C2E avec un filet #22304A en haut, 4 entrées, icônes
  géométriques fines #8FA0B8 avec libellé 11 px. L'onglet actif est en cyan.

INTERDIT : pas de halo lumineux, pas de néon, pas de dégradé, pas de carrousel,
pas de quiz, pas d'illustration, pas d'emoji. Les anneaux et barres restent
très fins.

RENDU : capture d'écran d'application en mode sombre, à plat, plein cadre,
ratio 9:19.5, très haute définition, chiffres parfaitement alignés et lisibles,
textes en français réels. Pas de cadre de téléphone, pas de main, pas de
perspective, pas de fond de scène.

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

STYLE : direction "nocturne clinique", mode sombre bleu nuit. Feuille #121C2E à
coins supérieurs 16 px sur le flux caméra. Texte #E6EDF7, secondaire #8FA0B8,
filets #22304A. Accent cyan #5CC8D8. Sans-serif Inter. Coins 12 px, aucune
ombre, aucun halo. Marges 18 px.

CONTENU :
- Fond : vue caméra en direct sur le dos d'un flacon cosmétique dans une
  lumière froide, légèrement flou et assombri.
- Un cadre de visée minimal sur la zone caméra : quatre petits angles en cyan
  #5CC8D8 de 2 px, rien d'autre, sans rectangle plein.
- Une feuille #121C2E couvrant les deux tiers bas, poignée #22304A fine
  centrée.
- Titre "Analyser un produit" en 22 px poids 600, sous-titre 13 px #8FA0B8 :
  "Choisissez votre méthode".
- Cinq lignes séparées par des filets #22304A, chacune avec une petite icône
  géométrique #8FA0B8 de 20 px à gauche, le libellé en 15 px #E6EDF7, son
  explication en 12 px #8FA0B8, et un chevron fin à droite :
  "Code-barres" / "Le plus rapide"
  "Photo de la liste INCI" / "À partir du dos du produit"
  "Lien e-commerce" / "Depuis un site marchand"
  "Saisie manuelle" / "Copier-coller le texte"
  "Catalogue" / "479 000 produits"
- La première ligne a son icône et son libellé en cyan #5CC8D8, sur un fond
  #1A2740, c'est la seule mise en avant.
- Une croix fine claire en haut à gauche sur la caméra.

INTERDIT : pas de halo, pas de néon, pas d'icône multicolore, pas de dégradé,
pas d'ombre, pas d'emoji.

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
l'application, présenté comme une fiche de données nocturne.

STYLE : direction "nocturne clinique", mode sombre bleu nuit. Fond #0B1220,
cartes #121C2E, éléments #1A2740, filets #22304A. Texte #E6EDF7, secondaire
#8FA0B8. Accent cyan #5CC8D8 sur le bouton primaire uniquement. Notation : vert
#4FC08D, jaune #E3BE5A, orange #E8975A, rouge #E06A72. Sans-serif Inter,
chiffres TABULAIRES. Coins 12 px, AUCUNE ombre, AUCUN halo. Marges 18 px.

CONTENU :
- Flèche de retour fine #8FA0B8 en haut à gauche, trois points à droite.
- Une carte #121C2E d'en-tête compacte : vignette produit 64 px coins 8 px à
  gauche, "Anua" en 12 px #8FA0B8, nom "Azelaic Acid 10 Hyaluron Redness
  Soothing Serum" en 16 px poids 500 #E6EDF7 sur deux lignes.
- Une carte #121C2E verdict : à gauche, un anneau très fin de 3 px et 96 px de
  diamètre, piste #22304A, rempli aux deux tiers en jaune #E3BE5A, avec au
  centre "12,9" en 28 px poids 600 #E6EDF7 et "/20" en 13 px #5E6E86 dessous.
  À droite de l'anneau, empilés : "Moyen" en 17 px poids 600 jaune #E3BE5A, et
  une phrase en 13 px #8FA0B8 sur trois lignes : "Formule correcte, mais deux
  ingrédients méritent votre attention."
- Une carte #121C2E "Vos restrictions" : un point vert #4FC08D de 8 px, le
  texte "Aucun ingrédient évité détecté" en 14 px #E6EDF7, et "0 / 5" aligné à
  droite en chiffres tabulaires #8FA0B8.
- Une carte #121C2E "Répartition des ingrédients" : quatre lignes de barres
  horizontales empilées, chacune avec le libellé en 13 px #8FA0B8 à gauche sur
  une largeur fixe, une barre de 6 px coins 999 px au milieu dont la longueur
  est proportionnelle sur une piste #22304A, et le compte en 15 px #E6EDF7 à
  droite : "Sûrs" barre verte longue "28", "À surveiller" barre jaune courte
  "7", "À éviter" barre vide "0", "À risque" barre vide "0".
  Sous les barres, une ligne 12 px #5E6E86 : "35 ingrédients identifiés sur 35".
- Une carte #121C2E contenant trois lignes repliées séparées par des filets
  #22304A, chacune en 14 px avec un chevron fin vers le bas et une valeur
  #8FA0B8 à droite : "Les 35 ingrédients en détail · 35", "Allergènes
  réglementés · 0", "Observations · 2".
- En bas : bouton pleine largeur CYAN #5CC8D8 coins 12 px, texte BLEU NUIT
  #0B1220 poids 600 : "Ajouter à ma routine". Sous lui un bouton #1A2740 à
  filet #22304A, texte cyan : "Voir des alternatives".

INTERDIT : pas de halo, pas de néon, pas d'étoiles, pas de dégradé, pas
d'ombre, pas d'emoji. La liste d'ingrédients reste REPLIÉE. Un seul anneau sur
l'écran, et il est fin.

RENDU : capture d'écran d'application en mode sombre, à plat, plein cadre,
ratio 9:19.5, très haute définition, chiffres parfaitement alignés, textes en
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
C'est l'écran le plus chiffré de l'application.

STYLE : direction "nocturne clinique", mode sombre bleu nuit. Fond #0B1220,
cartes #121C2E, filets #22304A. Texte #E6EDF7, secondaire #8FA0B8. Accent cyan
#5CC8D8. Notation : vert #4FC08D, jaune #E3BE5A. Sans-serif Inter, chiffres
TABULAIRES. Coins 12 px, aucune ombre, aucun halo. Marges 18 px.

CONTENU :
- "Ma routine" en 27 px poids 600, "6 produits · mis à jour aujourd'hui" en
  12 px #8FA0B8.
- Une carte #121C2E "Couverture de vos objectifs" avec un libellé #8FA0B8 en
  haut à gauche et une icône de rechargement fine #8FA0B8 de 16 px en haut à
  droite. Cinq lignes : nom de l'objectif en 14 px #E6EDF7 à gauche sur une
  largeur fixe, barre horizontale de 6 px coins 999 px au milieu (piste
  #22304A, remplissage plein sans dégradé), pourcentage en 15 px poids 500
  aligné à droite sur trois caractères.
  Remplissage vert #4FC08D au-dessus de 70 %, jaune #E3BE5A en dessous.
  Les cinq : "Hydratation 96 %", "Barrière cutanée 94 %", "Peau douce 97 %",
  "Produits clean 67 %", "Teint lumineux 52 %".
  Sous les lignes, un filet #22304A puis une ligne de synthèse en 13 px :
  "Moyenne générale" à gauche en #8FA0B8 et "81 %" à droite en poids 600
  #E6EDF7.
- Une carte #121C2E "Vos produits" contenant quatre lignes séparées par des
  filets #22304A : vignette 44 px coins 8 px, nom en 14 px #E6EDF7, marque et
  moment en 12 px #8FA0B8 dessous, et à droite la note en 16 px poids 500
  précédée d'un point de couleur de 6 px.
- En bas, bouton pleine largeur CYAN #5CC8D8, texte bleu nuit : "Ajouter un
  produit".

INTERDIT : pas de halo, pas de néon, pas de camembert, pas de graphique 3D, pas
de dégradé dans les barres, pas d'ombre, pas d'emoji.

RENDU : capture d'écran d'application en mode sombre, à plat, plein cadre,
ratio 9:19.5, très haute définition, pourcentages parfaitement alignés à
droite, textes en français réels. Pas de cadre de téléphone, pas de main, pas
de perspective.

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

STYLE : direction "nocturne clinique", mode sombre bleu nuit. Fond #0B1220,
une seule carte #121C2E contenant toute la liste, filets #22304A. Texte
#E6EDF7, secondaire #8FA0B8. Accent cyan #5CC8D8 sur le filtre actif. Notation :
vert #4FC08D, jaune #E3BE5A, orange #E8975A. Sans-serif Inter, chiffres
TABULAIRES. Coins 12 px, aucune ombre, aucun halo. Marges 18 px.

CONTENU :
- "Historique" en 27 px poids 600, "23 analyses" en 12 px #8FA0B8.
- Un champ de recherche #1A2740 coins 12 px hauteur 40 px, loupe fine #8FA0B8
  à gauche, texte #5E6E86 "Rechercher un produit".
- Un contrôle segmenté sur fond #1A2740, coins 10 px : "Tout" sur une pastille
  cyan #5CC8D8 avec texte bleu nuit (actif), "Favoris" en texte #8FA0B8. À
  droite, séparé, un bouton texte cyan 13 px : "Comparer".
- UNE seule carte #121C2E contenant six lignes séparées par des filets #22304A :
  vignette 44 px coins 8 px à gauche, nom du produit en 14 px #E6EDF7 sur une
  ligne tronquée proprement, marque et date en 12 px #8FA0B8 dessous
  ("The Ordinary · 15 sept."), et à droite la note en 16 px poids 500 précédée
  d'un point de couleur de 6 px.
- Une des lignes porte un petit marque-page cyan fin à droite de sa note.
- Pas de bouton principal.

INTERDIT : pas de halo, pas de néon, pas d'anneau, pas de demi-donut, pas de
carte par ligne, pas de dégradé, pas d'ombre, pas d'emoji. Une seule carte
contient toute la liste.

RENDU : capture d'écran d'application en mode sombre, à plat, plein cadre,
ratio 9:19.5, très haute définition, notes alignées à droite, textes en
français réels. Pas de cadre de téléphone, pas de main, pas de perspective.

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

STYLE : direction "nocturne clinique", mode sombre bleu nuit. Fond #0B1220,
surfaces #121C2E et #1A2740, filets #22304A. Texte #E6EDF7, secondaire #8FA0B8.
Accent cyan #5CC8D8. Sans-serif Inter, corps 15 px interligne 1,55. Coins
12 px, aucune ombre, aucun halo. Marges 18 px.

CONTENU :
- "Beauty Advisor" en 27 px poids 600, sous-titre 12 px #8FA0B8 : "Fondé sur
  votre profil et vos 6 produits".
- La conversation :
  - Message utilisateur aligné à droite, carte #1A2740 coins 12 px avec un fin
    filet cyan à 30 % d'opacité, texte #E6EDF7 : "Je cherche un sérum pour les
    rougeurs, peau grasse."
  - Réponse du conseiller alignée à gauche, carte #121C2E coins 12 px : texte
    en 15 px #E6EDF7, puis un filet #22304A, puis DEUX lignes produit intégrées
    dans la même carte, séparées par un filet : vignette 36 px, nom en 13 px,
    note en 14 px poids 500 à droite avec un point de couleur.
    Texte de la réponse : "Pour une peau grasse sujette aux rougeurs, cherchez
    un actif apaisant sans alcool ni parfum. Deux formules propres de votre
    catalogue correspondent."
- Deux suggestions rapides en boutons #1A2740 à filet #22304A, coins 8 px,
  texte cyan 13 px : "Et pour le soir ?" et "Compatible avec ma routine ?".
- Champ de saisie #1A2740 pleine largeur coins 12 px, texte #5E6E86 "Posez
  votre question", et à droite un carré CYAN #5CC8D8 de 32 px coins 8 px avec
  une flèche BLEU NUIT vers le haut.

INTERDIT : pas de halo, pas de néon, pas d'avatar, pas de visage, pas de robot,
pas de bulle arrondie de messagerie, pas de dégradé, pas d'ombre, pas d'emoji.

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

STYLE : direction "nocturne clinique", mode sombre bleu nuit. Fond #0B1220,
cartes #121C2E, éléments #1A2740, filets #22304A. Texte #E6EDF7, secondaire
#8FA0B8. Accent cyan #5CC8D8. Sans-serif Inter, chiffres TABULAIRES. Coins
12 px, aucune ombre, aucun halo. Marges 18 px.

CONTENU :
- "Profil" en 27 px poids 600.
- Une carte #121C2E d'identité compacte : carré #1A2740 de 44 px coins 8 px
  avec les initiales "SB" en cyan #5CC8D8, à côté "Stela" en 15 px #E6EDF7 et
  l'adresse e-mail en 12 px #8FA0B8. Un chevron fin à droite.
- Une carte #121C2E "Ma peau" : trois lignes séparées par des filets #22304A,
  libellé en 14 px #8FA0B8 à gauche, valeur en 14 px poids 500 #E6EDF7 à droite
  avec un chevron : "Type de peau · Grasse", "Zone du corps · Normale",
  "Objectifs · 5".
- Une carte #121C2E "Ce que j'évite" : une ligne 12 px #8FA0B8 "Signalés dans
  chaque analyse", puis cinq lignes séparées par des filets #22304A, chacune
  avec le nom en 14 px #E6EDF7 à gauche et, à droite, le nombre de produits
  concernés en 13 px #8FA0B8 suivi d'une croix fine :
  "Parfum · 4 produits", "Phénoxyéthanol · 2 produits", "Silicones · 3
  produits", "Sulfates · 0 produit", "Huiles essentielles · 1 produit".
  Sous la liste, un lien cyan #5CC8D8 en 13 px : "Ajouter un ingrédient".
- Une carte #121C2E à deux lignes séparées par un filet : "Crédits restants" à
  gauche en 14 px #8FA0B8 et "129" à droite en 17 px poids 600 #E6EDF7, puis
  "Passer à Premium" en #E6EDF7 avec un chevron fin.
- Tout en bas, trois liens #5E6E86 en 11 px : "Conditions", "Confidentialité",
  "Mentions légales".

INTERDIT : pas de halo, pas de néon, pas de photo de profil, pas de visage, pas
de bannière Premium colorée, pas de dégradé, pas d'ombre, pas d'emoji.

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
