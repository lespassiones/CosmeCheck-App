# PROMPT — Génération des maquettes Figma « Cosme Check » (mobile, ~40 écrans)

> **Comment l'utiliser :** copie TOUT le bloc ci-dessous (à partir de « Tu es… ») et colle-le dans ChatGPT (connecté à Figma). Il contient tout le nécessaire ; ne rien y ajouter d'autre.

---

Tu es **Lead Product Designer + Growth/Conversion designer** (niveau top studio : Yuka, Revolut, Headspace, Cal AI). Tu maîtrises l'UX mobile, le design system, la psychologie de conversion et le motion. Tu vas concevoir dans **Figma** l'intégralité des maquettes **mobiles** d'une application réelle : **Cosme Check**. Objectif : une app **magnifique, ultra-ergonomique et qui convertit**, où **aucun utilisateur n'a besoin qu'on lui explique où sont les choses**.

## 0. Règle d'or (liberté)
Je te donne **les fonctionnalités** (ce que l'app sait faire) et **ma charte couleur**. Je ne t'impose **NI la mise en page, NI l'organisation des écrans, NI la navigation, NI le nombre d'écrans par fonctionnalité**. Tu es **totalement libre** de :
- regrouper/séparer les fonctions comme bon te semble,
- inventer l'architecture d'information, les parcours et la navigation (barre d'onglets, gestes, hubs, etc.),
- créer les écrans, états et transitions que tu juges optimaux.
**Seule contrainte de fond :** chaque fonctionnalité listée en §5 doit **exister** et être **atteignable facilement et intuitivement** quelque part dans le produit. Applique **les meilleures pratiques marketing / UX / conversion** pour arriver au meilleur résultat possible.

## 1. Le produit (positionnement)
Cosme Check, c'est **« le Yuka de la cosmétique », mais personnalisé** : l'utilisateur scanne/recherche un cosmétique, l'app **décrypte la composition INCI**, donne un **score de qualité** ET un **score de compatibilité avec SON profil** (type de peau, cheveux, préoccupations, objectifs, ingrédients à éviter), propose des **alternatives plus saines**, vérifie si les **promesses marketing** du produit tiennent face à la formule réelle, et offre un **conseiller beauté IA** qui recommande de vrais produits adaptés. Modèle **freemium** : gratuit (scan + lecture) + **crédits** pour les fonctions IA + **abonnement Premium** (analyse personnalisée illimitée).
**Cible :** grand public FR soucieux de ce qu'il met sur sa peau (majorité de femmes 18-45, mais universel). **Ton :** bienveillant, rassurant, expert mais zéro jargon, « comme un pharmacien de confiance ».

## 2. Contraintes NON négociables
- **Langue : français** pour 100 % des textes (vrais libellés, jamais de lorem ipsum).
- **Light mode UNIQUEMENT.** Pas de dark mode, jamais. Fonds clairs, tout respire.
- **Format mobile** : cadres **390 × 844** (iPhone 13/14), respecter safe-areas (encoche haut, home-indicator bas). Penser « pouce » : actions primaires en bas, atteignables d'une main.
- **Palette imposée** (cf. §3) — tu peux jouer les nuances/dégradés, mais l'ADN couleur reste celui-ci.
- **Typo : Inter** (Regular / Medium / SemiBold / Bold).
- N'invente **pas** de fonctionnalités hors de la §5 (mais tu peux inventer la façon de les présenter).

## 3. Charte couleur (light) & typo
**Base**
- Fond écran `#FAFAFA` · Cartes/surfaces `#FFFFFF`
- Texte principal `#1F2937` · secondaire `#6B7280` · désactivé/placeholder `#9CA3AF` · bordures `#E5E7EB`

**Marque / accents**
- **Rose** (primaire, FAB, CTA forts) `#F43F5E` · foncé (pressed) `#E11D48` · rose clair (fonds) `#FFE4E6`
- **Violet** (accent secondaire, IA/Advisor) `#8B5CF6` · foncé `#7C3AED` · clair `#EDE9FE`
- **Vert succès / CTA d'action** (analyser, enregistrer, promesse) `#16A34A` · foncé `#15803D`
- Crème premium (fonds « hero » Premium) `#FDF6EC`

**Système de notation (qualité ingrédient / produit)** — 4 niveaux :
- Vert `#16A34A` (fond `#DCFCE7`) · Jaune `#CA8A04` (fond `#FEF9C3`) · Orange `#EA580C` (fond `#FFEDD5`) · Rouge `#DC2626` (fond `#FEE2E2`)
- Pour les **jauges/donuts/spectre de score**, palette plus vive : vert `#10B981`, jaune `#FBBF24`, orange `#FB923C`, rouge `#F43F5E`, vide `#E5E7EB`.

**Verdicts « promesses »** : tenue `#10B981` · partielle `#FBBF24` · marketing `#FB923C` · non démontrée `#EF4444` · contredite `#DC2626`.

**Feedback** : info `#2563EB`, warning `#CA8A04`, erreur `#DC2626`.

**Typo (échelle)** : titres 32/28/24/20, corps 16, labels 14, small 12, xs 11 ; titres en SemiBold/Bold avec letter-spacing légèrement négatif ; corps en Regular/Medium. Hiérarchie claire, généreuse.

**Direction visuelle (inspiration, non imposée)** : cartes blanches à coins bien arrondis + ombres douces ; boutons « pilule » (coins pleins) ; icônes en trait fin ; beaucoup d'espace blanc ; micro-illustrations rondes et positives ; visualisation des scores par **jauge/demi-donut animé**, **notes en étoiles**, **pastilles colorées** et **spectre de carrés** colorés. Tu peux réinterpréter tout cela — garde juste l'esprit doux, premium, rassurant.

## 4. Objectifs UX & conversion (à appliquer partout)
- **Onboarding qui active** : bénéfice clair dès le 1er écran, « aha moment » rapide, réduire la friction, personnalisation perçue (profil beauté), demande de permissions au bon moment (jamais brutale).
- **1re valeur avant le mur** : laisse goûter la valeur (score, lecture) gratuitement ; le **paywall/premium** arrive à un pic d'envie (ex. « score de compatibilité personnel » flouté avec cadenas → « Débloquer avec Premium »).
- **Monétisation soignée** : paywall clair (annuel mis en avant avec % d'économie, essai gratuit, réassurance « sans engagement »), rappel discret des **crédits**, moments d'upsell contextuels et non intrusifs, valeur « gratuit vs Premium » lisible.
- **Rétention** : astuce du jour, quizz/idées reçues, notifications opt-in, favoris, historique.
- **Clarté cognitive** : un objectif principal par écran, CTA primaire évident (couleur pleine), hiérarchie visuelle forte, empty states encourageants (jamais un cul-de-sac : toujours une action proposée), états de chargement rassurants, messages d'erreur humains avec bouton « Réessayer ».
- **Confiance** : ton pédagogue, sources/faits, disclaimer médical léger, RGPD visible, jamais anxiogène.
- **Accessibilité** : contrastes AA, cibles tactiles ≥ 44px, textes lisibles.

## 5. INVENTAIRE COMPLET DES FONCTIONNALITÉS (le cœur du brief)
Tout ceci doit exister et être accessible. La **présentation et la navigation sont libres**.

### A. Entrée, compte & onboarding
- **Intro/pré-onboarding** au 1er lancement : quelques slides illustrés qui expliquent la promesse (décrypter ses cosmétiques, score perso, alternatives). *(Tu dois GÉNÉRER les illustrations — cf. §6.)*
- **Authentification** : créer un compte (email + mot de passe **et** « Continuer avec Google »), se connecter, mot de passe oublié (email de réinitialisation), définir un nouveau mot de passe avec **checklist de règles en temps réel**.
- **Onboarding profil beauté** (questionnaire court, 1 question par étape) : type de peau (visage), type de peau (corps), état des cheveux, préoccupations (peau + cheveux, choix multiples + « autre »), objectifs (visage/corps/cheveux/routine + « autre »), opt-in notifications. Progression visible, ton chaleureux (« Bonjour {prénom} »), note RGPD/données santé. Modifiable à tout moment.

### B. Analyser un produit (multi-méthodes)
- **Scanner un code-barres** (caméra plein écran, viseur) → aperçu instantané du produit (image, marque, nom, score, répartition des ingrédients) → ouvrir l'analyse. Gérer « produit non trouvé » (proposer de contribuer en prenant 2 photos).
- **Coller la composition** manuellement (nom optionnel + liste INCI, compteur d'ingrédients en direct, exemple).
- **Rechercher un produit** dans le catalogue : grille de **catégories**, sous-catégories, parcours paginé, **recherche texte** instantanée ; si rien en base → **recherche approfondie sur internet** (coûte 1 crédit).
- *(Prévoir aussi, même si secondaires : analyse par photo/OCR de l'étiquette, et import par lien/URL produit.)*
- Pendant l'analyse : overlay rassurant « On décode la composition… ».

### C. Résultat d'analyse (écran cœur — le plus important)
Pour chaque produit analysé, l'app présente :
- **Identité produit** : image, nom, catégorie, marque.
- **Score de qualité de la composition** (note globale, ex. 5 étoiles / jauge) reflétant la propreté de la formule.
- **Score de compatibilité avec MON profil** (%, avec explication IA « ce qu'il faut retenir ») — **fonction Premium** : montrée floutée + cadenas si non-premium (déclencheur de conversion) ; si profil incomplet → invite à le compléter.
- **Alerte restrictions** : « contient N de tes ingrédients à éviter » (rouge) ou « aucun » (vert).
- **Détail complet gratuit** (dépliable) : ratio d'ingrédients reconnus, verdict en chiffres, **spectre coloré** des ingrédients (taper un ingrédient → sa fiche), observations (ce qui est présent/absent), **allergènes UE** détectés.
- **Liste complète des ingrédients** (avec filtres par couleur de tolérance) → chaque ingrédient ouvre sa **fiche** (nom, tolérance, fonction, description « à savoir », explication IA).
- **Alternatives plus saines** (carrousel façon Yuka) + voir toutes les alternatives (grille).
- **Actions** : ajouter à ma routine, analyser la promesse marketing, partager, signaler un souci / envoyer une photo.
- **Comparer 2 produits** : côte à côte, avec un gagnant mis en avant + conseils IA « comment choisir ».

### D. Promesses vs Formule (anti-greenwashing)
- Lancer une analyse de **cohérence** : choisir la source du produit (recherche / scan / historique / coller la promesse) → l'IA identifie le produit et sa promesse marketing → compare à la formule réelle → **verdict global** (% + anneau coloré) + **liste des promesses** (tenue / partielle / marketing / non démontrée / contredite) + conclusion + indice marketing. Historique de ces analyses (liste avec anneau de score, suppression par appui long).

### E. Ma routine
- **Ajouter des produits** à sa routine (depuis scan ou historique), régler la **fréquence** d'usage (quotidien/hebdo/mensuel), voir la fiche/analyse de chaque produit, retirer un produit.
- **Score d'exposition cumulée** de la routine (/20, jauge + répartition), exposition par **famille d'ingrédients**, alerte **allergènes en doublon** entre produits.
- **Favoris** (produits mis de côté).
- **Suggestions d'alternatives** pour améliorer sa routine (garder / comparer / ouvrir).
- **Couverture des objectifs** : dans quelle mesure la routine répond aux objectifs beauté de l'utilisateur.

### F. Beauty Advisor (conseiller IA — chat)
- Chat IA qui s'appuie sur le **profil + la routine** de l'utilisateur, en français simple, et **recommande de vrais produits notés** adaptés au besoin (déodorant, crème visage, anti-taches, etc.), en respectant automatiquement ses restrictions. Affiche des **cartes produits vérifiées** sous la réponse. Historique des conversations, nouvelle conversation, résumé de profil repliable. Écran dédié « produits recommandés » (grille).

### G. Historique & découverte
- **Historique** des analyses (recherche par produit OU ingrédient, filtre favoris, renommer/supprimer, comparer 2).
- **Accueil / hub** : accès rapide à la dernière analyse, à la routine, à l'advisor, aux promesses ; **astuce du jour** ; **quizz / idées reçues** du jour ; sélections de produits.

### H. Profil, réglages & légal
- **Profil** : identité (prénom, email, statut d'abonnement), édition du profil beauté (peau / cheveux / objectifs), **réglages de notifications**, se déconnecter, supprimer son compte.
- **Mes restrictions** : ingrédients & familles d'ingrédients à éviter — édition manuelle **+ restrictions probables déduites par l'IA** (lecture seule, indicatives) que l'utilisateur peut adopter.
- **Crédits & fonctionnalités** : écran pédagogique expliquant ce qui est **gratuit** (scan, lecture, routine, historique, fiches), ce qui coûte **1 crédit** (analyse perso, promesse, message advisor, alternatives, comparaison, recherche internet) et **3 crédits** (couverture des objectifs) ; CTA Premium.
- **Premium / Paywall** : présenter la valeur, plans **mensuel & annuel** (annuel recommandé, % d'économie, essai gratuit, réassurance), restaurer ses achats, et un état « Tu es Premium » avec gestion/annulation.
- **Écrans légaux** : CGU, Confidentialité, Mentions légales, À propos (+ avertissement médical + version de l'app).

## 6. Illustrations & images à GÉNÉRER
Génère toi-même les visuels nécessaires, style **cohérent, doux, premium, positif, light** (aquarelle/gradient délicat rose-violet, formes organiques, personnages inclusifs et divers, aucun texte incrusté dans l'image sauf si voulu) :
- 3-4 **illustrations d'onboarding/intro** (décrypter un produit, score personnalisé, alternatives/routine, conseiller IA).
- Petites **icônes/illustrations rondes** pour les tuiles du hub, catégories, empty states, hero du paywall (une jauge/score valorisante), badge Premium (diamant/étoile).
- Un **logo/marque** « Cosme Check » simple (flacon/goutte + coche), déclinable.
Cohérence : même palette (§3), même trait, ambiance rassurante.

## 7. Livrable Figma attendu
- **≈ 40 cadres mobiles** (390×844), nommés clairement, **regroupés par parcours** (sections/pages Figma : Onboarding & Compte, Accueil & Navigation, Scan & Analyse, Ingrédients & Alternatives, Promesses, Routine, Beauty Advisor, Profil & Premium, Légal, États & Composants).
- Couvre au minimum : **le parcours d'onboarding illustré**, l'auth (welcome/connexion/inscription/mot de passe oublié), le **hub d'accueil + la navigation**, les méthodes de scan (dont l'écran caméra + l'aperçu résultat), **l'écran d'analyse dans ses 2 versions clés (gratuit/teaser vs Premium débloqué)**, une **fiche ingrédient**, les **alternatives**, la **comparaison**, la **liste + le détail des promesses**, la **routine (hub + produits + exposition + favoris)**, le **chat Advisor + recommandations**, le **profil**, **mes restrictions**, **crédits & fonctionnalités**, le **paywall (plans + état Premium)**, un **écran légal**. La **répartition exacte est libre** ; ajoute les **états** qui valorisent le produit (empty, loading, locked/cadenas, succès, erreur).
- Fournis en plus : une **mini-map des parcours** (flow) et un **mini design system** (couleurs, typo, boutons, cartes, chips de score, jauges) pour montrer la cohérence.
- Chaque écran doit être **auto-explicatif** : à sa seule vue, on comprend quoi faire.

## 8. À NE PAS faire
- Pas de dark mode. Pas d'anglais. Pas de lorem ipsum. Pas d'écrans anxiogènes ou culpabilisants.
- Ne te bride pas sur la créativité de mise en page : **réorganise, réinvente la navigation, surprends** — tant que toutes les fonctionnalités du §5 existent et restent évidentes à trouver.

**Commence maintenant** : propose d'abord (très bref) ton architecture d'information + la liste des ~40 cadres regroupés, puis génère les maquettes et les illustrations dans Figma. Priorise la beauté, la clarté et la conversion.
