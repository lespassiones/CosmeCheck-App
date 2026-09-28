# Direction 06 : Néo-brut doux (mode clair)

**L'idée.** Du néo-brutalisme discipliné. Des blocs de couleur franche, un
contour noir net, une typographie large, mais un seul aplat coloré par écran.
C'est la direction la plus affirmée en couleur des dix, et elle ne tient que si
on se limite : deux blocs colorés maximum par écran, le reste en blanc cassé.

**Mode :** clair.

---

## Système de design de cette direction

**Couleurs**
- Fond blanc cassé `#FFFEF9`, surfaces blanches `#FFFFFF`
- Contour et texte noir `#101010`, secondaire `#5A5A5A`
- Accent primaire jaune franc `#FFD84D`, accent secondaire bleu `#3D5AFE`
- Notation : vert `#1FA35C`, jaune `#F2B705`, orange `#FF7A1A`, rouge `#E63946`

**Typographie**
- Une seule famille grotesque large (Archivo, Space Grotesk ou Inter Tight)
- Titres poids 700, corps poids 400, libellés poids 600
- Échelle : chiffre héros 72 px, titre 30 px, sous-titre 19 px, corps 15 px, libellé 12 px

**Formes et espace**
- Grille 8 pt, marge latérale 20 px
- Rayon de coin 14 px partout
- Contour noir `#101010` de 1,5 px sur les blocs porteurs
- Ombre dure décalée de 3 px en noir plein, uniquement sur le bouton primaire et sur un bloc par écran, jamais plus
- Aucune ombre floue

**Iconographie**
- Traits 2 px, géométriques, noirs
- 3 icônes maximum par écran
- Aucune illustration, aucun sticker

---

## Règles UX appliquées dans les 7 écrans

1. Une seule action primaire par écran : bloc jaune, contour noir, ombre dure.
2. Deux aplats colorés maximum par écran, le reste en blanc cassé.
3. Divulgation progressive : le détail est replié.
4. Le bleu ne sert qu'aux liens et à l'état actif, jamais aux grands aplats.
5. Cibles tactiles 44 x 44 px minimum.
6. Le contour noir remplace l'ombre pour hiérarchiser.

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

STYLE : direction "néo-brut doux". Fond blanc cassé #FFFEF9. Blocs blancs
#FFFFFF à coins 14 px avec un CONTOUR NOIR #101010 de 1,5 px. Texte noir
#101010, secondaire #5A5A5A. Accent jaune franc #FFD84D, accent secondaire bleu
#3D5AFE. Typographie grotesque large type Archivo, titres en poids 700. Ombre
DURE décalée de 3 px en noir plein, uniquement sur le bouton principal. Aucune
ombre floue. Marges 20 px.

CONTENU, du haut vers le bas :
- Barre d'état iOS, heure 9:41.
- "Bonjour Stela" en 30 px poids 700, date du jour en 12 px grise dessous.
- UN SEUL bloc coloré sur cet écran : un grand bloc jaune #FFD84D à contour
  noir 1,5 px et coins 14 px, contenant en haut à gauche le libellé
  "DERNIÈRE ANALYSE" en 12 px poids 600 noir, puis une vignette produit carrée
  64 px à contour noir, à côté la marque "The Ordinary" en 12 px et le nom
  "Lotion Tonique Exfoliante" en 19 px poids 700, et en bas à droite du bloc
  le chiffre "14,2" en 48 px poids 700 noir avec "/20" en 16 px.
- Deux blocs blancs à contour noir, l'un sous l'autre, séparés de 12 px :
  "Ma routine" en 19 px poids 700 avec "6 produits · 3/5 objectifs" en 13 px
  gris dessous et une flèche noire épaisse à droite ;
  "Beauty Advisor" en 19 px poids 700 avec "Posez une question" en 13 px gris
  et une flèche noire à droite.
- En bas, le bouton principal : bloc jaune #FFD84D pleine largeur, contour noir
  1,5 px, coins 14 px, ombre dure noire décalée de 3 px vers le bas et la
  droite, texte noir 17 px poids 700 centré : "Scanner un produit".
- Barre d'onglets blanche à filet noir 1,5 px en haut, 4 entrées, icônes
  géométriques noires 2 px avec libellé 11 px. L'onglet actif a un petit trait
  bleu #3D5AFE de 3 px sous son libellé.

