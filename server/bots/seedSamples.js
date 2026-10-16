import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SAMPLE_USER_ID = '00000000-0000-4000-8000-00000000a001';
const SAMPLE_EMAIL = 'samples@ottv2.invalid';
const samples = [
  { botId: '00000000-0000-4000-8000-00000000a101',
    name: 'Bot đi nước hợp lệ đầu tiên', filename: 'first_legal.py', source: new URL('../../examples/bots/first_legal.py', import.meta.url) },
  { botId: '00000000-0000-4000-8000-00000000a102',
    name: 'Bot tìm đường tới đích', filename: 'goal_seeker.py', source: new URL('../../examples/bots/goal_seeker.py', import.meta.url) }
];

/** Register repository-owned sample bots as ready opponents for Practice Arena. */
export async function seedSampleBots(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO users (id, email, display_name, password_hash)
      VALUES ($1, $2, 'OTTv2 Samples', 'disabled$not-a-login') ON CONFLICT DO NOTHING`, [SAMPLE_USER_ID, SAMPLE_EMAIL]);
    const owner = await client.query('SELECT id FROM users WHERE lower(email) = $1', [SAMPLE_EMAIL]);
    if (!owner.rowCount) throw new Error('Could not create the sample-bot owner');
    for (const sample of samples) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sample:${sample.botId}`]);
      const source = await readFile(fileURLToPath(sample.source));
      const sha256 = createHash('sha256').update(source).digest('hex');
      await client.query(`INSERT INTO bots (id, owner_id, name, description, is_public_sample)
        VALUES ($1, $2, $3, $4, true) ON CONFLICT (id) DO NOTHING`,
      [sample.botId, owner.rows[0].id, sample.name, 'Bot mẫu do dự án cung cấp để luyện tập.']);
      const bot = await client.query('SELECT owner_id, is_public_sample FROM bots WHERE id = $1', [sample.botId]);
      if (!bot.rowCount || bot.rows[0].owner_id !== owner.rows[0].id || !bot.rows[0].is_public_sample) {
        throw new Error(`Reserved sample bot ID is already in use: ${sample.botId}`);
      }
      const prior = await client.query('SELECT id FROM bot_versions WHERE bot_id = $1 AND sha256 = $2', [sample.botId, sha256]);
      if (prior.rowCount) continue;
      const next = await client.query('SELECT COALESCE(MAX(version), 0) + 1 AS version FROM bot_versions WHERE bot_id = $1', [sample.botId]);
      await client.query(`INSERT INTO bot_versions
        (id, bot_id, version, api_version, filename, sha256, source, validation_status, validation_message)
        VALUES ($1, $2, $3, '1.0', $4, $5, $6, 'READY', 'Bot mẫu được quản lý cùng mã nguồn OTTv2.')`,
      [randomUUID(), sample.botId, Number(next.rows[0].version), sample.filename, sha256, source]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
