# Direction 08 : Native pure (mode clair)

**L'idée.** Ne pas inventer de langage visuel, prendre celui du système et
l'exécuter parfaitement. Listes groupées iOS, grands titres, séparateurs
insérés, une seule teinte de marque. L'app disparaît derrière son contenu. C'est
la direction la plus rapide à implémenter et la plus sûre en termes
d'apprentissage utilisateur, parce que tout le monde la connaît déjà.

**Mode :** clair.

---

## Système de design de cette direction

**Couleurs**
- Fond groupé `#F2F2F7`, surfaces de liste `#FFFFFF`
- Texte principal `#000000`, secondaire `#3C3C43` à 60 %, tertiaire `#3C3C43` à 30 %
- Séparateurs `#C6C6C8` à 0,5 px, insérés à gauche de 16 px
- Teinte de marque unique corail `#E4574A`, qui remplace le bleu système
- Notation : vert `#34A853`, jaune `#F0B429`, orange `#F2801F`, rouge `#E5484D`

**Typographie**
- SF Pro (ou Inter en substitut), tailles système strictes
- Large Title 34 gras, Title 3 20 semi-gras, Body 17, Subhead 15, Footnote 13, Caption 12
- Aucune taille inventée, on reste sur l'échelle système

**Formes et espace**
- Marge latérale 16 px, groupes de liste à coins 12 px
- Hauteur de ligne de liste 44 px minimum
- Aucune ombre, les groupes se détachent par le fond gris
- Espace entre groupes 24 px, avec un titre de section en majuscules 13 px gris

**Iconographie**
- SF Symbols uniquement, en poids Regular
- Dans les listes, icône colorée dans un carré arrondi 29 px, ou pas d'icône du tout
- 4 icônes maximum par écran

---

## Règles UX appliquées dans les 7 écrans

1. Une seule action primaire par écran, en corail plein.
2. Divulgation progressive : chaque ligne de liste mène au détail.
3. On respecte les conventions système : chevrons à droite, titres de section en gris, bascules natives.
4. Cibles tactiles 44 x 44 px minimum.
5. Aucun composant maison là où un composant système existe.

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

ÉCRAN : la page d'accueil, en style iOS natif assumé.

STYLE : direction "native pure", design iOS moderne authentique. Fond gris
groupé #F2F2F7, groupes de liste blancs #FFFFFF à coins 12 px. Texte noir
#000000, secondaire gris iOS. Séparateurs 0,5 px #C6C6C8 insérés à 16 px de la
gauche. Teinte de marque corail #E4574A à la place du bleu système.
Typographie SF Pro aux tailles système : Large Title 34 gras, Body 17,
Footnote 13. Aucune ombre. Marges 16 px. Icônes SF Symbols uniquement.

CONTENU, du haut vers le bas :
- Barre d'état iOS, heure 9:41.
- Un grand titre iOS "Bonjour Stela" en Large Title 34 gras, aligné à gauche.
- Un premier groupe de liste blanc contenant une seule ligne haute : à gauche
  une vignette produit carrée 52 px à coins 8 px, au centre "Lotion Tonique
  Exfoliante" en Body 17 et "The Ordinary · il y a 2 jours" en Footnote 13
  grise, à droite "14,2" en 17 px semi-gras vert #34A853 suivi d'un chevron
  gris. Au-dessus du groupe, un titre de section en majuscules 13 px grises :
  "DERNIÈRE ANALYSE".
- Un deuxième groupe de liste blanc avec deux lignes séparées par un
  séparateur inséré, chacune avec une icône SF Symbol dans un carré arrondi
  29 px coloré à gauche, le libellé en Body 17 au centre, une valeur grise et
  un chevron à droite :
  carré corail avec une icône de couches : "Ma routine" / "6 produits"
  carré gris avec une icône de bulle : "Beauty Advisor" / "Poser une question"
  Au-dessus, titre de section : "RACCOURCIS".
- Un troisième groupe de liste blanc à une ligne : "Crédits restants" en Body
  17 à gauche et "129" en gris à droite. Pas de chevron.
- Un espace, puis un bouton pleine largeur corail #E4574A, coins 12 px,
  hauteur 50 px, texte blanc Body 17 semi-gras : "Scanner un produit".
- Barre d'onglets iOS translucide en bas avec 4 onglets, SF Symbols et libellés
  10 px : Accueil, Routine, Historique, Profil. L'onglet actif est en corail.

INTERDIT : pas de carrousel, pas de quiz, pas de carte à ombre, pas de dégradé,
pas d'illustration, pas d'emoji, pas de composant maison. Tout doit ressembler
à un écran de Réglages iOS bien conçu.

