export function qualificationPairings(versionId, benchmarks, rounds = 1) {
  if (!versionId || !Array.isArray(benchmarks) || benchmarks.length < 1 || benchmarks.length > 8 ||
      benchmarks.includes(versionId) || new Set(benchmarks).size !== benchmarks.length || !Number.isInteger(rounds) || rounds < 1 || rounds > 3) {
    throw new Error('Invalid qualification benchmark schedule');
  }
  return benchmarks.flatMap(opponent => Array.from({ length: rounds }, (_, round) => [
    { p1: versionId, p2: opponent, round: round + 1 },
    { p1: opponent, p2: versionId, round: round + 1 }
  ]).flat());
}

/** Serialize final results for one submission, in the match-save transaction. */
export async function completeQualificationSubmission(client, matchId) {
  const found = await client.query(`SELECT id, bot_version_id, expected_matches, status FROM qualifier_submissions
    WHERE id = (SELECT qualifier_submission_id FROM matches WHERE id = $1) FOR NO KEY UPDATE`, [matchId]);
  if (!found.rowCount || found.rows[0].status === 'COMPLETED') return;
  const submission = found.rows[0];
  const games = await client.query(`SELECT status, p1_version_id, p2_version_id, result_json FROM matches
    WHERE qualifier_submission_id = $1`, [submission.id]);
  if (games.rowCount !== submission.expected_matches || games.rows.some(game => game.status !== 'COMPLETED')) return;
  const score = scoreQualification(submission.bot_version_id, games.rows);
  await client.query(`UPDATE qualifier_submissions SET status = 'COMPLETED', points = $2, wins = $3,
    draws = $4, losses = $5, completed_at = now() WHERE id = $1`,
  [submission.id, score.points, score.wins, score.draws, score.losses]);
}

export function scoreQualification(versionId, games) {
  const score = { points: 0, wins: 0, draws: 0, losses: 0 };
  for (const game of games) {
    if (game.status !== 'COMPLETED' || !game.result_json || !['P1', 'P2', null].includes(game.result_json.winner) ||
        ![game.p1_version_id, game.p2_version_id].includes(versionId)) throw new Error('Incomplete or invalid qualification result');
    const seat = game.p1_version_id === versionId ? 'P1' : 'P2';
    if (game.result_json.winner === null) { score.draws++; score.points++; }
    else if (game.result_json.winner === seat) { score.wins++; score.points += 3; }
    else score.losses++;
  }
  return score;
}

// One best completed submission per account. Equal points share the same rank;
// creation time and IDs only stabilize display/which equal-scoring version is shown.
export const QUALIFIER_LEADERBOARD_SQL = `WITH best AS (
  SELECT DISTINCT ON (s.user_id) s.* FROM qualifier_submissions s
  WHERE s.qualifier_id = $1 AND s.status = 'COMPLETED'
  ORDER BY s.user_id, s.points DESC, s.created_at, s.id
), ranked AS (
  SELECT best.*, rank() OVER (ORDER BY points DESC) AS rank FROM best
)
SELECT r.id AS submission_id, r.rank::int, r.points, r.wins, r.draws, r.losses,
  r.expected_matches AS played, u.display_name AS owner_name, b.name AS bot_name, v.version
FROM ranked r JOIN users u ON u.id = r.user_id JOIN bot_versions v ON v.id = r.bot_version_id
JOIN bots b ON b.id = v.bot_id ORDER BY r.points DESC, r.created_at, r.id LIMIT $2 OFFSET $3`;
