CREATE TABLE IF NOT EXISTS bot_worker_heartbeats (
  worker_id uuid PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  online boolean NOT NULL DEFAULT true
);
