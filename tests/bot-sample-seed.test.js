import assert from 'node:assert/strict';
import { seedSampleBots } from '../server/bots/seedSamples.js';

const users = new Map();
const bots = new Map();
const versions = [];
const pool = { async connect() {
  return {
    async query(sql, params = []) {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: 0, rows: [] };
      if (sql.includes('INSERT INTO users')) {
        if (![...users.values()].some(user => user.email === params[1])) users.set(params[0], { id: params[0], email: params[1] });
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('SELECT id FROM users WHERE lower(email)')) {
        const user = [...users.values()].find(item => item.email === params[0]);
        return { rowCount: user ? 1 : 0, rows: user ? [{ id: user.id }] : [] };
      }
      if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 1, rows: [] };
      if (sql.includes('INSERT INTO bots')) {
        if (!bots.has(params[0])) bots.set(params[0], { owner_id: params[1], is_public_sample: true });
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('SELECT owner_id, is_public_sample FROM bots')) {
        const bot = bots.get(params[0]);
        return { rowCount: bot ? 1 : 0, rows: bot ? [bot] : [] };
      }
      if (sql.includes('SELECT id FROM bot_versions WHERE bot_id')) {
        const found = versions.find(item => item.botId === params[0] && item.sha256 === params[1]);
        return { rowCount: found ? 1 : 0, rows: found ? [{ id: found.id }] : [] };
      }
      if (sql.includes('SELECT COALESCE(MAX(version)')) {
        return { rowCount: 1, rows: [{ version: versions.filter(item => item.botId === params[0]).length + 1 }] };
      }
      if (sql.includes('INSERT INTO bot_versions')) {
        versions.push({ id: params[0], botId: params[1], version: params[2], filename: params[3], sha256: params[4],
          source: params[5], validationStatus: 'READY' });
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {}
  };
} };

await seedSampleBots(pool);
assert.equal(versions.length, 2);
assert.ok(versions.every(version => version.validationStatus === 'READY' && version.source.length > 0));
await seedSampleBots(pool);
assert.equal(versions.length, 2, 'restarting the web service must not duplicate sample versions');
console.log('✓ Bundled sample bots seed as idempotent Practice Arena opponents');
