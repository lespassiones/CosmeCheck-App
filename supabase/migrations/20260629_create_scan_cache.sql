-- Create scan_cache table to replace non-functional Deno KV cache
-- Barcode scans can now cache results for 12 hours across users

CREATE TABLE IF NOT EXISTS cosme_check.scan_cache (
  ean TEXT PRIMARY KEY,
  result_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '12 hours')
);

-- Index for TTL cleanup cron
CREATE INDEX IF NOT EXISTS scan_cache_expires_at_idx
ON cosme_check.scan_cache(expires_at);

-- Grant access to authenticated users (read-only via RLS if needed)
ALTER TABLE cosme_check.scan_cache ENABLE ROW LEVEL SECURITY;

-- Allow edge functions and server to read/write
CREATE POLICY "edge_functions_scan_cache_all"
ON cosme_check.scan_cache FOR ALL
USING (true)
WITH CHECK (true);
