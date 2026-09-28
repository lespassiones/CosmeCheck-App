# Direction 02 : Pastel respirant (mode clair)

**L'idée.** Douceur et respiration. Des cartes blanches très arrondies posées
sur un fond crème, deux pastels tenus en laisse, et surtout beaucoup de vide
entre les blocs. L'app doit donner l'impression qu'on lui a retiré la moitié de
son contenu. Le pastel ne sert jamais de fond à du texte long, uniquement à
signaler.

**Mode :** clair.

---

## Système de design de cette direction

**Couleurs**
- Fond de page crème `#FDFCFA`, cartes blanc pur `#FFFFFF`
- Texte principal `#2D2A28`, secondaire `#7A736E`, tertiaire `#A9A29D`
- Accent primaire rose poudré `#E8A0A8`, accent secondaire vert d'eau `#A8CBC0`
- Les pastels ne servent qu'aux fonds de pastille et aux traits, jamais au texte
- Notation : vert `#6FA88A`, jaune `#DCC07A`, orange `#E0A277`, rouge `#D98A8A`

**Typographie**
- Une seule famille, sans-serif humaniste (General Sans, Work Sans ou Inter)
- Titres poids 600, corps poids 400, libellés poids 500
- Échelle : titre 28 px, sous-titre 18 px, corps 16 px, libellé 13 px
- Interlignes larges, 1,5 sur le corps

**Formes et espace**
- Grille 8 pt, marge latérale 20 px
- Rayon de coin 24 px sur les cartes, 16 px sur les petits éléments, 999 px sur les pastilles
- Ombre unique et très douce : `0 8px 24px rgba(0,0,0,0.04)`, jamais plus marquée
- Espace vertical entre cartes : 16 px, et 32 px entre sections

**Iconographie**
- Traits arrondis 1,75 px, extrémités rondes
- 3 icônes maximum par écran
- Aucune illustration, aucun personnage

---

## Règles UX appliquées dans les 7 écrans

1. Une seule action primaire par écran, en rose poudré plein.
2. Divulgation progressive : le détail est replié, jamais étalé.
3. Une carte contient une seule idée. Si elle en contient deux, on la coupe en deux.
4. Action primaire dans le tiers bas, zone du pouce.
5. Cibles tactiles 44 x 44 px minimum.
6. Le texte reste toujours sur fond blanc ou crème, jamais sur pastel.
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

STYLE : direction "pastel respirant". Fond crème #FDFCFA, cartes blanc pur
#FFFFFF à coins très arrondis 24 px, ombre unique très douce
0 8px 24px rgba(0,0,0,0.04). Texte #2D2A28, secondaire #7A736E. Accent rose
poudré #E8A0A8, accent secondaire vert d'eau #A8CBC0. Une seule famille
sans-serif humaniste, titres en poids 600, corps en 400. Marges latérales
20 px, 16 px entre les cartes, 32 px entre les sections. Beaucoup de vide.

CONTENU, du haut vers le bas :
- Barre d'état iOS, heure 9:41.
- "Bonjour Stela" en titre 28 px, et en dessous une ligne grise avec la date
  du jour en toutes lettres.
- Une grande carte blanche, la plus haute de l'écran : en petit gris
  "Votre dernière analyse", puis une photo de flacon de sérum en vignette
  arrondie 64 px à gauche, à côté la marque "The Ordinary" en gris et le nom
  "Lotion Tonique Exfoliante" en noir. En bas de la carte, une pastille
  arrondie à fond vert pâle #6FA88A à 15 % d'opacité contenant "14,2 /20 ·
  Bien" en vert #6FA88A.
- Une carte blanche plus courte : "Ma routine" en noir, "6 produits" en gris,
  et à droite un petit anneau très fin de 36 px, ouvert aux trois cinquièmes,
  tracé en vert d'eau #A8CBC0, avec "3/5" au centre en tout petit.
- Une carte blanche plus courte : "Beauty Advisor" en noir, "Posez une
  question sur vos produits" en gris sur une ligne, et un chevron arrondi à
  droite.
- En bas, un bouton pleine largeur à coins 999 px, fond rose poudré #E8A0A8,
  texte blanc 17 px : "Scanner un produit".
- Barre d'onglets blanche, 4 entrées, icônes linéaires arrondies très fines
  avec le libellé dessous en 11 px. L'onglet actif est en rose poudré.

