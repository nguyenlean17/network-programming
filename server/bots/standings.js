export const DEFAULT_SCORING = Object.freeze({ win: 3, draw: 1, loss: 0 });

/** Calculate standings only from completed, engine-confirmed tournament matches. */
export function calculateStandings(participants, matches, scoring = DEFAULT_SCORING) {
  if (!Array.isArray(participants) || !Array.isArray(matches)) throw new TypeError('Participants and matches must be arrays');
  if (!scoring || !Number.isFinite(scoring.win) || !Number.isFinite(scoring.draw) ||
      !Number.isFinite(scoring.loss) || scoring.win < 0 || scoring.draw < 0 || scoring.loss < 0) {
    throw new TypeError('Invalid scoring configuration');
  }

  const rows = new Map();
  for (const participant of participants) {
    if (!participant?.botVersionId || rows.has(participant.botVersionId)) throw new Error('Each participant needs a unique botVersionId');
    rows.set(participant.botVersionId, {
      botVersionId: participant.botVersionId,
      botName: participant.botName ?? participant.botVersionId,
      ownerName: participant.ownerName ?? null,
      points: 0, played: 0, wins: 0, draws: 0, losses: 0
    });
  }

  for (const match of matches) {
    if (match.status !== 'COMPLETED') continue;
    const p1 = rows.get(match.p1VersionId);
    const p2 = rows.get(match.p2VersionId);
    if (!p1 || !p2 || p1 === p2) throw new Error('Completed match refers to an unknown or duplicate participant');
    if (!match.result || !['P1', 'P2', null].includes(match.result.winner)) throw new Error('Completed match has no valid engine result');
    p1.played++;
    p2.played++;
    if (match.result.winner === 'P1') {
      p1.wins++; p1.points += scoring.win;
      p2.losses++; p2.points += scoring.loss;
    } else if (match.result.winner === 'P2') {
      p2.wins++; p2.points += scoring.win;
      p1.losses++; p1.points += scoring.loss;
    } else {
      p1.draws++; p2.draws++;
      p1.points += scoring.draw; p2.points += scoring.draw;
    }
  }

  const sorted = [...rows.values()].sort((a, b) => b.points - a.points || a.botVersionId.localeCompare(b.botVersionId));
  let rank = 0;
  let lastPoints = null;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].points !== lastPoints) rank = i + 1;
    sorted[i].rank = rank;
    lastPoints = sorted[i].points;
    sorted[i].winRate = sorted[i].played ? sorted[i].wins / sorted[i].played : null;
  }
  return sorted;
}
