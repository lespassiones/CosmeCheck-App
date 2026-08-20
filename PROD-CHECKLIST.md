# CosmeCheck, le chemin jusqu'aux magasins

**Arrêté le 20/08/2026.** Ce fichier remplace `PLAY_STORE_DEPLOYMENT_GUIDE.md`, écrit
le 8 juillet, qui listait comme « à faire » des choses depuis livrées et qui ignore le
fait principal ci-dessous. Même esprit que le `PROD-CHECKLIST.md` de RevealChat : ce qui
est vérifié, ce qui reste, et pourquoi chaque étape débloque la suivante.

---

## 0. Le constat qui change tout le plan

### Play Store : l'app est **déjà en ligne**, vérifié et non supposé

Lu le 20/08/2026 par l'API Google Play (compte de service `revenuecat@cosme-check`) et
par la page publique du magasin, pas par souvenir :

| Ce qui est constaté | Valeur |
|---|---|
| Piste **production** | version `21 (1.0.0)`, statut **`completed`**, notes de version fr-FR présentes |
| Page publique | `play.google.com/store/apps/details?id=com.cosmecheck.app` répond **200** avec un bouton **Installer** et la catégorie **Beauté** |
| Fiche fr-FR | titre « cosmecheck: scan cosmétique », description courte 73 caractères, description longue 2 249 caractères |
| Visuels | **8 captures téléphone**, 8 captures 7 pouces, 1 graphique de mise en avant, 1 icône |
| Abonnements | `premium_monthly` (offre `monthly`) et `premium_yearly` (offre `yearly`), les deux **ACTIVE** |
| Autres pistes | alpha `19 (1.0.0)`, interne `6 (1.0.0)`, bêta vide |
| Binaires déposés | 11 AAB, du versionCode 2 au **21** |
| Contacts fiche | `contact@cosme-check.com`, `https://www.cosme-check.com`, téléphone renseigné |

**Conséquence directe : « mettre l'app sur le Play Store » est fait.** Il n'y a pas de
plan de publication Android à écrire, il y a un plan de **protection** de ce qui tourne
déjà, et il tient dans la section 5. Un point y est plus grave que tous les autres
réunis, la clé de signature, et il se traite aujourd'hui, pas la semaine prochaine.

### App Store : rien n'existe encore

Ta capture d'App Store Connect ne montre que **RevealChat**. Côté CosmeCheck, aucune
fiche, aucun identifiant d'app, aucun dossier `ios/` dans le dépôt, et surtout **aucune
connexion Apple dans le code**, ce qui est un rejet automatique dès la première
soumission. C'est là qu'est le travail réel, et c'est l'objet des sections 2 à 4.

Le compte développeur Apple étant maintenant ouvert, le chemin est le même que pour
RevealChat, à trois différences près qui changent des étapes :

| | RevealChat | CosmeCheck |
|---|---|---|
| Modèle économique | consommables (crédits, quiz) | **abonnements auto-renouvelables** (mensuel, annuel), donc groupe d'abonnement, offre d'essai, et notifications serveur qui comptent vraiment |
| Permissions natives | aucune | **caméra et photothèque**, donc des justifications à écrire pour le relecteur |
| Données sensibles | extraits de conversation | **type de peau, acné, rougeurs, peau atopique**, donc une question à trancher sur l'étiquette de confidentialité (voir étape 20) |

---

## 1. Ce qui est déjà écrit, et qui ne dépend plus de personne

Vérifié dans le code le 20/08/2026, fichier par fichier.

