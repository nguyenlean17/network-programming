import assert from 'node:assert/strict';
import { createJobPicker } from '../server/bots/jobPicker.js';
import { qualificationPairings, scoreQualification } from '../server/bots/qualification.js';
const picker = createJobPicker({ claimValidation: async () => ({ id: 'validation' }), claimMatch: async () => ({ id: 'match' }) });
const types = [];
for (let i = 0; i < 6; i++) types.push((await picker()).type);
assert.deepEqual(types, ['validation','match','validation','match','validation','match']);
const dedicated = createJobPicker({ role: 'matches', claimValidation: async () => { throw new Error('Wrong queue'); }, claimMatch: async () => ({ id: 1 }) });
assert.equal((await dedicated()).type, 'match');
assert.equal((await createJobPicker({ claimValidation: async () => null, claimMatch: async () => ({ id: 1 }) })()).type, 'match');
assert.throws(() => createJobPicker({ role: 'bad' }));
const pairings = qualificationPairings('student', ['a','b'], 2);
assert.equal(pairings.length, 8);
assert.equal(pairings.filter(p => p.p1 === 'student').length, 4);
assert.throws(() => qualificationPairings('student', ['student']));
assert.deepEqual(scoreQualification('student', [
  { status: 'COMPLETED', p1_version_id: 'a', p2_version_id: 'student', result_json: { winner: 'P2' } },
  { status: 'COMPLETED', p1_version_id: 'student', p2_version_id: 'a', result_json: { winner: null } },
  { status: 'COMPLETED', p1_version_id: 'student', p2_version_id: 'a', result_json: { winner: 'P2' } }
]), { points: 4, wins: 1, draws: 1, losses: 1 });
assert.throws(() => scoreQualification('student', [{ status: 'FAILED' }]));
console.log('✓ Fair queue selection, dedicated worker roles, balanced qualifier matches and scoring');
