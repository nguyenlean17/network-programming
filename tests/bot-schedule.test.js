import assert from 'node:assert/strict';
import { createRoundRobinSchedule } from '../server/bots/schedule.js';

for (const count of [2, 3, 4, 5, 8]) {
  const ids = Array.from({ length: count }, (_, index) => `v${index}`);
  const schedule = createRoundRobinSchedule(ids);
  assert.equal(schedule.length, count * (count - 1) / 2);
  const opponents = new Map(ids.map(id => [id, new Set()]));
  for (const match of schedule) {
    assert.ok(ids.includes(match.p1VersionId));
    assert.ok(ids.includes(match.p2VersionId));
    assert.notEqual(match.p1VersionId, match.p2VersionId);
    const pair = [match.p1VersionId, match.p2VersionId].sort().join(':');
    assert.equal([...opponents.values()].some(set => set.has(pair)), false, 'pairing must not repeat');
    for (const id of [match.p1VersionId, match.p2VersionId]) opponents.get(id).add(pair);
  }
  for (const id of ids) assert.equal(opponents.get(id).size, count - 1);
}
assert.throws(() => createRoundRobinSchedule(['same', 'same']));
console.log('✓ Round robin schedules each unique pair exactly once');
