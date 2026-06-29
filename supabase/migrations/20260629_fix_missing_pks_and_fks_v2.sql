-- Fix 3 missing PRIMARY KEYS + 2 missing FK indexes (CORRECTED SCHEMA)

-- 1. Add PK to catalog_category_word (word index: ean + word)
ALTER TABLE cosme_check.catalog_category_word
ADD PRIMARY KEY (ean, word);

-- 2. Add PK to category_counts_cache (category + subcategory)
ALTER TABLE cosme_check.category_counts_cache
ADD PRIMARY KEY (category, subcategory);

-- 3. Add PK to catalog_ingredient_index (token index: ean + token)
ALTER TABLE cosme_check.catalog_ingredient_index
ADD PRIMARY KEY (ean, token);

-- 4. Index missing FK on advisor_messages.user_id
CREATE INDEX IF NOT EXISTS advisor_messages_user_id_idx
ON cosme_check.advisor_messages(user_id);

-- 5. Index missing FK on catalog_photo_submissions.user_id
CREATE INDEX IF NOT EXISTS catalog_photo_submissions_user_id_idx
ON cosme_check.catalog_photo_submissions(user_id);
