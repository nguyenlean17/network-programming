CREATE TABLE qualifiers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','OPEN','CLOSED','FINALIZED')),
  submission_deadline timestamptz NOT NULL,
  rounds_per_opponent integer NOT NULL CHECK (rounds_per_opponent BETWEEN 1 AND 3),
  max_submissions integer NOT NULL DEFAULT 20 CHECK (max_submissions BETWEEN 1 AND 100),
  rules_json jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);
CREATE TABLE qualifier_benchmarks (
  qualifier_id uuid NOT NULL REFERENCES qualifiers(id),
  bot_version_id uuid NOT NULL REFERENCES bot_versions(id),
  position integer NOT NULL,
  PRIMARY KEY (qualifier_id, bot_version_id),
  UNIQUE (qualifier_id, position)
);
CREATE TABLE qualifier_submissions (
  id uuid PRIMARY KEY,
  qualifier_id uuid NOT NULL REFERENCES qualifiers(id),
  user_id uuid NOT NULL REFERENCES users(id),
  bot_version_id uuid NOT NULL REFERENCES bot_versions(id),
  source_sha256 char(64) NOT NULL,
  expected_matches integer NOT NULL CHECK (expected_matches BETWEEN 2 AND 48),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED')),
  points integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (qualifier_id, user_id, source_sha256)
);
CREATE INDEX qualifier_submissions_owner_idx ON qualifier_submissions(qualifier_id, user_id, created_at DESC);
CREATE INDEX qualifier_submissions_pending_idx ON qualifier_submissions(user_id, status, created_at);
CREATE INDEX qualifier_submissions_best_idx ON qualifier_submissions(qualifier_id, user_id, points DESC, created_at, id)
  WHERE status = 'COMPLETED';
ALTER TABLE matches ADD COLUMN qualifier_submission_id uuid REFERENCES qualifier_submissions(id);
CREATE INDEX matches_qualifier_submission_idx ON matches(qualifier_submission_id, status);
-- Replace the original checks mentioning kind without depending on generated constraint names.
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT conname FROM pg_constraint WHERE conrelid = 'matches'::regclass
    AND contype = 'c' AND pg_get_constraintdef(oid) ~ '\mkind\M'
  LOOP EXECUTE format('ALTER TABLE matches DROP CONSTRAINT %I', item.conname); END LOOP;
END $$;
ALTER TABLE matches ADD CONSTRAINT matches_kind_check CHECK (kind IN ('PRACTICE','TOURNAMENT','QUALIFICATION'));
ALTER TABLE matches ADD CONSTRAINT matches_competition_check CHECK (
  (kind = 'PRACTICE' AND tournament_id IS NULL AND qualifier_submission_id IS NULL) OR
  (kind = 'TOURNAMENT' AND tournament_id IS NOT NULL AND qualifier_submission_id IS NULL) OR
  (kind = 'QUALIFICATION' AND tournament_id IS NULL AND qualifier_submission_id IS NOT NULL)
);
CREATE INDEX bot_versions_bot_created_idx ON bot_versions(bot_id, created_at DESC);
CREATE INDEX runner_jobs_pending_idx ON runner_jobs(created_at, id) WHERE status IN ('QUEUED','RUNNING');
ALTER TABLE bot_worker_heartbeats ADD COLUMN worker_role text NOT NULL DEFAULT 'all'
  CHECK (worker_role IN ('all','validation','matches'));
