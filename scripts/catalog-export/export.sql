-- Export catalogue complet → CSV (méthode psql, la plus rapide : UNE lecture).
-- Usage :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/catalog-export/export.sql > catalog.csv
--
-- $DATABASE_URL = chaîne de connexion Postgres (Supabase Dashboard →
--   Project Settings → Database → Connection string → URI ; préfère la connexion
--   DIRECTE port 5432 pour un gros COPY, pas le pooler).
--
-- Le fichier est en UTF-8 SANS BOM. Pour qu'Excel affiche bien les accents :
--   printf '\xEF\xBB\xBF' | cat - catalog.csv > catalog_excel.csv
-- (ou dans Excel : Données → À partir d'un fichier texte/CSV → Origine : UTF-8).

COPY (
  SELECT * FROM cosme_check.catalog_export
) TO STDOUT WITH (FORMAT csv, HEADER true);
