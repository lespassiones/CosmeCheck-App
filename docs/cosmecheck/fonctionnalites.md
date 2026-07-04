# Toutes les fonctionnalités de CosmeCheck

Liste complète, mobile ET web (sauf mention contraire, tout existe des deux côtés).

## Analyser un produit (le scan)
- **Code-barres** : caméra → EAN → produit + analyse.
- **Photo (OCR)** : photo du dos (INCI obligatoire) + devant (option, marque/nom auto).
- **Saisie manuelle** : coller la liste d'ingrédients.
- **Lien / URL** : coller un lien marchand → récupération auto (image, marque, nom, INCI).
- **Recherche catalogue** : par nom/marque, par catégories et sous-catégories (browse).
- **Recherche approfondie internet** (manuelle, 1 crédit) : si le produit n'est pas au catalogue.

## L'analyse d'un produit
- **Pastille + note** (cœur/feuille/œil/triangle/stop).
- **L'Essentiel** : verdict résumé + restrictions détectées.
- **Synthèse personnalisée IA** (lazy, 1 crédit à la 1ʳᵉ génération, puis gratuite).
- **3 blocs personnalisés** (objectifs / peau / à surveiller) selon le profil.
- **Liste des ingrédients** colorée + modale avec filtres.
- **Alternatives** : produits mieux notés de la même sous-catégorie.
- **Restrictions** : alerte si le produit contient un ingrédient restreint par l'utilisateur.
- **Partage public** : lien web lecture seule d'une analyse.
- **Ajouter à la routine**, **Ajouter aux favoris**.
- **Outils** : signaler une erreur, proposer une photo, « comment c'est noté ».

## Analyse de la promesse (cohérence)
- On identifie la promesse marketing d'un produit et on vérifie si la composition la tient.
- Flux : identification → récupération de la description → analyse de cohérence → verdict (anneau + niveau).
- Cache cross-user : si un autre utilisateur a déjà analysé la même promesse, on sert le résultat sans reconsommer d'IA.

## Routine
- Ajouter des produits, fréquence d'usage.
- **Suggestions intelligentes** : deck de cartes « remplace X par une alternative plus propre » (respecte les restrictions, meilleure note).
- **Simulation** de routine.

## Beauty Advisor (chat IA)
- Conseils personnalisés dans un chat.
- **Recommandations de produits** dans la réponse (via index inversé mot→produit).
- Historique des conversations. 1 crédit par message.

## Ingrédient (fiche)
- Fiche par ingrédient : couleur/tolérance, prévalence, fonctions, traduction FR, statut réglementaire, « expliquer simplement » (IA), répartition par catégorie de produit.

## Historique & profil
- **Historique** dédupliqué (1 produit = 1 ligne), filtre Tout/Favoris, plafond de rétention par tier (gratuit 10 / premium 50, l'analyse de promesse est protégée).
- **Comparaison** de 2 produits.
- **Profil** : peau, préoccupations, **restrictions** (familles d'ingrédients à éviter).
- **Onboarding** en micro-étapes.

## Compte, crédits, premium
- **Crédits** : chaque fonctionnalité IA débite un crédit ; épuisé → page Offre.
- **Premium (RevenueCat)** : paywall, essai gratuit, plans mensuel/annuel.
- **Auth** : email + mot de passe, Google (Apple Sign-In à ajouter côté iOS).

## Contenu & conformité
- Écrans **légaux** (CGU, confidentialité, mentions, à propos) + disclaimer médical.
- **Feature flags + mode maintenance** pilotés à distance (lus au runtime).
- Quiz / idée reçue du jour (dashboard).

## Côté admin (app séparée)
- Une app web d'administration pilote la MÊME base : utilisateurs, crédits, catalogue, produits web, coûts IA, finance, retours (feedback), système/sécurité, feature flags.
