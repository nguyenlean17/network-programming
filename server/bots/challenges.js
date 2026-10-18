export const CHALLENGES = [
  { id: 'first-step', botId: '00000000-0000-4000-8000-00000000a101', icon: '🌱',
    title: 'Mầm non chiến thuật', description: 'Thử sức với bot chọn nước hợp lệ đầu tiên. Tập ưu tiên tới ô đích và ăn quân.',
    hint: 'Bắt đầu từ main.py, chấm điểm từng nước đi rồi chọn nước có điểm cao nhất.' },
  { id: 'goal-race', botId: '00000000-0000-4000-8000-00000000a102', icon: '🦊',
    title: 'Cuộc đua tới đích', description: 'Đối thủ ưu tiên ô đích, ăn quân và tiến gần mục tiêu. Hãy thử kết hợp tấn công với phòng thủ.',
    hint: 'Trước khi tấn công, kiểm tra xem đối thủ có thể tới ô đích ở lượt kế tiếp hay không.' }
];

const ownedPractice = `SELECT m.id,m.status,m.result_json,
  CASE WHEN b1.owner_id = $1 THEN m.p1_version_id ELSE m.p2_version_id END AS own_version_id,
  CASE WHEN b1.owner_id = $1 THEN m.p2_version_id ELSE m.p1_version_id END AS opponent_version_id,
  CASE WHEN b1.owner_id = $1 THEN 'P1' ELSE 'P2' END AS seat
  FROM matches m JOIN bot_versions v1 ON v1.id = m.p1_version_id JOIN bots b1 ON b1.id = v1.bot_id
  JOIN bot_versions v2 ON v2.id = m.p2_version_id JOIN bots b2 ON b2.id = v2.bot_id
  WHERE m.kind = 'PRACTICE' AND m.created_by = $1
    AND ((b1.owner_id = $1 AND b2.owner_id <> $1) OR (b2.owner_id = $1 AND b1.owner_id <> $1))`;

export async function challengeCatalog(pool) {
  const versions = await pool.query(`SELECT DISTINCT ON (v.bot_id) v.bot_id,v.id,v.version
    FROM bot_versions v JOIN bots b ON b.id = v.bot_id
    WHERE v.bot_id = ANY($1::uuid[]) AND b.is_public_sample = true AND v.validation_status = 'READY'
    ORDER BY v.bot_id,v.version DESC`, [CHALLENGES.map(item => item.botId)]);
  return CHALLENGES.map(item => {
    const version = versions.rows.find(row => row.bot_id === item.botId);
    return { ...item, versionId: version?.id ?? null, version: version?.version ?? null };
  });
}

export function installChallengeRoutes(router, { pool, requireUser }) {
  router.get('/challenges', async (_req, res, next) => {
    try { res.json({ challenges: await challengeCatalog(pool) }); } catch (error) { next(error); }
  });
  router.get('/challenges/progress', requireUser, async (req, res, next) => {
    try {
      const challenges = await challengeCatalog(pool);
      const versions = await pool.query(`SELECT v.id,v.version,v.validation_status,b.name,
        (SELECT j.status FROM bot_validation_jobs j WHERE j.bot_version_id = v.id) AS validation_job_status FROM bot_versions v
        JOIN bots b ON b.id = v.bot_id WHERE b.owner_id = $1 ORDER BY v.created_at DESC LIMIT 100`, [req.user.id]);
      const stats = await pool.query(`WITH practice AS (${ownedPractice}) SELECT
        count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
        count(*) FILTER (WHERE status = 'COMPLETED' AND result_json->>'winner' = seat)::int AS wins,
        (SELECT count(*)::int FROM matches WHERE kind = 'PRACTICE' AND created_by = $1 AND status IN ('QUEUED','RUNNING')) AS active
        FROM practice`, [req.user.id]);
      const progress = await pool.query(`WITH practice AS (${ownedPractice}), paired AS (
        SELECT opponent_version_id,own_version_id,
          bool_or(seat = 'P1')::int + bool_or(seat = 'P2')::int AS won_seats,
          min(id::text) FILTER (WHERE seat = 'P1') AS p1_replay,
          min(id::text) FILTER (WHERE seat = 'P2') AS p2_replay
        FROM practice WHERE status = 'COMPLETED' AND result_json->>'winner' = seat
          AND opponent_version_id = ANY($2::uuid[])
        GROUP BY opponent_version_id,own_version_id
      ) SELECT DISTINCT ON (opponent_version_id) * FROM paired
        ORDER BY opponent_version_id,won_seats DESC,own_version_id`,
      [req.user.id, challenges.map(c => c.versionId).filter(Boolean)]);
      res.json({ versions: versions.rows, stats: stats.rows[0], challenges: challenges.map(c => {
        const best = progress.rows.find(row => row.opponent_version_id === c.versionId);
        return { ...c, wonSeats: best?.won_seats ?? 0, ownVersionId: best?.own_version_id ?? null,
          replays: [best?.p1_replay, best?.p2_replay].filter(Boolean) };
      }) });
    } catch (error) { next(error); }
  });
}
