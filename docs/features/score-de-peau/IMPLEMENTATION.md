# Score de peau + Scan visage — Implémentation

_Livré le 7 juillet 2026. Feature de rétention centrale (l'app « connaît ta peau dans le temps »)._

## But
- Carte « Score de peau » /100 sur le dashboard (sous les 4 blocs), gate `flag_skin_score`.
- Page `/peau` : anneau /100 + variation hebdo + graphe filtrable (3/6/12 mois × dimension) + CTA bilan + journal photo + scan visage.
- Bilan hebdo `/peau/bilan` : 5 questions (~45 s), gratuit, 1 par semaine ISO.
- Scan visage `/peau/scan` : capture guidée + analyse IA (2 crédits), journal photo privé.

## Base de données (migrations en prod)
- `20260707_skin_score_v1.sql` : `skin_checkins` (UNIQUE user_id+week_key, answers/scores/score) + `face_scans` (photo_path, metrics, image_sha256 UNIQUE, INSERT service-role only) + GRANT authenticated + RLS owner `(select auth.uid())`.
- `20260707_skin_photos_bucket_v1.sql` : bucket privé `skin-photos` + policies storage SELECT/DELETE owner (1er segment du path = uid), pas de policy INSERT (Edge service-role).
- `20260707_consume_credit_count_v1.sql` : `cosme_check_consume_credit(p_feature, p_count DEFAULT 1)` — rétro-compatible (permet le débit de 2 pour le scan).

## Modèle de score (pur, `lib/skin/`)
- `score.ts` : `SKIN_DIMENSIONS` (imperfections/rougeurs/secheresse/brillance/douceur), convention **100 = idéal partout**. `answersToScores` (index 0..4 → 0/25/50/75/100), `headlineScore` (blend 0.6 checkin + 0.4 scan si scan < 14j, sinon checkin seul), `weeklyDelta` (vs lundi ISO), `insightLine` (phrase déterministe sans chiffre).
- `graph.ts` : `toSmoothPath` (Catmull-Rom), `seriesFor`, `filterByPeriod`.
- `week.ts` : `isoWeekKey` (module ISO partagé skin/notifs/pépites).
- `api.ts` : I/O Supabase (fetch/upsert checkins + scans, `signedPhotoUrl`, `deleteFaceScan`, `invokeFaceAnalyze`). `events.ts` : `SKIN_FIRST_BILAN_COMPLETED_EVENT`.
- `hooks/useSkinScore.ts` : compose les 2 queries + les purs. queryKeys `['skinCheckins']`/`['faceScans']` persistées ; `['skinPhotoUrl']` **blacklistée** (URLs signées expirantes).

## Écrans / composants
`components/peau/` : ScoreRing (SVG, 100=idéal), DeltaChip, SkinGraph, PhotoJournalStrip (URL signée 1h, suppression long-press), SkinScoreCard (dashboard), BilanWizard (5 questions), BilanResult, FaceOverlay. `app/peau/{index,bilan,scan}.tsx`.

## Scan visage — Edge `face-analyze` (déployée en prod)
Leafs zéro-dep : `validate.ts` (checkImage 6 Mo/mime), `parse.ts` (parse strict + clamp + enum raisons), `score.ts` (`scanGlobal`), `prompt.ts` (`buildFaceAnalyzePrompt`, `FACE_PROMPT_VERSION`). Pipeline `index.ts` : gate costCredits 0 → validation → sha256 → **idempotence** `face_scans` (alreadyAnalyzed, 0 débit) → cache `ai_cache` (clé `face_scan:v2:{sha}`) → 1 appel vision gpt-4o-mini (qualité + 5 métriques) → **rejet qualité = 200 sans débit** → OK = `consumeCredit('face_scan',2)` → upload storage service-role (retry x1) → insert `face_scans` → réponse.

### Prompt v2 — correction faux positif
Le prompt v1 rejetait à tort les visages souriants (yeux plissés lus comme « lunettes »). v2 : « lunettes » seulement si monture/verres/branches clairement visibles ; yeux plissés/fermés ≠ lunettes ; consigne d'indulgence globale. La version est dans la clé de cache (`face_scan:v2:`) pour que la correction prenne effet.

## Crédits
Bilan gratuit. Scan : pré-check client `remaining >= 2` sinon `/offre` ; débit serveur de 2 **après** le gate qualité ; rejet = 0 débit (message « Aucun crédit utilisé ») ; 429 → `CREDITS_EXHAUSTED_EVENT` (modale globale).

## Vérification
- Tests purs (~52) : week (frontières ISO), score (blend/delta/insight), graph, parse edge, scan score.
- **E2E prod** `scripts/face-analyze-e2e.mjs` (17/17) : lunettes de soleil → rejet + 0 débit ; photo valide → 5 métriques + débit exact 2 ; idempotence → 0 double-débit ; **fille souriante sans lunettes → acceptée (pas de faux positif, prompt v2)** ; RLS storage owner-scoped (autre user ne peut pas signer).

## RGPD (à faire)
Ajouter la purge de `skin-photos/{uid}` + `skin_checkins`/`face_scans` dans la fonction `delete-account` (les CASCADE couvrent les tables ; le storage prefix reste à purger).
