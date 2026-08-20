# Fiche App Store, textes prêts à coller

Écrit le 20/08/2026. Adapté de la fiche Play (relevée par l'API), pas réinventé, pour que
les deux magasins racontent la même chose.

⚠️ **Une seule modification de fond par rapport au texte Play** : la dernière phrase
« Cosme Check […] est disponible sur Google Play » est **retirée**. La règle 2.3.10
d'Apple interdit de mentionner une autre plateforme dans une fiche App Store, et c'est un
motif de rejet automatique.

---

## Sous-titre (30 max)

```
Décrypte la compo de tes soins
```

Exactement 30 caractères. Il est indexé par la recherche Apple au même titre que le nom,
donc il ne répète aucun mot déjà présent dans « Cosme Check: scan cosmétique ».

## Texte promotionnel (170 max)

```
Scanne un cosmétique et sache en quelques secondes s'il est fait pour ta peau, ce qu'il contient vraiment, et si ses promesses tiennent la route.
```

Ce champ se modifie **sans repasser par une vérification**. C'est là que vont les messages
saisonniers, jamais dans la description.

## Mots-clés (100 max)

```
inci,ingredient,composition,beaute,peau,routine,creme,shampooing,allergene,acne,dermo,label
```

91 caractères. Pas d'espace après les virgules, ils compteraient pour rien. Aucun mot déjà
présent dans le nom ou le sous-titre : Apple les indexe déjà, les répéter gaspille la
place. Pas de marque concurrente, c'est un motif de rejet.

## URL marketing

```
https://www.cosme-check.com
```

## Description (4 000 max)

```
Tu dépenses parfois des dizaines d'euros dans un cosmétique... sans savoir s'il est vraiment fait pour toi. Résultat : des produits qui finissent au fond du placard, une peau qui ne réagit pas comme promis, et de l'argent gaspillé.

Cosme Check change ça. En quelques secondes, tu sais si un produit correspond à ta peau, ce qu'il contient vraiment, et s'il tient les promesses affichées sur l'emballage. Tu arrêtes d'acheter au hasard, tu choisis ce qui te convient vraiment.

CE QUE COSMECHECK T'APPORTE

• Arrête de gaspiller ton argent
Avant même d'acheter, découvre ton score de compatibilité : à quel point le produit correspond à ton profil (type de peau, sensibilités, préférences). Fini les achats qui ne servent à rien.

• Comprends enfin ce que tu mets sur ta peau
Chaque ingrédient (INCI) est expliqué simplement. Tu sais ce que contient ton produit, et pourquoi c'est bon ou non pour toi.

• Vérifie si les promesses sont vraies
Anti-âge, hydratant, sans sulfates... cosmecheck contrôle si la composition tient réellement ce que la marque affiche. Tu ne paies plus pour du marketing.

• Avance vraiment vers tes objectifs
Construis une routine cohérente, repère les produits incompatibles entre eux et vois si tu progresses vers tes objectifs beauté.

• Trouve un produit plus adapté
Un produit te convient peu ? Cosme Check te propose des alternatives mieux notées dans la même catégorie.

• Un conseiller beauté dans ta poche
Pose tes questions et obtiens des réponses personnalisées sur tes produits et ta routine.

3 FAÇONS D'ANALYSER UN PRODUIT
• Scan du code-barres
• Recherche dans le catalogue
• Copier-coller la liste d'ingrédients (INCI)

GRATUIT ET PREMIUM
cosmecheck s'utilise gratuitement. L'abonnement Premium débloque l'usage illimité des scans et le score de compatibilité détaillé.

ABONNEMENT PREMIUM
• Premium mensuel : 9,99 € par mois
• Premium annuel : 59,99 € par an
Essai gratuit de 3 jours pour les nouveaux abonnés. L'abonnement se renouvelle automatiquement sauf annulation au moins 24 heures avant la fin de la période en cours. Il se gère et se résilie à tout moment dans les réglages de ton compte App Store.
Conditions d'utilisation : https://cosme-check.com/cgu
Politique de confidentialité : https://cosme-check.com/privacy

POURQUOI COSME CHECK
Parce que ta beauté ne devrait pas dépendre du hasard ni du marketing. Avec cosmecheck, tu dépenses mieux, tu comprends ce que tu utilises, et tu choisis enfin des produits vraiment faits pour toi.

Cosme Check est un outil d'information sur la composition des cosmétiques. Il ne remplace pas l'avis d'un professionnel de santé ou d'un dermatologue.
```

⚠️ **Le bloc ABONNEMENT PREMIUM n'est pas décoratif.** La règle 3.1.2 exige que la durée,
le prix et les liens vers les conditions et la confidentialité soient lisibles **avant**
l'achat. L'app les affiche déjà sur son écran d'offre ; les avoir aussi dans la fiche est
ce qui évite l'aller-retour de revue le plus fréquent sur les apps par abonnement.

⚠️ **Les prix sont ceux d'Apple** (9,99 € mensuel), pas ceux de Play (9,49 €). Écart
assumé, voir PROD-CHECKLIST 5.8.

---

## Informations utiles à la vérification

### Coordonnées

| Champ | Valeur |
|---|---|
| Prénom | `Brian` |
| Nom | `Biendou` |
| Numéro de téléphone | `+33 6 44 81 42 18` |
| E-mail | `contact@cosme-check.com` |

### Informations de connexion

« Connexion requise » reste **coché** : l'app demande un compte dès le premier écran, et un
vérificateur qui ne peut pas passer cet écran rejette pour app incomplète (règle 2.1).

| Champ | Valeur |
|---|---|
| Nom d'utilisateur | `review@cosme-check.com` |
| Mot de passe | celui déclaré dans Play Console, section **Accès à l'application** |

Ce compte existe depuis le 11/07/2026, il est **déjà `tier = premium`**, et sa dernière
connexion réussie date du 08/08/2026. C'est le même que pour la revue Google : un seul
compte à maintenir, les deux magasins posent la même question.

⚠️ **Le mot de passe n'est récupérable nulle part ailleurs.** Supabase n'en garde qu'une
empreinte bcrypt, et il n'est ni dans le dépôt ni dans le `.env`. La seule copie en clair
est celle saisie dans Play Console. S'il est perdu, il faut le réinitialiser par l'API
admin de Supabase **et** mettre à jour les deux consoles, sinon la revue suivante de Google
échoue sur des identifiants morts.

⚠️ **Son plafond de crédits est de 5 par jour**, comme un compte gratuit, malgré
`tier = premium` (relevé dans `user_credits` le 20/08/2026). Cinq analyses suffisent
largement à une revue, et si le vérificateur les épuise il tombe sur l'écran d'abonnement,
ce qui est un état légitime de l'app et non un défaut. À monter seulement si on veut lui
laisser plus de marge.

### Remarques

```
L'application analyse la composition (liste INCI) des produits cosmétiques et la confronte au profil de peau de la personne.

Le compte fourni est déjà abonné Premium : aucun achat n'est nécessaire pour voir l'application entière.

POUR ANALYSER UN PRODUIT SANS EN AVOIR UN SOUS LA MAIN
Toucher le bouton central « Décode » de la barre du bas, puis l'une des trois méthodes :

1. « Rechercher un produit » : taper par exemple « nivea », choisir un résultat du catalogue. L'analyse se lance et affiche la note, les ingrédients expliqués un par un, et la compatibilité avec le profil.

2. « Coller la composition » : coller cette liste d'ingrédients réelle :
AQUA, GLYCERIN, CETEARYL ALCOHOL, DIMETHICONE, PARFUM, PHENOXYETHANOL, TOCOPHEROL, CITRIC ACID

3. « Code-barres » : ouvre la caméra pour lire le code d'un produit physique.

AUTORISATIONS, ET LEUR SEUL USAGE
Caméra : lire un code-barres de produit.
Photothèque : proposer l'ajout au catalogue d'un produit absent, en photographiant son emballage. Aucune image n'est publiée ni partagée.

ÉCRAN D'ABONNEMENT
Onglet Profil, puis la carte Premium. L'onglet « Plans » affiche les deux abonnements, leurs prix, l'essai de 3 jours, la restauration des achats et les liens vers les conditions et la confidentialité.

SUPPRESSION DU COMPTE
Onglet Profil, puis « Supprimer mon compte ». La suppression purge les données côté serveur.

INFORMATION IMPORTANTE
L'application ne délivre aucun diagnostic médical et le dit explicitement dans son écran « À propos ». Les notes sont calculées par notre propre moteur à partir de données de composition issues de bases publiques et de fiches produit.
```

### Publication de la version

**Publier cette version manuellement**, déjà sélectionné. Une version qui atteint le
public ne se rappelle pas, elle se remplace par la suivante.

---

## Ce qui manque encore à cette fiche

| Élément | Bloqué par |
|---|---|
| Les 9 captures sont déposées | rien, c'est fait |
| Catégorie principale **Style de vie** | à poser dans Informations sur l'app. ⚠️ Pas Médecine ni Santé et forme |
| Confidentialité de l'app (étiquette) | à remplir, voir PROD-CHECKLIST étape 20 |
| Classification par âge | à remplir |
| Captures de vérification des 2 abonnements | le build TestFlight |
| Le build | le feu vert pour `eas build` |
