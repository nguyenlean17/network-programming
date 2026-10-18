import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.events = {}; this.value = ''; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(event, handler) { this.events[event] = handler; }
  get options() { return this.children.filter(child => child.tag === 'option'); }
  get childElementCount() { return this.children.length; }
  querySelectorAll(selector) {
    const matches = node => selector.startsWith('.') ? node.className?.split(' ').includes(selector.slice(1)) : node.tag === selector;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
}
const elements = new Map(), timers = new Map(), events = {};
const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
const content = element => [element.textContent, ...element.children.map(content)].join(' ');
let timerId = 0, submitted = 0, boardRequests = 0, completed = false, deferred = null;
const phase = { id: 'q1', name: '<script>unsafe</script>', status: 'OPEN', submission_deadline: '2099-01-01', benchmark_count: 2, rounds_per_opponent: 1, max_submissions: 20 };
const results = () => ({ submissions: [{ id: 's1', bot_name: 'My bot', version: 1, status: completed ? 'COMPLETED' : 'PENDING',
  points: 7, completed_matches: completed ? 4 : 1, expected_matches: 4, failed_matches: 0 }], page: 1, hasMore: false });
const context = vm.createContext({
  document: { getElementById: get, createElement: tag => new Element(tag) },
  sessionStorage: { getItem: () => 'test-token' },
  window: { addEventListener: (name, callback) => { events[name] = callback; } },
  setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
  fetch: async (url, options) => {
    let data;
    if (url.endsWith('/auth/me')) data = { user: { id: 'u1', role: 'USER', displayName: 'Student' } };
    else if (url.includes('/qualifiers?page=')) data = { qualifiers: [phase], page: 1, hasMore: false };
    else if (url.endsWith('/bots')) data = { bots: [{ name: 'My bot', versions: [{ id: 'ready', version: 1, status: 'READY' }, { id: 'pending', version: 2, status: 'QUARANTINED' }] }] };
    else if (url.endsWith('/submissions') && options.method === 'POST') { submitted++; data = { matches: 4 }; }
    else if (url.includes('/submissions?')) {
      if (deferred) return deferred;
      data = results();
    }
    else if (url.includes('/leaderboard?')) { boardRequests++; data = { leaderboard: [], page: 1, hasMore: false }; }
    else throw new Error(`Unexpected endpoint: ${url}`);
    return { ok: true, json: async () => data };
  }
});
vm.runInContext(await readFile(new URL('../js/qualifierHub.js', import.meta.url), 'utf8'), context);
await new Promise(setImmediate);
assert.equal(get('qualifier-admin').hidden, true);
assert.match(content(get('qualifier-account')), /Student/);
const list = get('qualifier-list');
assert.match(content(list), /<script>unsafe<\/script>/);
assert.equal(list.querySelectorAll('script').length, 0, 'phase names are rendered as text');
const choice = list.querySelector('select');
assert.equal(choice.options.length, 1, 'only validated own versions can be selected');
choice.value = 'ready';
const click = label => list.querySelectorAll('button').find(node => node.textContent === label).events.click();
await click('Bảng xếp hạng');
await click('Nộp chấm điểm');
assert.equal(submitted, 1); assert.equal(timers.size, 1);
await click('Bài của tôi');
assert.equal(timers.size, 1, 'manual refresh replaces rather than duplicates the polling loop');
completed = true;
const [id, callback] = timers.entries().next().value;
timers.delete(id); await callback();
assert.equal(timers.size, 0, 'completed history stops polling');
assert.match(content(list), /7 điểm/);
assert.equal(boardRequests, 2, 'completion refreshes an open leaderboard');

// A slow prior history request cannot overwrite a newer response or restart polling.
const container = new Element(), board = new Element();
let resolveOld;
deferred = new Promise(resolve => { resolveOld = resolve; });
const old = context.history('q1', container, board, 1);
deferred = null;
await context.history('q1', container, board, 1);
resolveOld({ ok: true, json: async () => ({ ...results(), submissions: [{ ...results().submissions[0], status: 'PENDING', points: 0 }] }) });
await old;
assert.match(content(container), /7 điểm/);
assert.equal(timers.size, 0);
completed = false;
await click('Bài của tôi');
assert.equal(timers.size, 1);
events.pagehide();
assert.equal(timers.size, 0, 'leaving the page cancels pending refreshes');
console.log('✓ Qualifier UI authorization, safe text, validated selection, submission, completion and stale-poll protection');
