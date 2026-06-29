-- Fix 3 missing PRIMARY KEYS + 2 missing FK indexes (audit 29 juin 2026)

-- 1. Add PK to catalog_category_word (word index table)
ALTER TABLE cosme_check.catalog_category_word
ADD PRIMARY KEY (word, category_slug);

-- 2. Add PK to category_counts_cache
ALTER TABLE cosme_check.category_counts_cache
ADD PRIMARY KEY (category_slug);

-- 3. Add PK to catalog_ingredient_index (token index)
-- Assuming columns: token, ean, score - verify schema before applying
ALTER TABLE cosme_check.catalog_ingredient_index
ADD PRIMARY KEY (token, ean);

-- 4. Index missing FK on advisor_messages.user_id
CREATE INDEX IF NOT EXISTS advisor_messages_user_id_idx
ON cosme_check.advisor_messages(user_id);

-- 5. Index missing FK on catalog_photo_submissions.user_id
CREATE INDEX IF NOT EXISTS catalog_photo_submissions_user_id_idx
ON cosme_check.catalog_photo_submissions(user_id);
