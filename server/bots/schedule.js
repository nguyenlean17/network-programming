/** Pair every entry once in a circle schedule. A null opponent is a bye. */
export function createRoundRobinSchedule(versionIds) {
  if (!Array.isArray(versionIds) || versionIds.length < 2 || versionIds.length > 64 ||
      versionIds.some(id => typeof id !== 'string') || new Set(versionIds).size !== versionIds.length) {
    throw new Error('Round robin needs 2–64 unique bot version IDs');
  }
  const entries = [...versionIds];
  if (entries.length % 2) entries.push(null);
  const rounds = entries.length - 1;
  const half = entries.length / 2;
  const schedule = [];
  for (let round = 0; round < rounds; round++) {
    for (let slot = 0; slot < half; slot++) {
      const left = entries[slot];
      const right = entries[entries.length - 1 - slot];
      if (left && right) {
        const flip = (round + slot) % 2 === 1;
        schedule.push({ round: round + 1, p1VersionId: flip ? right : left, p2VersionId: flip ? left : right });
      }
    }
    entries.splice(1, 0, entries.pop());
  }
  return schedule;
}
