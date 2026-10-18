import assert from 'node:assert/strict';
import { completeTournament } from '../server/bots/completeTournament.js';

// Model independent READ COMMITTED transactions: uncommitted match results are
// visible only to their writer, and the tournament row lock lasts until commit.
function database(status = 'RUNNING', matchStates = ['RUNNING', 'RUNNING']) {
  const state = { status, matches: [...matchStates], audits: 0, waiting: 0 };
  let lock = Promise.resolve();
  let secondArrived;
  const bothArrived = new Promise(resolve => { secondArrived = resolve; });
  let arrivals = 0;
  return {
    state,
    transaction(index, concurrent = false) {
      let unlock;
      let complete = false;
      let audit = false;
      return {
        async query(sql) {
          if (sql.startsWith('SELECT id FROM tournaments')) {
            assert.match(sql, /FOR NO KEY UPDATE/);
            if (index === null) return { rowCount: 0, rows: [] };
            if (++arrivals === 2) secondArrived();
            const prior = lock;
            lock = new Promise(resolve => { unlock = resolve; });
            state.waiting++;
            await prior;
            state.waiting--;
            return { rowCount: 1, rows: [{ id: 'tournament' }] };
          }
          if (sql.startsWith('UPDATE tournaments')) {
            if (concurrent) await bothArrived;
            const visibleMatches = state.matches.map((value, i) => i === index ? 'COMPLETED' : value);
            complete = state.status === 'RUNNING' && visibleMatches.every(value => value === 'COMPLETED');
            return { rowCount: complete ? 1 : 0, rows: complete ? [{ id: 'tournament' }] : [] };
          }
          if (sql.startsWith('INSERT INTO audit_logs')) { audit = true; return { rowCount: 1 }; }
          throw new Error(`Unexpected query: ${sql}`);
        },
        commit() {
          if (index !== null) state.matches[index] = 'COMPLETED';
          if (complete) state.status = 'COMPLETED';
          if (audit) state.audits++;
          unlock?.();
        }
      };
    }
  };
}

const db = database();
const finish = async (client, matchId) => { await completeTournament(client, matchId); client.commit(); };
await Promise.all([finish(db.transaction(0, true), 'match-1'), finish(db.transaction(1, true), 'match-2')]);
assert.equal(db.state.status, 'COMPLETED', 'two simultaneous final matches must complete the tournament');
assert.equal(db.state.audits, 1, 'completion is audited exactly once');
await finish(db.transaction(1), 'match-2');
assert.equal(db.state.audits, 1, 'a repeated finish must not repeat the audit');

const paused = database('PAUSED', ['COMPLETED', 'RUNNING']);
await finish(paused.transaction(1), 'match-2');
assert.equal(paused.state.status, 'PAUSED', 'finishing an active match must respect an administrator pause');
assert.equal(paused.state.audits, 0);
const failed = database('RUNNING', ['FAILED', 'RUNNING']);
await finish(failed.transaction(1), 'match-2');
assert.equal(failed.state.status, 'RUNNING', 'failed matches still require intervention');
const practice = database();
await finish(practice.transaction(null), 'practice');
assert.equal(practice.state.audits, 0);
console.log('✓ Concurrent tournament finishers, one completion audit, pause and failed-match guards (transaction model)');
