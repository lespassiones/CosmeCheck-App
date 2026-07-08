# Score de peau + Scan visage — Portage web

## Réutilisable tel quel
- `lib/skin/{score,graph,week}.ts` : purs, copier à l'identique (le blend 0.6/0.4, la convention 100=idéal, l'ISO week).
- Tables `skin_checkins` / `face_scans`, bucket `skin-photos`, RPC `cosme_check_consume_credit(p_feature, p_count)` : **partagés**, déjà en prod.
- Edge Function `face-analyze` : partagée. Le web envoie l'image base64 au même contrat (`{ image, mimeType }`), reçoit `FaceAnalyzeResult`.
- `signedPhotoUrl` : identique côté web (supabase-js storage).

## À réimplémenter côté web
- Les écrans `/peau`, `/peau/bilan`, `/peau/scan` (React web).
- Le graphe : réutiliser `toSmoothPath` (pur) dans un `<svg>` web, ou une lib de charts.
- La capture : `getUserMedia` (webcam) au lieu d'expo-camera ; redimensionner à 1600px avant envoi.
- ScoreRing/DeltaChip/PhotoJournalStrip en composants web.

## Attention
- Ne jamais persister les URLs signées (elles expirent en 1h) : équivalent de la blacklist `skinPhotoUrl`.
- `ai_cache` du scan n'a pas de TTL serveur : la clé embarque `FACE_PROMPT_VERSION` (`face_scan:v2:`). Bumper à chaque changement de prompt.
- Le score PEAU /100 est autorisé à l'affichage (ce n'est PAS un score produit) ; les scores produits restent en pastille.