RENDU : capture d'écran d'application iOS à plat, plein cadre, ratio 9:19.5,
très haute définition, respect exact des conventions iOS, textes en français
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

ÉCRAN : l'entrée "Scanner un produit", feuille iOS de choix de méthode
par-dessus la vue caméra.

STYLE : direction "native pure", iOS authentique. Feuille modale iOS à coins
supérieurs 12 px, fond gris groupé #F2F2F7, groupes de liste blancs. Teinte de
marque corail #E4574A. SF Pro aux tailles système. Séparateurs 0,5 px insérés.
Aucune ombre. Marges 16 px. SF Symbols uniquement.

CONTENU :
- Fond : vue caméra en direct sur le dos d'un flacon cosmétique, légèrement
  flou et assombri.
- Une feuille modale iOS couvrant les deux tiers bas, avec la petite poignée
  grise système centrée en haut.
- Titre "Analyser un produit" en Title 3 20 px semi-gras, centré, avec un
  bouton texte "Annuler" en corail à gauche sur la même ligne.
- Un premier groupe de liste blanc à une seule ligne, mise en avant : carré
  arrondi 29 px corail #E4574A avec une icône SF Symbol de code-barres blanche,
  "Code-barres" en Body 17, "Le plus rapide" en Footnote 13 grise, chevron à
  droite.
- Un deuxième groupe de liste blanc à quatre lignes séparées par des
  séparateurs insérés, chacune avec un carré arrondi 29 px GRIS et son SF
  Symbol blanc, le libellé en Body 17, une explication en Footnote 13 grise, et
  un chevron :
  "Photo de la liste INCI" / "À partir du dos du produit"
  "Lien e-commerce" / "Depuis un site marchand"
  "Saisie manuelle" / "Copier-coller le texte"
  "Catalogue" / "479 000 produits"
- Rien d'autre sur la feuille.

INTERDIT : pas de carré coloré différent par méthode, un seul est corail, les
autres sont gris. Pas de dégradé, pas d'ombre, pas d'emoji, pas d'illustration.

RENDU : capture d'écran d'application iOS à plat, plein cadre, ratio 9:19.5,
très haute définition, conventions iOS respectées, textes en français réels.
Pas de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 3/7 : Résultat d'analyse

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : le résultat d'analyse d'un produit, en style iOS natif.

STYLE : direction "native pure", iOS authentique. Fond gris groupé #F2F2F7,
groupes de liste blancs #FFFFFF coins 12 px, séparateurs 0,5 px insérés.
Teinte corail #E4574A. Notation : vert #34A853, jaune #F0B429, orange #F2801F,
rouge #E5484D. SF Pro aux tailles système. Aucune ombre. Marges 16 px.

CONTENU :
- Barre de navigation iOS avec un bouton "Retour" en corail à gauche et une
  icône SF Symbol de partage à droite. Titre de barre compact : "Analyse".
- Un bloc d'en-tête sur le fond gris, sans carte : vignette produit carrée
  88 px coins 12 px centrée, sous elle "Anua" en Footnote 13 grise centrée et
  "Azelaic Acid 10 Hyaluron Redness Soothing Serum" en Title 3 20 px semi-gras
  centré sur deux lignes.
- Un groupe de liste blanc contenant LE VERDICT sur une seule ligne haute :
  à gauche "12,9" en 40 px gras noir avec "/20" en 17 px gris, à droite un
  badge arrondi jaune pâle contenant "Moyen" en 15 px semi-gras #F0B429. Sous
  cette ligne, séparateur inséré, puis une ligne de texte en Subhead 15 grise :
  "Formule correcte, mais deux ingrédients méritent votre attention."
- Titre de section en majuscules 13 px grises : "VOS RESTRICTIONS". Un groupe
  blanc à une ligne : SF Symbol de coche dans un carré arrondi vert #34A853,
  "Aucun ingrédient évité détecté" en Body 17.
- Titre de section : "COMPOSITION". Un groupe blanc à quatre lignes séparées
  par des séparateurs insérés, chacune avec un petit cercle plein de 12 px de
  la couleur correspondante à gauche, le libellé en Body 17, et le nombre en
  17 px gris à droite : "Sûrs 28", "À surveiller 7", "À éviter 0",
  "À risque 0".
- Titre de section : "DÉTAIL". Un groupe blanc à trois lignes avec chevrons :
  "Les 35 ingrédients", "Allergènes réglementés", "Observations".
  Chaque ligne a une valeur grise à droite : "35", "Aucun", "2".
- En bas, un bouton pleine largeur corail #E4574A coins 12 px hauteur 50 px,
  texte blanc : "Ajouter à ma routine". Sous lui, un bouton texte simple en
  corail sans fond : "Voir des alternatives".

