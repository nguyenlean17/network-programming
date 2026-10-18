/** Alternate queue types so a steady upload stream cannot starve matches. */
export function createJobPicker({ claimValidation, claimMatch, role = 'all' }) {
  if (!['all', 'validation', 'matches'].includes(role)) throw new Error('BOT_WORKER_ROLE must be all, validation or matches');
  let preferValidation = true;
  return async () => {
    const validation = { type: 'validation', claim: claimValidation };
    const match = { type: 'match', claim: claimMatch };
    const order = role === 'validation' ? [validation] : role === 'matches' ? [match]
      : preferValidation ? [validation, match] : [match, validation];
    for (const item of order) {
      const job = await item.claim();
      if (job) { preferValidation = item.type !== 'validation'; return { type: item.type, job }; }
    }
    return null;
  };
}
