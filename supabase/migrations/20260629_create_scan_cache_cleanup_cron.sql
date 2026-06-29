-- Create cron job to cleanup expired scan_cache entries
-- Runs daily at 03:10 UTC (after other cleanup jobs)

SELECT cron.schedule(
  'cosme_check_cleanup_scan_cache',
  '10 3 * * *',  -- 03:10 UTC daily
  $$
  DELETE FROM cosme_check.scan_cache
  WHERE expires_at < now();
  $$
);
