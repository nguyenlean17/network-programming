import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.events = {}; this.dataset = {}; this.value = ''; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(event, handler) { this.events[event] = handler; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.tag === selector ? [child] : []), ...child.querySelectorAll(selector)]); }
}
const elements = new Map(), timers = new Map(), events = {};
const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
const text = el => [el.textContent, ...el.children.map(text)].join(' ');
let timerId = 0, posts = 0, resolvePost, fail = false;
const data = { stats: { completed: 0, wins: 0, active: 0 }, versions: [
  { id: 'v1', name: 'My bot', version: 1, validation_status: 'READY' },
  { id: 'v2', name: 'My bot', version: 2, validation_status: 'READY' }
], challenges: [{ id: 'c1', icon: '🌱', title: '<script>name</script>', description: 'Example', hint: 'Hint', versionId: 'sample', version: 1, wonSeats: 0, replays: [] }] };
const context = vm.createContext({
  document: { getElementById: get, createElement: tag => new Element(tag) }, sessionStorage: { getItem: () => 'token' },
  window: { addEventListener: (name, callback) => { events[name] = callback; } },
  setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
  fetch: async (url, options) => {
    if (fail) throw new Error('Offline');
    if (url.endsWith('/practice/matches')) {
      posts++; assert.deepEqual(JSON.parse(options.body), { ownBotVersionId: 'v2', opponentBotVersionId: 'sample', count: 2 });
      await new Promise(resolve => { resolvePost = resolve; }); data.stats.active = 2;
    } else assert.ok(url.endsWith('/challenges/progress'));
    return { ok: true, json: async () => structuredClone(data) };
  }
});
vm.runInContext(await readFile(new URL('../js/challengeHub.js', import.meta.url), 'utf8'), context);
await new Promise(setImmediate);
const list = get('challenge-list');
assert.equal(list.querySelectorAll('script').length, 0);
assert.match(text(list), /<script>name<\/script>/);
list.querySelectorAll('select')[0].value = 'v2';
const start = list.querySelectorAll('button')[0];
const pending = start.events.click();
await start.events.click(); assert.equal(posts, 1, 'double click must not enqueue another pair');
resolvePost(); await pending;
assert.equal(timers.size, 1);
assert.equal(list.querySelectorAll('button')[0].disabled, true, 'two active matches leave insufficient quota for another pair');
assert.equal(list.querySelectorAll('select')[0].value, 'v2', 'refresh preserves selected version');
data.stats = { active: 0, completed: 2, wins: 1 }; data.challenges[0].wonSeats = 1;
const [id, callback] = timers.entries().next().value; timers.delete(id); await callback();
assert.equal(timers.size, 0);
assert.match(text(list), /1\/2/); assert.doesNotMatch(text(list), /Đã vượt cửa ải/);
assert.equal((text(get('journey-milestones')).match(/✓ Đã đạt/g) || []).length, 4);
assert.equal(list.querySelectorAll('select')[0].value, 'v2');
data.versions.push({ id: 'failed', validation_status: 'QUARANTINED', validation_job_status: 'FAILED' });
await context.refresh(); assert.equal(timers.size, 0, 'failed validation must not poll indefinitely');
fail = true; await context.refresh(); assert.match(text(get('journey-notice')), /Offline/);
assert.equal(get('refresh-journey').disabled, false);
fail = false; data.stats.active = 1; await context.refresh(); assert.equal(timers.size, 1);
events.pagehide(); assert.equal(timers.size, 0);
console.log('✓ Beginner progress, safe names, balanced pair submission, duplicate-click guard, quota, preserved choices and polling cleanup');
