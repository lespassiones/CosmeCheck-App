# FEATURES — CosmeCheck Mobile

> Documentation complète de toutes les fonctionnalités de l'application, avec user stories et critères d'acceptation.

---

## 1. Authentification

### 1.1 Connexion Email/Mot de passe
**User story** : En tant qu'utilisateur existant, je veux me connecter avec mon email et mot de passe pour accéder à mon compte.

**Critères d'acceptation :**
- Formulaire avec champs email + mot de passe
- Validation en temps réel (email valide, mot de passe non vide)
- Bouton "Se connecter" désactivé si formulaire invalide
- Message d'erreur clair si identifiants incorrects
- Redirection vers Dashboard (tabs) si connexion réussie
- Lien "Mot de passe oublié" visible

### 1.2 Inscription
**User story** : En tant que nouvel utilisateur, je veux créer un compte pour utiliser l'application.

**Critères d'acceptation :**
- Champs : Prénom, Email, Mot de passe, Confirmation mot de passe
- Indicateur de force du mot de passe (faible/moyen/fort)
- Validation Zod côté client avant envoi
- Après inscription réussie → redirection vers Onboarding
- Gestion des erreurs (email déjà utilisé, etc.)

### 1.3 Connexion Google OAuth
**User story** : Je veux me connecter rapidement avec mon compte Google.

**Critères d'acceptation :**
- Bouton "Continuer avec Google" sur sign-in ET sign-up
- Ouvre le flux OAuth Google via expo-auth-session
- Après authentification → vérifie si profil existe → Onboarding ou Dashboard
- Gestion du cas "fenêtre fermée sans compléter"

### 1.4 Réinitialisation mot de passe
**User story** : J'ai oublié mon mot de passe, je veux le réinitialiser par email.

**Critères d'acceptation :**
- Écran "Mot de passe oublié" avec champ email
- Envoi email de réinitialisation via Supabase
- Message de confirmation "Email envoyé"
- Deep link vers écran reset-password

---

## 2. Onboarding

### 2.1 Étape 1 — Type de peau
**User story** : Je veux indiquer mon type de peau pour recevoir des analyses personnalisées.

**Critères d'acceptation :**
- 3 sections : Visage / Corps / Cheveux
- Visage : Sèche / Mixte / Grasse / Sensible / Normale (sélection unique par section)
- Corps : Sèche / Très sèche / Normale / Sensible / Mixte
- Cheveux : Secs / Gras / Cuir chevelu sensible
- Chips visuelles style pilule avec neumorphisme (effet pressé quand sélectionné)
- Sauvegarde automatique dans `user_profiles.preferences`

### 2.2 Étape 2 — Préoccupations & Allergies
**User story** : Je veux indiquer mes préoccupations beauté et mes allergies connues.

**Critères d'acceptation :**
- Multi-select (plusieurs choix possibles)
- Peau : Acné / Rides / Taches / Sécheresse / Rougeurs / Sensibilité / Pores / Sébum / Cernes / Vergetures
- Cheveux : Chute / Brillance / Hydratation / Frisottis / Pellicules
- Champ texte libre "Allergies connues" avec placeholder "ex: alcool, parfum, lanoline..."
- Sauvegarde debounce 600ms

### 2.3 Étape 3 — Objectifs beauté
**User story** : Je veux définir mes objectifs beauté pour personnaliser les recommandations.

**Critères d'acceptation :**
- Multi-select : Peau douce / Teint uniforme / Anti-âge / Éclat / Hydratation intense / Pores réduits / Contrôle sébum / Confort / Brillance cheveux / Pousse cheveux
- Bouton "Terminer" → sauvegarde finale + redirect vers (tabs)/index
- Possibilité de "Passer" (skip) l'onboarding via bouton en haut à droite

---

## 3. Scan Produit

### 3.1 Scan code-barres
**User story** : Je veux scanner le code-barres d'un produit pour l'analyser instantanément.

**Critères d'acceptation :**
- S'ouvre via le FAB central (bouton rose) dans un bottom sheet
- Accès caméra avec permission demandée au premier lancement
- Overlay cadre de scan animé
- Détection EAN-13 / EAN-8 / QR Code
- Vibration + son court au scan réussi
- Lookup dans la base de données (via API) par code EAN
  - Produit trouvé : affiche nom + marque + INCI → bouton "Analyser"
  - Produit non trouvé : "Produit inconnu — analyser quand même?" + saisie INCI manuelle

### 3.2 Photo OCR recto/verso
**User story** : Je veux photographier l'emballage d'un produit pour extraire la liste INCI automatiquement.

