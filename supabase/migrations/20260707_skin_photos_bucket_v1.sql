-- Bucket prive pour les photos de visage (journal peau).
-- APPLIQUEE EN PROD le 7 juillet 2026 via MCP (migration skin_photos_bucket_v1).
-- RLS owner : le 1er segment du chemin = uid. AUCUNE policy INSERT : seul le
-- service role (Edge face-analyze) ecrit. Le client lit via createSignedUrl.

INSERT INTO storage.buckets (id, name, public) VALUES ('skin-photos', 'skin-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY skin_photos_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'skin-photos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY skin_photos_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'skin-photos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
