# Réponse à Apple, règle 2.1 « Information Needed »

Rejet du 28/08/2026, submission `472afdad-10ad-4d73-9018-0e7ba3558e83`.

## Ce que ce courrier est, et ce qu'il n'est pas

Ce n'est **pas** un rejet pour bug, crash ou fonctionnalité manquante. Apple n'a rien
reproché à l'application. La règle 2.1 « Information Needed » veut dire une seule chose :
le champ **App Review Information > Notes** ne contenait pas assez d'éléments pour que le
vérificateur comprenne l'app, et Apple demande désormais **systématiquement une vidéo**
pour toute première soumission d'une app.

Le texte de remarques existe déjà, il est dans `docs/fiche-app-store.md`, section
« Remarques ». Il a soit été laissé de côté au moment de la soumission, soit collé sans
la vidéo, qui est le point 1 et le seul livrable réellement nouveau.

La section « How to Prevent Common Issues » en bas du courrier est un pied de page
générique, pas une liste de reproches. Elle est envoyée à toutes les apps.

**Rien à recompiler.** Le binaire reste valide, on répond dans App Store Connect et la
revue repart.

---

## 1. La vidéo, seul vrai travail

Enregistrement d'écran, **sur un iPhone physique**, pas sur simulateur, avec la dernière
version d'iOS. Elle doit commencer par le lancement de l'app depuis l'icône, et montrer
dans l'ordre :

1. Écran d'accueil, **création de compte** (avec Apple et avec e-mail).
2. Déconnexion, puis **connexion** avec le compte de revue.
3. Le parcours principal : bouton central « Décode », recherche d'un produit dans le
   catalogue, analyse affichée, ingrédients expliqués, compatibilité avec le profil.
4. Le **scan code-barres**, pour montrer l'invite d'autorisation caméra qui apparaît.
5. La **soumission d'une photo de produit**, pour l'invite d'autorisation photothèque.
6. L'**écran d'abonnement** : Profil, carte Premium, onglet Plans. Filmer lentement le
   bloc qui affiche les deux durées, les deux prix, l'essai de 3 jours, « Restaurer mes
   achats » et les deux liens conditions et confidentialité. Puis toucher le bouton
   d'achat jusqu'à faire apparaître la feuille de paiement Apple. On peut annuler à ce
   moment, ce qu'Apple veut voir c'est que le tunnel existe et affiche bien le prix.
7. La **suppression de compte** : Profil, puis « Supprimer mon compte », jusqu'à l'écran de
   confirmation. À filmer avec un compte jetable, pas avec `reviewer@cosme-check.com`,
   sinon la revue suivante n'a plus de compte.

Format accepté : `.mp4` ou `.mov`, ou un lien non protégé par mot de passe. Le fichier
`video/0828 (2).mp4` déjà présent au dépôt ne couvre probablement pas les sept points,
à vérifier avant de l'envoyer.

---

## 2 à 8. Texte prêt à coller dans la réponse App Store Connect

> ⚠️ Le point 2 attend les modèles réellement testés. Le remplir avant envoi, Apple
> recoupe avec les rapports de plantage TestFlight.

