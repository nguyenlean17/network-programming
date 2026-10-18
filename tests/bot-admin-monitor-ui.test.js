import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.events = {}; this.textContent = ''; this.fields = []; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(event, handler) { this.events[event] = handler; }
  querySelectorAll(tag) { return this.children.flatMap(c => [...(c.tag === tag ? [c] : []), ...c.querySelectorAll(tag)]); }
}
const source = await readFile(new URL('../js/adminMonitor.js', import.meta.url), 'utf8');
const text = e => [e.textContent, ...e.children.map(text)].join(' ');
const fixture = { id: 'j1', job_type: 'MATCH', job_name: '<script>bot name</script>', status: 'FAILED', attempts: 3,
  error_message: '<img src=x onerror=bad()>', match_id: 'm1' };
const elements = new Map(), requests = [];
const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
get('job-filters').fields = [['status','FAILED'],['type','MATCH'],['reference','']];
let jobs = [fixture], retryFails = true, denyNext = false, pendingJobs = null;
const context = vm.createContext({ document: { getElementById: get, createElement: tag => new Element(tag) },
  window: { addEventListener() {} }, sessionStorage: { getItem: () => 'test-token' }, URLSearchParams,
  FormData: class { constructor(el) { this.fields = el.fields; } [Symbol.iterator]() { return this.fields[Symbol.iterator](); } },
  fetch: async (url, options) => {
    requests.push(url);
    if (denyNext) return { ok: false, status: 403, json: async () => ({ error: 'Denied' }) };
    let data;
    if (url.endsWith('/auth/me')) data = { user: { role: 'ADMIN' } };
    else if (url.endsWith('/admin/overview')) data = { observedAt: new Date().toISOString(), coverage: { matches: true, validation: false, healthy_workers: 1 },
      queues: [{ job_type: 'MATCH', queued: 0, running: 0, failed: 1, expired: 0, oldest_queued_at: null }],
      workers: [{ worker_id: 'w1', worker_role: 'matches', healthy: true, metrics_json: {} }] };
    else if (url.includes('/retry')) {
      assert.equal(options.method, 'POST'); assert.equal(JSON.parse(options.body).jobType, 'MATCH');
      if (retryFails) return { ok: false, status: 503, json: async () => ({ error: 'Offline' }) };
      jobs = []; data = { queued: true };
    } else if (url.includes('/admin/jobs?')) {
      if (pendingJobs) return pendingJobs;
      data = { jobs: structuredClone(jobs), page: 1, hasMore: false };
    } else if (url.includes('/admin/audit?')) data = { events: [], page: 1, hasMore: false };
    else throw new Error(url);
    return { ok: true, status: 200, json: async () => data };
  }
});
vm.runInContext(source, context); await new Promise(setImmediate);
assert.equal(get('monitor-content').hidden, false);
assert.ok(requests.some(url => url.includes('status=FAILED') && url.includes('type=MATCH')));
assert.match(text(get('worker-coverage')), /Thiếu worker kiểm tra mã/);
assert.match(text(get('worker-list')), /CPU: — · RAM: —/);
const list = get('monitor-jobs');
assert.equal(list.querySelectorAll('script').length, 0); assert.equal(list.querySelectorAll('img').length, 0);
assert.match(text(list), /<img src=x onerror=bad\(\)>/);
const retry = list.querySelectorAll('button').find(node => node.textContent === 'Đưa vào hàng đợi chạy lại');
await retry.events.click(); assert.equal(retry.disabled, false, 'a failed retry request must leave a usable button');
assert.match(text(get('monitor-notice')), /tạm không kết nối/);
retryFails = false; await retry.events.click(); assert.match(text(list), /Không có tác vụ/);
jobs = [{ ...fixture, job_type: 'VALIDATION', status: 'SUCCEEDED', match_id: null, validation_status: 'REJECTED' }];
await context.loadJobs();
assert.match(text(list), /Cần sửa mã/);
assert.ok(!list.querySelectorAll('button').some(node => node.textContent === 'Đưa vào hàng đợi chạy lại'), 'rejected source is not an infrastructure retry');
jobs = [];
let resolveOld;
pendingJobs = new Promise(resolve => { resolveOld = resolve; });
const old = context.loadJobs(2); pendingJobs = null;
await context.loadJobs(1);
resolveOld({ ok: true, json: async () => ({ jobs: [fixture], page: 2, hasMore: true }) }); await old;
assert.doesNotMatch(text(list), /bot name/, 'slow older filter results cannot replace current data');
denyNext = true; await assert.rejects(context.refreshOverview(), /quản trị/);
assert.equal(get('monitor-content').hidden, true); assert.equal(get('monitor-login').hidden, false);
assert.equal(get('worker-list').children.length, 0, 'losing admin permission clears privileged data');
console.log('✓ Admin monitoring filters, unknown metrics, safe diagnostics, retry recovery, stale-response and authorization guards');
