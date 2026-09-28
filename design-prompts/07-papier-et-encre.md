# Direction 07 : Papier et encre (mode clair)

**L'idée.** L'app ressemble à une fiche imprimée sur un beau papier. Fond beige
chaud très légèrement texturé, encre noire, et un seul geste de couleur : un
trait de surligneur jaune posé derrière le mot qui compte. Rien ne brille, rien
ne flotte, tout est posé.

**Mode :** clair.

---

## Système de design de cette direction

**Couleurs**
- Fond papier `#F4F1EA` avec un grain à peine perceptible
- Surfaces légèrement plus claires `#FAF8F3`
- Encre `#1A1A1A`, secondaire `#5F5B54`, tertiaire `#918C83`
- Filets `#D9D3C7` à 1 px
- Accent unique surligneur jaune `#F2E14C`, appliqué comme un trait de feutre derrière un mot, jamais comme un fond de bouton
- Bouton primaire : encre pleine `#1A1A1A`, texte papier
- Notation : vert `#4F7A3F`, jaune `#B8912B`, orange `#B86B2B`, rouge `#9E3B32`

**Typographie**
- Titres et corps : serif de texte (Spectral, Source Serif ou Freight)
- Libellés et données : sans-serif condensée (Archivo Narrow ou Roboto Condensed) en majuscules
- Échelle : chiffre héros 64 px, titre 27 px, sous-titre 18 px, corps 16 px, libellé 11 px

**Formes et espace**
- Grille 8 pt, marge latérale 24 px
- Rayon de coin 2 px, presque nul
- Aucune ombre
- Séparations par filets 1 px `#D9D3C7`, pleine largeur

**Iconographie**
- 2 icônes maximum par écran, traits 1 px, style tampon
- Aucune illustration

---

## Règles UX appliquées dans les 7 écrans

1. Une seule action primaire par écran, en encre pleine.
2. Le surligneur jaune n'apparaît qu'UNE fois par écran, sur le mot décisif.
3. Divulgation progressive : le détail est replié derrière une ligne.
4. Cibles tactiles 44 x 44 px minimum.
5. Le grain du papier reste discret, il ne doit jamais gêner la lecture.

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

STYLE : direction "papier et encre". Fond beige papier #F4F1EA avec un grain
très fin à peine visible. Texte encre #1A1A1A, secondaire #5F5B54. Filets
#D9D3C7 en 1 px. Titres en serif de texte type Spectral, libellés en
sans-serif condensée MAJUSCULES très espacées. Accent unique : un trait de
surligneur jaune #F2E14C, tracé au feutre large, légèrement irrégulier,
derrière UN SEUL mot de l'écran. Coins 2 px. AUCUNE ombre. Marges 24 px.

CONTENU, du haut vers le bas :
- Barre d'état iOS, heure 9:41.
- "COSMECHECK" en sans-serif condensée majuscules 11 px espacées, centré.
- Un filet fin pleine largeur.
- "Bonjour Stela" en serif 27 px, date du jour en 12 px grise dessous.
- Libellé "DERNIÈRE ANALYSE" en majuscules condensées 11 px.
- Le nom "Lotion Tonique Exfoliante" en serif 22 px sur deux lignes, et
  "THE ORDINARY" en majuscules condensées 11 px grises dessous. À droite, une
  vignette produit carrée 64 px à coins 2 px, avec un fin filet #D9D3C7 tout
  autour comme une photo collée.
- Le chiffre "14,2" en serif 64 px avec "/20" en 18 px. Juste à côté, le mot
  "Bien" avec LE TRAIT DE SURLIGNEUR jaune #F2E14C tracé derrière lui, au
  feutre large, légèrement débordant et irrégulier. C'est la seule couleur de
  l'écran.
- Un filet fin pleine largeur.
- Deux lignes de navigation séparées par un filet, chacune avec le libellé en
  serif 18 px à gauche et une donnée en majuscules condensées 11 px grise à
  droite : "Ma routine / 6 PRODUITS", "Beauty Advisor / POSER UNE QUESTION".
- Un filet fin, puis un large espace papier vide.
- En bas, un bouton pleine largeur en ENCRE PLEINE #1A1A1A, coins 2 px, texte
  papier #F4F1EA en majuscules condensées 14 px espacées : "SCANNER UN
  PRODUIT".
- Barre d'onglets en texte seul, majuscules condensées 10 px : ACCUEIL,
  ROUTINE, HISTORIQUE, PROFIL. L'actif est en encre, les autres en gris.

INTERDIT : pas de carte à ombre, pas de coin arrondi, pas de carrousel, pas de
quiz, pas d'illustration, pas de dégradé, pas d'emoji, pas plus de 2 icônes.
UN SEUL trait de surligneur sur tout l'écran.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, texture papier subtile, typographie nette, textes en français
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

