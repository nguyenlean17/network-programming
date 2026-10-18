import pg from 'pg';
import { Render } from '@renderinc/sdk';
import { runBotMatch } from './match.js';
import { createRenderSandboxRunner, validatePythonBot } from './renderSandboxRunner.js';
import { completeTournament } from './completeTournament.js';
import { watchPoolErrors } from './database.js';
import { migrateBotPlatform } from './migrate.js';
import { verifyWorkerSandbox, startWorkerHeartbeat } from './workerReadiness.js';
import { completeQualificationSubmission } from './qualification.js';
import { createJobPicker } from './jobPicker.js';

const { Pool } = pg;
const pollMs = Number(process.env.BOT_WORKER_POLL_MS) > 0 ? Number(process.env.BOT_WORKER_POLL_MS) : 1500;
const maxAttempts = 3;
const leaseMs = 5 * 60 * 1000;

if (!process.env.DATABASE_URL || !process.env.RENDER_API_KEY || !process.env.RENDER_WORKSPACE_ID) {
  throw new Error('Worker requires DATABASE_URL, RENDER_API_KEY and RENDER_WORKSPACE_ID');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000 });
watchPoolErrors(pool, 'Bot worker');
const render = new Render({ token: process.env.RENDER_API_KEY, ownerId: process.env.RENDER_WORKSPACE_ID });
const sandboxes = render.experimental.sandboxes;
let stopping = false;

