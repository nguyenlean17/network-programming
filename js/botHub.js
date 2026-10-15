const API = '/api/platform';
const tokenKey = 'ottv2.bot.access-token';
let accessToken = sessionStorage.getItem(tokenKey);
let authMode = 'login';
let currentUser = null;
let myBots = [];

const byId = id => document.getElementById(id);
const authPanel = byId('auth-panel');
const accountPanel = byId('account-panel');
const notice = byId('notice');

function showNotice(message, kind = 'success') {
  notice.textContent = message;
  notice.className = `notice${kind === 'error' ? ' error' : kind === 'info' ? ' info' : ''}`;
  notice.hidden = false;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  let data = {};
  try { data = await response.json(); } catch { /* server may return no body */ }
  if (!response.ok) throw new Error(data.error || `Yêu cầu thất bại (${response.status})`);
  return data;
}

function setAuthMode(mode) {
  authMode = mode;
  byId('display-name-field').hidden = mode !== 'register';
  const form = byId('auth-form');
  form.elements.password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  byId('auth-submit').textContent = mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập';
  document.querySelectorAll('.auth-tab').forEach(tab => {
    const selected = tab.dataset.authMode === mode;
    tab.classList.toggle('selected', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
}

function addText(parent, tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function showAccount(user) {
  currentUser = user;
  authPanel.hidden = true;
  accountPanel.hidden = false;
  byId('logout-button').hidden = false;
  byId('account-name').textContent = user.displayName;
  byId('role-badge').textContent = user.role === 'ADMIN' ? 'Quản trị viên' : 'Người chơi';
  byId('admin-panel').hidden = user.role !== 'ADMIN';
}

function renderBots(bots) {
  myBots = bots;
  const list = byId('bot-list');
  list.replaceChildren();
  if (!bots.length) return addText(list, 'p', 'Bạn chưa tạo bot nào. Bắt đầu với một tệp Python nhỏ nhé!', 'empty-state');
  for (const bot of bots) {
    const card = document.createElement('article');
    card.className = 'bot-card';
    const heading = document.createElement('div');
    heading.className = 'card-title-row';
    addText(heading, 'h3', bot.name);
    addText(heading, 'span', `${bot.versions.length} phiên bản`, 'pill');
    card.append(heading);
    if (bot.description) addText(card, 'p', bot.description, 'card-description');
    if (!bot.versions.length) addText(card, 'p', 'Chưa có phiên bản. Tải lên tệp .py (tối đa 64 KiB).', 'card-meta');
    const versions = document.createElement('div');
    versions.className = 'version-list';
    for (const version of bot.versions) {
      const row = document.createElement('div');
      row.className = 'version-row';
      const identity = document.createElement('span');
      identity.textContent = `v${version.version} · ${version.apiVersion}`;
      const status = document.createElement('span');
      status.className = 'state-pill';
      status.textContent = version.status === 'READY' ? 'Đã kiểm tra' : version.status === 'REJECTED' ? 'Cần sửa' : 'Đang cách ly';
      row.append(identity, status);
      versions.append(row);
    }
    card.append(versions);
    const form = document.createElement('form');
    form.className = 'upload-row';
    form.dataset.botId = bot.id;
    const file = document.createElement('input');
    file.type = 'file'; file.accept = '.py,text/x-python'; file.required = true;
    file.setAttribute('aria-label', `Chọn tệp Python cho bot ${bot.name}`);
    const submit = document.createElement('button');
    submit.className = 'button'; submit.type = 'submit'; submit.textContent = 'Tải phiên bản';
    form.append(file, submit);
    card.append(form);
    list.append(card);
  }
}

function renderTournaments(tournaments) {
  for (const list of [byId('tournament-list'), byId('public-tournament-list')]) {
    list.replaceChildren();
    if (!tournaments.length) { addText(list, 'p', 'Hiện chưa có giải nào được mở.', 'empty-state'); continue; }
    for (const tournament of tournaments) {
    const card = document.createElement('article');
    card.className = 'tournament-card';
    const heading = document.createElement('div');
    heading.className = 'card-title-row';
    addText(heading, 'h3', tournament.name);
    addText(heading, 'span', tournament.status, 'state-pill');
    card.append(heading);
    const date = tournament.submission_deadline ? new Date(tournament.submission_deadline).toLocaleString('vi-VN') : 'Chưa đặt hạn đăng ký';
    addText(card, 'p', `Vòng tròn · Thắng 3 · Hòa 1 · Thua 0 · Hạn: ${date}`, 'card-meta');
    const button = document.createElement('button');
    button.className = 'button'; button.type = 'button'; button.textContent = 'Xem bảng điểm';
    button.addEventListener('click', async () => {
      try {
        const result = await api(`/tournaments/${encodeURIComponent(tournament.id)}/leaderboard`);
        showNotice(result.leaderboard.length ? result.leaderboard.map((row, index) => `${index + 1}. ${row.botName} — ${row.points} điểm`).join(' · ') : 'Giải chưa có kết quả được lưu.', 'info');
      } catch (error) { showNotice(error.message, 'error'); }
    });
    const matches = document.createElement('button');
    matches.className = 'button'; matches.type = 'button'; matches.textContent = 'Các trận & replay';
    matches.addEventListener('click', async () => {
      try {
        const result = await api(`/tournaments/${encodeURIComponent(tournament.id)}/matches`);
        let matchList = card.querySelector('.match-list');
        if (!matchList) { matchList = document.createElement('div'); matchList.className = 'match-list'; card.append(matchList); }
        matchList.replaceChildren();
        if (!result.matches.length) return addText(matchList, 'p', 'Giải chưa có lịch đấu nào.', 'card-meta');
        for (const match of result.matches) {
          const row = document.createElement('div'); row.className = 'match-row';
          const winner = match.result_json?.winner ? ` · Thắng ${match.result_json.winner}` : '';
          addText(row, 'span', `Vòng ${match.round_number}: ${match.p1_bot_name} (${match.p1_owner_name}) – ${match.p2_bot_name} (${match.p2_owner_name}) · ${match.status}${winner}`);
          if (match.status === 'COMPLETED') {
            const replay = document.createElement('a'); replay.href = `/match.html?id=${encodeURIComponent(match.id)}`;
            replay.textContent = 'Xem replay'; row.append(replay);
          }
          matchList.append(row);
        }
      } catch (error) { showNotice(error.message, 'error'); }
    });
    const actions = document.createElement('div');
    actions.className = 'tournament-actions';
    actions.append(button, matches);
    if (currentUser?.role === 'ADMIN') {
      const transitions = { DRAFT: ['open', 'Mở đăng ký'], OPEN: ['lock', 'Khóa đăng ký'], LOCKED: ['start', 'Bắt đầu giải'], RUNNING: ['pause', 'Tạm dừng'], PAUSED: ['resume', 'Tiếp tục'] };
      const transition = transitions[tournament.status];
      if (transition) {
        const control = document.createElement('button');
        control.className = 'button'; control.type = 'button'; control.textContent = transition[1];
        control.addEventListener('click', async () => {
          control.disabled = true;
          try {
            const result = await api(`/tournaments/${encodeURIComponent(tournament.id)}/${transition[0]}`, { method: 'POST' });
            await refreshAccount();
            showNotice(result.scheduledMatches === undefined ? `Đã cập nhật trạng thái giải: ${transition[1]}.` : `Đã tạo ${result.scheduledMatches} trận.`);
          } catch (error) { showNotice(error.message, 'error'); }
          finally { control.disabled = false; }
        });
        actions.append(control);
      }
    }
    if (currentUser && tournament.status === 'OPEN') {
      const readyVersions = myBots.flatMap(bot => bot.versions.filter(version => version.status === 'READY')
        .map(version => ({ bot, version })));
      if (readyVersions.length) {
        const selection = document.createElement('select');
        selection.className = 'tournament-version-select';
        selection.setAttribute('aria-label', `Chọn bot đăng ký giải ${tournament.name}`);
        for (const entry of readyVersions) {
          const option = document.createElement('option'); option.value = entry.version.id;
          option.textContent = `${entry.bot.name} v${entry.version.version}`; selection.append(option);
        }
        const register = document.createElement('button');
        register.className = 'button primary'; register.type = 'button'; register.textContent = 'Đăng ký bot';
        register.addEventListener('click', async () => {
          register.disabled = true;
          try {
            await api(`/tournaments/${encodeURIComponent(tournament.id)}/participants`, { method: 'POST',
              headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botVersionId: selection.value }) });
            showNotice('Đã đăng ký bot vào giải. Phiên bản được khóa khi quản trị đóng đăng ký.');
          } catch (error) { showNotice(error.message, 'error'); }
          finally { register.disabled = false; }
        });
        actions.append(selection, register);
      } else addText(card, 'p', 'Tải lên và kiểm tra bot trước khi đăng ký thi đấu.', 'card-meta');
    }
    card.append(actions);
    list.append(card);
    }
  }
}

function renderPracticeBots(bots) {
  const form = byId('practice-form');
  const own = form.elements.ownBotVersionId;
  const opponent = form.elements.opponentBotVersionId;
  const priorOwn = own.value;
  const priorOpponent = opponent.value;
  own.replaceChildren(); opponent.replaceChildren();
  const addPlaceholder = (select, label) => {
    const option = document.createElement('option'); option.value = ''; option.textContent = label; option.disabled = true; option.selected = true;
    select.append(option);
  };
  addPlaceholder(own, 'Chọn bot đã kiểm tra');
  addPlaceholder(opponent, 'Chọn bot đối thủ');
  const versions = bots.map(bot => ({ ...bot, bot_version_id: String(bot.bot_version_id) }));
  const ownBots = versions.filter(bot => bot.is_mine);
  for (const bot of ownBots) {
    const option = document.createElement('option'); option.value = bot.bot_version_id;
    option.textContent = `${bot.bot_name} v${bot.version}`; own.append(option);
  }
  const selectedOwn = ownBots.find(bot => bot.bot_version_id === priorOwn) || ownBots[0];
  if (selectedOwn) own.value = selectedOwn.bot_version_id;
  for (const bot of versions.filter(item => item.bot_version_id !== own.value)) {
    const option = document.createElement('option'); option.value = bot.bot_version_id;
    option.textContent = `${bot.bot_name} v${bot.version} · ${bot.is_mine ? 'bot của bạn' : bot.owner_name}`;
    opponent.append(option);
  }
  const selectedOpponent = versions.find(bot => bot.bot_version_id === priorOpponent && bot.bot_version_id !== own.value);
  if (selectedOpponent) opponent.value = selectedOpponent.bot_version_id;
  form.querySelector('button[type=submit]').disabled = ownBots.length === 0 || versions.length < 2;
  if (!ownBots.length) addText(byId('practice-match-list'), 'p', 'Cần có bot của bạn đã qua kiểm tra và ít nhất một bot đối thủ sẵn sàng.', 'empty-state');
}

function renderPracticeMatches(matches) {
  const list = byId('practice-match-list');
  list.replaceChildren();
  if (!matches.length) return addText(list, 'p', 'Bạn chưa chạy trận luyện tập nào.', 'empty-state');
  for (const match of matches) {
    const row = document.createElement('article'); row.className = 'match-row';
    const result = match.result_json?.winner ? ` · ${match.result_json.winner === 'P1' ? match.p1_bot_name : match.p2_bot_name} thắng` : '';
    const reason = match.result_json?.reason ? ` · ${match.result_json.reason}` : match.error_message ? ` · ${match.error_message}` : '';
    addText(row, 'span', `${match.p1_bot_name} v${match.p1_version} – ${match.p2_bot_name} v${match.p2_version} · ${match.status}${result}${reason}`);
    if (match.status === 'COMPLETED') {
      const replay = document.createElement('a'); replay.href = `/match.html?id=${encodeURIComponent(match.id)}`; replay.textContent = 'Xem replay'; row.append(replay);
    }
    list.append(row);
  }
}

async function refreshAccount() {
  const [botData, tournamentData, practiceBots, practiceMatches] = await Promise.all([
    api('/bots'), api('/tournaments'), api('/practice/bots'), api('/practice/matches')
  ]);
  renderBots(botData.bots);
  renderTournaments(tournamentData.tournaments);
  renderPracticeBots(practiceBots.bots);
  renderPracticeMatches(practiceMatches.matches);
  if (currentUser?.role === 'ADMIN') await refreshJobs();
}

async function refreshJobs() {
  const result = await api('/admin/jobs');
  const list = byId('admin-job-list');
  list.replaceChildren();
  if (!result.jobs.length) return addText(list, 'p', 'Chưa có công việc nền.', 'empty-state');
  for (const job of result.jobs) {
    const row = document.createElement('div'); row.className = 'match-row';
    addText(row, 'span', `${job.job_type} · ${job.status} · lần chạy ${job.attempts}`);
    if (job.status === 'FAILED') {
      const retry = document.createElement('button'); retry.className = 'button'; retry.type = 'button'; retry.textContent = 'Thử lại';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        try {
          await api(`/admin/jobs/${encodeURIComponent(job.id)}/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobType: job.job_type }) });
          await refreshJobs(); showNotice('Đã đưa công việc vào hàng đợi thử lại.');
        } catch (error) { showNotice(error.message, 'error'); }
      });
      row.append(retry);
    }
    list.append(row);
  }
}

document.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode)));
byId('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form));
  const button = byId('auth-submit');
  button.disabled = true;
  try {
    const result = await api(`/auth/${authMode === 'register' ? 'register' : 'login'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    accessToken = result.accessToken;
    sessionStorage.setItem(tokenKey, accessToken);
    showAccount(result.user);
    await refreshAccount();
    showNotice(authMode === 'register' ? 'Tài khoản đã sẵn sàng. Tạo bot đầu tiên nhé!' : 'Đăng nhập thành công.');
  } catch (error) { showNotice(error.message, 'error'); }
  finally { button.disabled = false; }
});

byId('create-bot-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button'); button.disabled = true;
  try {
    const result = await api('/bots', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: new FormData(form).get('name') }) });
    form.reset(); await refreshAccount(); showNotice(`Đã tạo bot “${result.bot.name}”.`);
  } catch (error) { showNotice(error.message, 'error'); }
  finally { button.disabled = false; }
});

