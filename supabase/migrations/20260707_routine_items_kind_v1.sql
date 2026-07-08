-- Sépare la routine en deux buckets :
--   'routine' = soins visage (matin/soir, ordre, lié au score de peau)
--   'staple'  = produits du quotidien (déo, dentifrice, gel douche...) : simple liste
-- ADDITIF (default 'routine'). APPLIQUEE EN PROD le 7 juil 2026 via MCP (routine_items_kind_v1).

ALTER TABLE cosme_check.routine_items
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'routine'
    CONSTRAINT routine_items_kind_check CHECK (kind IN ('routine','staple'));

-- Backfill de l'existant par NOM (analyses.category est un enum LLM trop grossier).
UPDATE cosme_check.routine_items ri
SET kind = 'staple'
FROM cosme_check.analyses a
WHERE a.id = ri.analysis_id
  AND lower(cosme_check.f_unaccent(coalesce(a.product_label, a.name, ''))) ~
    '(dentifrice|toothpaste|deodorant|anti-transpirant|anti transpirant|gel douche|gel-douche|savon|shampo|apres-shampo|apres shampo|conditioner|parfum|eau de toilette|eau de parfum|cologne|vernis|rasage|rasoir|mousse a raser|nettoyant intime|coiffant|laque)';