| Élément | État | Preuve |
|---|---|---|
| Identifiant de paquet unique aux deux magasins | ✅ `com.cosmecheck.app` déjà figé côté Android, déjà écrit dans `ios.bundleIdentifier` | [app.json](app.json) |
| `ios.buildNumber` | ✅ `"1"`, présent. Avec `appVersionSource: "local"` il est obligatoire, sinon le premier build iOS refuse de démarrer | [app.json](app.json), [eas.json](eas.json) |
| Déclaration de chiffrement | ✅ `ITSAppUsesNonExemptEncryption: false`. Sans elle, App Store Connect repose la question à chaque envoi | [app.json](app.json) |
| Textes de permission iOS | ✅ caméra et photothèque, en français, explicites | [app.json](app.json) |
| iPad | ✅ `supportsTablet: false`, donc **aucune capture iPad à produire** | [app.json](app.json) |
| RevenueCat, clé iOS | ✅ le code lit déjà `EXPO_PUBLIC_REVENUCAT_IOS_KEY`, avec repli. Il ne manque **que la valeur** | [lib/revenucat/client.ts:14](lib/revenucat/client.ts#L14) |
| RevenueCat, garde anti-crash | ✅ pas d'init en release si la clé est absente ou de test. Les achats restent inertes, l'app ne ferme pas | [lib/revenucat/client.ts:35](lib/revenucat/client.ts#L35) |
| Webhook RevenueCat | ✅ Edge Function `revenucat-webhook` déployée, bascule `user_profiles.tier` | [supabase/functions/revenucat-webhook](supabase/functions/revenucat-webhook) |
| Écran d'offre conforme 3.1.2 | ✅ prix et durée affichés, « Renouvellement automatique sauf annulation 24 h avant », lien Conditions d'utilisation, lien Confidentialité, **Restaurer mes achats** | [app/offre/index.tsx:309-325](app/offre/index.tsx#L309-L325) |
| Suppression du compte dans l'app | ✅ Profil, « Supprimer mon compte », Edge Function `delete-account`. **Apple l'exige** (5.1.1 v) | [app/profile/index.tsx:311](app/profile/index.tsx#L311) |
| Politique de confidentialité publique | ✅ `https://cosme-check.com/privacy` répond, et déclare les sous-traitants (Supabase, Vercel, Google, OpenAI, Mistral, Stripe, PostHog, Brevo) | vérifié en ligne |
| Écrans légaux dans l'app | ✅ CGU, confidentialité, mentions, à propos, avertissement médical | [app/legal/](app/legal/) |
| Aucun paiement hors magasin dans l'app | ✅ vérifié : Stripe n'est cité que dans un commentaire côté web. Aucun lien d'achat externe, donc rien qui viole 3.1.1 | [app/offre/index.tsx:13](app/offre/index.tsx#L13) |
| Sentry | ✅ plugin configuré sur le projet `cosme-check`, init au boot | [app.json](app.json), [lib/reporting/report.ts](lib/reporting/report.ts) |
| Avis dans l'app | ✅ `expo-store-review` en chargement paresseux, `SKStoreReviewController` sur iOS sans une ligne à changer | [lib/review/storeReview.ts](lib/review/storeReview.ts) |

**Ce qui n'est pas spécifique à Android dans le produit :** rien, sauf la caisse. Le scan
de code-barres passe par `expo-camera`, l'OCR par `expo-image-picker`, les deux ont leur
équivalent natif iOS sans code à écrire.

---

## 2. Le seul blocage de code : la connexion Apple

**Règle 4.8 de l'App Store : dès qu'une connexion tierce est proposée, Apple doit l'être
aussi.** CosmeCheck propose Google, et un seul bouton dans toute l'app
([app/(auth)/welcome.tsx:137](app/(auth)/welcome.tsx#L137)). Sans bouton Apple, le rejet
est automatique et ne coûte pas un aller-retour de revue, il en coûte deux.

Ce qu'il faut écrire, et dans cet ordre :

1. `npx expo install expo-apple-authentication`, puis `ios.usesAppleSignIn: true` dans
   `app.json`. C'est ce drapeau qui pose l'habilitation `com.apple.developer.applesignin`
   au build, sans lui la feuille système ne s'ouvre pas.
2. Un bouton **iOS seulement** dans `welcome.tsx`, à côté du bouton Google, au format
   imposé par Apple (fond noir ou blanc, logo officiel, libellé « Continuer avec Apple »).
   Sur Android il ne s'affiche pas : il n'y a pas de feuille native là-bas, et une porte
   web de plus à maintenir pour un usage que personne ne demande.
3. Le flux **natif**, pas le navigateur : `AppleAuthentication.signInAsync()` puis
   `supabase.auth.signInWithIdToken({ provider: 'apple', token })`. On ne réutilise pas le
   détour `expo-web-browser` de Google : Apple refuse une feuille web quand la native
   existe.
4. ⚠️ **Le prénom d'Apple ne se donne qu'une fois.** `fullName` n'est renvoyé qu'à la
   **toute première** autorisation, jamais ensuite, sur aucun appareil. Il doit être
   enregistré dans `user_profiles.first_name` **avant** tout autre `await` susceptible
   d'échouer. C'est la faute la plus commune de cette intégration, et elle est
   irréversible pour l'utilisateur concerné.
5. Côté Supabase, activer le fournisseur Apple avec `client_id = com.cosmecheck.app`.
   ⚠️ **Laisser le secret vide, c'est correct** : il ne sert qu'au parcours web (Sign in
   with Apple JS), qui expire tous les six mois. Notre connexion est native, elle ne s'en
   sert jamais.
6. Le même filet que Google au retour : `needsOnboarding = !onboardingShown &&
   !isProfileComplete` (`_layout.tsx`) marche déjà pour les deux fournisseurs, il n'y a
   rien à y toucher.

**Charge estimée : une demi-journée**, tests compris. C'est le seul chantier de code du
plan. Tout le reste se passe dans des consoles.

---

## 3. Le chemin App Store, étape par étape

L'ordre n'est pas cosmétique : chaque bloc débloque le suivant, et le bloc A est le plus
lent parce qu'il dépend d'une validation bancaire et fiscale qu'Apple prend plusieurs
jours à faire.

### Bloc A, chez Apple, et rien ne marche avant

| # | Qui | Quoi | Débloque |
|---|---|---|---|
| **1** | ~~Toi~~ | ✅ **Déjà actif, constaté le 20/08/2026 dans Business.** Contrat applications payantes **Actif** (19 août 2026 au 19 août 2027), contrat applications gratuites **Actif**, compte bancaire `BIENDOU BRIAN (4044)` **Actif** (France, EUR, redevances USD), `U.S. Form W-8BEN` **Actif** et `U.S. Certificate of Foreign Status` **Actif**, les deux envoyés le 19 août. Numéro de vendeur **94728527**, 175 pays ou régions. ⚠️ **Ces lignes sont au niveau du COMPTE, pas de l'app** : elles ont été remplies pour RevealChat et couvrent CosmeCheck sans un geste de plus. C'était le point le plus lent du plan, il est derrière nous | les achats, y compris en bac à sable, sur **toutes** les apps du compte |
| **2** | ~~Toi~~ | ✅ **DAC7 Actif le 20/08/2026** (« Directive relative à la coopération administrative, 7e révision », 27 pays). La réponse donnée à « services personnels » était **Non**, et c'est la bonne : la directive vise les plateformes qui mettent en relation un prestataire et un client, alors que nous vendons notre propre production logicielle | la soumission d'une app neuve, qu'Apple refuse sans ça |
| **2b** | Apple | ⚠️ **« La législation sur les services numériques » est En cours de vérification** depuis le 19/08/2026 (27 pays). C'est le DSA, et c'est Apple qui valide l'identification de commerçant. **Rien à faire**, et rien à relancer. Ce qu'il faut savoir : tant que ce n'est pas validé, la **distribution dans l'Union** peut être retenue, même si la soumission passe. Même état que sur RevealChat, donc c'est la file d'attente d'Apple et pas un dossier incomplet | la distribution en Europe |
| **3** | Toi | **Identifiant d'app** `com.cosmecheck.app` dans le portail Apple (Certificates, Identifiers & Profiles), avec les capacités **Sign in with Apple** et **Push Notifications** | les habilitations natives au build. Sans elles, Xcode refuse de signer |
| **4** | Toi | **Fiche App Store Connect** : nom « Cosme Check » (30 caractères max), sous-titre, langue par défaut français, catégorie principale **Style de vie**. ⚠️ **Pas Médecine, pas Santé et forme** : la catégorie médicale déclenche une revue bien plus dure sur les affirmations produit | tout ce qui suit, et l'`ascAppId` dont EAS a besoin |
| **5** | Toi | **Clé d'API App Store Connect**, rôle **Admin**, dans Utilisateurs et accès > Intégrations. C'est l'équivalent Apple du compte de service Google Play : elle remplace ton mot de passe et laisse EAS créer les certificats, les profils, et déposer les binaires sans intervention. ⚠️ Rôle Admin et non App Manager : c'est lui qui autorise la gestion complète des certificats, et un rôle trop étroit échoue **au milieu** d'un build avec un message qui ne parle pas de droits | tous les builds iOS, sans exception |

### Bloc B, la caisse iOS

| # | Qui | Quoi | Débloque |
|---|---|---|---|
| **6** | Toi | **Clé APNs** (.p8), environnement **Sandbox & Production**, portée équipe. ⚠️ Ces deux réglages ne sont **pas modifiables après coup** et le compte n'autorise que deux clés vivantes. « Production seul » interdirait tout test de notification sur un build de développement, en silence | les notifications iOS, que `push-dispatch` envoie déjà côté Android |
| **7** | Toi | **Clé Achat intégré** (.p8), un **autre type de clé** que celle du point 5. ⚠️ Elle n'est pas optionnelle : l'app est sur `react-native-purchases` v10, donc StoreKit 2, où une transaction **ne s'enregistre pas du tout** sans cette clé. L'utilisateur paierait sans rien recevoir. ⚠️ Ne pas remplir le « secret partagé » à la place, il est marqué *Legacy* chez RevenueCat et les deux se contredisent | l'encaissement iOS |
| **8** | Toi | **Les deux abonnements dans App Store Connect**, identifiants **identiques à Google Play** : `premium_monthly` et `premium_yearly`, dans un **même groupe d'abonnement** (sinon on ne peut pas passer de mensuel à annuel sans résilier), prix alignés sur 7,99 €/mois et 49,99 €/an, essai gratuit 3 jours en offre d'introduction. ⚠️ **Un identifiant qui diverge encaisse un paiement sans rien créditer.** C'est la doctrine : un identifiant unique du magasin jusqu'à la base. ⚠️ Vérifier que les paliers de prix Apple contiennent exactement 7,99 et 49,99, sinon **ne pas choisir un voisin de ta propre initiative**, me le dire | la revue des produits, qui exige aussi une capture par produit |
| **9** | Toi | **App iOS chez RevenueCat, dans le MÊME projet que l'Android** (pas un projet neuf, sinon l'utilisateur premium sur Android redevient gratuit sur iOS). Y déposer la clé Achat intégré du point 7, relever la clé publique `appl_…`, rattacher les deux produits à l'entitlement **`premium`** (vérifier au passage que la clé de recherche est bien `premium` et pas « Cosme Check Pro », le code compare à `user_profiles.tier`), et coller l'**URL de notification du serveur App Store** en **Production ET en Sandbox** | l'octroi du premium sur iOS, et le signalement des remboursements |

### Bloc C, le code

| # | Qui | Quoi | Débloque |
|---|---|---|---|
| **10** | Claude | **Connexion Apple**, section 2 ci-dessus | la conformité 4.8, donc la possibilité d'être accepté |
| **11** | Claude | `EXPO_PUBLIC_REVENUCAT_IOS_KEY=appl_…` dans le `.env`, **et** en variable d'environnement EAS (portée projet, visibilité publique, environnement production). Le code la lit déjà | un binaire qui sait encaisser. Sans elle le build part avec une caisse muette, et le défaut ne se voit qu'au moment de payer |
| **12** | Claude | **`eas.json`** : ajouter le profil d'envoi iOS (`appleId`, `ascAppId`, `appleTeamId`) et le bloc `ios` du profil `production`. Aujourd'hui `submit.production` ne connaît qu'Android, et `track: "internal"` + `releaseStatus: "draft"` ne correspondent plus à la réalité de production | `eas submit -p ios` |
| **13** | Claude | ⚠️ **Aligner le numéro de version.** App Store Connect crée la fiche en `1.0` par défaut et exige que le build porte **exactement** le numéro de la version soumise. `app.json` dit `1.0.0` : ce sont deux chaînes différentes. Poser la fiche en `1.0.0`, et non l'inverse, pour rester aligné avec Android. Sinon on attend devant un encart Build vide en croyant que le traitement n'est pas fini | la sélection du binaire dans la fiche |
| **14** | Claude | `ios.buildNumber` : décider **maintenant** entre l'incrément manuel dans `app.json` (cohérent avec `appVersionSource: "local"`) et `autoIncrement` côté EAS. ⚠️ Un numéro de build iOS ne se téléverse qu'**une fois**, comme un versionCode Android : le second envoi du même numéro est refusé | des livraisons qui s'enchaînent sans blocage |

### Bloc D, le binaire

| # | Qui | Quoi | Débloque |
|---|---|---|---|
| **15** | Toi | **Le premier build iOS**, en interactif une seule fois, pour accepter la création du certificat de distribution : `eas build -p ios --profile production`. ⚠️ Aucun Mac n'est nécessaire, EAS construit dans le nuage. Le seul coût est la file d'attente du plan gratuit, mesurée à plus de quinze minutes sur RevealChat | tous les builds iOS suivants, non interactifs |
| **16** | Claude | **Audit de secrets sur l'`.ipa` réellement livré** : aucune clé Mistral, OpenAI, `service_role`, Brevo ou Sentry dans le bundle, aucun appel direct à `api.mistral.ai` ni `api.openai.com`, et la clé RevenueCat **iOS** présente. ⚠️ Le nom du bundle change de plateforme : `index.android.bundle` devient `main.jsbundle`. Un contrôle qui échoue pour la mauvaise raison apprend à passer outre | la confiance dans ce qu'on publie |
| **17** | Toi | **TestFlight sur un iPhone réel** : connexion Apple, scan d'un code-barres, OCR d'une photo de dos de produit, un abonnement acheté de bout en bout en bac à sable, une notification reçue, la suppression du compte. ⚠️ **Aucun contournement sous Windows** : le simulateur demande un Mac, un `.ipa` ne s'installe pas ailleurs. Sans iPhone, ni cette vérification ni les captures ne sont possibles, et il faut alors emprunter un appareil | la soumission, et la seule preuve que les chemins natifs marchent |

### Bloc E, la fiche et la revue

| # | Qui | Quoi | Débloque |
|---|---|---|---|
| **18** | Toi + Claude | **Compte de démonstration** pour le relecteur, avec un abonnement premium déjà actif et des crédits. L'app exige un compte dès le premier écran : sans identifiants, le relecteur s'arrête sur `welcome.tsx` et rejette pour app incomplète (2.1). ⚠️ Un compte réel de la base, jamais un code qui contourne le paiement : une porte dérobée serait présente dans le binaire de tous les utilisateurs. Le mot de passe va dans le `.env` central, **jamais dans ce fichier**, qui est suivi par git |
| **19** | Claude | **Notes de revue**, à écrire et à coller dans la fiche. Elles doivent dire trois choses qu'Apple ne devine pas : comment obtenir un résultat **sans avoir de produit cosmétique sous la main** (mode Recherche du catalogue, un EAN d'exemple, un texte INCI à coller en saisie manuelle), pourquoi la caméra et la photothèque sont demandées, et que l'app n'émet **aucun diagnostic médical** (l'avertissement est dans À propos) |
| **20** | Claude + toi | **Étiquette de confidentialité (App Privacy)**, et elle doit dire la même chose que `cosme-check.com/privacy`, qu'Apple recoupe : adresse e-mail, contenu utilisateur (listes INCI, photos d'emballage), historique d'achats, identifiants, journaux de plantage, données d'usage (PostHog). ⚠️ **La question à trancher : le profil peau.** `lib/skin/profile.ts` stocke « acné », « rougeurs », « sensibilité », « très sèche / atopique ». C'est discutable, mais c'est de la donnée de santé au sens d'Apple. **Recommandation : déclarer « Santé »**, liée à l'identité, finalité « fonctionnement de l'app », et **pas** de suivi publicitaire. Sur-déclarer ne coûte rien ; un écart détecté coûte un rejet et une réputation de déclaration approximative |
| **21** | Claude | **Captures iPhone 6,9 pouces** (1 320 × 2 868 ou 1 290 × 2 796, portrait, 3 à 10). ⚠️ Les 8 visuels de la fiche Play sont au format d'un écran Android et Apple exige des **dimensions exactes** : il faut les remettre à l'échelle sans déformation, puis ajouter une bande en haut et en bas, **chacune dans la couleur de son propre bord** échantillonnée sur quelques pixels, ce qui les rend invisibles. Les 8 originaux sont récupérables par l'API Play, donc rien à refaire à la main. Aucune capture iPad, `supportsTablet: false` |
| **22** | Toi | **Classification par âge** (nouvelle grille 4+, 9+, 13+, 16+, 18+), lien vers la politique de confidentialité, URL d'assistance, et ⚠️ **publier** la déclaration de confidentialité : enregistrée ne suffit pas, sans le bouton *Publier* la soumission est refusée pour un motif qui parle de confidentialité et pas de publication |
| **23** | Toi | **Testeur bac à sable** (Utilisateurs et accès > Testeurs Sandbox) pour éprouver l'abonnement avant qu'Apple ne le fasse. Les renouvellements y sont accélérés, un mois vaut quelques minutes |
| **24** | Toi | **Soumettre.** Compter un à trois jours de revue, et prévoir un aller-retour : le premier refus n'est pas un échec, c'est le fonctionnement normal du magasin |

### Bloc F, après l'obtention

| Quoi | Quand |
|---|---|
| `ios.appStoreUrl` dans `app.json`, pour que la demande d'avis ait un repli quand `SKStoreReviewController` n'est pas disponible | dès que l'identifiant de la fiche existe |
| **Programme Apple Small Business** : commission 30 % → 15 % sous le million de dollars de chiffre d'affaires. Inscription dans App Store Connect > Entreprise, effet le mois suivant. ⚠️ Ne pas cocher la section correspondante chez RevenueCat avant d'être inscrit, ça afficherait des revenus nets faux | hors chemin critique, mais c'est de l'argent |
| Retirer les identifiants du compte de démonstration s'ils ont servi à ouvrir des accès élargis | après validation |

---

## 4. Les six motifs de rejet qui nous visent précisément

Les règles générales, tout le monde les lit. Celles-ci concernent **cette app** et se
préparent avant la soumission, pas après le refus.

| Règle | Le risque, pour nous | La parade |
|---|---|---|
| **4.8** Connexion Apple | Google est proposé, Apple ne l'est pas. **Rejet automatique** | Section 2. C'est le seul travail de code du plan |
| **2.1** App complète | L'app exige un compte au premier écran. Le relecteur s'arrête là | Compte de démonstration, étape 18 |
| **1.4.1** Affirmations de santé | On note des cosmétiques et on parle de peau, d'acné, de sensibilité. Un relecteur peut y lire un diagnostic | Avertissement médical déjà écrit dans À propos, à **citer dans les notes de revue** (étape 19), et catégorie Style de vie et non Médecine |
| **5.2.1 / 4.1** Propriété intellectuelle | Le catalogue affiche des **marques et des photos de produits** qui ne sont pas les nôtres. Apple pose la question quand une app repose sur des données de tiers | Réponse à préparer : données issues d'Open Beauty Facts sous licence ouverte, plus les photos soumises par les utilisateurs et modérées. À écrire une fois, à garder pour les prochains envois |
| **3.1.2** Abonnements | Une page d'abonnement incomplète est un refus fréquent | Déjà conforme : prix, durée, renouvellement automatique, CGU, confidentialité, restauration. Vérifié ligne à ligne |
| **5.1.1 (v)** Suppression de compte | Obligatoire depuis 2022, et le relecteur la cherche | Déjà dans Profil, avec purge en cascade côté base |

⚠️ **Un piège de configuration, pas de code : le bac à sable.** Le relecteur d'Apple teste
**toujours** un achat, et il le fait en bac à sable. Si un jour un drapeau serveur
refusait les reçus de bac à sable, le paiement passerait chez Apple et rien ne serait
crédité : l'app aurait l'air cassée, et le motif de rejet ne parlerait pas de
configuration. À vérifier dans `revenucat-webhook` avant de soumettre.

---

## 5. Play Store : ce qui reste, et ce n'est pas la publication

### 5.1 ⚠️ Le risque le plus grave de tout le projet : la clé de signature

Le dossier `android/` est **gitignoré**. La clé d'upload
`android/app/cosmecheck-upload.keystore` et son mot de passe (`android/keystore.properties`)
n'existent donc **qu'en un exemplaire, sur ce poste Windows**.

**Perdre ce fichier, c'est ne plus jamais pouvoir mettre à jour une app déjà installée
par le public.** Ce n'est pas une gêne, c'est la fin de la ligne de vie du produit sur
Android, et il n'y a pas de recours en dehors d'une procédure de réinitialisation chez
Google qui n'aboutit pas toujours.

À faire **aujourd'hui**, dans l'ordre, et ça prend dix minutes :

1. ✅ **Fait le 20/08/2026.** `cosmecheck-upload.keystore` et `keystore.properties` copiés
   dans `D:\MesApps\Origma\CosmeCheck`, avec un `LISEZ-MOI.txt` qui porte l'identité de la
   clé et la procédure de restauration. Copies **identiques bit à bit** (`cmp`), et
   l'identité est vérifiée et non supposée : alias `cosmecheck-upload`,
   SHA-256 `38:F5:BB:44:…:38:CE`, **le même que le certificat de l'AAB de release présent
   sur le poste**, celui qui a servi à la version en production.
   ⚠️ **Il reste un trou, et il est nommé dans le LISEZ-MOI** : ce disque est dans la même
   machine que l'original. La copie protège de l'effacement accidentel et de la panne du
   disque C, pas du vol, de l'incendie, ni d'un rançongiciel. Une **troisième copie** dans
   un gestionnaire de mots de passe ou un cloud privé chiffré reste à faire.
2. Vérifier dans Play Console > Configuration > Intégrité de l'app que **Play App Signing**
   est actif, et relever le SHA-256 de la **clé d'application** (celle de Google), pas
   seulement celle d'upload. ⚠️ Cette valeur n'est **pas** lisible par l'API, il faut
   ouvrir la console.
3. Vérifier que ce SHA-256 est bien enregistré dans le client OAuth Android côté Google
   Cloud. Sinon la connexion Google casse **uniquement** sur les installs venues du
   magasin, jamais en développement, ce qui est le pire endroit pour l'apprendre.

### 5.2 Le compte de service Play est trop puissant

`revenuecat@cosme-check.iam.gserviceaccount.com` sert à la fois à RevenueCat et à
`eas submit`, et il porte **l'administration du compte développeur entier**. Une clé de
compte de service n'expire jamais et n'a pas de second facteur, et celle-là est déposée
**chez un tiers**.

Le bon découpage, celui appliqué sur RevealChat, sépare trois rôles :

| Compte | Ce qu'il peut | Ce qu'il ne doit pas |
|---|---|---|
| `revenuecat-cosmecheck` | lire les ventes, gérer les commandes | **publier** |
| `eas-submit-cosmecheck` | déposer sur les pistes, y compris production | **lire les finances** |
| Firebase Admin | envoyer des notifications | tout le reste |

⚠️ **Ne pas réduire les droits de l'actuel à l'aveugle** : il sert peut-être à des envois
automatisés d'une app **en production**. Créer les nouveaux comptes, basculer les usages
un par un, vérifier, et seulement ensuite retirer les droits de l'ancien.

### 5.3 Les notifications temps réel de Google Play, et pourquoi elles comptent ici

Sur RevealChat, Pub/Sub avait été volontairement laissé de côté : le produit ne vendait
que des consommables. **Ce raisonnement ne tient pas pour CosmeCheck**, qui vend des
abonnements. Sans notifications temps réel, RevenueCat interroge Google
périodiquement, et le retard se paie sur exactement ce qui compte : résiliations,
échecs de prélèvement, **remboursements**. Un premium qui reste actif en base après un
remboursement, c'est du service offert sans le savoir.

À faire : activer les notifications de développeur en temps réel dans Play Console
(Monétisation > Configuration) et donner au compte de service RevenueCat l'accès Pub/Sub.

### 5.4 Le formulaire Sécurité des données doit dire la même chose que la politique publiée

Google recoupe les deux, et la politique en ligne déclare huit sous-traitants dont
**PostHog** (mesure d'audience) et deux fournisseurs de modèles. À relire dans la console
et à corriger si le formulaire est plus pauvre que la page : photos d'emballage, listes
INCI, e-mail, achats, journaux de plantage, données d'usage. Ne jamais cocher « aucune
donnée collectée », c'est la déclaration que Google vérifie le plus facilement en
analysant le trafic réel du binaire.

Même question qu'à l'étape 20 sur le profil peau : si on déclare « Santé » chez Apple,
il faut déclarer l'équivalent ici. Deux magasins, une seule vérité.

### 5.5 La chaîne de livraison n'est pas outillée

Aujourd'hui : `gradlew bundleRelease` en local (ce qui marche, contrairement à RevealChat
que `MAX_PATH` bloque), puis un dépôt manuel, puis une diffusion manuelle. `eas.json`
pointe encore `track: "internal"` et `releaseStatus: "draft"`, ce qui ne correspond plus
à une app en production.

Ce qui vaut d'être porté depuis RevealChat, dans l'ordre du gain :

1. Un script `livrer` qui monte le numéro affiché **et** le versionCode, construit, dépose
   et diffuse. ⚠️ La réécriture d'`app.json` doit être **textuelle**, une ligne remplacée,
   et non un `JSON.stringify` de l'objet : réenregistrer le fichier entier réordonnerait
   ses clés et produirait un diff de plusieurs centaines de lignes pour un chiffre.
2. Un script `play etat` qui lit les quatre pistes sans rien changer (celui que j'ai
   utilisé pour la section 0 fait déjà ça).
3. La production protégée par un mot en plus, du genre `--vraiment`. Il ne protège de
   personne, il impose une seconde de réflexion : **une version qui atteint le grand
   public ne se rappelle pas**, elle se remplace par la suivante.

⚠️ **Un versionCode ne se téléverse qu'une fois pour toute l'application**, pas une fois
par piste. Choisir la piste cible **avant** d'envoyer.

### 5.6 Le reste, par ordre décroissant

| Quoi | Pourquoi |
|---|---|
| **Committer `app.json`** | Le dépôt est à `versionCode 21` **non committé**, et 21 est en production. Un `app.json` non committé après une livraison, c'est un numéro qui se perd et un doublon garanti au prochain build |
| `aab-build.log` (56 Ko) traîne à la racine, non suivi | À supprimer ou à ignorer. Un log de build dans un dépôt finit toujours par être committé par accident |
| Source maps Sentry | Le runtime capture, mais sans `SENTRY_AUTH_TOKEN` au build les traces de production sont illisibles. Non bloquant, et pourtant c'est la différence entre « crash chez un utilisateur » et « crash ligne 214 » |
| Fiche en français seulement | Une localisation `en-US` double la surface d'exposition, à froid. À faire quand le reste est calme, jamais avant |
| Pistes alpha 19 et interne 6, orphelines | Inoffensif. À rafraîchir seulement si on reprend un cycle de test fermé |

---

## 6. Qui fait quoi

**Ce que je peux faire sans toi :** la connexion Apple, `eas.json`, la clé iOS dans le
`.env` et chez EAS, l'audit de secrets sur l'`.ipa`, le reformatage des 8 captures, les
notes de revue, les réponses de l'étiquette de confidentialité, les scripts de livraison,
et la lecture de l'état des deux magasins par leurs API.

**Ce que je ne peux pas faire pour toi, et pourquoi :**

| | Pourquoi |
|---|---|
| Le contrat Applications payantes, les formulaires fiscaux, DAC7 | ce sont des engagements juridiques signés par une personne |
| Les clés Apple (.p8 APNs, .p8 Achat intégré, clé d'API) | elles se téléchargent une fois et ne se re-téléchargent jamais. Elles doivent naître chez toi |
| Le certificat de distribution du premier build | une acceptation interactive, une seule fois |
| TestFlight sur un iPhone réel | aucun contournement sous Windows |
| Sauvegarder la clé de signature Android | elle ne doit pas quitter ton contrôle, et c'est justement le point 5.1 |

---

## 7. L'ordre conseillé, jour par jour

Rien n'est parallélisable au début : le bloc A conditionne tout, et Apple est lent.

| Jour | Toi | Claude |
|---|---|---|
| **J0, aujourd'hui** | ✅ 5.1 clé de signature sauvegardée. ✅ étapes 1 et 2 constatées **déjà actives**, le calendrier gagne les jours qui étaient réservés au contrat. Reste à trancher le type d'entité (annexe B §6) avant de créer la fiche | ✅ commit d'`app.json`. Puis connexion Apple (section 2) |
| **J1** | étapes 3, 4, 5 : identifiant d'app, fiche App Store Connect, clé d'API | `eas.json`, alignement des versions, préparation des captures depuis l'API Play |
| **J2** | étapes 6, 7, 8, 9 : APNs, clé Achat intégré, les deux abonnements, RevenueCat iOS | clé `appl_` dans le `.env` et chez EAS, notes de revue, étiquette de confidentialité |
| **J3** | étape 15 : premier build iOS en interactif. Puis TestFlight | audit de secrets sur l'`.ipa` |
| **J4** | étape 17 : l'iPhone réel, les six chemins à éprouver | corrections de ce que l'iPhone aura révélé |
| **J5** | étapes 18 à 24 : compte de démonstration, classification, publication de la déclaration, soumission | captures finales, relecture de la fiche |
| **Après** | 5.2 et 5.3 côté Play : découper le compte de service, brancher Pub/Sub | scripts de livraison |

⚠️ **Le contrat du jour J0 peut prendre plusieurs jours à devenir actif.** Tant qu'il ne
l'est pas, les étapes 7 à 9 peuvent être configurées mais **aucun achat ne peut être
éprouvé**, même en bac à sable. C'est la raison, et la seule, pour laquelle il est en
tête de liste.

---

## 8. Les principes, parce qu'ils tranchent les cas non prévus

1. **Un identifiant unique, du magasin jusqu'à la base.** `premium_monthly` s'appelle
   pareil chez Google, chez Apple, chez RevenueCat et dans le code. Un identifiant qui
   diverge encaisse un paiement sans rien créditer.
2. **Jamais de porte dérobée pour la revue.** Un code qui contourne le paiement serait
   dans le binaire de tous les utilisateurs. Un compte de démonstration réel, avec ses
   droits, est la seule façon propre.
3. **Une déclaration approximative coûte plus cher qu'une déclaration large.** Les deux
   magasins recoupent le formulaire avec la politique publiée et avec le trafic réel.
4. **Une valeur manquante coûte moins cher qu'une valeur inventée.** Si un palier de prix,
   un identifiant ou un rôle n'est pas celui attendu, s'arrêter et demander.
5. **Ce qui atteint le grand public ne se rappelle pas.** Sur les deux magasins, une
   version se remplace, elle ne s'annule pas.

---

## Annexe A, le prompt pour le Claude navigateur

À copier tel quel dans une session qui a un navigateur. Il couvre les blocs A et B, ceux
qui se passent entièrement dans des consoles.

```
Tu as accès à un navigateur. Tu configures les comptes tiers d'une application mobile
React Native / Expo qui s'appelle Cosme Check, pour sa mise en ligne sur l'App Store.
L'app est DÉJÀ en production sur Google Play, ne touche à rien côté Google sauf si je te
le demande explicitement.

CONTEXTE À NE PAS CHANGER
- Nom de l'app : Cosme Check (fiche Play : « cosmecheck: scan cosmétique »)
- Identifiant de paquet : com.cosmecheck.app  (DÉFINITIF, identique sur les deux
  magasins, ne le modifie sous aucun prétexte)
- Schéma d'URL : cosmecheck://
- Site : https://www.cosme-check.com   Contact : contact@cosme-check.com
- Confidentialité : https://cosme-check.com/privacy  (en ligne)
- Projet Supabase : rogesnduejmqpxolhbif
- Éditeur : Brian-Clarky BIENDOU, entrepreneur individuel, SIRET 919 153 189 00015,
  5 Bis rue Vestrepain, 31100 Toulouse
- Ce que fait l'app : elle décrypte la composition (liste INCI) des produits
  cosmétiques, par scan de code-barres, photo de l'emballage, collage d'un lien
  marchand, saisie manuelle, ou recherche dans un catalogue. Elle note le produit et
  le confronte au profil de peau de l'utilisateur. Elle n'émet AUCUN diagnostic
  médical, et l'app le dit explicitement dans son écran À propos.
- Modèle économique : abonnement auto-renouvelable, PAS de consommable.
      premium_monthly   7,99 €/mois
      premium_yearly   49,99 €/an
      essai gratuit 3 jours
  Les deux identifiants existent déjà et sont ACTIFS sur Google Play : ils doivent être
  RECOPIÉS À L'IDENTIQUE côté Apple.
- RevenueCat : un projet « Cosme Check » existe déjà avec l'app Android. L'app iOS doit
  être créée DANS CE MÊME PROJET, jamais dans un projet neuf.
- Entitlement attendu : « premium » (le code compare à user_profiles.tier).

RÈGLES DE TRAVAIL
- Ne devine jamais une valeur. Si une information me concerne (nom légal, IBAN, numéro
  de TVA, palier de prix), arrête-toi et demande-la.
- Ne coche jamais une déclaration légale ou fiscale à ma place sans me montrer d'abord
  ce que tu vas déclarer et pourquoi.
- DONNE LES VALEURS, pas les noms. Chaque identifiant, chaque Key ID, chaque Issuer ID
  doit apparaître EN ENTIER dans le récapitulatif final.
- Les fichiers .p8 se TÉLÉCHARGENT et ne se collent jamais : donne leur nom de fichier.
  Ils ne sont téléchargeables QU'UNE FOIS, dis-le moi avant de cliquer.
- Marque clairement ce qui est SECRET et ce qui est public.

TÂCHE 1 - LE CONTRAT, EN PREMIER PARCE QU'IL EST LENT
App Store Connect > Entreprise : contrat Applications payantes, coordonnées bancaires,
formulaires fiscaux (entrepreneur individuel français, donc W-8BEN), et DAC7. Pour DAC7,
la réponse à « l'une de vos apps fournit-elle des services personnels ? » est NON :
nous vendons notre propre logiciel, il n'y a aucun tiers vendeur. Montre-moi chaque
formulaire avant envoi. Rapporte l'état exact de chaque ligne (Actif / En attente).

TÂCHE 2 - IDENTIFIANT D'APP
Portail Apple Developer > Identifiers : créer l'App ID com.cosmecheck.app avec les
capacités « Sign in with Apple » et « Push Notifications », rien d'autre.

TÂCHE 3 - LA FICHE
App Store Connect > Apps > créer : nom « Cosme Check », langue par défaut français,
plateforme iOS, catégorie principale « Style de vie ». PAS « Médecine » ni « Santé et
forme ». Relève l'Apple ID numérique de la fiche (ascAppId) et le Team ID.
Ne remplis PAS encore les captures, elles sont en préparation.

TÂCHE 4 - LES TROIS CLÉS, ET ELLES SONT DIFFÉRENTES
a. Clé d'API App Store Connect, rôle Admin (Utilisateurs et accès > Intégrations).
   Relève Key ID + Issuer ID, télécharge le .p8.
b. Clé APNs, environnement « Sandbox & Production », portée équipe. ATTENTION : ce
   choix n'est PAS modifiable après coup et le compte n'autorise que deux clés.
c. Clé « Achat intégré » (In-App Purchase). C'est une TROISIÈME clé, distincte des deux
   autres. Sans elle, StoreKit 2 n'enregistre aucune transaction.

TÂCHE 5 - LES DEUX ABONNEMENTS
Dans la fiche : créer un groupe d'abonnement, puis premium_monthly (7,99 €/mois) et
premium_yearly (49,99 €/an), les deux dans CE groupe, avec un essai gratuit de 3 jours
en offre d'introduction. Les identifiants doivent être exactement ceux-là.
Si un palier de prix n'existe pas à l'euro près, NE CHOISIS PAS un voisin : note le
palier disponible le plus proche et demande-moi de trancher.
Dis-moi ce que la console exige comme capture de revue pour chaque produit.

TÂCHE 6 - REVENUECAT
Dans le projet « Cosme Check » EXISTANT : ajouter une app iOS (com.cosmecheck.app),
y déposer la clé Achat intégré .p8, laisser le « secret partagé » VIDE (il est Legacy et
les deux se contredisent), rattacher premium_monthly et premium_yearly à l'entitlement
« premium », et coller l'URL de notification du serveur App Store en Production ET en
Sandbox. Relève la clé publique iOS (appl_...).
Vérifie que la clé de recherche de l'entitlement est bien « premium ».

TÂCHE 7 - UN TESTEUR BAC À SABLE
Utilisateurs et accès > Testeurs Sandbox : en créer un, me donner l'adresse utilisée.

TÂCHE 8 - LE RÉCAPITULATIF
Termine par ce bloc, valeurs complètes, rien après.

    -- PUBLIC --
    APPLE_TEAM_ID              = ...
    ASC_APP_ID                 = ...        (l'identifiant numérique de la fiche)
    BUNDLE_ID                  = com.cosmecheck.app   (confirmé ? oui / non)
    RC_PUBLIC_SDK_KEY_IOS      = appl_...
    RC_IOS_APP_ID              = ...
    ASC_API_KEY_ID             = ...
    ASC_API_ISSUER_ID          = ...
    APNS_KEY_ID                = ...
    IAP_KEY_ID                 = ...

    -- SECRET (à ranger hors dépôt) --
    (toute clé ou valeur secrète créée, avec son nom exact)

    -- FICHIERS TÉLÉCHARGÉS (jamais collés) --
    clé d'API App Store Connect  -> nom du fichier .p8
    clé APNs                     -> nom du fichier .p8
    clé Achat intégré            -> nom du fichier .p8

    -- ABONNEMENTS CRÉÉS --
    identifiant | prix demandé | palier retenu | essai | groupe

    -- ÉTAT DU CONTRAT --
    ligne par ligne, avec Actif / En attente

    -- CE QUI EST BLOQUÉ, ET POURQUOI --
    -- CE QUE JE DOIS DÉCIDER MOI-MÊME --
```

---

## Annexe B, le bloc A champ par champ : contrat, W-8BEN, DAC7

> ✅ **Périmé le 20/08/2026, et gardé exprès.** Tout ce qui suit était **déjà fait** sur ce
> compte, rempli pour RevealChat les 19 et 20 août : contrats, banque, W-8BEN, certificat
> de statut étranger, DAC7, tous **Actifs**. Ces lignes vivent au niveau du **compte** et
> pas de l'app, donc elles ne se refont jamais. Cette annexe reste ici pour deux raisons :
> savoir ce qui a été déclaré et sous quel régime le jour où l'administration le demande,
> et refaire ce parcours sans le réapprendre si un second compte développeur existe un
> jour.

**Où :** `appstoreconnect.apple.com`, onglet **Business** (celui de la capture).

⚠️ **Se connecter avec l'Apple ID titulaire du compte** (Account Holder). Un rôle Admin
voit la section mais **ne peut ni signer un contrat ni saisir des coordonnées bancaires**.
À vérifier dans Utilisateurs et accès si un doute existe : c'est la cause la plus banale
d'un bouton grisé qu'on croit cassé.

### Les valeurs à avoir sous la main avant de commencer

| Donnée | Valeur |
|---|---|
| Entité | Brian-Clarky BIENDOU, entrepreneur individuel |
| Adresse | 5 Bis rue Vestrepain, 31100 Toulouse (adresse physique, jamais une boîte postale) |
| SIREN | 919 153 189 |
| SIRET | 919 153 189 00015 |
| TVA intracommunautaire | FR33919153189 |
| Numéro fiscal personnel | **13 chiffres**, sur ton avis d'impôt. ⚠️ Ce n'est **pas** le SIRET |
| IBAN + BIC | le compte qui recevra les versements |
| Date de naissance | exigée par DAC7 pour une personne physique |

### 1. Le contrat Applications payantes

Business > Accords. La ligne **Applications payantes** porte un bouton *Demander* ou
*Accepter les conditions*. Statut visé : **Actif**.

⚠️ **C'est lui qui fait apparaître les sections bancaire et fiscale.** Tant qu'il n'est
pas signé, il n'y a rien à remplir en dessous, et **aucun achat ne fonctionne, pas même
en bac à sable**.

### 2. Les coordonnées bancaires

Business > Informations bancaires > Ajouter un compte bancaire. IBAN, BIC, devise **EUR**,
adresse de la banque.

⚠️ **Le nom du titulaire du compte doit correspondre à l'entité du compte développeur.**
Un écart, même une abréviation, se solde par un rejet qui arrive plusieurs jours plus
tard, sans explication détaillée.

### 3. Les formulaires fiscaux

Business > Informations fiscales. Trois blocs, tous ne s'affichent pas toujours.

**a. États-Unis, formulaire W-8BEN** (le formulaire des personnes physiques ; une société
remplirait un W-8BEN-E) :

| Champ | Ce qu'on met |
|---|---|
| Nom, pays de citoyenneté | nom civil, **France** |
| Adresse de résidence permanente | l'adresse ci-dessus, telle quelle |
| **Foreign TIN (FTIN)** | le **numéro fiscal à 13 chiffres**. ⚠️ Pas le SIRET, pas la TVA |
| Avantages conventionnels | **cocher**, pays **France**, **article 12 (Redevances)**, taux **0 %** |
| Signature | signature électronique, date, capacité « soi-même » |

⚠️ **Le paragraphe des avantages conventionnels n'est pas décoratif.** Sans lui, les États-Unis
retiennent **30 %** à la source sur les ventes réalisées là-bas. La convention
France-États-Unis ramène ce taux à zéro, mais seulement si la case est cochée.

**b. Certificat de statut étranger**, s'il est demandé : mêmes informations, autre
formulaire.

**c. Autres juridictions** : Apple demande parfois la TVA pour l'Union, et des
déclarations pour le Japon, l'Australie ou le Canada. Pour la France, c'est
`FR33919153189`.

### 4. DAC7

Section ou bandeau propre dans Business. Apple est tenu de collecter, pour l'Union : nom
légal, adresse, **date de naissance**, numéro fiscal, numéro de TVA, identifiant
d'entreprise (SIREN ou SIRET) et État membre de résidence.

**La question qui compte :** « l'une de vos apps fournit-elle des services personnels ? »
Réponse : **Non**. La directive vise les plateformes qui mettent en relation un prestataire
et un client (location, transport, vente de biens, travail à la tâche). CosmeCheck vend sa
propre production logicielle : aucun tiers vendeur à déclarer, donc rien à reporter
trimestriellement.

⚠️ **Sans DAC7 validé, Apple refuse la soumission d'une app neuve** et peut bloquer les
versements. C'est un motif de refus qui ne parle jamais de DAC7.

### 5. Le statut visé, et ce qu'on ne peut pas accélérer

Toutes les lignes de Business doivent afficher **Actif** : le contrat, le compte bancaire,
chaque formulaire fiscal, DAC7. Compter **plusieurs jours**, et il n'y a rien à faire
pendant ce délai à part avancer les étapes 3 à 5 du bloc A, qui n'en dépendent pas.

⚠️ **Aucun achat n'est éprouvable avant.** Ni un achat de production, ni un achat en bac à
sable, ni un achat depuis TestFlight. Un test de paiement lancé trop tôt échoue pour une
raison qui ressemble à un défaut de code, et on cherche dans le code.

### 6. ⚠️ Une décision à prendre dans la même session, parce qu'elle est lente à défaire

**Ce n'est plus une hypothèse, c'est mesuré le 20/08/2026 :**

| Magasin | Nom qui s'affiche au public |
|---|---|
| Google Play | **Biendou Enterprises** (`play.google.com/store/apps/developer?id=Biendou+Enterprises`) |
| App Store | **Brian Biendou**, l'entité du compte Business étant `BRIAN BIENDOU`, personne physique |

Le compte Apple est donc **Individual**, et sur une fiche App Store le vendeur affiché est
le **nom civil**, pas « Cosme Check » ni « Origma ». Passer en **Organization** exige un
numéro **D-U-N-S**, une nouvelle vérification d'identité, et un passage par l'assistance
Apple : ça ne se fait pas confortablement, et surtout pas après la soumission.

L'asymétrie n'a **aucune conséquence technique**, seulement une conséquence d'image : la
même app portera deux éditeurs différents selon le téléphone. À trancher **avant** de
créer la fiche, parce que la conversion pendant une revue est le pire moment possible.

---

## Annexe C, les commandes

```bash
npx tsc --noEmit                                   # doit être 0 erreur
npx jest --config jest.config.js --no-coverage      # la suite

# Android, ce qui marche déjà en local
cd android && ./gradlew bundleRelease               # -> app/build/outputs/bundle/release/
keytool -printcert -jarfile app-release.aab         # vérifier la clé de signature

# iOS, dans le nuage, aucun Mac requis
eas build -p ios --profile production               # la 1re fois en interactif
eas submit -p ios --profile production

# Lire l'état des pistes Play sans rien changer
node scripts/play-etat.mjs                          # pistes, abonnements, fiche, visuels
```

---

*Écrit le 20/08/2026. La section 0 est vérifiée par API et par la page publique du
magasin, la section 1 par lecture du code fichier par fichier. Tout ce qui est marqué
« à vérifier » ne l'a pas été.*