byId('practice-form').elements.ownBotVersionId.addEventListener('change', async () => {
  try {
    const result = await api('/practice/bots'); renderPracticeBots(result.bots);
  } catch (error) { showNotice(error.message, 'error'); }
});

byId('practice-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type=submit]'); button.disabled = true;
  try {
    const created = await api('/practice/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownBotVersionId: form.elements.ownBotVersionId.value, opponentBotVersionId: form.elements.opponentBotVersionId.value }) });
    showNotice('Đã xếp trận luyện tập vào hàng đợi. Trạng thái sẽ tự cập nhật.', 'info');
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const [jobs, bots] = await Promise.all([api('/practice/matches'), api('/practice/bots')]);
      renderPracticeMatches(jobs.matches); renderPracticeBots(bots.bots);
      const match = jobs.matches.find(item => item.id === created.matchId);
      if (match && ['COMPLETED', 'FAILED'].includes(match.status)) {
        showNotice(match.status === 'COMPLETED' ? 'Trận tập đã kết thúc. Có thể mở replay để xem lại.' : `Trận tập gặp lỗi: ${match.error_message || 'runner thất bại'}.`, match.status === 'COMPLETED' ? 'success' : 'error');
        break;
      }
    }
  } catch (error) { showNotice(error.message, 'error'); }
  finally { button.disabled = false; }
});