INTERDIT : pas de carrousel, pas de quiz, pas d'illustration, pas de sticker,
pas de dégradé, pas d'ombre floue, pas d'emoji. UN SEUL bloc jaune sur l'écran,
plus le bouton. Tout le reste est blanc à contour noir.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, contours nets et réguliers, textes en français réels. Pas de
cadre de téléphone, pas de main, pas de perspective, pas de fond de scène.

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

STYLE : direction "néo-brut doux". Feuille blanc cassé #FFFEF9 à coins
supérieurs 20 px et filet noir 1,5 px sur tout son pourtour supérieur, posée
sur le flux caméra assombri. Blocs blancs à contour noir 1,5 px, coins 14 px.
Accent jaune #FFD84D. Grotesque large, titres poids 700. Aucune ombre floue.
Marges 20 px.

CONTENU :
- Fond : vue caméra en direct sur le dos d'un flacon cosmétique, légèrement
  flou et assombri.
- Feuille couvrant les deux tiers bas, poignée noire épaisse centrée.
- Titre "Analyser un produit" en 30 px poids 700.
- Le premier choix est un bloc JAUNE #FFD84D à contour noir 1,5 px, coins
  14 px, avec une icône de code-barres noire 2 px à gauche, "Code-barres" en
  19 px poids 700 et "Le plus rapide" en 13 px dessous.
- Quatre blocs BLANCS à contour noir 1,5 px, coins 14 px, séparés de 10 px,
  sans icône, chacun avec un titre en 17 px poids 700 et une ligne en 13 px
  grise dessous :
  "Photo de la liste INCI" / "À partir du dos du produit"
  "Lien e-commerce" / "Depuis un site marchand"
  "Saisie manuelle" / "Copier-coller le texte"
  "Catalogue" / "479 000 produits"
- Une flèche noire épaisse à droite de chaque bloc.
- Un bouton de fermeture carré blanc à contour noir en haut à gauche sur la
  caméra, avec une croix noire épaisse.

INTERDIT : pas d'icône différente et colorée par méthode, pas de dégradé, pas
d'ombre floue, pas d'emoji. Un seul bloc jaune.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, contours nets, textes en français réels. Pas de cadre de
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

STYLE : direction "néo-brut doux". Fond blanc cassé #FFFEF9. Blocs blancs
#FFFFFF à contour noir #101010 1,5 px, coins 14 px. Texte noir, secondaire
#5A5A5A. Accent jaune #FFD84D sur le bouton primaire uniquement. Notation :
vert #1FA35C, jaune #F2B705, orange #FF7A1A, rouge #E63946. Grotesque large,
titres poids 700. Aucune ombre floue, ombre dure uniquement sur le bouton.
Marges 20 px.

CONTENU :
- Flèche de retour noire épaisse en haut à gauche, trois points noirs à droite.
- Un bloc blanc d'en-tête à contour noir : vignette produit carrée 72 px à
  contour noir à gauche, "ANUA" en 12 px poids 600, nom "Azelaic Acid 10
  Hyaluron Redness Soothing Serum" en 19 px poids 700 sur deux lignes.
- LE BLOC VERDICT, le seul aplat coloré de l'écran : un bloc à fond jaune de
  notation #F2B705 (car la note est moyenne), contour noir 1,5 px, coins 14 px,
  contenant le chiffre "12,9" en 72 px poids 700 noir avec "/20" en 20 px,
  sous lui le mot "MOYEN" en 15 px poids 700 dans une petite pastille blanche
  à contour noir, et une phrase en 14 px noire : "Formule correcte, mais deux
  ingrédients méritent votre attention."
- Un bloc blanc à contour noir : un carré plein vert #1FA35C de 14 px à contour
  noir, puis "Aucun de vos ingrédients évités n'est présent" en 15 px.
- Un bloc blanc à contour noir "COMPOSITION" : quatre gros carrés alignés sur
  une rangée, chacun 64 x 64 px à contour noir 1,5 px et coins 10 px, remplis
  de leur couleur de notation, avec le nombre en blanc poids 700 au centre
  ("28" vert, "7" jaune, "0" orange, "0" rouge) et le libellé en 11 px poids
  600 noir sous chaque carré : "SÛRS", "SURVEILLER", "ÉVITER", "RISQUE".