INTERDIT : pas d'anneau, pas d'étoiles, pas de jauge maison, pas de dégradé,
pas d'ombre, pas d'emoji. Le détail des ingrédients reste REPLIÉ derrière une
ligne de liste.

RENDU : capture d'écran d'application iOS à plat, plein cadre, ratio 9:19.5,
très haute définition, conventions iOS respectées, textes en français réels.
Pas de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 4/7 : Ma routine

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Ma routine", les produits et la couverture des objectifs de peau, en
style iOS natif.

STYLE : direction "native pure", iOS authentique. Fond gris groupé #F2F2F7,
groupes blancs coins 12 px, séparateurs 0,5 px insérés. Teinte corail #E4574A.
Notation : vert #34A853, jaune #F0B429. SF Pro aux tailles système. Aucune
ombre. Marges 16 px.

CONTENU :
- Grand titre iOS "Ma routine" en Large Title 34 gras.
- Titre de section en majuscules 13 px grises : "COUVERTURE DE VOS OBJECTIFS".
- Un groupe de liste blanc contenant cinq lignes séparées par des séparateurs
  insérés. Chaque ligne : le nom de l'objectif en Body 17 à gauche, puis à
  droite le pourcentage en 17 px gris, et sous le texte une barre de
  progression iOS native très fine de 4 px occupant toute la largeur de la
  ligne, teintée en vert #34A853 au-dessus de 70 % et en jaune #F0B429 en
  dessous.
  Les cinq : "Hydratation 96 %", "Barrière cutanée 94 %", "Peau douce 97 %",
  "Produits clean 67 %", "Teint lumineux 52 %".
- Sous le groupe, un texte de pied de section en Footnote 13 grise, comme dans
  les Réglages iOS : "Recalculé lorsque vous modifiez votre routine."
- Titre de section : "VOS PRODUITS · 6".
- Un groupe de liste blanc à quatre lignes séparées par des séparateurs
  insérés : vignette produit 40 px coins 8 px à gauche, nom en Body 17, marque
  et moment en Footnote 13 grise dessous, et à droite la note en 17 px de la
  couleur correspondante suivie d'un chevron.
- En bas, un bouton pleine largeur corail #E4574A : "Ajouter un produit".

INTERDIT : pas d'anneau, pas de camembert, pas de carte maison, pas de dégradé,
pas d'ombre, pas d'emoji.

RENDU : capture d'écran d'application iOS à plat, plein cadre, ratio 9:19.5,
très haute définition, conventions iOS respectées, pourcentages alignés, textes
en français réels. Pas de cadre de téléphone, pas de main, pas de perspective.

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
comparaison, en style iOS natif.

STYLE : direction "native pure", iOS authentique. Fond gris groupé #F2F2F7,
groupe de liste blanc coins 12 px, séparateurs 0,5 px insérés. Teinte corail
#E4574A. Notation : vert #34A853, jaune #F0B429, orange #F2801F. SF Pro aux
tailles système. Aucune ombre. Marges 16 px.

CONTENU :
- Grand titre iOS "Historique" en Large Title 34 gras. À droite du titre, un
  bouton texte corail "Comparer".
- Une barre de recherche iOS native : fond gris #E3E3E8, coins 10 px, hauteur
  36 px, loupe grise et texte gris "Rechercher".
- Un contrôle segmenté iOS natif pleine largeur, fond gris #E3E3E8, avec deux
  segments : "Tout" sélectionné (pastille blanche) et "Favoris".
- UN seul groupe de liste blanc contenant six lignes séparées par des
  séparateurs insérés : vignette produit 44 px coins 8 px à gauche, nom en
  Body 17 tronqué proprement sur une ligne, marque et date en Footnote 13 grise
  dessous ("The Ordinary · 15 sept."), et à droite la note en 17 px de la
  couleur correspondante suivie d'un chevron gris.
- Une des lignes porte un petit SF Symbol de signet corail juste avant la note.
- Pas de bouton principal, pas de bouton flottant.

INTERDIT : pas d'anneau, pas de demi-donut, pas de carte par ligne, pas de
dégradé, pas d'ombre, pas d'emoji, pas de composant maison.

RENDU : capture d'écran d'application iOS à plat, plein cadre, ratio 9:19.5,
très haute définition, conventions iOS respectées, textes en français réels.
Pas de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 6/7 : Beauty Advisor

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Beauty Advisor", conversation avec un conseiller beauté IA, en style
iOS natif type Messages.

STYLE : direction "native pure", iOS authentique. Fond blanc #FFFFFF pour la
conversation. Bulles arrondies iOS : celle de l'utilisateur en corail #E4574A
avec texte blanc, celle du conseiller en gris clair #E9E9EB avec texte noir,
coins 18 px avec la petite pointe caractéristique. SF Pro Body 17. Aucune
ombre. Marges 16 px.