INTERDIT : pas de carrousel, pas de quiz du jour, pas de carte de conseil, pas
de compteur de crédits, pas d'illustration, pas de dégradé, pas d'emoji, pas
plus de 3 cartes sur tout l'écran. L'écran doit respirer, le vide fait partie
du design.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, textes en français réels et lisibles, pas de faux texte
latin. Pas de cadre de téléphone, pas de main, pas de perspective, pas d'ombre
autour de l'écran, pas de fond de scène.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 2/7 : Scanner un produit

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : l'entrée "Scanner un produit". Une feuille de choix de méthode
remontée du bas, par-dessus la vue caméra en direct.

STYLE : direction "pastel respirant". Feuille blanche #FFFFFF à coins
supérieurs très arrondis 28 px, posée sur le flux caméra assombri. Texte
#2D2A28, secondaire #7A736E. Accent rose poudré #E8A0A8 sur la méthode mise en
avant. Sans-serif humaniste. Ombre très douce sous la feuille. Marges 20 px.

CONTENU :
- Le fond est une vue caméra en direct montrant le dos d'un flacon de
  cosmétique sur une surface claire, légèrement flou et assombri.
- Une feuille blanche couvre les deux tiers bas.
- Petite poignée grise arrondie centrée en haut de la feuille.
- Titre "Analyser un produit" en 22 px poids 600.
- Sous-titre gris sur une ligne : "Choisissez votre méthode".
- Une première option mise en avant, en carte à fond rose très pâle (#E8A0A8
  à 12 % d'opacité), coins 16 px : à gauche une petite icône linéaire arrondie
  de code-barres en rose poudré, puis "Scanner le code-barres" en noir et
  "Le plus rapide" en gris dessous.
- Puis quatre options en cartes blanches simples, coins 16 px, sans ombre,
  séparées de 8 px, chacune avec un titre noir et une ligne grise :
  "Photographier la liste INCI" / "À partir du dos du produit"
  "Coller un lien" / "Depuis un site marchand"
  "Saisir la liste à la main" / "Copier-coller le texte"
  "Chercher dans le catalogue" / "Plus de 479 000 produits"
- Un chevron arrondi gris à droite de chaque option.
- Un bouton de fermeture rond blanc translucide en haut à gauche sur la caméra.

INTERDIT : pas d'icône colorée différente par méthode, pas de vignette carrée
saturée, pas de dégradé, pas d'emoji. Une seule icône sur tout l'écran, celle
de l'option mise en avant.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, textes en français réels et lisibles. Pas de cadre de
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

ÉCRAN : le résultat d'analyse d'un produit. C'est l'écran le plus important de
l'application. Il doit rester doux et calme malgré la densité de l'information.

STYLE : direction "pastel respirant". Fond crème #FDFCFA, cartes blanches
#FFFFFF coins 24 px, ombre très douce 0 8px 24px rgba(0,0,0,0.04). Texte
#2D2A28, secondaire #7A736E. Accent rose poudré #E8A0A8 sur le bouton
principal uniquement. Notation : vert #6FA88A, jaune #DCC07A, orange #E0A277,
rouge #D98A8A. Sans-serif humaniste. Marges 20 px, 16 px entre les cartes.

CONTENU, du haut vers le bas :
- Une flèche de retour arrondie fine en haut à gauche, un point de menu à
  droite.
- Une carte blanche principale, généreuse : photo du produit en vignette
  arrondie 88 px centrée en haut, puis sous elle, centrés, la marque "Anua" en
  gris 13 px, le nom "Azelaic Acid 10 Hyaluron Redness Soothing Serum" en noir
  17 px sur deux lignes. En dessous, LE VERDICT : "12,9" en 64 px poids 600 en
  noir, "/20" en gris à côté, et sous le nombre une pastille arrondie à fond
  jaune pâle contenant "Moyen" en #DCC07A. Enfin une phrase grise centrée sur
  deux lignes : "Formule correcte, mais deux ingrédients méritent votre
  attention."
- Une carte blanche courte : un petit point vert #6FA88A puis le texte
  "Aucun de vos ingrédients évités n'est présent" en noir 15 px.
- Une carte blanche "Composition" : une barre horizontale unique de 10 px de
  haut, coins 999 px, segmentée en 4 couleurs proportionnelles (beaucoup de
  vert, un peu de jaune, un fin trait orange). Sous la barre, quatre libellés
  en ligne avec leur compte, chacun précédé d'un point de 6 px de la couleur
  correspondante : "28 sûrs", "7 à surveiller", "0 à éviter", "0 à risque".
- Trois lignes repliées dans une seule carte blanche, séparées par des filets
  très clairs, chacune avec un chevron vers le bas :
  "Les 35 ingrédients en détail", "Allergènes réglementés : aucun",
  "Observations : 2 silicones détectés".
- En bas, fixé : un bouton pleine largeur coins 999 px, fond rose poudré
  #E8A0A8, texte blanc "Ajouter à ma routine". Sous lui, un bouton fantôme à
  contour rose 1 px et texte rose : "Voir des alternatives".

INTERDIT : pas d'anneau de score, pas de jauge circulaire, pas d'étoiles, pas
de dégradé, pas d'emoji, pas de liste d'ingrédients dépliée. Le détail reste
REPLIÉ.

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

ÉCRAN : "Ma routine". L'utilisateur y voit ses produits et dans quelle mesure
ils couvrent les objectifs qu'il s'est fixés pour sa peau.

STYLE : direction "pastel respirant". Fond crème #FDFCFA, cartes blanches
#FFFFFF coins 24 px, ombre très douce. Texte #2D2A28, secondaire #7A736E.
Accent rose poudré #E8A0A8, secondaire vert d'eau #A8CBC0. Notation : vert
#6FA88A, jaune #DCC07A. Sans-serif humaniste. Marges 20 px.

CONTENU :
- Titre "Ma routine" 28 px, sous-titre gris "6 produits".
- Une carte blanche "Couverture de vos objectifs" contenant cinq lignes.
  Chaque ligne : nom de l'objectif à gauche en noir 15 px, barre horizontale
  arrondie de 8 px au milieu avec une piste gris très clair et un remplissage
  plein, pourcentage à droite en noir. Remplissage vert #6FA88A au-dessus de
  70 %, jaune #DCC07A en dessous.
  Les cinq : "Hydratation 96 %", "Barrière cutanée 94 %", "Peau douce 97 %",
  "Produits clean 67 %", "Teint lumineux 52 %".
  En bas de la carte, une ligne discrète grise avec une petite flèche de
  rechargement arrondie : "Recalculer après un changement".
- Un titre de section "Vos produits" en 18 px.
- Quatre cartes produit blanches séparées de 8 px, coins 20 px : vignette
  arrondie 56 px à gauche, nom du produit en noir, marque et moment en gris
  dessous ("Pai · Matin"), et à droite une pastille arrondie à fond coloré
  très pâle contenant la note ("16,4") dans la couleur correspondante.
- En bas, bouton pleine largeur coins 999 px, rose poudré #E8A0A8, texte blanc
  "Ajouter un produit".

INTERDIT : pas de graphique en anneau, pas de camembert, pas d'illustration,
pas de dégradé dans les barres, pas d'emoji.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, textes en français réels et lisibles, pourcentages nets et
alignés. Pas de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 5/7 : Historique

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Historique". La liste des analyses déjà faites, avec recherche,
filtres et comparaison.

STYLE : direction "pastel respirant". Fond crème #FDFCFA, cartes blanches
#FFFFFF coins 20 px, ombre très douce. Texte #2D2A28, secondaire #7A736E.
Accent rose poudré #E8A0A8 sur le filtre actif. Notation : vert #6FA88A, jaune
#DCC07A, orange #E0A277. Sans-serif humaniste. Marges 20 px.

CONTENU :
- Titre "Historique" 28 px, sous-titre gris "23 analyses".
- Un champ de recherche blanc, coins 999 px, ombre très douce, loupe linéaire
  arrondie grise à gauche, texte gris "Rechercher un produit".
- Une rangée de pastilles de filtre à coins 999 px : "Tout" en fond rose
  poudré #E8A0A8 avec texte blanc (actif), "Favoris" en fond blanc avec texte
  gris. À droite de la rangée, une pastille fantôme à contour gris 1 px :
  "Comparer".
- Six cartes produit blanches empilées, séparées de 8 px : vignette arrondie
  56 px à gauche, nom du produit en noir sur une ou deux lignes, marque et
  date en gris dessous ("The Ordinary · il y a 3 jours"), et à droite une
  pastille arrondie à fond coloré très pâle avec la note dans la couleur
  correspondante ("11,8").
- Une des six cartes porte un petit marque-page rose poudré plein en haut à
  droite de sa vignette, signalant un favori.
- Pas de bouton principal sur cet écran.

INTERDIT : pas d'anneau de score, pas de demi-donut, pas d'illustration, pas
d'emoji, pas de dégradé. La couleur reste dans les pastilles de note et le
filtre actif.

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

ÉCRAN : "Beauty Advisor", une conversation avec un conseiller beauté IA.

STYLE : direction "pastel respirant". Fond crème #FDFCFA. Texte #2D2A28,
secondaire #7A736E. Accent rose poudré #E8A0A8, secondaire vert d'eau #A8CBC0.
Sans-serif humaniste, corps 16 px, interligne 1,6. Coins 20 px, ombre très
douce. Marges 20 px.

CONTENU :
- Titre "Beauty Advisor" 28 px, sous-titre gris "Conseils fondés sur votre
  profil et vos produits".
- La conversation :
  - Message de l'utilisateur, aligné à droite, bulle à fond rose très pâle
    (#E8A0A8 à 14 % d'opacité), coins 20 px sauf le coin bas droit à 6 px,
    texte noir : "Je cherche un sérum pour les rougeurs, peau grasse."
  - Réponse du conseiller, alignée à gauche, bulle blanche #FFFFFF coins 20 px
    sauf le coin bas gauche à 6 px, ombre très douce, texte noir : "Pour une
    peau grasse sujette aux rougeurs, cherchez un actif apaisant sans alcool ni
    parfum. Voici deux formules propres de votre catalogue."
  - Sous cette bulle, deux cartes produit blanches compactes, coins 16 px :
    vignette arrondie 48 px, marque en gris, nom en noir, pastille de note
    arrondie colorée à droite.
- Deux suggestions rapides en pastilles à contour gris 1 px, coins 999 px :
  "Et pour le soir ?" et "Compatible avec ma routine ?".
- Champ de saisie blanc pleine largeur, coins 999 px, ombre très douce, texte
  gris "Posez votre question", et à droite un bouton rond rose poudré #E8A0A8
  de 36 px avec une flèche blanche vers le haut.

INTERDIT : pas d'avatar, pas de visage, pas de robot, pas d'illustration, pas
de dégradé, pas d'emoji. Deux niveaux de bulle seulement, rien de plus.

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

ÉCRAN : "Profil". Type de peau, objectifs, et la liste des ingrédients que
l'utilisateur veut éviter.

STYLE : direction "pastel respirant". Fond crème #FDFCFA, cartes blanches
#FFFFFF coins 24 px, ombre très douce. Texte #2D2A28, secondaire #7A736E.
Accent rose poudré #E8A0A8, secondaire vert d'eau #A8CBC0. Sans-serif
humaniste. Marges 20 px.

CONTENU :
- Titre "Profil" 28 px.
- Une carte blanche d'identité : un cercle de 56 px à fond vert d'eau pâle
  contenant les initiales "SB" en vert d'eau foncé, à côté le prénom "Stela" en
  noir 18 px et l'adresse e-mail en gris 13 px.
- Une carte blanche "Ma peau" contenant trois lignes séparées par des filets
  très clairs, libellé gris à gauche, valeur noire à droite avec un chevron
  arrondi : "Type de peau · Grasse", "Zone du corps · Normale",
  "Objectifs · 5 sélectionnés".
- Une carte blanche "Ce que j'évite" : une ligne grise d'explication
  "Ces ingrédients sont signalés dans chaque analyse.", puis des puces à coins
  999 px disposées sur deux rangées, fond rose très pâle (#E8A0A8 à 12 %),
  texte rose poudré foncé 13 px, avec une petite croix arrondie à droite :
  "Parfum", "Phénoxyéthanol", "Silicones", "Sulfates", "Huiles essentielles".
  Après les puces, une puce fantôme à contour rose pointillé : "+ Ajouter".
- Une carte blanche courte à deux lignes : "Crédits restants" en gris à gauche
  et "129" en noir à droite, puis "Passer à Premium" en noir avec un chevron.
- Tout en bas, trois liens gris très petits alignés : "Conditions",
  "Confidentialité", "Mentions légales".

INTERDIT : pas de photo de profil, pas de visage, pas de bannière Premium
colorée et vendeuse, pas de dégradé, pas d'illustration, pas d'emoji.

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