- Un bloc blanc à contour noir contenant trois lignes repliées séparées par des
  filets noirs 1 px, chacune avec une flèche vers le bas : "Les 35 ingrédients
  en détail", "Allergènes réglementés : aucun", "Observations : 2 silicones".
- En bas : bouton jaune #FFD84D pleine largeur, contour noir, ombre dure noire
  décalée 3 px, texte noir 17 px poids 700 : "Ajouter à ma routine". Sous lui
  un bouton blanc à contour noir, sans ombre : "Voir des alternatives".

INTERDIT : pas d'anneau, pas d'étoiles, pas de dégradé, pas d'ombre floue, pas
d'emoji, pas d'illustration. La liste d'ingrédients reste REPLIÉE. Deux aplats
colorés maximum sur l'écran, hors carrés de composition.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, contours nets et réguliers, textes en français réels. Pas de
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

ÉCRAN : "Ma routine", les produits et la couverture des objectifs de peau.

STYLE : direction "néo-brut doux". Fond blanc cassé #FFFEF9, blocs blancs à
contour noir 1,5 px coins 14 px. Accent jaune #FFD84D. Notation : vert #1FA35C,
jaune #F2B705. Grotesque large, titres poids 700. Aucune ombre floue. Marges
20 px.

CONTENU :
- "Ma routine" en 30 px poids 700, "6 produits" en 13 px gris.
- Un bloc blanc à contour noir "COUVERTURE DE VOS OBJECTIFS" en 12 px poids
  600, contenant cinq lignes. Chaque ligne : nom de l'objectif en 15 px poids
  600 à gauche, pourcentage en 17 px poids 700 à droite, et juste en dessous
  une barre horizontale pleine largeur de 12 px avec un CONTOUR NOIR 1,5 px,
  coins 6 px, remplie proportionnellement d'un aplat plein.
  Remplissage vert #1FA35C au-dessus de 70 %, jaune #F2B705 en dessous.
  Les cinq : "Hydratation 96 %", "Barrière cutanée 94 %", "Peau douce 97 %",
  "Produits clean 67 %", "Teint lumineux 52 %".
  En bas du bloc, une petite pastille blanche à contour noir avec une flèche
  circulaire noire et le texte "Recalculer" en 12 px.
- Quatre blocs produit blancs à contour noir, séparés de 10 px : vignette
  carrée 48 px à contour noir à gauche, nom en 16 px poids 700, marque et
  moment en 12 px gris dessous, et à droite la note dans une petite pastille
  carrée à contour noir remplie de la couleur de notation, chiffre en noir.
- En bas, bouton jaune #FFD84D pleine largeur à contour noir et ombre dure :
  "Ajouter un produit".

INTERDIT : pas d'anneau, pas de camembert, pas de dégradé, pas d'ombre floue,
pas d'illustration, pas d'emoji.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, contours nets, pourcentages lisibles. Pas de cadre de
téléphone, pas de main, pas de perspective.

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

STYLE : direction "néo-brut doux". Fond blanc cassé #FFFEF9, blocs blancs à
contour noir 1,5 px coins 14 px. Accent jaune #FFD84D sur le filtre actif,
bleu #3D5AFE sur le lien de comparaison. Notation : vert #1FA35C, jaune
#F2B705, orange #FF7A1A. Grotesque large. Aucune ombre floue. Marges 20 px.

CONTENU :
- "Historique" en 30 px poids 700, "23 analyses" en 13 px gris.
- Un champ de recherche blanc à contour noir 1,5 px, coins 14 px, hauteur
  48 px, loupe noire 2 px à gauche, texte gris "Rechercher un produit".
- Une rangée de pastilles à contour noir 1,5 px et coins 999 px : "Tout" en
  fond jaune #FFD84D avec texte noir poids 700 (actif), "Favoris" en fond
  blanc. À droite, un lien texte bleu #3D5AFE souligné : "Comparer".
- Six blocs d'analyse blancs à contour noir, séparés de 10 px : vignette carrée
  48 px à contour noir à gauche, nom du produit en 16 px poids 700 sur une ou
  deux lignes, marque et date en 12 px gris dessous, et à droite une pastille
  carrée à contour noir de 40 px remplie de la couleur de notation avec la
  note en noir poids 700 au centre.
