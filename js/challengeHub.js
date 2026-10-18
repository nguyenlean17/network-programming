const byId = id => document.getElementById(id);
const token = sessionStorage.getItem('ottv2.bot.access-token');
let generation = 0, timer = null, busy = false, hidden = false, hasRendered = false;
async function api(path, body) {
  const response = await fetch(`/api/platform${path}`, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) {
    const message = { 401: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại tại Góc bot.',
      503: 'Dịch vụ thử thách đang tạm chưa sẵn sàng. Vui lòng thử lại sau.',
      429: 'Chưa đủ chỗ cho cặp trận mới. Hãy đợi các trận đang chờ hoặc chạy hoàn tất.' }[response.status];
    throw new Error(message || result.error || 'Chưa kết nối được dịch vụ.');
  }
  return result;
}
function add(parent, tag, text, className = '') {
  const element = document.createElement(tag); element.textContent = text; element.className = className; parent.append(element); return element;
}
function notice(text, error = false) { const node = byId('journey-notice'); node.hidden = false; node.className = error ? 'notice error' : 'notice'; node.textContent = text; }
function milestones(data) {
  const list = byId('journey-milestones'); list.replaceChildren();
  const ready = data.versions.some(v => v.validation_status === 'READY');
  for (const [icon, title, description, done] of [
    ['🌱', 'Gieo mầm', 'Tải lên phiên bản Python đầu tiên.', data.versions.length > 0],
    ['🛠️', 'Sẵn sàng ra sân', 'Có phiên bản vượt qua kiểm tra.', ready],
    ['🎮', 'Trận đầu tiên', 'Hoàn tất trận tập với một đối thủ.', data.stats.completed > 0],
    ['⭐', 'Chiến thắng đầu tiên', 'Thắng một trận tập với đối thủ.', data.stats.wins > 0]
  ]) {
    const card = add(list, 'article', '', `milestone${done ? ' earned' : ''}`);
    add(card, 'span', icon); add(card, 'h3', title); add(card, 'p', description);
    add(card, 'p', done ? '✓ Đã đạt' : 'Chưa hoàn thành', 'achievement-state');
  }
}
function render(data, signedIn) {
  hasRendered = true;
  if (signedIn) { milestones(data); byId('journey-account').textContent = `${data.stats.completed} trận tập hoàn tất · ${data.stats.wins} trận thắng · ${data.stats.active} trận đang chờ hoặc chạy.`; }
  const list = byId('challenge-list');
  const selected = new Map([...list.querySelectorAll('select')].map(select => [select.dataset.challengeId, select.value]));
  list.replaceChildren();
  const versions = (data.versions || []).filter(v => v.validation_status === 'READY');
  for (const c of data.challenges) {
    const card = add(list, 'article', '', 'bot-card');
    const heading = add(card, 'div', '', 'challenge-title'); add(heading, 'span', c.icon); add(heading, 'h3', c.title);
    add(card, 'p', c.description); add(card, 'p', c.hint, 'card-meta');
    add(card, 'p', c.versionId ? `Đối thủ mẫu v${c.version}` : 'Đối thủ chưa sẵn sàng.', 'card-meta');
    if (signedIn) add(card, 'p', c.wonSeats === 2 ? '🏅 Đã vượt cửa ải ở cả hai bên!' : `Đã thắng ${c.wonSeats}/2 bên với phiên bản tốt nhất.`, 'challenge-progress');
    if (signedIn && versions.length && c.versionId) {
      const select = add(card, 'select', '', 'challenge-select'); select.setAttribute('aria-label', `Bot của bạn cho ${c.title}`);
      select.dataset.challengeId = c.id;
      for (const v of versions) { const option = add(select, 'option', `${v.name} v${v.version}`); option.value = v.id; }
      if (versions.some(v => v.id === selected.get(c.id))) select.value = selected.get(c.id);
      const button = add(card, 'button', 'Đấu cặp 2 trận đổi bên', 'button primary'); button.type = 'button';
      // Existing practice quota is three active matches; a pair needs two slots.
      button.disabled = busy || data.stats.active > 1;
      button.addEventListener('click', async () => {
        if (busy) return;
        busy = true; clearTimeout(timer); generation++;
        for (const node of list.querySelectorAll('button')) node.disabled = true;
        try {
          await api('/practice/matches', { ownBotVersionId: select.value, opponentBotVersionId: c.versionId, count: 2 });
          notice('Đã xếp hai trận đổi bên vào hàng đợi. Trang sẽ cập nhật tiến độ; xem trận và replay tại Sân tập.');
        } catch (error) { notice(error.message, true); }
        finally { busy = false; await refresh(); }
      });
      if (data.stats.active > 1) add(card, 'p', 'Đợi các trận hiện tại hoàn tất để có chỗ cho cặp trận mới.', 'form-hint');
    } else {
      const link = add(card, 'a', signedIn ? 'Tải bot và đợi kiểm tra ở Góc bot →' : 'Đăng nhập để thử sức →'); link.href = '/bots.html';
    }
    for (const id of c.replays || []) { const link = add(card, 'a', 'Xem trận thắng ↗', 'challenge-replay'); link.href = `/match.html?id=${encodeURIComponent(id)}`; }
  }
}
async function refresh() {
  if (busy || hidden) return;
  clearTimeout(timer); const request = ++generation;
  byId('refresh-journey').disabled = true;
  try {
    const data = await api(token ? '/challenges/progress' : '/challenges');
    if (request !== generation) return;
    render(data, Boolean(token));
    if (data.stats?.active > 0 || data.versions?.some(v => ['QUARANTINED','VALIDATING'].includes(v.validation_status) && v.validation_job_status !== 'FAILED')) timer = setTimeout(refresh, 15000);
  } catch (error) {
    if (request === generation) {
      notice(`${error.message} Bạn vẫn có thể tải mã mẫu và đọc hướng dẫn.`, true);
      if (!hasRendered) { const list = byId('challenge-list'); list.replaceChildren(); add(list, 'p', 'Chưa tải được các đối thủ. Bấm “Cập nhật tiến độ” để thử lại.', 'empty-state'); }
    }
  } finally { if (request === generation) byId('refresh-journey').disabled = false; }
}
byId('refresh-journey').addEventListener('click', refresh);
window.addEventListener('pagehide', () => { hidden = true; generation++; clearTimeout(timer); });
window.addEventListener('pageshow', event => { if (event.persisted) { hidden = false; refresh(); } });
refresh();
