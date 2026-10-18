import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import http from 'node:http';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { createBotPlatformRouter } from '../server/bots/platformRouter.js';
import { signAccessToken } from '../server/bots/auth.js';
import { completeQualificationSubmission } from '../server/bots/qualification.js';
import { readBotServiceStatus, startWorkerHeartbeat } from '../server/bots/workerReadiness.js';
import { seedSampleBots } from '../server/bots/seedSamples.js';

// Isolated PostgreSQL engine, no connection to development or production data.
const db = new PGlite();
const pool = {
  async query(sql, params = []) {
    const result = await db.query(sql, params);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  },
  async connect() { return { query: pool.query, release() {} }; }
};
const secret = 'qualifier integration test secret, never production';
const app = express();
app.use(express.json());
app.use('/api/platform', createBotPlatformRouter({ pool, authSecret: secret }));
const server = http.createServer(app);
let base;
async function request(path, user, body, expected = 200) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${signAccessToken(user, secret)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`);
  return result;
}
async function account(role = 'USER') {
  const id = randomUUID();
  await pool.query('INSERT INTO users (id,email,display_name,password_hash,role) VALUES ($1,$2,$3,$4,$5)',
    [id, `${id}@example.test`, id, 'disabled-test-login', role]);
  return { id };
}
async function version(owner, sha = randomUUID().replaceAll('-', '').repeat(2)) {
  const bot = randomUUID(), id = randomUUID();
  await pool.query('INSERT INTO bots (id,owner_id,name) VALUES ($1,$2,$3)', [bot, owner.id, `Test ${bot}`]);
  await pool.query(`INSERT INTO bot_versions (id,bot_id,version,api_version,filename,sha256,source,validation_status)
    VALUES ($1,$2,1,'1.0','bot.py',$3,convert_to('test fixture','UTF8'),'READY')`, [id, bot, sha]);
  return id;
}
async function games(id) { return (await pool.query('SELECT * FROM matches WHERE qualifier_submission_id = $1 ORDER BY id', [id])).rows; }
async function finish(game, outcome, studentVersion) {
  const seat = game.p1_version_id === studentVersion ? 'P1' : 'P2';
  const winner = outcome === 'D' ? null : outcome === 'W' ? seat : seat === 'P1' ? 'P2' : 'P1';
  await pool.query('BEGIN');
  try {
    await pool.query(`UPDATE matches SET status = 'COMPLETED',result_json = $2::jsonb WHERE id = $1`, [game.id, JSON.stringify({ winner })]);
    await completeQualificationSubmission(pool, game.id);
    await pool.query('COMMIT');
  } catch (error) { await pool.query('ROLLBACK'); throw error; }
}
try {
  const dir = new URL('../server/migrations/', import.meta.url);
  for (const file of (await readdir(dir)).filter(file => file.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file, dir), 'utf8'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/platform`;
  assert.equal((await readBotServiceStatus(pool, true)).botRunner, 'offline');
  const stopValidation = await startWorkerHeartbeat(pool, 'validation');
  const stopMatches = await startWorkerHeartbeat(pool, 'matches');
  try { assert.equal((await readBotServiceStatus(pool, true)).botPlatform, 'ready'); }
  finally { await stopMatches(); }
  try { assert.equal((await readBotServiceStatus(pool, true)).botRunner, 'partial'); }
  finally { await stopValidation(); }
  assert.equal((await readBotServiceStatus(pool, true)).botRunner, 'offline');
  const admin = await account('ADMIN'), a = await account(), b = await account();
  const benchmarks = [await version(admin), await version(admin)];
  const first = await version(a), second = await version(a), third = await version(a), other = await version(b);
  const config = { name: 'Isolated test qualifier', submissionDeadline: new Date(Date.now() + 86400000).toISOString(),
    benchmarkVersionIds: benchmarks, roundsPerOpponent: 1, maxSubmissions: 5 };
  await request('/qualifiers', null, config, 401);
  await request('/qualifiers', a, config, 403);
  await request('/qualifiers', admin, { ...config, benchmarkVersionIds: [first] }, 400);
  const q = (await request('/qualifiers', admin, config, 201)).qualifier;
  const submit = (v, who = a, status = 202) => request(`/qualifiers/${q.id}/submissions`, who, { botVersionId: v }, status);
  const board = async (query = '') => (await request(`/qualifiers/${q.id}/leaderboard${query}`)).leaderboard;
  await submit(first, a, 409);
  await request(`/qualifiers/${q.id}/open`, admin, {});
  await submit(other, a, 400);
  const s1 = await submit(first);
  const scheduled = await games(s1.submissionId);
  assert.equal(scheduled.length, 4);
  for (const opponent of benchmarks) {
    assert.equal(scheduled.filter(g => g.p1_version_id === first && g.p2_version_id === opponent).length, 1);
    assert.equal(scheduled.filter(g => g.p2_version_id === first && g.p1_version_id === opponent).length, 1);
  }
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM runner_jobs')).rows[0].n, 4);
  await submit(first, a, 409);
  await submit(second, a, 429);
  assert.deepEqual(await board(), []);
  await finish(scheduled[0], 'W', first);
  assert.deepEqual(await board(), [], 'Partial scores must never enter the leaderboard');
  await pool.query("UPDATE matches SET status = 'FAILED' WHERE id = $1", [scheduled[1].id]);
  assert.deepEqual(await board(), []);
  const privateGames = await request(`/qualifiers/${q.id}/submissions/${s1.submissionId}/matches`, b);
  assert.deepEqual(privateGames.matches, []);
  await finish(scheduled[1], 'W', first);
  await finish(scheduled[2], 'D', first);
  await finish(scheduled[3], 'L', first);
  await completeQualificationSubmission(pool, scheduled[3].id); // Idempotent completion.
  assert.equal((await board())[0].points, 7);
  const sha = (await pool.query('SELECT sha256 FROM bot_versions WHERE id = $1', [first])).rows[0].sha256;
  await submit(await version(a, sha), a, 409);
  for (const [v, outcomes] of [[second, ['L','L','D','L']], [third, ['W','W','W','W']]]) {
    const submission = await submit(v);
    for (const [i, game] of (await games(submission.submissionId)).entries()) await finish(game, outcomes[i], v);
    assert.equal((await board())[0].points, v === second ? 7 : 12, 'Use best version, never sum versions');
    assert.equal((await board()).length, 1);
  }
  const sb = await submit(other, b);
  await request(`/qualifiers/${q.id}/close`, admin, {});
  await request(`/qualifiers/${q.id}/finalize`, admin, {}, 409);
  await submit(await version(a), a, 409);
  for (const game of await games(sb.submissionId)) await finish(game, 'W', other);
  assert.deepEqual((await board()).map(row => row.rank), [1, 1]);
  const page1 = await request(`/qualifiers/${q.id}/leaderboard?limit=1`);
  const page2 = await request(`/qualifiers/${q.id}/leaderboard?limit=1&page=2`);
  assert.equal(page1.hasMore, true); assert.equal(page2.hasMore, false);
  assert.equal(page2.leaderboard[0].rank, 1);
  assert.notEqual(page1.leaderboard[0].submission_id, page2.leaderboard[0].submission_id);
  await request(`/qualifiers/${q.id}/leaderboard?limit=101`, null, undefined, 400);
  assert.equal((await request(`/qualifiers/${q.id}/finalize`, admin, {})).qualifier.status, 'FINALIZED');
  await assert.rejects(pool.query('DELETE FROM bot_versions WHERE id = $1', [benchmarks[0]]), error => error.code === '23503');
  await request('/admin/users?page=1&limit=2', admin);
  await request('/admin/jobs?page=1&limit=2', admin);

  // Enforce phase limits and rolling quotas across phases, including expiry.
  const limitedUser = await account();
  const one = (await request('/qualifiers', admin, { ...config, benchmarkVersionIds: [benchmarks[0]], maxSubmissions: 1 }, 201)).qualifier;
  const two = (await request('/qualifiers', admin, { ...config, benchmarkVersionIds: [benchmarks[0]], maxSubmissions: 100 }, 201)).qualifier;
  for (const phase of [one, two]) await request(`/qualifiers/${phase.id}/open`, admin, {});
  const limitedSubmit = (phase, v, status = 202) => request(`/qualifiers/${phase.id}/submissions`, limitedUser, { botVersionId: v }, status);
  const limitedVersion = await version(limitedUser);
  const pending = await limitedSubmit(one, limitedVersion);
  const nextVersion = await version(limitedUser);
  await limitedSubmit(two, nextVersion, 429);
  for (const game of await games(pending.submissionId)) await finish(game, 'D', limitedVersion);
  await limitedSubmit(one, nextVersion, 429);
  for (let i = 0; i < 4; i++) {
    const v = await version(limitedUser);
    const submission = await limitedSubmit(two, v);
    for (const game of await games(submission.submissionId)) await finish(game, 'D', v);
  }
  await limitedSubmit(two, nextVersion, 429);
  await pool.query("UPDATE qualifier_submissions SET created_at = now() - interval '25 hours' WHERE id = $1", [pending.submissionId]);
  const allowedAgain = await limitedSubmit(two, nextVersion);
  for (const game of await games(allowedAgain.submissionId)) await finish(game, 'D', nextVersion);
  await pool.query("UPDATE qualifiers SET submission_deadline = now() - interval '1 minute' WHERE id = $1", [two.id]);
  await limitedSubmit(two, await version(limitedUser), 409);
  assert.equal((await request(`/qualifiers/${two.id}/finalize`, admin, {})).qualifier.status, 'FINALIZED');

  // Beginner milestones use real SQL over isolated fixture matches, never client claims.
  await seedSampleBots(pool);
  const catalog = (await request('/challenges')).challenges;
  assert.equal(catalog.length, 2);
  assert.ok(catalog.every(c => c.versionId));
  await request('/challenges/progress', null, undefined, 401);
  let journey = await request('/challenges/progress', a);
  assert.equal(journey.stats.completed, 0, 'qualifying results are not practice milestones');
  assert.equal(journey.stats.wins, 0);
  const opponent = catalog[0].versionId;
  const pair = async v => (await request('/practice/matches', a,
    { ownBotVersionId: v, opponentBotVersionId: opponent, count: 2 }, 202)).matchIds;
  const setResult = (id, winner, status = 'COMPLETED') => pool.query(
    'UPDATE matches SET status = $2, result_json = $3::jsonb WHERE id = $1', [id, status, JSON.stringify({ winner, reason: 'GOAL_REACHED' })]);
  const firstPair = await pair(first);
  journey = await request('/challenges/progress', a);
  assert.equal(journey.stats.active, 2); assert.equal(journey.challenges[0].wonSeats, 0);
  await setResult(firstPair[0], 'P1');
  await setResult(firstPair[1], 'P2', 'FAILED');
  journey = await request('/challenges/progress', a);
  assert.equal(journey.stats.wins, 1, 'failed matches never award wins');
  assert.equal(journey.challenges[0].wonSeats, 1);
  const secondPair = await pair(second);
  await setResult(secondPair[0], 'P2'); await setResult(secondPair[1], 'P2');
  journey = await request('/challenges/progress', a);
  assert.equal(journey.challenges[0].wonSeats, 1, 'opposite-seat wins from different own versions cannot combine');
  const thirdPair = await pair(first);
  await setResult(thirdPair[0], 'P2'); await setResult(thirdPair[1], 'P2');
  journey = await request('/challenges/progress', a);
  assert.equal(journey.challenges[0].wonSeats, 2);
  assert.equal(journey.challenges[0].ownVersionId, first);
  assert.deepEqual(new Set(journey.challenges[0].replays), new Set([firstPair[0], thirdPair[1]]));
  assert.equal(journey.stats.wins, 3);
  assert.equal((await request('/challenges/progress', b)).stats.wins, 0, 'achievements belong only to the requesting account');
  const self = await request('/practice/matches', a, { ownBotVersionId: first, opponentBotVersionId: second, count: 1 }, 202);
  await setResult(self.matchId, 'P1');
  assert.equal((await request('/challenges/progress', a)).stats.wins, 3, 'self-play does not award a win badge');
  await pool.query(`INSERT INTO bot_versions (id,bot_id,version,api_version,filename,sha256,source,validation_status)
    SELECT $1,bot_id,2,api_version,filename,$2,source,'READY' FROM bot_versions WHERE id = $3`,
  [randomUUID(), 'a'.repeat(64), opponent]);
  assert.equal((await request('/challenges/progress', a)).challenges[0].wonSeats, 0, 'a revised sample version starts a new challenge');

  // Operational monitoring must be admin-only and retries must leave an audit trail.
  for (const route of ['/admin/overview','/admin/audit','/admin/jobs?status=FAILED']) {
    await request(route, null, undefined, 401); await request(route, a, undefined, 403);
  }
  await request('/admin/jobs?status=NOPE', admin, undefined, 400);
  await request('/admin/jobs?reference=not-a-uuid', admin, undefined, 400);
  await request('/admin/audit?reference=not-a-uuid', admin, undefined, 400);
  const scoped = await request(`/admin/jobs?type=MATCH&reference=${q.id}`, admin);
  assert.ok(scoped.jobs.length > 0 && scoped.jobs.every(j => j.qualifier_id === q.id));
  const failedMatch = randomUUID(), failedJob = randomUUID();
  await pool.query(`INSERT INTO matches(id,created_by,kind,p1_version_id,p2_version_id,rules_json,status,error_message)
    VALUES($1,$2,'PRACTICE',$3,$4,'{}','FAILED','<script>diagnostic</script>')`, [failedMatch,a.id,first,opponent]);
  await pool.query(`INSERT INTO runner_jobs(id,match_id,status,attempts) VALUES($1,$2,'FAILED',3)`, [failedJob,failedMatch]);
  const failed = await request(`/admin/jobs?status=FAILED&type=MATCH&reference=${failedMatch}`, admin);
  assert.equal(failed.jobs.length, 1); assert.equal(failed.jobs[0].id, failedJob);
  assert.equal(failed.jobs[0].error_message, '<script>diagnostic</script>');
  let overview = await request('/admin/overview', admin);
  assert.equal(overview.coverage.matches, false); assert.equal(overview.coverage.validation, false);
  assert.ok(overview.queues.find(q => q.job_type === 'MATCH').failed >= 1);
  const monitorHeartbeat = await startWorkerHeartbeat(pool, 'matches');
  try {
    overview = await request('/admin/overview', admin);
    assert.equal(overview.coverage.matches, true); assert.equal(overview.coverage.validation, false);
    assert.equal(overview.coverage.healthy_workers, 1);
    assert.ok(overview.workers.find(w => w.healthy).metrics_json.rssBytes > 0);
    await pool.query("UPDATE bot_worker_heartbeats SET last_seen_at=now()-interval '2 minutes' WHERE online");
    assert.equal((await request('/admin/overview', admin)).coverage.matches, false, 'stale workers do not count as available');
  } finally { await monitorHeartbeat(); }
  await request(`/admin/jobs/${failedJob}/retry`, a, { jobType: 'MATCH' }, 403);
  await request(`/admin/jobs/${failedJob}/retry`, admin, { jobType: 'MATCH' }, 202);
  await request(`/admin/jobs/${failedJob}/retry`, admin, { jobType: 'MATCH' }, 404);
  const queuedAgain = await request(`/admin/jobs?status=QUEUED&reference=${failedJob}`, admin);
  assert.equal(queuedAgain.jobs.length, 1); assert.equal(queuedAgain.jobs[0].attempts, 0);
  const events = (await request(`/admin/audit?reference=${failedMatch}`, admin)).events;
  assert.equal(events.length, 1); assert.equal(events[0].action, 'MATCH_JOB_REQUEUED');
  assert.equal(events[0].actor_name, admin.id);
  const validationVersion = await version(a), validationJob = randomUUID();
  await pool.query("UPDATE bot_versions SET validation_status='QUARANTINED' WHERE id=$1", [validationVersion]);
  await pool.query("INSERT INTO bot_validation_jobs(id,bot_version_id,status,attempts,result_message) VALUES($1,$2,'FAILED',3,'Sandbox unavailable')", [validationJob,validationVersion]);
  let validationJobs = (await request(`/admin/jobs?type=VALIDATION&reference=${validationVersion}`, admin)).jobs;
  assert.equal(validationJobs.length, 1); assert.equal(validationJobs[0].validation_status, 'QUARANTINED');
  await request(`/admin/jobs/${validationJob}/retry`, admin, { jobType: 'VALIDATION' }, 202);
  assert.equal((await request(`/admin/audit?reference=${validationVersion}`, admin)).events[0].action, 'BOT_VALIDATION_REQUEUED');
  await pool.query("UPDATE bot_validation_jobs SET status='SUCCEEDED',result_message='SyntaxError' WHERE id=$1", [validationJob]);
  await pool.query("UPDATE bot_versions SET validation_status='REJECTED' WHERE id=$1", [validationVersion]);
  validationJobs = (await request(`/admin/jobs?status=SUCCEEDED&type=VALIDATION&reference=${validationVersion}`, admin)).jobs;
  assert.equal(validationJobs[0].validation_status, 'REJECTED', 'completed validation must not be mistaken for accepted source');

  // 5,000 rows exercise real ranking SQL and pagination, not a concurrency/load claim.
  const large = (await request('/qualifiers', admin, { ...config, name: '5000 isolated fixtures' }, 201)).qualifier;
  await pool.query(`INSERT INTO users (id,email,display_name,password_hash)
    SELECT md5('fixture-user-' || n)::uuid, 'fixture-' || n || '@example.test', 'Fixture ' || n, 'disabled'
    FROM generate_series(1,5000) n`);
  await pool.query(`INSERT INTO qualifier_submissions (id,qualifier_id,user_id,bot_version_id,source_sha256,
    expected_matches,status,points,wins,draws,losses,completed_at)
    SELECT gen_random_uuid(),$1,md5('fixture-user-' || n)::uuid,$2,repeat('0',64),4,'COMPLETED',
      (n % 5)*3,n % 5,0,4-(n % 5),now() FROM generate_series(1,5000) n`, [large.id, first]);
  const firstPage = await request(`/qualifiers/${large.id}/leaderboard?limit=50`);
  const lastPage = await request(`/qualifiers/${large.id}/leaderboard?limit=50&page=100`);
  assert.equal(firstPage.leaderboard.length, 50); assert.equal(firstPage.hasMore, true);
  assert.equal(lastPage.leaderboard.length, 50); assert.equal(lastPage.hasMore, false);
  assert.equal(firstPage.leaderboard[0].rank, 1); assert.equal(lastPage.leaderboard[0].rank, 4001);
  console.log('✓ PostgreSQL qualifiers, quotas, scoring, 5,000-row ranking and private beginner achievements with balanced challenge wins');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await db.close();
}