- Un des blocs porte un petit triangle noir plein dans son coin supérieur
  gauche, marquant un favori.
- Pas de bouton principal.

INTERDIT : pas d'anneau, pas de demi-donut, pas de dégradé, pas d'ombre floue,
pas d'illustration, pas d'emoji.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, contours nets, textes en français réels. Pas de cadre de
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

STYLE : direction "néo-brut doux". Fond blanc cassé #FFFEF9, blocs à contour
noir 1,5 px coins 14 px. Texte noir #101010, secondaire #5A5A5A. Accent jaune
#FFD84D, bleu #3D5AFE. Grotesque large, corps 15 px. Aucune ombre floue.
Marges 20 px.

CONTENU :
- "Beauty Advisor" en 30 px poids 700, sous-titre 13 px gris : "Conseils fondés
  sur votre profil".
- La conversation, en blocs à contour noir :
  - Message utilisateur, aligné à droite, bloc à fond jaune #FFD84D contour
    noir coins 14 px, texte noir 15 px, occupant 80 % de la largeur :
    "Je cherche un sérum pour les rougeurs, peau grasse."
  - Réponse du conseiller, alignée à gauche, bloc BLANC contour noir coins
    14 px, texte noir 15 px : "Pour une peau grasse sujette aux rougeurs,
    cherchez un actif apaisant sans alcool ni parfum. Voici deux formules
    propres de votre catalogue."
  - Sous ce bloc, deux blocs produit blancs à contour noir plus petits, coins
    10 px : vignette 40 px à contour noir, nom en 14 px poids 700, marque en
    12 px grise, et une pastille carrée de note colorée à contour noir à droite.
- Deux suggestions en pastilles blanches à contour noir, coins 999 px, texte
  13 px poids 600 : "Et pour le soir ?" et "Compatible avec ma routine ?".
- Champ de saisie blanc pleine largeur à contour noir 1,5 px, coins 14 px,
  texte gris "Posez votre question", et à droite un carré jaune #FFD84D de
  40 px à contour noir avec une flèche noire épaisse vers le haut.

INTERDIT : pas d'avatar, pas de visage, pas de robot, pas de dégradé, pas
d'ombre floue, pas d'emoji, pas d'illustration.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, contours nets, textes en français réels. Pas de cadre de
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

STYLE : direction "néo-brut doux". Fond blanc cassé #FFFEF9, blocs blancs à
contour noir 1,5 px coins 14 px. Accent jaune #FFD84D, bleu #3D5AFE. Grotesque
large, titres poids 700. Aucune ombre floue. Marges 20 px.

CONTENU :
- "Profil" en 30 px poids 700.
- Un bloc blanc à contour noir : un carré jaune #FFD84D de 52 px à contour noir
  contenant "SB" en noir poids 700, à côté "Stela" en 19 px poids 700 et
  l'adresse e-mail en 12 px grise.
- Un bloc blanc à contour noir "MA PEAU" en 12 px poids 600, contenant trois
  lignes séparées par des filets noirs 1 px : libellé en 15 px à gauche, valeur
  en 15 px poids 700 à droite avec une flèche noire : "Type de peau · Grasse",
  "Zone du corps · Normale", "Objectifs · 5 sélectionnés".
- Un bloc blanc à contour noir "CE QUE J'ÉVITE" : une ligne grise 13 px
  "Signalés dans chaque analyse.", puis des puces rectangulaires à contour noir
  1,5 px, coins 8 px, fond blanc, texte noir 13 px poids 600, réparties sur
  deux rangées avec une croix noire à droite de chacune : "Parfum",
  "Phénoxyéthanol", "Silicones", "Sulfates", "Huiles essentielles".
  Après les puces, une puce à fond jaune #FFD84D contour noir : "+ Ajouter".
- Un bloc blanc à contour noir à deux lignes séparées par un filet :
  "Crédits restants" à gauche et "129" en 19 px poids 700 à droite, puis
  "Passer à Premium" avec une flèche noire.
- Tout en bas, trois liens gris 11 px : "Conditions", "Confidentialité",
  "Mentions légales".

INTERDIT : pas de photo de profil, pas de visage, pas de bannière Premium
colorée, pas de dégradé, pas d'ombre floue, pas d'emoji.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, contours nets, textes en français réels. Pas de cadre de
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
