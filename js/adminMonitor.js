const byId = id => document.getElementById(id);
const names = { MATCH: 'Trận đấu', VALIDATION: 'Kiểm tra mã', QUEUED: 'Chờ xử lý', RUNNING: 'Đang chạy', FAILED: 'Thất bại', SUCCEEDED: 'Hoàn tất xử lý',
  all: 'Kiểm tra mã và chạy trận', validation: 'Kiểm tra mã', matches: 'Chạy trận' };
const actions = { USER_ROLE_CHANGED: 'Đổi quyền tài khoản', MATCH_JOB_REQUEUED: 'Yêu cầu chạy lại trận', BOT_VALIDATION_REQUEUED: 'Yêu cầu kiểm tra lại mã',
  QUALIFIER_CREATED: 'Tạo vòng loại', QUALIFIER_OPEN: 'Mở nhận bài vòng loại', QUALIFIER_CLOSED: 'Đóng nhận bài vòng loại', QUALIFIER_FINALIZED: 'Chốt kết quả vòng loại',
  TOURNAMENT_CREATED: 'Tạo giải', TOURNAMENT_UPDATED: 'Sửa thông tin giải', TOURNAMENT_CANCELLED: 'Hủy giải', TOURNAMENT_OPENED: 'Mở đăng ký giải',
  TOURNAMENT_PARTICIPANT_REMOVED: 'Gỡ đăng ký dự giải', TOURNAMENT_LOCKED: 'Khóa phiên bản dự giải', TOURNAMENT_STARTED: 'Bắt đầu giải',
  TOURNAMENT_PAUSED: 'Tạm dừng giải', TOURNAMENT_RESUMED: 'Tiếp tục giải', TOURNAMENT_AUTO_COMPLETED: 'Tự động hoàn tất giải' };
