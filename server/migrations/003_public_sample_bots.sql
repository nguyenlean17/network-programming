ALTER TABLE bots ADD COLUMN IF NOT EXISTS is_public_sample boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS bots_public_sample_idx ON bots (name) WHERE is_public_sample;