CONTENU :
- Barre de navigation iOS avec un bouton "Retour" corail à gauche et le titre
  "Beauty Advisor" centré en 17 px semi-gras, avec en dessous en 12 px grise la
  ligne "Fondé sur votre profil".
- La conversation :
  - Bulle utilisateur alignée à droite, corail, texte blanc : "Je cherche un
    sérum pour les rougeurs, peau grasse."
  - Bulle conseiller alignée à gauche, gris clair, texte noir : "Pour une peau
    grasse sujette aux rougeurs, cherchez un actif apaisant sans alcool ni
    parfum. Voici deux formules propres de votre catalogue."
  - Sous cette bulle, alignées à gauche et sans bulle, deux cartes produit
    blanches à coins 12 px et fine bordure grise, empilées : vignette 44 px,
    nom en Body 17, marque en Footnote 13 grise, note colorée à droite avec un
    chevron.
- Au-dessus du champ de saisie, deux suggestions rapides en boutons arrondis
  gris clair #E9E9EB, coins 999 px, texte corail 15 px : "Et pour le soir ?" et
  "Compatible avec ma routine ?".
- Champ de saisie iOS natif : fond gris clair, coins 999 px, texte gris
  "Message", et à droite un bouton rond corail #E4574A de 32 px avec une flèche
  blanche vers le haut.

INTERDIT : pas d'avatar, pas de visage, pas de robot, pas de dégradé, pas
d'ombre, pas d'emoji, pas de composant maison. Ça doit ressembler à Messages.

RENDU : capture d'écran d'application iOS à plat, plein cadre, ratio 9:19.5,
très haute définition, conventions iOS respectées, textes en français réels.
Pas de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 7/7 : Profil et mes restrictions

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : "Profil", type de peau, objectifs et ingrédients évités, en style iOS
natif type Réglages.

STYLE : direction "native pure", iOS authentique. Fond gris groupé #F2F2F7,
groupes de liste blancs coins 12 px, séparateurs 0,5 px insérés. Teinte corail
#E4574A. SF Pro aux tailles système. Aucune ombre. Marges 16 px.

CONTENU :
- Grand titre iOS "Profil" en Large Title 34 gras.
- Un premier groupe blanc avec une ligne haute d'identité : cercle gris de
  60 px contenant "SB" en gris foncé, à côté "Stela" en 20 px semi-gras et
  l'adresse e-mail en Footnote 13 grise, chevron à droite.
- Titre de section en majuscules 13 px grises : "MA PEAU". Un groupe blanc à
  trois lignes séparées par des séparateurs insérés, chacune avec le libellé en
  Body 17 à gauche, la valeur en 17 px grise à droite et un chevron :
  "Type de peau · Grasse", "Zone du corps · Normale", "Objectifs · 5".
- Titre de section : "CE QUE J'ÉVITE". Un groupe blanc à cinq lignes séparées
  par des séparateurs insérés, chacune avec le nom de l'ingrédient en Body 17 à
  gauche et, à droite, un bouton de suppression circulaire rouge iOS :
  "Parfum", "Phénoxyéthanol", "Silicones", "Sulfates", "Huiles essentielles".
  Une sixième ligne en corail avec un SF Symbol plus dans un cercle :
  "Ajouter un ingrédient".
  Sous le groupe, un pied de section en Footnote 13 grise : "Ces ingrédients
  sont signalés dans chaque analyse."
- Titre de section : "COMPTE". Un groupe blanc à deux lignes : "Crédits
  restants" avec "129" en gris à droite, et "Passer à Premium" avec un chevron.
- Tout en bas, sur le fond gris, trois liens en Footnote 13 grise centrés :
  "Conditions", "Confidentialité", "Mentions légales".

INTERDIT : pas de photo de profil, pas de visage, pas de bannière Premium
colorée, pas de dégradé, pas d'ombre, pas d'emoji, pas de composant maison.

RENDU : capture d'écran d'application iOS à plat, plein cadre, ratio 9:19.5,
très haute définition, conventions iOS respectées, textes en français réels.
Pas de cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## Sources UX

- [10 Mobile App Design Best Practices for 2026](https://market.gluestack.io/blog/mobile-app-design-best-practices)
- [How to Fix a Cluttered Mobile App Interface Design](https://flowmazeux.com/mobile-app-interface-design-clutter-fixes/)
- [What is Mobile User Experience (UX) Design, IxDF](https://ixdf.org/literature/topics/mobile-ux-design)
- [Minimalist Design Systems for Mobile Apps in 2026](https://www.futuristicbug.com/minimalist-design-systems-for-mobile-apps/)
