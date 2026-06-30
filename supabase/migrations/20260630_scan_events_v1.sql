-- Lightweight scan-event log (barcode / ocr) for admin Activité metrics.
-- Separate from ai_logs so it doesn't pollute the AI cache-hit-rate denominator.
-- Written best-effort by the product-by-barcode Edge Function via cosme_check_log_scan.
CREATE TABLE IF NOT EXISTS cosme_check.scan_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,            -- 'barcode' | 'ocr'
  ean         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_events_kind_created ON cosme_check.scan_events(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_events_user ON cosme_check.scan_events(user_id);

ALTER TABLE cosme_check.scan_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scan_events_select_own ON cosme_check.scan_events;
CREATE POLICY scan_events_select_own ON cosme_check.scan_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON cosme_check.scan_events TO authenticated;

CREATE OR REPLACE FUNCTION public.cosme_check_log_scan(p_kind TEXT, p_ean TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = cosme_check, public AS $fn$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  IF p_kind NOT IN ('barcode','ocr') THEN RETURN; END IF;
  INSERT INTO cosme_check.scan_events(user_id, kind, ean)
  VALUES (v_user, p_kind, NULLIF(left(p_ean, 40), ''));
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.cosme_check_log_scan(TEXT, TEXT) TO authenticated, anon;