STYLE : direction "papier et encre". Feuille beige papier #F4F1EA légèrement
grainée, coins supérieurs 4 px, posée sur le flux caméra assombri. Encre
#1A1A1A, filets #D9D3C7. Serif de texte pour les titres, sans-serif condensée
majuscules pour les libellés. Accent surligneur jaune #F2E14C une seule fois.
Aucune ombre. Marges 24 px.

CONTENU :
- Fond : vue caméra en direct sur le dos d'un flacon cosmétique posé sur du
  papier, légèrement flou et assombri.
- Feuille papier couvrant les deux tiers bas, avec un filet #D9D3C7 en haut à
  la place d'une poignée.
- "MÉTHODE" en majuscules condensées 11 px espacées grises.
- Titre "Analyser un produit" en serif 27 px.
- Cinq lignes séparées par des filets #D9D3C7, sans carte, chacune avec un
  numéro en majuscules condensées grises à gauche, le libellé en serif 18 px et
  une explication en 12 px grise dessous :
  I "Code-barres" / "Le plus rapide"
  II "Photo de la liste INCI" / "À partir du dos du produit"
  III "Lien" / "Depuis un site marchand"
  IV "Saisie manuelle" / "Copier-coller le texte"
  V "Catalogue" / "479 000 produits"
- Sur la ligne I uniquement, le mot "Code-barres" porte le TRAIT DE SURLIGNEUR
  jaune #F2E14C tracé au feutre derrière lui.
- Une croix fine à l'encre en haut à gauche sur la caméra.

INTERDIT : pas d'icône par méthode, pas de carte, pas de coin arrondi, pas
d'ombre, pas de dégradé, pas d'emoji. Un seul trait de surligneur.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, texture papier subtile, textes en français réels. Pas de
cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## PROMPT 3/7 : Résultat d'analyse

