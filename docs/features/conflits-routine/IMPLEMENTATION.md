# Conflits de routine (hybride) — Implémentation

_Livré le 7 juillet 2026._

## But
Bouton « Vérifier les conflits » (badge) sous les sections routine. Ouvre une feuille listant les conflits **déterministes** (instantané, 0 crédit) + un CTA « Analyse approfondie IA » (1 crédit) qui nuance par-dessus.

Flag : `flag_conflicts` (défaut FALSE). Badge = conflits de sévérité ≠ `info`.

## Moteur déterministe (pur)
- `lib/inci/activesDictionary.ts` — dictionnaire d'actifs (slugs **vérifiés en DB** + tags `retinoides`/`acide-salicylique`), `classifyItem`, `isSunscreenProduct`. Exclusions assumées : bakuchiol, citric-acid.
- `lib/routine/conflicts.ts` — `detectConflicts(products, profile, restrictions, families)`. Catalogue de 12 règles (copie FR finale) : rétinoïde+exfoliant (high), rétinoïde+vitC pure (medium / dérivés info), rétinoïde le matin (medium), exfoliant matin sans SPF (high), rétinoïde sans SPF matin (info), sur-exfoliation ≥3 (medium, high si sensibilité/rougeurs), peroxyde de benzoyle+rétinoïde (high), allergène en double (info, medium si sensibilité/rougeurs, via `computeAllergenOverlap`), alcool+peau sèche/sensible (medium), huiles essentielles+sensibilité (medium), ingrédient restreint (high, via `checkRestrictions`). **Vitamine C + niacinamide : JAMAIS flaggé** (mythe, commenté + testé). Downgrade de sévérité si concentration trace (`thresholdContext`). `both`/null → présent dans les 2 créneaux. Ordre déterministe, `conflictId` stable.
- `lib/routine/conflictsSeen.ts` — seen-store AsyncStorage `cosmecheck:conflicts:seen` ; `diffNewHighConflicts` (pur) ; `reconcileSeenConflicts` émet `NEW_HIGH_CONFLICTS_EVENT` (DeviceEventEmitter) sur nouveau conflit high → consommé par les notifications.

## Client
- `hooks/useRoutineConflicts.ts` — mémoïse `detectConflicts` sur useRoutine + useProfile + useIngredientFamilies ; `badgeCount` ; réconcilie le seen-store.
- `hooks/useConflictsDeepAnalysis.ts` — projection compacte (signaux ≤12/produit) + cache local `routine-conflicts` (7j, `TTL_ROUTINE_CONFLICTS_MS`) ; miss → invoke edge ; 429 → toast + `/offre`.
- `components/routine/ConflictsButton.tsx` + `ConflictsSheet.tsx` (pattern PenalizingDetailModal, footer « Vérification instantanée. Sans IA. Sans crédit. » + section IA).
- Câblé dans `app/(tabs)/routine.tsx` (`RoutineActionsRow` conflictsEnabled = `flag_conflicts && ready`).

## Edge Function `routine-conflicts-ai` (déployée en prod)
- Leafs zéro-dep : `lib/normalize.ts` (validation, `buildCacheSeed` stable, `parseAiConflicts` — coerce sévérité vers medium/info, cap 5, nettoie U+2014 et motifs `/20`), `lib/prompt.ts` (`buildPrompt`, `PROMPT_VERSION`).
- `index.ts` : gate costCredits 0 → hit `ai_cache` (clé `routine-conflicts:v1:{sha}`) = 0 crédit → miss = `consumeCredit('routine_conflicts',1)` → gpt-4o-mini json_object (fallback Mistral) → `parseAiConflicts` → `setCached`. L'IA ne peut émettre que medium/info (le high reste déterministe).

## Vérification
Tests purs (67) : 1 fixture par règle + trace + both + profil + seen-store + parse edge. Smoke prod : miss débite 1 crédit, hit = 0 (cached), 429 → paywall.