async function claimJob() {
  const recovery = await pool.connect();
  try {
    await recovery.query('BEGIN');
    const expired = await recovery.query(`UPDATE runner_jobs SET status = 'FAILED', lease_until = NULL,
      updated_at = now() WHERE status = 'RUNNING' AND lease_until < now() AND attempts >= $1 RETURNING match_id`, [maxAttempts]);
    if (expired.rowCount) {
      await recovery.query(`UPDATE matches SET status = 'FAILED', error_message = 'Runner lease expired after maximum retries'
        WHERE id = ANY($1::uuid[])`, [expired.rows.map(row => row.match_id)]);
    }
    await recovery.query('COMMIT');
  } catch (error) {
    await recovery.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { recovery.release(); }
  const result = await pool.query(`WITH candidate AS (
      SELECT id FROM runner_jobs
      WHERE (status = 'QUEUED' OR (status = 'RUNNING' AND lease_until < now())) AND attempts < $1
        AND EXISTS (SELECT 1 FROM matches m LEFT JOIN tournaments t ON t.id = m.tournament_id
          WHERE m.id = runner_jobs.match_id AND
            (m.kind IN ('PRACTICE','QUALIFICATION') OR (m.kind = 'TOURNAMENT' AND t.status = 'RUNNING')))
      ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE runner_jobs j SET status = 'RUNNING', attempts = j.attempts + 1,
      lease_until = now() + ($2::int * interval '1 millisecond'), updated_at = now()
    FROM candidate WHERE j.id = candidate.id
    RETURNING j.id, j.match_id, j.attempts`, [maxAttempts, leaseMs]);
  return result.rows[0] ?? null;
}

async function claimValidationJob() {
  const abandoned = await pool.query(`UPDATE bot_validation_jobs SET status = 'FAILED', lease_until = NULL,
    result_message = 'Validation worker lease expired after maximum retries', updated_at = now()
    WHERE status = 'RUNNING' AND lease_until < now() AND attempts >= $1 RETURNING bot_version_id`, [maxAttempts]);
  if (abandoned.rowCount) {
    await pool.query(`UPDATE bot_versions SET validation_message = 'Isolated validation worker stopped unexpectedly'
      WHERE id = ANY($1::uuid[])`, [abandoned.rows.map(row => row.bot_version_id)]);
  }
  const result = await pool.query(`WITH candidate AS (
      SELECT id FROM bot_validation_jobs
      WHERE (status = 'QUEUED' OR (status = 'RUNNING' AND lease_until < now())) AND attempts < $1
      ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE bot_validation_jobs j SET status = 'RUNNING', attempts = j.attempts + 1,
      lease_until = now() + ($2::int * interval '1 millisecond'), updated_at = now()
    FROM candidate WHERE j.id = candidate.id
    RETURNING j.id, j.bot_version_id, j.attempts`, [maxAttempts, leaseMs]);
  return result.rows[0] ?? null;
}

function renewLease(jobId, attempt) {
  return pool.query(`UPDATE runner_jobs SET lease_until = now() + ($2::int * interval '1 millisecond'), updated_at = now()
    WHERE id = $1 AND status = 'RUNNING' AND attempts = $3`, [jobId, leaseMs, attempt]);
}

async function withActiveAttempt(job, update) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const active = await client.query('SELECT status, attempts FROM runner_jobs WHERE id = $1 FOR UPDATE', [job.id]);
    if (!active.rowCount || active.rows[0].status !== 'RUNNING' || active.rows[0].attempts !== job.attempts) {
      await client.query('ROLLBACK');
      return false;
    }
    await update(client);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

function startMatchProgress(job, initialBoard) {
  return withActiveAttempt(job, async client => {
    await client.query('DELETE FROM match_moves WHERE match_id = $1', [job.match_id]);
    await client.query(`UPDATE matches SET status = 'RUNNING', started_at = COALESCE(started_at, now()),
      initial_board_json = $2::jsonb, final_board_json = $2::jsonb, result_json = NULL,
      error_message = NULL WHERE id = $1`, [job.match_id, JSON.stringify(initialBoard)]);
  });
}

function persistMatchProgress(job, move, board) {
  return withActiveAttempt(job, async client => {
    await client.query(`INSERT INTO match_moves (match_id, ply, player, from_cell, to_cell, event_json)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [job.match_id, move.ply, move.player, move.from, move.to, JSON.stringify(move)]);
    await client.query('UPDATE matches SET final_board_json = $2::jsonb WHERE id = $1',
      [job.match_id, JSON.stringify(board)]);
  });
}

async function deferJob(job, error) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const active = await client.query("SELECT status, attempts FROM runner_jobs WHERE id = $1 FOR UPDATE", [job.id]);
    if (!active.rowCount || active.rows[0].status !== 'RUNNING' || active.rows[0].attempts !== job.attempts) { await client.query('COMMIT'); return; }
    const retry = job.attempts < maxAttempts;
    await client.query(`UPDATE runner_jobs SET status = $2, lease_until = NULL, updated_at = now() WHERE id = $1`,
      [job.id, retry ? 'QUEUED' : 'FAILED']);
    await client.query('UPDATE matches SET status = $2, error_message = $3 WHERE id = $1',
      [job.match_id, retry ? 'QUEUED' : 'FAILED', String(error?.message || error).slice(0, 500)]);
    await client.query('COMMIT');
  } catch (failure) {
    await client.query('ROLLBACK').catch(() => {});
    throw failure;
  } finally { client.release(); }
}

async function saveMatch(job, record) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query('SELECT status, attempts FROM runner_jobs WHERE id = $1 FOR UPDATE', [job.id]);
    if (!selected.rowCount || selected.rows[0].status !== 'RUNNING' || selected.rows[0].attempts !== job.attempts) { await client.query('ROLLBACK'); return; }
    if (record.result.reason === 'RUNNER_ERROR') {
      const retry = job.attempts < maxAttempts;
      await client.query('UPDATE runner_jobs SET status = $2, lease_until = NULL, updated_at = now() WHERE id = $1',
        [job.id, retry ? 'QUEUED' : 'FAILED']);
      await client.query('UPDATE matches SET status = $2, error_message = $3 WHERE id = $1',
        [job.match_id, retry ? 'QUEUED' : 'FAILED', record.result.detail || 'Runner infrastructure error']);
      await client.query('COMMIT');
      return;
    }
    await client.query(`UPDATE matches SET status = 'COMPLETED', result_json = $2::jsonb,
      initial_board_json = $3::jsonb, final_board_json = $4::jsonb, completed_at = now(), error_message = NULL
      WHERE id = $1`, [job.match_id, JSON.stringify(record.result), JSON.stringify(record.initialBoard), JSON.stringify(record.finalBoard)]);
    await client.query("UPDATE runner_jobs SET status = 'SUCCEEDED', lease_until = NULL, updated_at = now() WHERE id = $1", [job.id]);
    await completeTournament(client, job.match_id);
    await completeQualificationSubmission(client, job.match_id);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function executeJob(job) {
  const heartbeat = setInterval(() => renewLease(job.id, job.attempts).catch(error => console.error('Could not renew runner lease:', error.message)), 30000);
  try {
    const match = await pool.query(`SELECT id, p1_version_id, p2_version_id, rules_json, kind
      FROM matches WHERE id = $1 AND kind IN ('TOURNAMENT', 'PRACTICE', 'QUALIFICATION')`, [job.match_id]);
    if (!match.rowCount) throw new Error('Bot match record is missing');
    const row = match.rows[0];
    const versions = await pool.query(`SELECT id, source, validation_status FROM bot_versions
      WHERE id = ANY($1::uuid[])`, [[row.p1_version_id, row.p2_version_id]]);
    const byId = new Map(versions.rows.map(version => [version.id, version]));
    const p1 = byId.get(row.p1_version_id);
    const p2 = byId.get(row.p2_version_id);
    if (!p1 || !p2 || p1.validation_status !== 'READY' || p2.validation_status !== 'READY') {
      throw new Error('Match references a bot version that is not validated');
    }
    const runner = createRenderSandboxRunner({ sandboxes, sources: { P1: p1.source, P2: p2.source } });
    const record = await runBotMatch({ runner, maxPlies: row.rules_json.maxPlies, matchId: row.id,
      onStart: ({ initialBoard }) => startMatchProgress(job, initialBoard),
      onMove: ({ move, board }) => persistMatchProgress(job, move, board) });
    await saveMatch(job, record);
  } catch (error) {
    console.error(`Runner job ${job.id} failed:`, error.message);
    await deferJob(job, error);
  } finally { clearInterval(heartbeat); }
}

async function finishValidation(job, result, infraError = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const active = await client.query('SELECT status, attempts FROM bot_validation_jobs WHERE id = $1 FOR UPDATE', [job.id]);
    if (!active.rowCount || active.rows[0].status !== 'RUNNING' || active.rows[0].attempts !== job.attempts) {
      await client.query('ROLLBACK'); return;
    }
    if (infraError) {
      const retry = job.attempts < maxAttempts;
      await client.query('UPDATE bot_validation_jobs SET status = $2, lease_until = NULL, result_message = $3, updated_at = now() WHERE id = $1',
        [job.id, retry ? 'QUEUED' : 'FAILED', String(infraError.message || infraError).slice(0, 500)]);
      if (!retry) await client.query("UPDATE bot_versions SET validation_message = 'Isolated validation service failed after retries' WHERE id = $1", [job.bot_version_id]);
    } else {
      await client.query(`UPDATE bot_versions SET validation_status = $2, validation_message = $3 WHERE id = $1`,
        [job.bot_version_id, result.valid ? 'READY' : 'REJECTED', result.message]);
      await client.query(`UPDATE bot_validation_jobs SET status = 'SUCCEEDED', lease_until = NULL,
        result_message = $2, updated_at = now() WHERE id = $1`, [job.id, result.message]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function executeValidation(job) {
  try {
    const version = await pool.query('SELECT source FROM bot_versions WHERE id = $1', [job.bot_version_id]);
    if (!version.rowCount) throw new Error('Bot version is missing');
    const result = await validatePythonBot({ sandboxes, source: version.rows[0].source });
    await finishValidation(job, result);
  } catch (error) {
    console.error(`Bot validation job ${job.id} failed:`, error.message);
    await finishValidation(job, null, error);
  }
}

async function main() {
  let stopHeartbeat;
  try {
    const pickJob = createJobPicker({ claimValidation: claimValidationJob, claimMatch: claimJob, role: process.env.BOT_WORKER_ROLE || 'all' });
    await migrateBotPlatform(pool);
    await verifyWorkerSandbox(sandboxes);
    stopHeartbeat = await startWorkerHeartbeat(pool, process.env.BOT_WORKER_ROLE || 'all');
    console.log('OTTv2 isolated bot worker started');
    while (!stopping) {
      try {
        const next = await pickJob();
        if (next?.type === 'validation') await executeValidation(next.job);
        else if (next) await executeJob(next.job);
        else await new Promise(resolve => setTimeout(resolve, pollMs));
      } catch (error) {
        console.error('Worker loop error:', error.message);
        await new Promise(resolve => setTimeout(resolve, Math.min(pollMs * 5, 10000)));
      }
    }
  } finally {
    if (stopHeartbeat) await stopHeartbeat().catch(() => {});
    await pool.end();
  }
}

process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });
main().catch(error => { console.error('Worker stopped:', error); process.exitCode = 1; });