```
Bonjour,

Merci pour votre retour. Voici les informations demandées.

1. ENREGISTREMENT D'ÉCRAN
La vidéo est jointe à cette réponse. Elle est capturée sur un appareil physique et montre, dans l'ordre : le lancement de l'application, la création de compte (Apple et e-mail), la connexion, le parcours d'analyse d'un produit, les invites d'autorisation caméra et photothèque, l'écran d'abonnement avec le détail des offres et le tunnel d'achat, puis la suppression de compte.

2. APPAREILS ET SYSTÈMES DE TEST
[À COMPLÉTER, par exemple : iPhone 14 Pro sous iOS 18.6, iPhone SE 3e génération sous iOS 18.5. Distribution TestFlight avant soumission.]

3. FONCTION DE L'APPLICATION ET PUBLIC VISÉ
Cosme Check analyse la composition (liste INCI) d'un produit cosmétique et la confronte au profil de peau de la personne.

Problème résolu : une liste d'ingrédients cosmétiques est illisible pour le grand public. Les gens achètent des produits qui ne conviennent pas à leur peau, ou qui ne tiennent pas les promesses affichées sur l'emballage.

Valeur apportée : en quelques secondes, l'utilisateur obtient une note du produit, l'explication de chaque ingrédient en langage courant, un score de compatibilité avec son profil, une vérification des promesses marketing, et des alternatives mieux notées dans la même catégorie.

Public visé : grand public francophone, adultes intéressés par les cosmétiques et le soin de la peau. Aucun contenu réservé aux professionnels.

L'application ne délivre aucun diagnostic médical et l'indique explicitement dans son écran « À propos ».

4. ACCÈS ET MISE EN ROUTE
Un compte est requis dès le premier écran. Identifiants de démonstration :
  Nom d'utilisateur : reviewer@cosme-check.com
  Mot de passe : 0106-Apple

Ce compte est déjà abonné Premium et son profil de peau est renseigné, donc aucun achat n'est nécessaire pour voir l'application entière. Il n'existe qu'un seul type de compte.

Pour analyser un produit sans en avoir un sous la main, toucher le bouton central « Décode » de la barre du bas, puis l'une des trois méthodes :

  a) « Rechercher un produit » : taper par exemple « nivea » et choisir un résultat du catalogue.
  b) « Coller la composition » : coller cette liste d'ingrédients réelle :
     AQUA, GLYCERIN, CETEARYL ALCOHOL, DIMETHICONE, PARFUM, PHENOXYETHANOL, TOCOPHEROL, CITRIC ACID
  c) « Code-barres » : ouvre la caméra pour lire le code d'un produit physique.

Autorisations et leur seul usage :
  Caméra : lire le code-barres d'un produit, ou photographier son emballage.
  Photothèque : proposer l'ajout au catalogue d'un produit absent, en photographiant son emballage. Aucune image n'est publiée ni partagée entre utilisateurs.
  Notifications : rappels de routine, sur consentement explicite.

Suppression du compte : onglet Profil, puis « Supprimer mon compte ». La suppression purge les données côté serveur.

Contenu généré par les utilisateurs : l'application ne comporte ni fil public, ni profils publics, ni messagerie entre utilisateurs. Le seul contenu soumis est une photo d'emballage de produit envoyée pour enrichir le catalogue. Cette photo n'est jamais visible par d'autres utilisateurs : elle entre dans une file de modération et n'est publiée qu'après validation manuelle de notre part. Il n'y a donc aucune exposition d'utilisateur à utilisateur, et pas de mécanisme de blocage à prévoir.

5. SERVICES EXTERNES UTILISÉS
  Supabase : authentification, base de données et fonctions serveur.
  Apple Sign In et Google Sign In : authentification.
  RevenueCat : gestion des abonnements. Les paiements eux-mêmes sont exclusivement traités par In-App Purchase d'Apple, aucun autre moyen de paiement n'est proposé.
  OpenAI et Mistral AI : génération des explications d'ingrédients, vérification des promesses produit et conseiller beauté. Aucune donnée identifiante n'est transmise à ces services.
  Open Beauty Facts et Open Food Facts : bases publiques de données produit, utilisées pour la recherche par code-barres.
  DuckDuckGo : recherche web pour retrouver la composition d'un produit absent du catalogue.
  PostHog : mesure d'audience produit. Aucun suivi publicitaire, aucun partage à des fins de ciblage, NSPrivacyTracking est à false.
  Sentry : rapports de plantage.
  Brevo : e-mails transactionnels.
  Expo et EAS : construction de l'application.

6. DIFFÉRENCES RÉGIONALES
Aucune. L'application fonctionne de manière identique dans toutes les régions, avec les mêmes fonctionnalités et le même contenu. L'interface et les contenus sont en français. Aucune fonctionnalité n'est restreinte ou modifiée selon le pays.

7. SECTEUR RÉGLEMENTÉ ET CONTENU DE TIERS
L'application ne relève pas d'un secteur réglementé. Elle ne fournit ni diagnostic, ni conseil médical, ni traitement, et affiche un avertissement en ce sens. Il s'agit d'un outil d'information sur la composition des cosmétiques.

Les données produit proviennent de bases publiques ouvertes (Open Beauty Facts, Open Food Facts, sous licence ODbL) et de fiches produit publiquement accessibles. Les notes et analyses sont calculées par notre propre moteur. Aucun contenu protégé appartenant à une marque tierce n'est reproduit.

8. CE QUE L'ACHAT INTÉGRÉ PERMET D'OBTENIR, ET OÙ LE TROUVER
Deux abonnements auto-renouvelables, exclusifs l'un de l'autre :
  Premium mensuel, 9,99 € par mois
  Premium annuel, 59,99 € par an
Essai gratuit de 3 jours pour les nouveaux abonnés.

Ce que l'abonnement débloque : usage illimité des analyses (la version gratuite fonctionne avec un nombre de crédits quotidien), le score de compatibilité détaillé avec le profil de peau, et les analyses personnalisées par intelligence artificielle.

Comment y accéder dans l'application :
  Chemin principal : onglet Profil, carte Premium, onglet « Plans ».
  Second chemin : à la fin de l'inscription, un écran d'offre est présenté. Il est librement ignorable par le bouton « Plus tard ».

L'écran d'abonnement affiche avant tout achat : le titre de chaque offre, sa durée, son prix, la durée de l'essai gratuit, le bouton « Restaurer mes achats », ainsi que les liens vers les conditions d'utilisation (https://cosme-check.com/cgu) et la politique de confidentialité (https://cosme-check.com/privacy).

Ces informations ont également été ajoutées au champ Notes de la section App Review Information pour les prochaines soumissions.

Cordialement,
Brian Biendou
```

---

## À faire aussi, pendant qu'on y est

- **Recopier ce même texte dans le champ Notes** de App Review Information, comme Apple le
  demande en fin de courrier. Sinon le prochain envoi repart au même endroit.
- **Vérifier que les prix collent** : `REVENUCAT_INTEGRATION.md` mentionne encore
  `cosmecheck_monthly` à 4,99 €, alors que la fiche annonce 9,99 €. Le prix cité dans la
  réponse doit être exactement celui déclaré dans App Store Connect, un écart est un
  aller-retour de revue garanti.
- **Point de vigilance sur les captures, règle 2.3.3** : les 9 captures en ligne sont des
  maquettes générées, pas des captures de l'app en fonctionnement. Apple rappelle
  justement cette règle dans son pied de page. Ce n'est pas le motif du rejet actuel, mais
  c'est un motif possible du prochain. Des captures réelles prises sur l'appareil, même
  habillées d'un texte d'accroche, ferment ce risque.
