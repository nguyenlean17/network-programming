import { pagination, pageResult } from './pagination.js';

export function jobFilters(query) {
  const status = query.status || null, type = query.type || null, reference = query.reference || null;
  if ((status && !['QUEUED','RUNNING','FAILED','SUCCEEDED'].includes(status)) ||
      (type && !['MATCH','VALIDATION'].includes(type)) ||
      (reference && (typeof reference !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(reference)))) {
    throw Object.assign(new Error('Bộ lọc không hợp lệ. Mã tra cứu phải là UUID đầy đủ.'), { status: 400 });
  }
  return { status, type, reference };
}

export const ADMIN_JOBS_SQL = `SELECT * FROM (
  SELECT j.id,j.match_id,j.status,j.attempts,j.lease_until,j.created_at,j.updated_at,m.tournament_id,
    'MATCH' AS job_type,m.qualifier_submission_id AS submission_id,s.qualifier_id,NULL::uuid AS bot_version_id,
    m.kind AS match_kind,b1.name || ' / ' || b2.name AS job_name,m.error_message,NULL::text AS validation_status
  FROM runner_jobs j JOIN matches m ON m.id = j.match_id
    JOIN bot_versions v1 ON v1.id = m.p1_version_id JOIN bots b1 ON b1.id = v1.bot_id
    JOIN bot_versions v2 ON v2.id = m.p2_version_id JOIN bots b2 ON b2.id = v2.bot_id
    LEFT JOIN qualifier_submissions s ON s.id = m.qualifier_submission_id
  UNION ALL
  SELECT j.id,NULL::uuid,j.status,j.attempts,j.lease_until,j.created_at,j.updated_at,NULL::uuid,
    'VALIDATION',NULL::uuid,NULL::uuid,j.bot_version_id,NULL::text,
    b.name || ' v' || v.version::text,j.result_message,v.validation_status
  FROM bot_validation_jobs j JOIN bot_versions v ON v.id = j.bot_version_id JOIN bots b ON b.id = v.bot_id
) jobs WHERE ($3::text IS NULL OR status = $3) AND ($4::text IS NULL OR job_type = $4)
  AND ($5::uuid IS NULL OR id = $5 OR match_id = $5 OR tournament_id = $5 OR submission_id = $5 OR qualifier_id = $5 OR bot_version_id = $5)
ORDER BY created_at DESC,id LIMIT $1 OFFSET $2`;

export function installAdminMonitorRoutes(router, { pool, requireAdmin }) {
  router.get('/admin/overview', requireAdmin, async (_req, res, next) => {
    try {
      const queues = await pool.query(`SELECT 'MATCH' AS job_type,
        count(*) FILTER (WHERE status = 'QUEUED')::int AS queued,
        count(*) FILTER (WHERE status = 'RUNNING')::int AS running,
        count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
        count(*) FILTER (WHERE status = 'RUNNING' AND lease_until < now())::int AS expired,
        min(created_at) FILTER (WHERE status = 'QUEUED') AS oldest_queued_at
        FROM runner_jobs WHERE status IN ('QUEUED','RUNNING','FAILED')
        UNION ALL SELECT 'VALIDATION',count(*) FILTER (WHERE status = 'QUEUED')::int,
        count(*) FILTER (WHERE status = 'RUNNING')::int,count(*) FILTER (WHERE status = 'FAILED')::int,
        count(*) FILTER (WHERE status = 'RUNNING' AND lease_until < now())::int,
        min(created_at) FILTER (WHERE status = 'QUEUED')
        FROM bot_validation_jobs WHERE status IN ('QUEUED','RUNNING','FAILED')`);
      const workers = await pool.query(`SELECT worker_id,worker_role,last_seen_at,metrics_json,
        (online AND last_seen_at > now() - interval '90 seconds') AS healthy
        FROM bot_worker_heartbeats ORDER BY last_seen_at DESC,worker_id LIMIT 51`);
      // Cap the list, but assess capabilities using all live workers.
      const coverage = await pool.query(`SELECT count(*)::int AS healthy_workers,
        COALESCE(bool_or(worker_role IN ('all','validation')),false) AS validation,
        COALESCE(bool_or(worker_role IN ('all','matches')),false) AS matches
        FROM bot_worker_heartbeats WHERE online AND last_seen_at > now() - interval '90 seconds'`);
      res.json({ observedAt: new Date().toISOString(), queues: queues.rows, coverage: coverage.rows[0],
        workers: workers.rows.slice(0, 50), workersTruncated: workers.rows.length > 50 });
    } catch (error) { next(error); }
  });
  router.get('/admin/audit', requireAdmin, async (req, res, next) => {
    try {
      const paging = pagination(req.query);
      const reference = jobFilters({ reference: req.query.reference }).reference;
      const result = await pool.query(`SELECT a.id,a.action,a.subject_type,a.subject_id,a.created_at,u.display_name AS actor_name
        FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
        WHERE ($3::uuid IS NULL OR a.subject_id = $3)
        ORDER BY a.created_at DESC,a.id LIMIT $1 OFFSET $2`, [paging.limit + 1, paging.offset, reference]);
      res.json(pageResult(result.rows, paging, 'events'));
    } catch (error) { next(error); }
  });
}
