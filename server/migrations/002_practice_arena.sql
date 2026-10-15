ALTER TABLE matches ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);
CREATE INDEX IF NOT EXISTS practice_matches_owner_idx ON matches (created_by, created_at DESC)
  WHERE kind = 'PRACTICE';
