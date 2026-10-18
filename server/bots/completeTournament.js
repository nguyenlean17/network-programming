/** Call inside the transaction that saves a match result, before COMMIT. */
export async function completeTournament(client, matchId) {
  // Serialize finishers of the same tournament. The next statement gets a fresh
  // READ COMMITTED snapshot after any earlier finisher has committed its result.
  const tournament = await client.query(`SELECT id FROM tournaments
    WHERE id = (SELECT tournament_id FROM matches WHERE id = $1)
    FOR NO KEY UPDATE`, [matchId]);
  if (!tournament.rowCount) return; // Practice matches have no tournament.
  const finished = await client.query(`UPDATE tournaments SET status = 'COMPLETED', completed_at = now()
    WHERE id = $1 AND status = 'RUNNING'
      AND NOT EXISTS (SELECT 1 FROM matches WHERE tournament_id = $1 AND status <> 'COMPLETED')
    RETURNING id`, [tournament.rows[0].id]);
  if (finished.rowCount) await client.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
    VALUES (gen_random_uuid(), NULL, 'TOURNAMENT_AUTO_COMPLETED', 'TOURNAMENT', $1, '{}'::jsonb)`, [finished.rows[0].id]);
}
