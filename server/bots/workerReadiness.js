import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validatePythonBot } from './renderSandboxRunner.js';
import { createWorkerMetricsSampler } from './workerMetrics.js';

/** Do not claim submissions until sandbox access and one trusted Python run work. */
export async function verifyWorkerSandbox(sandboxes) {
  const groups = await sandboxes.listGroups();
  if (!Array.isArray(groups) || !groups.length) {
    throw new Error('Render Sandboxes is not enabled for this workspace. Request access before starting the worker.');
  }
  const source = await readFile(new URL('../../examples/bots/first_legal.py', import.meta.url));
  const result = await validatePythonBot({ sandboxes, source });
  if (!result.valid) throw new Error(`Sandbox startup check failed: ${result.message}`);
}

export async function startWorkerHeartbeat(pool, role = 'all') {
  if (!['all', 'validation', 'matches'].includes(role)) throw new Error('Invalid worker role');
  const id = randomUUID();
  const sample = createWorkerMetricsSampler();
  const publish = () => pool.query(`INSERT INTO bot_worker_heartbeats (worker_id, last_seen_at, online, worker_role, metrics_json)
    VALUES ($1, now(), true, $2, $3::jsonb) ON CONFLICT (worker_id) DO UPDATE SET last_seen_at = now(), online = true,
      worker_role = EXCLUDED.worker_role, metrics_json = EXCLUDED.metrics_json`, [id, role, JSON.stringify(sample())]);
  await publish();
  let pending = null;
  const timer = setInterval(() => {
    if (pending) return;
    pending = publish().catch(error => console.error('Worker heartbeat failed:', error?.code || 'DATABASE_ERROR'))
      .finally(() => { pending = null; });
  }, 30000);
  return async () => {
    clearInterval(timer);
    await pending;
    await pool.query('UPDATE bot_worker_heartbeats SET online = false WHERE worker_id = $1', [id]);
  };
}

export async function readBotServiceStatus(pool, initialized) {
  if (!pool || !initialized) return { botPlatform: 'unavailable', botStorage: 'unavailable', botRunner: 'unknown' };
  try {
    const result = await pool.query(`SELECT
      COALESCE(bool_or(worker_role IN ('all','validation')), false) AS validation,
      COALESCE(bool_or(worker_role IN ('all','matches')), false) AS matches
      FROM bot_worker_heartbeats WHERE online = true AND last_seen_at > now() - interval '90 seconds'`);
    const validation = result.rows[0]?.validation === true;
    const matches = result.rows[0]?.matches === true;
    const online = validation && matches;
    return { botPlatform: online ? 'ready' : 'worker_offline', botStorage: 'ready',
      botRunner: online ? 'online' : validation || matches ? 'partial' : 'offline' };
  } catch {
    return { botPlatform: 'unavailable', botStorage: 'unavailable', botRunner: 'unknown' };
  }
}
