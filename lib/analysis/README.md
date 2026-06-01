# Analysis Library

Fonctions utilitaires pour les appels à l'API d'analyse INCI et le parsing des résultats.

## Fichiers

### `analyser.ts`
Fonctions pour appeler l'API `/api/analyser` de CosmetWiki et sauvegarder le résultat.

### `types.ts`
Types TypeScript complets pour les résultats d'analyse (AnalyseResponse, AnalyseItem, etc.)

## Flux d'analyse

```typescript
// Utilisation dans les hooks/composants
import { runAnalysis } from '@/lib/analysis/analyser'

const result = await runAnalysis({
  inciInput: 'Aqua, Glycerin, Niacinamide...',
  productName: 'Sérum Hydratant X',
  userId: 'uuid',
  userRestrictions: profile.restrictions,
})
// result: { analysisId: string, response: AnalyseResponse }
```
