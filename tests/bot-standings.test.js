import assert from 'node:assert/strict';
import { calculateStandings } from '../server/bots/standings.js';

const participants = [
  { botVersionId: 'v1', botName: 'Alpha', ownerName: 'An' },
  { botVersionId: 'v2', botName: 'Beta', ownerName: 'Bình' },
  { botVersionId: 'v3', botName: 'Gamma', ownerName: 'Chi' }
];
const matches = [
  { status: 'COMPLETED', p1VersionId: 'v1', p2VersionId: 'v2', result: { winner: 'P1' } },
  { status: 'COMPLETED', p1VersionId: 'v1', p2VersionId: 'v3', result: { winner: null } },
  { status: 'COMPLETED', p1VersionId: 'v2', p2VersionId: 'v3', result: { winner: 'P2' } },
  { status: 'RUNNING', p1VersionId: 'v1', p2VersionId: 'v2' }
];
const table = calculateStandings(participants, matches);
assert.deepEqual(table.map(row => [row.botVersionId, row.points, row.played, row.wins, row.draws, row.losses, row.rank]), [
  ['v1', 4, 2, 1, 1, 0, 1],
  ['v3', 4, 2, 1, 1, 0, 1],
  ['v2', 0, 2, 0, 0, 2, 3]
]);
assert.equal(table[0].winRate, 0.5);
assert.throws(() => calculateStandings(participants, [...matches, {
  status: 'COMPLETED', p1VersionId: 'unknown', p2VersionId: 'v2', result: { winner: 'P1' }
}]));
console.log('✓ Tournament standings award 3/1/0 and preserve tied ranks');