let allowed = false, jobsGeneration = 0, auditGeneration = 0, overviewGeneration = 0;
const date = value => value ? new Date(value).toLocaleString('vi-VN') : '—';
function add(parent, tag, text, className = '') { const node = document.createElement(tag); node.textContent = text; node.className = className; parent.append(node); return node; }
function notice(text, error = true) { const node = byId('monitor-notice'); node.hidden = false; node.className = error ? 'notice error' : 'notice'; node.textContent = text; }
function deny() {
  allowed = false; jobsGeneration++; auditGeneration++; overviewGeneration++;
  byId('monitor-content').hidden = true; byId('monitor-login').hidden = false;
  for (const id of ['queue-overview','worker-list','monitor-jobs','monitor-audit']) byId(id).replaceChildren();
}
async function api(path, body) {
  const token = sessionStorage.getItem('ottv2.bot.access-token');
  const response = await fetch(`/api/platform${path}`, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) {
    if ([401,403].includes(response.status)) deny();
    throw new Error([401,403].includes(response.status) ? 'Bạn cần đăng nhập bằng tài khoản quản trị.' : response.status === 503 ? 'Cơ sở dữ liệu tạm không kết nối được. Hãy thử lại sau.' : result.error || 'Không tải được dữ liệu.');
  }
  return result;
}
function formQuery(id, page) {
  const query = new URLSearchParams({ page: String(page), limit: '25' });
  for (const [key,value] of new FormData(byId(id))) if (String(value).trim()) query.set(key, String(value).trim());
  return query;
}
function button(parent, label, action, disabled = false) {
  const node = add(parent, 'button', label, 'button'); node.type = 'button'; node.disabled = disabled;
  node.addEventListener('click', async () => { node.disabled = true; try { await action(); } catch (error) { notice(error.message); } finally { node.disabled = disabled; } }); return node;
}
function pager(container, data, load) {
  const nav = add(container, 'div', '', 'monitor-page');
  button(nav, '← Trước', () => load(data.page - 1), data.page <= 1);
  add(nav, 'span', `Trang ${data.page}`); button(nav, 'Sau →', () => load(data.page + 1), !data.hasMore);
}
function metric(value, render) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? render(value) : '—'; }
async function refreshOverview() {
  if (!allowed) return;
  const generation = ++overviewGeneration; byId('refresh-overview').disabled = true;
  try {
    const data = await api('/admin/overview');
    if (!allowed || generation !== overviewGeneration) return;
    byId('monitor-time').textContent = `Số liệu lúc ${date(data.observedAt)}. Bấm cập nhật để lấy số liệu mới.`;
    const missing = [!data.coverage.validation && 'kiểm tra mã', !data.coverage.matches && 'chạy trận'].filter(Boolean);
    const coverage = byId('worker-coverage'); coverage.className = missing.length ? 'monitor-warning' : 'monitor-ok';
    coverage.textContent = missing.length ? `Thiếu worker ${missing.join(' và ')}. Bài có thể phải nằm chờ.` : `${data.coverage.healthy_workers} worker đang hoạt động, có đủ hai chức năng kiểm tra mã và chạy trận.`;
    const queues = byId('queue-overview'); queues.replaceChildren();
    for (const q of data.queues) {
      const card = add(queues, 'article', '', 'bot-card'); add(card, 'h3', names[q.job_type]);
      const stats = add(card, 'div', '', 'monitor-stats');
      for (const [label,key] of [['Chờ','queued'],['Đang chạy','running'],['Thất bại','failed'],['Quá hạn giữ việc','expired']]) add(stats, 'span', `${label}: ${q[key]}`);
      add(card, 'p', `Tác vụ đang chờ lâu nhất được tạo: ${date(q.oldest_queued_at)}`, 'card-meta');
      if (q.expired) add(card, 'p', 'Có tác vụ đã quá hạn giữ việc. Worker sẽ thử nhận lại hoặc đánh dấu lỗi theo giới hạn số lần chạy.', 'monitor-warning');
    }
    const workers = byId('worker-list'); workers.replaceChildren();
    if (!data.workers.length) add(workers, 'p', 'Chưa có worker nào gửi tín hiệu hoạt động.', 'empty-state');
    for (const w of data.workers) {
      const card = add(workers, 'article', '', 'bot-card'); add(card, 'h3', `${names[w.worker_role] || w.worker_role} · ${w.healthy ? 'Đang hoạt động' : 'Đã dừng hoặc mất kết nối'}`);
      add(card, 'p', w.worker_id, 'monitor-id'); add(card, 'p', `Tín hiệu cuối: ${date(w.last_seen_at)}`, 'card-meta');
      const m = w.metrics_json || {};
      add(card, 'p', `Số đo lần gửi cuối · CPU: ${metric(m.cpuPercent, n => n.toFixed(1) + '%')} · RAM: ${metric(m.rssBytes, n => (n / 1048576).toFixed(1) + ' MiB')} · Đã chạy: ${metric(m.uptimeSeconds, n => Math.floor(n / 60) + ' phút')}`, 'card-meta');
    }
    if (data.workersTruncated) add(workers, 'p', 'Hiển thị 50 worker gửi tín hiệu gần nhất. Tình trạng tổng thể được tính trên tất cả worker đang hoạt động.', 'form-hint');
  } finally { if (generation === overviewGeneration) byId('refresh-overview').disabled = false; }
}
async function loadJobs(page = 1) {
  if (!allowed) return;
  const generation = ++jobsGeneration;
  const data = await api(`/admin/jobs?${formQuery('job-filters', page)}`);
  if (!allowed || generation !== jobsGeneration) return;
  const list = byId('monitor-jobs'); list.replaceChildren();
  if (!data.jobs.length) add(list, 'p', 'Không có tác vụ khớp bộ lọc.', 'empty-state');
  for (const job of data.jobs) {
    const card = add(list, 'article', '', 'bot-card'); add(card, 'h3', job.job_name);
    add(card, 'p', `${names[job.job_type]} · ${names[job.status]} · Lần chạy: ${job.attempts} · ${date(job.created_at)}`, 'card-meta');
    add(card, 'p', `Mã tác vụ: ${job.id}`, 'monitor-id');
    for (const [label,key] of [['Trận','match_id'],['Vòng loại','qualifier_id'],['Bài nộp','submission_id'],['Giải','tournament_id'],['Phiên bản','bot_version_id']]) if (job[key]) add(card, 'p', `${label}: ${job[key]}`, 'monitor-id');
    if (job.validation_status) add(card, 'p', `Kết quả kiểm tra phiên bản: ${{ READY: 'Đạt', REJECTED: 'Cần sửa mã', QUARANTINED: 'Chờ kiểm tra', VALIDATING: 'Đang kiểm tra' }[job.validation_status] || job.validation_status}`, job.validation_status === 'REJECTED' ? 'monitor-error' : 'card-meta');
    if (job.error_message) add(card, 'p', job.error_message, job.status === 'FAILED' || job.validation_status === 'REJECTED' ? 'monitor-error' : 'card-meta');
    if (job.match_id) { const link = add(card, 'a', 'Mở trận / replay →'); link.href = `/match.html?id=${encodeURIComponent(job.match_id)}`; }
    if (job.status === 'FAILED') button(card, 'Đưa vào hàng đợi chạy lại', async () => {
      await api(`/admin/jobs/${encodeURIComponent(job.id)}/retry`, { jobType: job.job_type });
      notice('Đã yêu cầu chạy lại và ghi nhật ký thao tác.', false);
      await Promise.all([loadJobs(page), refreshOverview(), loadAudit()]);
    });
  }
  pager(list, data, loadJobs);
}
async function loadAudit(page = 1) {
  if (!allowed) return;
  const generation = ++auditGeneration;
  const data = await api(`/admin/audit?${formQuery('audit-filters', page)}`);
  if (!allowed || generation !== auditGeneration) return;
  const list = byId('monitor-audit'); list.replaceChildren();
  if (!data.events.length) add(list, 'p', 'Chưa có thao tác khớp bộ lọc.', 'empty-state');
  for (const event of data.events) {
    const card = add(list, 'article', '', 'bot-card'); add(card, 'p', `${actions[event.action] || event.action} · ${event.actor_name || 'Hệ thống / không còn thông tin tài khoản'} · ${date(event.created_at)}`);
    add(card, 'p', `${event.subject_type} · ${event.subject_id || '—'}`, 'monitor-id');
  }
  pager(list, data, loadAudit);
}
byId('refresh-overview').addEventListener('click', () => refreshOverview().catch(error => notice(error.message)));
for (const [id,load] of [['job-filters',loadJobs],['audit-filters',loadAudit]]) byId(id).addEventListener('submit', event => { event.preventDefault(); load().catch(error => notice(error.message)); });
async function init() {
  if (!sessionStorage.getItem('ottv2.bot.access-token')) { deny(); byId('monitor-notice').hidden = true; return; }
  const me = await api('/auth/me');
  if (me.user.role !== 'ADMIN') { deny(); notice('Trang này dành cho tài khoản quản trị.'); return; }
  allowed = true; byId('monitor-content').hidden = false; byId('monitor-login').hidden = true; byId('monitor-notice').hidden = true;
  await Promise.all([refreshOverview(),loadJobs(),loadAudit()]);
}
window.addEventListener('pagehide', () => deny());
window.addEventListener('pageshow', event => { if (event.persisted) init().catch(error => notice(error.message)); });
init().catch(error => notice(error.message));
