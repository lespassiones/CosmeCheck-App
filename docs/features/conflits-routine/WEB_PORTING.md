# Conflits de routine — Portage web

## Réutilisable tel quel (modules purs)
- `lib/inci/activesDictionary.ts`, `lib/routine/conflicts.ts` (moteur + catalogue de règles), les leafs edge `routine-conflicts-ai/lib/{normalize,prompt}.ts`. Zéro dépendance RN : copier à l'identique. **Parité stricte exigée** sur le catalogue de règles (mobile ↔ web).
- L'Edge Function `routine-conflicts-ai` est **partagée** (déjà déployée) : le web l'appelle directement.
- Le flag `flag_conflicts` (colonne `app_config`) est partagé.

## À réimplémenter côté web
- La feuille `ConflictsSheet` (modal web) + le bouton badge.
- Le seen-store : côté web utiliser `localStorage` au lieu d'AsyncStorage ; garder `diffNewHighConflicts` pur tel quel.
- Le hook crédits + le cache local IA (équivalent `readAiCache/writeAiCache`).

## Attention
- `ai_cache` (serveur) n'a PAS de TTL : le préfixe de clé embarque `PROMPT_VERSION` (`routine-conflicts:v1:`). Bumper la version à chaque changement de prompt, sinon d'anciens résultats seraient servis.
- Le socle déterministe doit rester en parité byte-à-byte avec le mobile (les 12 règles + la non-détection vitC+niacinamide).
