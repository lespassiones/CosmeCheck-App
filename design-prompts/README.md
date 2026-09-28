# Refonte visuelle CosmeCheck : 10 directions de design

Dix pistes visuelles complètes pour refaire le front de l'app. Chaque fichier est
une direction indépendante, et contient **7 prompts autonomes** qui produisent
**7 images séparées**, une par écran.

## Comment s'en servir

Ouvre un fichier, copie un bloc `PROMPT n/7` en entier, colle-le dans ton
générateur d'images, récupère l'image, passe au bloc suivant. Sept collages en
un seul prompt, ça ne marche pas : les générateurs répondent par une planche
compressée et illisible. Chaque bloc est donc autonome et redit le système de
design, pour que tu puisses les lancer dans n'importe quel ordre, ou en
parallèle sur plusieurs onglets.

Chaque bloc se termine par une consigne anti-planche explicite. Ne la retire pas.

## Les 7 écrans, identiques dans les 10 directions

| # | Écran | Ce qu'il met à l'épreuve |
|---|---|---|
| 1 | Accueil | La hiérarchie et le tri de l'information. C'est l'écran qui pose problème aujourd'hui. |
| 2 | Scanner un produit | Un point d'entrée à 5 méthodes sans donner le vertige. |
| 3 | Résultat d'analyse | L'écran le plus dense de l'app. Le vrai test de la direction. |
| 4 | Ma routine | De la donnée de progression lisible d'un coup d'œil. |
| 5 | Historique | Une liste longue, avec recherche, filtres et comparaison. |
| 6 | Beauty Advisor | Une conversation, avec des cartes produit insérées dedans. |
| 7 | Profil et mes restrictions | Des réglages et des listes de préférences. |

Les écrans non couverts (Promesses, annuaire Ingrédients, page Premium) héritent
du même système : une fois la direction choisie, ils se déduisent.

## Les 10 directions

| # | Fichier | Direction | Mode | Signature |
|---|---|---|---|---|
| 01 | [01-clinique-editorial.md](01-clinique-editorial.md) | Clinique éditorial | Clair | Blanc, serif de titre, un seul corail |
| 02 | [02-pastel-respirant.md](02-pastel-respirant.md) | Pastel respirant | Clair | Crème, rose poudré, formes douces |
| 03 | [03-suisse-typographique.md](03-suisse-typographique.md) | Suisse typographique | Clair | Grille stricte, chiffres géants, un rouge |
| 04 | [04-apothicaire-botanique.md](04-apothicaire-botanique.md) | Apothicaire botanique | Clair | Crème, vert sauge, serif de labeur |
| 05 | [05-data-sobre.md](05-data-sobre.md) | Data sobre | Clair | Gris froid, un bleu ardoise, la donnée parle |
| 06 | [06-neo-brut-doux.md](06-neo-brut-doux.md) | Néo-brut doux | Clair | Blocs plats, contour net, jaune franc |
| 07 | [07-papier-et-encre.md](07-papier-et-encre.md) | Papier et encre | Clair | Papier chaud, encre, surligneur |
| 08 | [08-native-pure.md](08-native-pure.md) | Native pure | Clair | iOS natif assumé, chrome minimal |
| 09 | [09-nuit-encre.md](09-nuit-encre.md) | Nuit encre | **Sombre** | Noir chaud, ambre, serif haute |
| 10 | [10-nocturne-clinique.md](10-nocturne-clinique.md) | Nocturne clinique | **Sombre** | Bleu nuit, cyan doux, anneaux fins |

Huit directions en mode clair, deux en mode sombre, comme demandé.

## Le principe commun aux 10

Toutes les directions partagent les mêmes règles de fond, seule l'écriture
visuelle change :

- une seule action primaire par écran ;
- divulgation progressive : le détail n'apparaît que si l'utilisateur le demande ;
- la hiérarchie doit se lire en une demi-seconde ;
- peu d'icônes, et seulement là où elles remplacent un mot ;
- une couleur d'accent, plus les 4 couleurs de notation, rien d'autre.

Ces règles viennent des sources listées en bas de chaque fichier.
