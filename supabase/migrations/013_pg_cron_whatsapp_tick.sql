-- Postgres-native scheduler (replaces unreliable GitHub Actions for the tick).
-- Runs every 2 minutes; reads its bearer secret from app_settings at run-time
-- so the secret never lives in the migration text or in cron.job.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- The cron.schedule call itself is applied at runtime (see operator note) —
-- this file documents the intent; the actual scheduling was registered via
-- the MCP execute_sql migration step.
