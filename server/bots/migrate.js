import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrations = [
  { id: '001_bot_platform', path: new URL('../migrations/001_bot_platform.sql', import.meta.url) },
  { id: '002_practice_arena', path: new URL('../migrations/002_practice_arena.sql', import.meta.url) },
  { id: '003_public_sample_bots', path: new URL('../migrations/003_public_sample_bots.sql', import.meta.url) }
];

export async function migrateBotPlatform(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['ottv2-bot-platform-migrations']);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const migration of migrations) {
      const applied = await client.query('SELECT id FROM schema_migrations WHERE id = $1', [migration.id]);
      if (applied.rowCount) continue;
      const sql = await readFile(fileURLToPath(migration.path), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['ottv2-bot-platform-migrations']).catch(() => {});
    client.release();
  }
}
