ALTER TABLE bot_worker_heartbeats ADD COLUMN metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(metrics_json) = 'object');
CREATE INDEX worker_heartbeats_seen_idx ON bot_worker_heartbeats(last_seen_at DESC);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC, id);