**Critères d'acceptation :**
- Flux en 2 étapes : photo recto (packaging) → photo verso/liste INCI
- Chaque étape montre un guide visuel du contenu attendu
- Envoi vers API OCR → texte extrait affiché
- Zone de correction du texte OCR (textarea éditable)
- Bouton "Confirmer et analyser"
- Indicateur de qualité OCR ("Texte bien reconnu" / "Vérifiez le texte extrait")

### 3.3 Recherche par nom
**User story** : Je veux rechercher un produit par son nom pour retrouver une analyse existante.

**Critères d'acceptation :**
- SearchBar avec debounce 300ms
- Résultats : liste de produits (nom + marque + score existant si dispo)
- Tap sur un résultat → affiche analyse existante ou propose d'analyser
- Filtre par marque optionnel

### 3.4 Saisie manuelle INCI
**User story** : Je veux coller manuellement la liste INCI pour l'analyser.

**Critères d'acceptation :**
- Grand TextArea avec placeholder "Coller ou taper ici la liste des ingrédients (INCI)..."
- Exemple de format attendu affiché sous le champ
- Compteur de caractères + estimation nb ingrédients
- Bouton "Analyser" → lance analyse

---

## 4. Analyse INCI

### 4.1 Résultat d'analyse
**User story** : Je veux voir le score de mon produit avec une explication claire des ingrédients.

**Critères d'acceptation :**
- Score 0-20 affiché dans une jauge arc animée
- Couleur selon score : Vert (15-20) / Jaune (10-14) / Orange (5-9) / Rouge (0-4)
- Label verbal : "Excellent" / "Bon" / "Acceptable" / "À améliorer"
- Spectre visuel : proportion d'ingrédients verts/jaunes/orange/rouges
- Liste complète des ingrédients avec :
  - Position (n°1, n°2...)
  - Nom INCI + traduction française
  - Badge couleur
  - Fonctions (ex: "Hydratant", "Conservateur", "Parfum")
  - Tags cliquables (ex: "#allergène", "#endocrinien")
- Section "Observations" : alertes tagguées
- Section "Allergènes UE" : liste des 26 allergènes de contact réglementés
- Synthèse IA : résumé en langage naturel

### 4.2 Vue simplifiée "L'essentiel"
**User story** : Je suis un utilisateur non-expert et je veux comprendre l'essentiel sans jargon technique.

**Critères d'acceptation :**
- 3-5 points clés en français courant
- Pas de noms INCI, pas de termes chimiques
- Code couleur global visible
- Toggle "Vue simplifiée / Vue experte"

---

## 5. Routine Beauté

### 5.1 Tracker produits
**User story** : Je veux suivre les produits que j'utilise chaque jour pour analyser mon exposition globale.

**Critères d'acceptation :**
- Liste des produits dans la routine (nom + marque + score)
- Sélecteur de fréquence par produit (Matin / Soir / Matin+Soir)
- Score cumulé de la routine affiché en haut
- Swipe pour supprimer un produit
- Tap sur produit → détail analyse

### 5.2 Exposition par famille d'ingrédients
**User story** : Je veux voir quelles familles d'ingrédients je consomme trop dans ma routine.

**Critères d'acceptation :**
- Graphique barres : exposition par famille (Conservateurs, Parfums, Silicones, Colorants, etc.)
- Valeur numérique + barre colorée selon niveau
- Seuils : vert (faible) / orange (moyen) / rouge (élevé)

### 5.3 Simulation "Et si j'enlève le pire?"
**User story** : Je veux voir l'impact de supprimer le produit le plus problématique de ma routine.

**Critères d'acceptation :**
- Bouton "Simuler" dans l'écran Routine
- Modal avec produit suggéré à supprimer + nouveau score simulé
- Comparaison : score actuel vs score simulé
- Bouton "Confirmer la suppression" ou "Annuler"

### 5.4 Ajouter un produit à la routine
**Critères d'acceptation :**
- Bouton "+" dans l'écran Routine
- Modal : "Analyser un nouveau produit" ou "Choisir dans l'historique"
- Depuis historique : liste scrollable des analyses passées

---

## 6. Promesses Marketing

### 6.1 Analyse d'une promesse
**User story** : Je veux vérifier si les claims marketing d'un produit sont honnêtes avec sa formule réelle.

**Critères d'acceptation :**
- Saisie : nom du produit + texte de la promesse marketing (copier-coller depuis site/packaging)
- Analyse IA : compare claims vs ingrédients INCI
- Résultat : liste de promesses avec verdict par promesse
  - Vert : promesse tenue
  - Jaune : partiellement tenue
  - Orange : douteuse
  - Rouge : non tenue / trompeuse
- Explication courte pour chaque verdict

### 6.2 Historique des analyses promesses
**Critères d'acceptation :**
- Liste des analyses promesses passées dans Tab 5
- Date + nom produit + verdict global
- Tap → détail de l'analyse

---

