-- Score de peau : bilans hebdo (questionnaire) + scans visage IA.
-- APPLIQUEE EN PROD le 7 juillet 2026 via MCP (migration skin_score_v1).
-- skin_checkins : 1 ligne par (user, semaine ISO), reponses + scores derives.
-- face_scans   : 1 scan visage par photo (idempotent par sha256), INSERT
--                reserve au service role (Edge face-analyze) ; le client lit
--                et peut supprimer (journal photo).

CREATE TABLE IF NOT EXISTS cosme_check.skin_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_key text NOT NULL,
  answers jsonb NOT NULL,
  scores jsonb NOT NULL,
  score numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_key)
);

CREATE TABLE IF NOT EXISTS cosme_check.face_scans (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_path text NOT NULL,
  metrics jsonb NOT NULL,
  score numeric NOT NULL,
  model text,
  quality jsonb,
  image_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, image_sha256)
);

CREATE INDEX IF NOT EXISTS idx_skin_checkins_user ON cosme_check.skin_checkins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_face_scans_user ON cosme_check.face_scans(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON cosme_check.skin_checkins TO authenticated;
GRANT SELECT, DELETE ON cosme_check.face_scans TO authenticated;

ALTER TABLE cosme_check.skin_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosme_check.face_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY skin_checkins_own ON cosme_check.skin_checkins
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY face_scans_select_own ON cosme_check.face_scans
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY face_scans_delete_own ON cosme_check.face_scans
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
