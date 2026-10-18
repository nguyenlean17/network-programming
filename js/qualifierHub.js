const byId = id => document.getElementById(id);
let user = null;
let listGeneration = 0;
const pollTimers = new Set();
const historyRequests = new WeakMap();
const states = { DRAFT: 'Bản nháp', OPEN: 'Đang nhận bài', CLOSED: 'Đã đóng nhận bài', FINALIZED: 'Đã chốt kết quả' };
async function api(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = sessionStorage.getItem('ottv2.bot.access-token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api/platform${path}`, { headers, method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Không tải được dữ liệu.');
  return result;
}
function add(parent, tag, text, className = '') {
  const node = document.createElement(tag); node.textContent = text; node.className = className; parent.append(node); return node;
}
function notice(message, error = false) {
  const node = byId('qualifier-notice'); node.hidden = false; node.textContent = message; node.className = error ? 'notice error' : 'notice';
}
function button(parent, label, action) {
  const node = add(parent, 'button', label, 'button'); node.type = 'button';
  node.addEventListener('click', async () => { node.disabled = true; try { await action(); } catch (error) { notice(error.message, true); } finally { node.disabled = false; } });
  return node;
}
function pager(parent, result, refresh) {
  const nav = add(parent, 'div', '', 'tournament-actions');
  button(nav, '← Trước', () => refresh(result.page - 1)).disabled = result.page <= 1;
  add(nav, 'span', `Trang ${result.page}`);
  button(nav, 'Sau →', () => refresh(result.page + 1)).disabled = !result.hasMore;
}
async function leaderboard(id, container, page = 1) {
  const result = await api(`/qualifiers/${id}/leaderboard?page=${page}&limit=50`);
  container.replaceChildren();
  if (!result.leaderboard.length) add(container, 'p', 'Chưa có bài được chấm đủ trận.', 'empty-state');
  else {
    const scroll = add(container, 'div', '', 'leaderboard-container');
    const table = add(scroll, 'table', '', 'leaderboard-table');
    const head = add(table, 'tr', '');
    for (const label of ['Hạng', 'Sinh viên', 'Phiên bản tốt nhất', 'Điểm', 'Thắng', 'Hòa', 'Thua']) add(head, 'th', label);
    for (const entry of result.leaderboard) {
      const row = add(table, 'tr', '');
      for (const value of [entry.rank, entry.owner_name, `${entry.bot_name} v${entry.version}`, entry.points, entry.wins, entry.draws, entry.losses]) add(row, 'td', String(value));
    }
  }
  pager(container, result, next => leaderboard(id, container, next));
}
async function history(id, container, board, generation, page = 1) {
  const prior = historyRequests.get(container);
  if (prior?.timer) { clearTimeout(prior.timer); pollTimers.delete(prior.timer); }
  const request = {};
  historyRequests.set(container, request);
  const result = await api(`/qualifiers/${id}/submissions?page=${page}&limit=20`);
  if (generation !== listGeneration || historyRequests.get(container) !== request) return;
  container.replaceChildren();
  if (!result.submissions.length) add(container, 'p', 'Bạn chưa nộp bài vào đợt này.', 'empty-state');
  for (const s of result.submissions) {
    const row = add(container, 'article', '', 'bot-card');
    add(row, 'p', `${s.bot_name} v${s.version} · ${s.status === 'COMPLETED' ? `${s.points} điểm` : `Đã chấm ${s.completed_matches}/${s.expected_matches} trận`}`);
    if (s.failed_matches) add(row, 'p', `${s.failed_matches} trận gặp lỗi hệ thống, cần quản trị viên chạy lại. Bài này chưa được tính vào BXH.`, 'card-meta');
    button(row, 'Xem trận & replay', async () => {
      const games = await api(`/qualifiers/${id}/submissions/${s.id}/matches`);
      let list = row.querySelector('.match-list');
      if (!list) list = add(row, 'div', '', 'match-list');
      list.replaceChildren();
      for (const game of games.matches) {
        const line = add(list, 'p', '', 'card-meta');
        add(line, 'span', `${({ QUEUED: 'Chờ chấm', RUNNING: 'Đang đấu', COMPLETED: 'Hoàn tất', FAILED: 'Lỗi hệ thống' })[game.status]} `);
        if (game.replay_available) { const link = add(line, 'a', 'Xem bàn cờ'); link.href = `/match.html?id=${encodeURIComponent(game.id)}`; }
      }
    });
  }
  pager(container, result, next => history(id, container, board, generation, next));
  if (result.submissions.some(s => s.status === 'PENDING' && !s.failed_matches) && generation === listGeneration) {
    const timer = setTimeout(async () => {
      pollTimers.delete(timer);
      if (generation !== listGeneration || historyRequests.get(container) !== request) return;
      try {
        const updated = await history(id, container, board, generation, page);
        if (updated?.submissions.every(s => s.status === 'COMPLETED') && board.childElementCount) await leaderboard(id, board);
      }
      catch (error) { notice(`Tạm dừng tự cập nhật: ${error.message} Bấm “Bài của tôi” để thử lại.`, true); }
    }, 15000);
    request.timer = timer;
    pollTimers.add(timer);
  }
  return result;
}
async function renderList(page = 1) {
  const generation = ++listGeneration;
  for (const timer of pollTimers) clearTimeout(timer);
  pollTimers.clear();
  const [result, bots] = await Promise.all([api(`/qualifiers?page=${page}&limit=20`), user ? api('/bots') : Promise.resolve({ bots: [] })]);
  if (generation !== listGeneration) return;
  const list = byId('qualifier-list'); list.replaceChildren();
  if (!result.qualifiers.length) add(list, 'p', 'Chưa có đợt vòng loại nào.', 'empty-state');
  for (const q of result.qualifiers) {
    const card = add(list, 'article', '', 'tournament-card');
    add(card, 'h3', q.name);
    const expired = q.status === 'OPEN' && new Date(q.submission_deadline) <= new Date();
    add(card, 'p', `${expired ? 'Đã hết hạn nhận bài' : states[q.status]} · Hạn: ${new Date(q.submission_deadline).toLocaleString('vi-VN')}`, 'card-meta');
    add(card, 'p', `${q.benchmark_count} bot chuẩn × ${q.rounds_per_opponent * 2} trận = ${q.benchmark_count * q.rounds_per_opponent * 2} trận/bài. Tối đa ${q.max_submissions} bài/tài khoản/đợt.`, 'card-meta');
    const actions = add(card, 'div', '', 'tournament-actions');
    const board = add(card, 'div', '');
    const mine = add(card, 'div', '');
    button(actions, 'Bảng xếp hạng', () => leaderboard(q.id, board));
    if (user) button(actions, 'Bài của tôi', () => history(q.id, mine, board, generation));
    if (user && q.status === 'OPEN' && !expired) {
      const choices = add(actions, 'select', '', 'tournament-version-select'); choices.setAttribute('aria-label', `Phiên bản nộp vào ${q.name}`);
      for (const bot of bots.bots) for (const v of bot.versions.filter(v => v.status === 'READY')) {
        const option = add(choices, 'option', `${bot.name} v${v.version}`); option.value = v.id;
      }
      const submit = button(actions, 'Nộp chấm điểm', async () => {
        const created = await api(`/qualifiers/${q.id}/submissions`, { botVersionId: choices.value });
        notice(`Đã xếp ${created.matches} trận vào hàng đợi. Điểm sẽ xuất hiện khi toàn bộ trận hoàn tất.`);
        await history(q.id, mine, board, generation);
      });
      submit.disabled = !choices.options.length;
      if (!choices.options.length) add(card, 'p', 'Cần phiên bản đã kiểm tra. Tải bot tại Góc bot, sau đó mở lại trang này.', 'card-meta');
    }
    if (user?.role === 'ADMIN') {
      const actionsForState = q.status === 'DRAFT' ? [['Mở nhận bài', 'open']] : q.status === 'OPEN' ? [['Đóng nhận bài', 'close']] : q.status === 'CLOSED' ? [['Chốt kết quả', 'finalize']] : [];
      for (const [label, action] of actionsForState) button(actions, label, async () => { await api(`/qualifiers/${q.id}/${action}`, {}); await renderList(page); });
    }
  }
  pager(list, result, renderList);
}
byId('qualifier-create').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type=submit]'); submit.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    const benchmarkVersionIds = [...form.querySelectorAll('input[name=benchmark]:checked')].map(input => input.value);
    await api('/qualifiers', { name: values.name, submissionDeadline: new Date(values.submissionDeadline).toISOString(),
      roundsPerOpponent: Number(values.roundsPerOpponent), maxSubmissions: Number(values.maxSubmissions), benchmarkVersionIds });
    notice('Đã tạo bản nháp với bộ bot chuẩn cố định. Kiểm tra thông tin rồi bấm “Mở nhận bài”.');
    await renderList();
  } catch (error) { notice(error.message, true); }
  finally { submit.disabled = false; }
});
async function init() {
  if (sessionStorage.getItem('ottv2.bot.access-token')) {
    try { user = (await api('/auth/me')).user; } catch (error) { notice(error.message, true); }
  }
  byId('qualifier-account').textContent = user ? `Xin chào ${user.displayName}.` : 'Bạn có thể xem BXH công khai; đăng nhập ở Góc bot để nộp bài.';
  byId('qualifier-admin').hidden = user?.role !== 'ADMIN';
  if (user?.role === 'ADMIN') {
    const result = await api('/qualifiers/benchmarks');
    for (const benchmark of result.benchmarks) {
      const label = add(byId('qualifier-benchmarks'), 'label', '');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = 'benchmark'; checkbox.value = benchmark.id; label.append(checkbox);
      add(label, 'span', `${benchmark.name} v${benchmark.version}`);
    }
  }
  await renderList();
}
window.addEventListener('pagehide', () => { listGeneration++; for (const timer of pollTimers) clearTimeout(timer); pollTimers.clear(); });
init().catch(error => notice(error.message, true));
