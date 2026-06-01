# Scan Components

Composants du module de scan de produits cosmétiques.

## Composants

### `ScanSheet.tsx`
Bottom sheet principal avec 4 onglets de scan. Point d'entrée de toute analyse.

### `BarcodeScanner.tsx`
Caméra temps réel avec détection de codes-barres EAN/QR.
Feedback haptique + son au scan réussi.

### `PhotoOcrFlow.tsx`
Flux en 2 étapes pour photographier recto et verso d'un emballage.
Envoi vers l'API OCR et affichage du texte extrait.

### `ManualInciInput.tsx`
Zone de texte pour coller ou saisir manuellement la liste INCI.

## Permissions requises

- `CAMERA` (iOS: NSCameraUsageDescription, Android: CAMERA permission)
- Demandée via `expo-camera` / `Camera.requestCameraPermissionsAsync()`
- Si refusée: afficher un message explicatif + lien vers les réglages

## Flux de scan

```
ScanSheet (bottom sheet)
  ├── Onglet "Photo OCR" → PhotoOcrFlow → texte INCI extrait
  ├── Onglet "Code-barres" → BarcodeScanner → EAN → lookup API → INCI
  ├── Onglet "Recherche" → SearchBar → sélection produit → INCI
  └── Onglet "Saisie manuelle" → ManualInciInput → texte INCI
         ↓
  Bouton "Analyser"
         ↓
  Appel /api/analyser → ProcessingOverlay → Navigation /analyse/[id]
```