```
Maquette d'interface mobile, une seule image, écran unique.

PRODUIT : CosmeCheck, application mobile française d'analyse de composition
cosmétique.

ÉCRAN : le résultat d'analyse d'un produit. Il doit ressembler à une fiche
d'analyse imprimée.

STYLE : direction "papier et encre". Fond beige papier #F4F1EA grainé, encre
#1A1A1A, secondaire #5F5B54, filets #D9D3C7 1 px. Bouton primaire en encre
pleine. Accent surligneur jaune #F2E14C une seule fois. Notation : vert
#4F7A3F, jaune #B8912B, orange #B86B2B, rouge #9E3B32. Serif de texte pour les
titres, sans-serif condensée majuscules pour les libellés. Coins 2 px, aucune
ombre. Marges 24 px.

CONTENU :
- Une flèche de retour fine à l'encre en haut à gauche, trois points à droite.
- "ANUA" en majuscules condensées 11 px espacées grises.
- Le nom "Azelaic Acid 10 Hyaluron Redness Soothing Serum" en serif 24 px sur
  trois lignes. À droite, une vignette produit 72 px encadrée d'un filet fin,
  comme une photo collée sur la fiche.
- Un filet fin pleine largeur.
- "NOTE GLOBALE" en majuscules condensées 11 px grises.
- Le chiffre "12,9" en serif 64 px avec "/20" en 18 px. À côté, le mot "Moyen"
  portant LE TRAIT DE SURLIGNEUR jaune #F2E14C tracé au feutre large derrière
  lui. Sous le chiffre, une phrase en serif 15 px : "Formule correcte, mais
  deux ingrédients méritent votre attention."
- Un filet fin.
- "POUR VOUS" en majuscules condensées grises, puis en serif 16 px : "Aucun de
  vos ingrédients évités n'est présent", précédé d'un petit cercle vert #4F7A3F
  de 8 px.
- Un filet fin.
- "COMPOSITION" en majuscules condensées grises. En dessous, quatre lignes
  séparées par des filets fins, chacune avec un petit carré de couleur de 10 px
  à gauche, le libellé en serif 16 px et le nombre en serif 20 px aligné à
  droite : "Sûrs 28", "À surveiller 7", "À éviter 0", "À risque 0".
- Un filet fin, puis trois lignes repliées séparées par des filets, chacune en
  serif 16 px avec un petit chevron fin vers le bas : "Les 35 ingrédients en
  détail", "Allergènes réglementés : aucun", "Observations : 2 silicones".
- En bas : bouton pleine largeur en ENCRE PLEINE #1A1A1A, coins 2 px, texte
  papier en majuscules condensées espacées : "AJOUTER À MA ROUTINE". Sous lui,
  un lien en serif souligné : "Voir des alternatives".

INTERDIT : pas d'anneau, pas d'étoiles, pas de carte à ombre, pas de coin
arrondi, pas de dégradé, pas d'emoji. La liste d'ingrédients reste REPLIÉE. Un
seul trait de surligneur sur tout l'écran.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, texture papier subtile, typographie et chiffres nets, textes
en français réels. Pas de cadre de téléphone, pas de main, pas de perspective.

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

STYLE : direction "papier et encre". Fond beige papier #F4F1EA grainé, encre
#1A1A1A, filets #D9D3C7. Accent surligneur jaune #F2E14C une seule fois.
Notation : vert #4F7A3F, jaune #B8912B. Serif de texte, libellés en sans-serif
condensée majuscules. Coins 2 px, aucune ombre. Marges 24 px.

CONTENU :
- "Ma routine" en serif 27 px, "SIX PRODUITS" en majuscules condensées 11 px
  grises dessous.
- Un filet fin pleine largeur.
- "COUVERTURE DE VOS OBJECTIFS" en majuscules condensées grises.
- Cinq lignes séparées par des filets fins. Chaque ligne : le nom de l'objectif
  en serif 16 px à gauche, le pourcentage en serif 18 px à droite, et sous le
  texte une barre horizontale pleine largeur de 4 px, piste #D9D3C7 et
  remplissage plein. Remplissage vert #4F7A3F au-dessus de 70 %, jaune #B8912B
  en dessous.
  Les cinq : "Hydratation 96 %", "Barrière cutanée 94 %", "Peau douce 97 %",
  "Produits clean 67 %", "Teint lumineux 52 %".
  Sur la ligne "Produits clean", le pourcentage "67 %" porte LE TRAIT DE
  SURLIGNEUR jaune derrière lui, car c'est le point faible à regarder.
- Une ligne en majuscules condensées 11 px grises avec une petite flèche
  circulaire à l'encre : "RECALCULER".
- Un filet fin.
- "VOS PRODUITS" en majuscules condensées grises. Quatre lignes séparées par
  des filets : vignette 48 px encadrée d'un filet fin à gauche, nom en serif
  17 px, marque et moment en majuscules condensées 11 px grises dessous, et la
  note en serif 20 px à droite précédée d'un petit carré de couleur.
- En bas, bouton pleine largeur en encre pleine : "AJOUTER UN PRODUIT".

INTERDIT : pas d'anneau, pas de camembert, pas de carte à ombre, pas de coin
arrondi, pas de dégradé, pas d'emoji. Un seul trait de surligneur.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, texture papier subtile, pourcentages alignés, textes en
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

STYLE : direction "papier et encre". Fond beige papier #F4F1EA grainé, encre
#1A1A1A, filets #D9D3C7. Accent surligneur jaune #F2E14C une seule fois, sur le
filtre actif. Notation : vert #4F7A3F, jaune #B8912B, orange #B86B2B. Serif de
texte, libellés en sans-serif condensée majuscules. Coins 2 px, aucune ombre.
Marges 24 px.

CONTENU :
- "Historique" en serif 27 px, "VINGT-TROIS ANALYSES" en majuscules condensées
  11 px grises.
- Un champ de recherche : pas de boîte, simplement une ligne d'écriture, c'est
  à dire un filet #D9D3C7 en bas sur toute la largeur, avec le texte gris
  "Rechercher un produit" au-dessus et une petite loupe à l'encre à droite.
- Une rangée de trois libellés de filtre en majuscules condensées 11 px
  espacées : "TOUT" portant LE TRAIT DE SURLIGNEUR jaune derrière lui (actif),
  "FAVORIS" en gris, et à droite "COMPARER" en gris.
- Un filet fin pleine largeur.
- Six lignes séparées par des filets fins, sans carte : vignette 48 px encadrée
  d'un filet à gauche, nom du produit en serif 17 px sur une ou deux lignes,
  marque et date en majuscules condensées 11 px grises dessous
  ("THE ORDINARY · 15 SEPT."), et la note en serif 20 px à droite précédée d'un
  petit carré de couleur de 8 px.
- Une des lignes porte un petit signet à l'encre dessiné dans la marge gauche.
- Pas de bouton principal.

INTERDIT : pas d'anneau, pas de demi-donut, pas de carte à ombre, pas de coin
arrondi, pas de dégradé, pas d'emoji. Un seul trait de surligneur.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, texture papier subtile, textes en français réels. Pas de
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

STYLE : direction "papier et encre". Fond beige papier #F4F1EA grainé, encre
#1A1A1A, filets #D9D3C7. Accent surligneur jaune #F2E14C une seule fois. Serif
de texte en 16 px avec interligne 1,65, libellés en sans-serif condensée
majuscules. Coins 2 px, aucune ombre. Marges 24 px.

CONTENU :
- "Beauty Advisor" en serif 27 px, "CONSEILS FONDÉS SUR VOTRE PROFIL" en
  majuscules condensées 11 px grises.
- Un filet fin pleine largeur.
- La conversation, composée comme un échange de lettres, SANS bulle :
  - "VOUS" en majuscules condensées 11 px grises, puis en serif 17 px italique :
    "Je cherche un sérum pour les rougeurs, peau grasse."
  - Un filet fin.
  - "LE CONSEILLER" en majuscules condensées 11 px grises, puis en serif 16 px
    romain, interligne large : "Pour une peau grasse sujette aux rougeurs,
    cherchez un actif apaisant sans alcool ni parfum. Voici deux formules
    propres de votre catalogue." Dans ce paragraphe, les mots "sans alcool ni
    parfum" portent LE TRAIT DE SURLIGNEUR jaune #F2E14C.
  - Deux lignes produit séparées par des filets : vignette 40 px encadrée d'un
    filet, nom en serif 16 px, marque en majuscules condensées 11 px grises, et
    la note en serif 18 px à droite avec un petit carré de couleur.
- Un filet fin, puis deux suggestions en serif 14 px italique soulignées d'un
  filet : "Et pour le soir ?" et "Compatible avec ma routine ?".
- En bas, un champ de saisie sous forme de ligne d'écriture : un filet
  #D9D3C7 sur toute la largeur, texte gris "Votre question" au-dessus, et à
  droite un petit carré d'encre pleine de 36 px avec une flèche papier vers le
  haut.

INTERDIT : pas de bulle, pas d'avatar, pas de visage, pas de robot, pas de
carte à ombre, pas de dégradé, pas d'emoji. Un seul trait de surligneur.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, texture papier subtile, textes en français réels. Pas de
cadre de téléphone, pas de main, pas de perspective.

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

STYLE : direction "papier et encre". Fond beige papier #F4F1EA grainé, encre
#1A1A1A, filets #D9D3C7. Accent surligneur jaune #F2E14C une seule fois. Serif
de texte, libellés en sans-serif condensée majuscules. Coins 2 px, aucune
ombre. Marges 24 px.

CONTENU :
- "Profil" en serif 27 px.
- Une ligne d'identité sans avatar : "Stela" en serif 20 px et l'adresse
  e-mail en 12 px grise dessous. À droite, un carré de 44 px encadré d'un filet
  fin contenant les initiales "SB" à l'encre en serif.
- Un filet fin pleine largeur.
- "MA PEAU" en majuscules condensées grises. Trois lignes séparées par des
  filets : libellé en serif 16 px à gauche, valeur en majuscules condensées
  12 px grises à droite avec un chevron fin : "Type de peau / GRASSE",
  "Zone du corps / NORMALE", "Objectifs / 5 SÉLECTIONNÉS".
- Un filet fin.
- "CE QUE J'ÉVITE" en majuscules condensées grises, puis une ligne en serif
  14 px italique grise : "Signalés dans chaque analyse."
  En dessous, les cinq ingrédients listés en serif 17 px, chacun sur sa propre
  ligne séparée par un filet fin, avec une petite croix à l'encre à droite :
  "Parfum", "Phénoxyéthanol", "Silicones", "Sulfates", "Huiles essentielles".
  Le mot "Parfum" porte LE TRAIT DE SURLIGNEUR jaune derrière lui.
  Sous la liste, un lien en serif souligné : "Ajouter un ingrédient".
- Un filet fin, puis une ligne "Crédits restants" en serif 16 px à gauche et
  "129" en serif 20 px à droite.
- Une ligne "Passer à Premium" en serif 16 px avec un chevron fin. Pas de
  bandeau, pas de couleur.
- Tout en bas, trois liens en majuscules condensées 10 px grises :
  "CONDITIONS", "CONFIDENTIALITÉ", "MENTIONS LÉGALES".

INTERDIT : pas de photo de profil, pas de visage, pas de puce arrondie, pas de
bannière Premium, pas de carte à ombre, pas de dégradé, pas d'emoji. Un seul
trait de surligneur.

RENDU : capture d'écran d'application à plat, plein cadre, ratio 9:19.5, très
haute définition, texture papier subtile, textes en français réels. Pas de
cadre de téléphone, pas de main, pas de perspective.

UNE SEULE IMAGE, UN SEUL ÉCRAN. Ne produis pas de planche, pas de grille de
plusieurs écrans, pas de collage.
```

---

## Sources UX

- [10 Mobile App Design Best Practices for 2026](https://market.gluestack.io/blog/mobile-app-design-best-practices)
- [How to Fix a Cluttered Mobile App Interface Design](https://flowmazeux.com/mobile-app-interface-design-clutter-fixes/)
- [What is Mobile User Experience (UX) Design, IxDF](https://ixdf.org/literature/topics/mobile-ux-design)
- [Minimalist Design Systems for Mobile Apps in 2026](https://www.futuristicbug.com/minimalist-design-systems-for-mobile-apps/)
