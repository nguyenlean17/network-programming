CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS bots (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 48),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  is_public_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bots_owner_created_idx ON bots (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bot_versions (
  id uuid PRIMARY KEY,
  bot_id uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  api_version text NOT NULL,
  filename text NOT NULL,
  sha256 char(64) NOT NULL,
  source bytea NOT NULL,
  validation_status text NOT NULL DEFAULT 'QUARANTINED'
    CHECK (validation_status IN ('QUARANTINED', 'VALIDATING', 'READY', 'REJECTED')),
  validation_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, version),
  UNIQUE (bot_id, sha256)
);
CREATE INDEX IF NOT EXISTS bot_versions_status_created_idx ON bot_versions (validation_status, created_at);

CREATE TABLE IF NOT EXISTS bot_validation_jobs (
  id uuid PRIMARY KEY,
  bot_version_id uuid NOT NULL UNIQUE REFERENCES bot_versions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until timestamptz,
  result_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bot_validation_status_lease_idx ON bot_validation_jobs (status, lease_until, created_at);

CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'OPEN', 'LOCKED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  format text NOT NULL CHECK (format IN ('ROUND_ROBIN', 'SINGLE_ELIMINATION')),
  submission_deadline timestamptz,
  rules_json jsonb NOT NULL,
  scoring_json jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS tournaments_status_created_idx ON tournaments (status, created_at DESC);

CREATE TABLE IF NOT EXISTS tournament_participants (
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  bot_version_id uuid NOT NULL REFERENCES bot_versions(id),
  locked_at timestamptz,
  registered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id),
  UNIQUE (tournament_id, bot_version_id)
);
CREATE INDEX IF NOT EXISTS participants_version_idx ON tournament_participants (bot_version_id);

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY,
  tournament_id uuid REFERENCES tournaments(id),
  created_by uuid REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('PRACTICE', 'TOURNAMENT')),
  p1_version_id uuid NOT NULL REFERENCES bot_versions(id),
  p2_version_id uuid NOT NULL REFERENCES bot_versions(id),
  round_number integer CHECK (round_number > 0),
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  result_json jsonb,
  initial_board_json jsonb,
  final_board_json jsonb,
  rules_json jsonb NOT NULL,
  scoring_json jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CHECK (p1_version_id <> p2_version_id),
  CHECK ((kind = 'PRACTICE' AND tournament_id IS NULL) OR (kind = 'TOURNAMENT' AND tournament_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS matches_tournament_status_idx ON matches (tournament_id, status, created_at);
CREATE INDEX IF NOT EXISTS matches_versions_idx ON matches (p1_version_id, p2_version_id);

CREATE TABLE IF NOT EXISTS match_moves (
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  ply integer NOT NULL CHECK (ply > 0),
  player text NOT NULL CHECK (player IN ('P1', 'P2')),
  from_cell text NOT NULL CHECK (from_cell ~ '^[A-I][1-9]$'),
  to_cell text NOT NULL CHECK (to_cell ~ '^[A-I][1-9]$'),
  event_json jsonb NOT NULL,
  PRIMARY KEY (match_id, ply)
);

CREATE TABLE IF NOT EXISTS runner_jobs (
  id uuid PRIMARY KEY,
  match_id uuid NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runner_jobs_status_lease_idx ON runner_jobs (status, lease_until, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_subject_created_idx ON audit_logs (subject_type, subject_id, created_at DESC);