byId('bot-list').addEventListener('submit', async event => {
  const form = event.target.closest('.upload-row');
  if (!form) return;
  event.preventDefault();
  const file = form.querySelector('input[type=file]').files[0];
  if (!file) return;
  if (file.size > 64 * 1024) return showNotice('Tệp phải nhỏ hơn hoặc bằng 64 KiB.', 'error');
  const button = form.querySelector('button'); button.disabled = true;
  try {
    await api(`/bots/${encodeURIComponent(form.dataset.botId)}/versions`, { method: 'POST',
      headers: { 'Content-Type': 'text/x-python', 'X-Bot-Filename': file.name }, body: file });
    await refreshAccount(); showNotice('Đã lưu phiên bản ở trạng thái cách ly. Hệ thống chưa chạy mã bot này.');
  } catch (error) { showNotice(error.message, 'error'); }
  finally { button.disabled = false; }
});

byId('create-tournament-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const payload = { name: values.name, format: 'ROUND_ROBIN' };
  if (values.submissionDeadline) payload.submissionDeadline = new Date(values.submissionDeadline).toISOString();
  const button = form.querySelector('button'); button.disabled = true;
  try {
    const result = await api('/tournaments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    form.reset(); await refreshAccount(); showNotice(`Đã tạo giải “${result.tournament.name}”.`);
  } catch (error) { showNotice(error.message, 'error'); }
  finally { button.disabled = false; }
});

byId('logout-button').addEventListener('click', () => {
  sessionStorage.removeItem(tokenKey); accessToken = null; currentUser = null;
  accountPanel.hidden = true; authPanel.hidden = false; byId('logout-button').hidden = true;
  showNotice('Bạn đã đăng xuất.');
});

if (accessToken) {
  api('/auth/me').then(async result => { showAccount(result.user); await refreshAccount(); })
    .catch(() => { sessionStorage.removeItem(tokenKey); accessToken = null; });
} else {
  api('/tournaments').then(result => renderTournaments(result.tournaments))
    .catch(error => { renderTournaments([]); showNotice(error.message, 'error'); });
}
