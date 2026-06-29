-- Fix RLS auth_rls_initplan on 3 tables (audit 29 juin 2026)
-- Replace auth.current_user() with (select auth.current_user()) to avoid per-row re-evaluation
-- Tables: catalog_photo_submissions, advisor_conversations, advisor_messages

-- 1. catalog_photo_submissions - policy "users insert own photo submissions"
DROP POLICY IF EXISTS "users insert own photo submissions" ON cosme_check.catalog_photo_submissions;
CREATE POLICY "users insert own photo submissions"
ON cosme_check.catalog_photo_submissions FOR INSERT
WITH CHECK (user_id = (select auth.uid()));

-- 2. catalog_photo_submissions - policy "users read own photo submissions"
DROP POLICY IF EXISTS "users read own photo submissions" ON cosme_check.catalog_photo_submissions;
CREATE POLICY "users read own photo submissions"
ON cosme_check.catalog_photo_submissions FOR SELECT
USING (user_id = (select auth.uid()));

-- 3. advisor_conversations - policy "own advisor conversations"
DROP POLICY IF EXISTS "own advisor conversations" ON cosme_check.advisor_conversations;
CREATE POLICY "own advisor conversations"
ON cosme_check.advisor_conversations FOR ALL
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

-- 4. advisor_messages - policy "own advisor messages"
DROP POLICY IF EXISTS "own advisor messages" ON cosme_check.advisor_messages;
CREATE POLICY "own advisor messages"
ON cosme_check.advisor_messages FOR ALL
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));
