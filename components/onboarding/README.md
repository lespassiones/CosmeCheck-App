# Onboarding Components

Composants du wizard d'onboarding en 3 étapes pour CosmeCheck.

## Composants

### `OnboardingWizard.tsx`
Orchestrateur principal du wizard. Gère la navigation entre les 3 steps,
la barre de progression et la sauvegarde auto debounce.

### `Step1Skin.tsx`
Première étape: sélection du type de peau (visage, corps, cheveux).
Chips sélectionnables avec style neumorphique.

### `Step2Concerns.tsx`
Deuxième étape: sélection des préoccupations beauté (multi-select)
et saisie des allergies connues (texte libre).

### `Step3Goals.tsx`
Troisième étape: sélection des objectifs beauté (multi-select).
Bouton "Terminer" déclenche la sauvegarde finale et la redirection.

## Pattern de données

Chaque step émet ses données via `onNext(partialData)`.
L'état est accumulé dans `OnboardingWizard` avant d'être sauvegardé.