## 7. Beauty Advisor (Chat IA)

### 7.1 Chat personnalisé
**User story** : Je veux des conseils beauté personnalisés selon mon profil de peau.

**Critères d'acceptation :**
- Interface chat (bulles utilisateur à droite, IA à gauche)
- Réponses streamées (apparition progressive du texte)
- Contexte : profil peau injecté dans le prompt système (invisible pour l'utilisateur)
- Suggestions de questions pré-définies au démarrage
- Guard : si profil incomplet → CTA "Compléter mon profil" avant d'accéder au chat

### 7.2 Historique des conversations
**Critères d'acceptation :**
- Session persistée dans la conversation en cours
- Possibilité de "Nouvelle conversation" (réinitialise le contexte)

---

## 8. Historique des Analyses

### 8.1 Liste des analyses
**User story** : Je veux retrouver toutes mes analyses passées facilement.

**Critères d'acceptation :**
- Liste chronologique (plus récent en premier)
- Chaque item : date + nom produit + marque + badge score coloré
- SearchBar pour filtrer par nom de produit
- Pull-to-refresh
- Pagination (20 par page, chargement automatique au scroll)

### 8.2 Accès rapide
**Critères d'acceptation :**
- Tap sur un item → navigation vers /analyse/[id]
- Swipe gauche → option "Supprimer de l'historique"

---

## 9. Comparaison de Produits

### 9.1 Comparaison côte à côte
**User story** : Je veux comparer 2 ou 3 produits pour choisir le meilleur pour ma peau.

**Critères d'acceptation :**
- Sélection de 2 à 3 produits depuis l'historique
- Affichage en colonnes côte à côte (scroll horizontal)
- Pour chaque produit : score, top 5 ingrédients, ingrédients problématiques surlignés
- Exposition par famille d'ingrédients côte à côte
- Recommandation finale : "Meilleur choix pour votre profil : [nom]"

---

## 10. Profil Utilisateur

### 10.1 Infos personnelles
**Critères d'acceptation :**
- Affichage : prénom, email, type d'abonnement (Free / Premium)
- SkinProfileCard : résumé type de peau + préoccupations top 3
- Bouton "Modifier mon profil" → ouvre formulaire onboarding pré-rempli
- Bouton "Mes restrictions / allergies" → écran dédié
- Bouton "Se déconnecter" avec confirmation

### 10.2 Restrictions & Allergies
**Critères d'acceptation :**
- Allergies freeform : textarea libre
- Familles d'ingrédients à éviter : 40+ checkboxes (Alcools, Parabènes, Silicones, Sulfates, Parfums, Colorants, etc.)
- Ingrédients INCI favoris (à surveiller en positif)
- Sauvegarde automatique debounce

---

## 11. Détail Ingrédient

### 11.1 Fiche ingrédient
**User story** : Je veux comprendre ce qu'est un ingrédient spécifique.

**Critères d'acceptation :**
- Nom INCI officiel
- Traduction française
- ColorRating badge (note générale)
- Fonctions dans les cosmétiques (ex: "Émollient", "Conservateur")
- Tags (ex: "#endocrinien", "#allergène", "#naturel")
- Description courte en français
- Liste des produits analysés qui contiennent cet ingrédient (dans l'historique personnel)
- Sources réglementaires si pertinent (CosIng)

---

## 12. Abonnement Premium

### 12.1 Offre Free vs Premium
**Critères d'acceptation :**
- Page comparaison claire : Free (gratuit) vs Premium (2.99€/mois ou 24.99€/an)
- Free : 3 analyses/mois, historique 30 jours, sans Beauty Advisor
- Premium : analyses illimitées, historique complet, Beauty Advisor, comparaison, promesses marketing
- Bouton "Passer à Premium" → placeholder pour in-app purchase (Apple/Google)
- Prix clairement affichés + période d'essai si applicable

### 12.2 Crédits
**Critères d'acceptation :**
- Pilule "X crédits" visible dans l'app
- Rouge si < 3 crédits restants
- Tap sur la pilule → modal upgrade

---

## 13. Notifications

*(Pour version future)*

- Notification "Rappel routine du matin/soir"
- Notification "Votre analyse est prête" (si traitement long)
- Notification "Nouvel ingrédient problématique identifié"

---

## Priorité de développement

| Priorité | Feature | Raison |
|----------|---------|--------|
| P0 | Auth + Onboarding | Prérequis absolu |
| P0 | Scan + Analyse INCI | Core value proposition |
| P1 | Historique | Fidélisation |
| P1 | Routine | Engagement quotidien |
| P2 | Promesses | Différenciation |
| P2 | Beauty Advisor | Premium feature |
| P3 | Comparaison | Nice-to-have |
| P3 | Abonnement | Monétisation |
