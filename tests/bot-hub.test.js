import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.dataset = {}; this.events = {}; this.value = ''; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  querySelectorAll(selector) {
    const matches = element => selector.startsWith('.') ? element.className?.split(' ').includes(selector.slice(1)) : element.tag === selector;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
}
const elements = new Map();
const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
get('practice-form').elements = { ownBotVersionId: new Element('select'), opponentBotVersionId: new Element('select') };
const practiceButton = new Element('button');
get('practice-form').querySelector = () => practiceButton;
let timerId = 0;
const timers = new Map();
let nextResponse;
let fetchFailure = false;
let pendingResponse;
const context = vm.createContext({
  document: { getElementById: get, createElement: tag => new Element(tag), querySelectorAll: () => [] },
  sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
  Headers,
  setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
  clearTimeout: id => timers.delete(id),
  fetch: async url => {
    if (url.endsWith('/tournaments')) return { ok: true, json: async () => ({ tournaments: [] }) };
    if (fetchFailure) throw new Error('Connection lost');
    if (pendingResponse) return pendingResponse;
    return { ok: true, json: async () => url.endsWith('/practice/bots') ? { bots: [] } : nextResponse };
  }
});
vm.runInContext(await readFile(new URL('../js/botHub.js', import.meta.url), 'utf8'), context);
await new Promise(setImmediate);
context.showAccount({ id: 'admin', displayName: 'Admin', role: 'ADMIN' });
assert.equal(get('admin-panel').hidden, false);
assert.equal(get('role-badge').textContent, 'Quản trị viên');

const version = { id: 'v1', version: 1, apiVersion: '1.0', status: 'QUARANTINED', validationJobStatus: 'QUEUED' };
const bot = { id: 'b1', name: 'Bot', description: '', versions: [version] };
const render = () => context.renderBots([structuredClone(bot)]);
const text = element => [element.textContent, ...element.children.map(text)].join(' ');
const tick = async () => {
  assert.equal(timers.size, 1, 'only one validation refresh may be scheduled');
  const [id, { callback }] = timers.entries().next().value;
  timers.delete(id);
  await callback();
};
render();
const fileInput = get('bot-list').querySelectorAll('input').find(input => input.type === 'file');
fileInput.files = [{ name: 'unsent.py' }];
const nameInput = get('bot-list').querySelectorAll('input').find(input => input.name === 'name');
nameInput.value = 'Unsaved name';
nextResponse = { bots: [{ ...bot, versions: [{ ...version, validationJobStatus: 'RUNNING' }] }] };
await tick();
assert.match(text(get('bot-list')), /Đang kiểm tra/);
assert.ok(get('bot-list').querySelectorAll('input').includes(fileInput), 'polling preserves the chosen upload');
assert.equal(nameInput.value, 'Unsaved name', 'polling preserves unsaved edits');
nextResponse = { bots: [{ ...bot, versions: [{ ...version, status: 'REJECTED', validationJobStatus: 'SUCCEEDED', message: 'SyntaxError: <script>bad()</script>\nline 2' }] }] };
await tick();
assert.match(text(get('bot-list')), /SyntaxError: <script>bad\(\)<\/script>/);
assert.equal(get('bot-list').querySelectorAll('script').length, 0, 'diagnostics must be text, never HTML');
assert.equal(timers.size, 0, 'terminal validation stops polling');

render();
fetchFailure = true;
await tick();
assert.equal([...timers.values()][0].delay, 6000, 'network errors back off and keep polling');
fetchFailure = false;
nextResponse = { bots: [{ ...bot, versions: [{ ...version, validationJobStatus: 'FAILED', message: 'Validation worker stopped' }] }] };
await tick();
assert.match(text(get('bot-list')), /Kiểm tra bị gián đoạn/);
assert.equal(timers.size, 0);

render();
nextResponse = { bots: [{ ...bot, versions: [{ ...version, status: 'READY', validationJobStatus: 'SUCCEEDED' }] }] };
await tick();
assert.match(text(get('bot-list')), /Đã kiểm tra/);
assert.equal(timers.size, 0);

render();
let resolveResponse;
pendingResponse = new Promise(resolve => { resolveResponse = resolve; });
const inFlight = tick();
get('logout-button').events.click();
resolveResponse({ ok: true, json: async () => nextResponse });
await inFlight;
assert.equal(timers.size, 0, 'logout cancels rescheduling from an in-flight response');
assert.match(text(get('bot-list')), /Đang chờ kiểm tra/, 'late results do not update the logged-out account');
console.log('✓ Admin visibility, validation diagnostics, polling, preserved edits, retries and logout');
