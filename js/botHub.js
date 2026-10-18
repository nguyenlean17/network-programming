const API = '/api/platform';
const tokenKey = 'ottv2.bot.access-token';
let accessToken = sessionStorage.getItem(tokenKey);
let authMode = 'login';
let currentUser = null;
let myBots = [];
let validationPollTimer = null;
let validationPollGeneration = 0;
let practiceBusy = false;

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

function validationPending(version) {
  return ['QUARANTINED', 'VALIDATING'].includes(version.status) && version.validationJobStatus !== 'FAILED';
}

function renderVersions(container, versions) {
  container.replaceChildren();
  for (const version of versions) {
    const row = document.createElement('div');
    row.className = 'version-row';
    addText(row, 'span', `v${version.version} · ${version.apiVersion}`);
    const failed = version.validationJobStatus === 'FAILED';
    const label = version.status === 'READY' ? 'Đã kiểm tra' : version.status === 'REJECTED' ? 'Cần sửa'
      : failed ? 'Kiểm tra bị gián đoạn' : version.validationJobStatus === 'RUNNING' || version.status === 'VALIDATING'
        ? 'Đang kiểm tra' : 'Đang chờ kiểm tra';
    addText(row, 'span', label, 'state-pill');
    if (failed) addText(row, 'p', 'Hệ thống chưa kiểm tra được bot. Cần quản trị viên cho chạy lại; đây chưa phải kết luận mã bot bị lỗi.', 'validation-message');
    if (version.message) addText(row, 'p', version.message, 'validation-message');
    else if (version.status === 'REJECTED') addText(row, 'p', 'Bot chưa vượt qua kiểm tra. Chưa có thông báo lỗi chi tiết.', 'validation-message');
    container.append(row);
  }
}

function stopValidationPolling() {
  clearTimeout(validationPollTimer);
  validationPollTimer = null;
  validationPollGeneration++;
}

function scheduleValidationRefresh(waitMs = 3000) {
  stopValidationPolling();
  if (!currentUser || !myBots.some(bot => bot.versions.some(validationPending))) return;
  const generation = validationPollGeneration;
  validationPollTimer = setTimeout(async () => {
    let nextWait = 3000;
    try {
      const result = await api('/bots');
      if (generation !== validationPollGeneration || !currentUser) return;
      const priorReady = new Set(myBots.flatMap(bot => bot.versions.filter(v => v.status === 'READY').map(v => v.id)));
      const becameReady = result.bots.some(bot => bot.versions.some(v => v.status === 'READY' && !priorReady.has(v.id)));
      const choices = becameReady ? await api('/practice/bots') : null;
      if (generation !== validationPollGeneration || !currentUser) return;
      myBots = result.bots;
      const byBot = new Map(myBots.map(bot => [bot.id, bot]));
      for (const container of byId('bot-list').querySelectorAll('.version-list')) {
        const bot = byBot.get(container.dataset.botId);
        if (bot) renderVersions(container, bot.versions);
      }
      // Refresh playable choices when validation succeeds, without rebuilding edit/upload forms.
      if (choices) renderPracticeBots(choices.bots);
    } catch {
      nextWait = Math.min(waitMs * 2, 30000);
    } finally {
      if (generation === validationPollGeneration) scheduleValidationRefresh(nextWait);
    }
  }, waitMs);
}

function renderBots(bots) {
  myBots = bots;
  scheduleValidationRefresh();
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
    if (!bot.versions.length) addText(card, 'p', 'Tải lên .py (tối đa 64 KiB) hoặc ZIP chỉ chứa main.py ở thư mục gốc (tối đa 128 KiB).', 'card-meta');
    const edit = document.createElement('form'); edit.className = 'bot-edit-row'; edit.dataset.botId = bot.id;
    const nameInput = document.createElement('input'); nameInput.name = 'name'; nameInput.maxLength = 48; nameInput.required = true; nameInput.value = bot.name; nameInput.setAttribute('aria-label', 'Tên bot');
    const descriptionInput = document.createElement('input'); descriptionInput.name = 'description'; descriptionInput.maxLength = 500; descriptionInput.value = bot.description || ''; descriptionInput.placeholder = 'Mô tả chiến thuật (không bắt buộc)'; descriptionInput.setAttribute('aria-label', 'Mô tả bot');
    const save = document.createElement('button'); save.type = 'submit'; save.className = 'button'; save.textContent = 'Lưu thông tin';
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button danger'; remove.textContent = 'Xóa bot';
    remove.addEventListener('click', async () => {
      if (!confirm(`Xóa bot “${bot.name}”? Bot đã tham gia trận hoặc giải đấu sẽ không thể xóa.`)) return;
      remove.disabled = true;
      try { await api(`/bots/${encodeURIComponent(bot.id)}`, { method: 'DELETE' }); await refreshAccount(); showNotice('Đã xóa bot.'); }
      catch (error) { showNotice(error.message, 'error'); }
      finally { remove.disabled = false; }
    });
    edit.append(nameInput, descriptionInput, save, remove); card.append(edit);
    const versions = document.createElement('div');
    versions.className = 'version-list';
    versions.dataset.botId = bot.id;
    versions.setAttribute('aria-live', 'polite');
    renderVersions(versions, bot.versions);
    card.append(versions);
    const form = document.createElement('form');
    form.className = 'upload-row';
    form.dataset.botId = bot.id;
    const file = document.createElement('input');
    file.type = 'file'; file.accept = '.py,.zip,text/x-python,application/zip'; file.required = true;
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
        let board = card.querySelector('.leaderboard-container');
        if (!board) { board = document.createElement('div'); board.className = 'leaderboard-container'; card.append(board); }
        board.replaceChildren();
        if (!result.leaderboard.length) { addText(board, 'p', 'Giải chưa có người đăng ký.', 'card-meta'); return; }
        const table = document.createElement('table'); table.className = 'leaderboard-table';
        const labels = ['Hạng', 'Chủ bot', 'Bot', 'Trận', 'Thắng', 'Hòa', 'Thua', 'Tỷ lệ thắng', 'Điểm'];
        const head = document.createElement('thead'); const headerRow = document.createElement('tr');
        for (const label of labels) addText(headerRow, 'th', label);
        head.append(headerRow); table.append(head);
        const body = document.createElement('tbody');
        for (const entry of result.leaderboard) {
          const row = document.createElement('tr');
          const cells = [entry.rank, entry.ownerName || 'Ẩn danh', `${entry.botName}${entry.version ? ` v${entry.version}` : ''}`,
            entry.played, entry.wins, entry.draws, entry.losses,
            entry.winRate === null ? '—' : `${(entry.winRate * 100).toFixed(1)}%`, entry.points];
          for (const value of cells) addText(row, 'td', String(value));
          body.append(row);
        }
        table.append(body); board.append(table);
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
    if (list.id === 'tournament-list' && currentUser?.role === 'ADMIN') {
      const participantButton = document.createElement('button'); participantButton.className = 'button'; participantButton.type = 'button'; participantButton.textContent = 'Người đăng ký';
      participantButton.addEventListener('click', async () => {
        try {
          const result = await api(`/tournaments/${encodeURIComponent(tournament.id)}/participants`);
          let participantList = card.querySelector('.participant-list');
          if (!participantList) { participantList = document.createElement('div'); participantList.className = 'participant-list match-list'; card.append(participantList); }
          participantList.replaceChildren();
          if (!result.participants.length) { addText(participantList, 'p', 'Chưa có người đăng ký.', 'card-meta'); return; }
          for (const participant of result.participants) {
            const row = document.createElement('div'); row.className = 'match-row';
            addText(row, 'span', `${participant.owner_name} · ${participant.email} · ${participant.bot_name} v${participant.version}`);
            if (tournament.status === 'OPEN') {
              const removeParticipant = document.createElement('button'); removeParticipant.className = 'button danger'; removeParticipant.type = 'button'; removeParticipant.textContent = 'Gỡ';
              removeParticipant.addEventListener('click', async () => {
                removeParticipant.disabled = true;
                try { await api(`/tournaments/${encodeURIComponent(tournament.id)}/participants/${encodeURIComponent(participant.user_id)}`, { method: 'DELETE' }); participantButton.click(); showNotice('Đã gỡ người đăng ký khỏi giải.'); }
                catch (error) { showNotice(error.message, 'error'); }
                finally { removeParticipant.disabled = false; }
              });
              row.append(removeParticipant);
            }
            participantList.append(row);
          }
        } catch (error) { showNotice(error.message, 'error'); }
      });
      actions.append(participantButton);
      if (['DRAFT', 'OPEN'].includes(tournament.status)) {
        const edit = document.createElement('form'); edit.className = 'tournament-edit-form';
        const name = document.createElement('input'); name.name = 'name'; name.maxLength = 100; name.required = true; name.value = tournament.name; name.setAttribute('aria-label', 'Tên giải');
        const deadline = document.createElement('input'); deadline.name = 'submissionDeadline'; deadline.type = 'datetime-local'; deadline.setAttribute('aria-label', 'Hạn đăng ký');
        if (tournament.submission_deadline) deadline.value = new Date(new Date(tournament.submission_deadline).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        const saveEdit = document.createElement('button'); saveEdit.type = 'submit'; saveEdit.className = 'button'; saveEdit.textContent = 'Sửa giải';
        edit.append(name, deadline, saveEdit); edit.addEventListener('submit', async event => {
          event.preventDefault(); saveEdit.disabled = true;
          try {
            const values = Object.fromEntries(new FormData(edit));
            values.submissionDeadline = values.submissionDeadline ? new Date(values.submissionDeadline).toISOString() : null;
            await api(`/tournaments/${encodeURIComponent(tournament.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
            await refreshAccount(); showNotice('Đã cập nhật giải đấu.');
          } catch (error) { showNotice(error.message, 'error'); }
          finally { saveEdit.disabled = false; }
        });
        actions.append(edit);
      }
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
      if (['DRAFT', 'OPEN', 'LOCKED'].includes(tournament.status)) {
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'button danger'; cancel.textContent = 'Hủy giải';
        cancel.addEventListener('click', async () => {
          if (!confirm(`Hủy giải “${tournament.name}”? Thao tác này không thể hoàn tác.`)) return;
          cancel.disabled = true;
          try { await api(`/tournaments/${encodeURIComponent(tournament.id)}/cancel`, { method: 'POST' }); await refreshAccount(); showNotice('Đã hủy giải.'); }
          catch (error) { showNotice(error.message, 'error'); }
          finally { cancel.disabled = false; }
        });
        actions.append(cancel);
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
    option.textContent = `${bot.bot_name} v${bot.version} · ${bot.is_mine ? 'bot của bạn' : bot.is_sample ? 'bot mẫu' : bot.owner_name}`;
    opponent.append(option);
  }
  const selectedOpponent = versions.find(bot => bot.bot_version_id === priorOpponent && bot.bot_version_id !== own.value);
  if (selectedOpponent) opponent.value = selectedOpponent.bot_version_id;
  form.querySelector('button[type=submit]').disabled = practiceBusy || ownBots.length === 0 || versions.length < 2;
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
    if (match.replay_available && ['RUNNING', 'COMPLETED'].includes(match.status)) {
      const replay = document.createElement('a'); replay.href = `/match.html?id=${encodeURIComponent(match.id)}`;
      replay.textContent = match.status === 'RUNNING' ? 'Xem trực tiếp' : 'Xem replay'; row.append(replay);
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
  if (currentUser?.role === 'ADMIN') await Promise.all([refreshJobs(), refreshUsers()]);
}

function appendPager(list, result, refresh) {
  if (!result.hasMore && result.page <= 1) return;
  const controls = document.createElement('div'); controls.className = 'tournament-actions';
  for (const [label, page, disabled] of [['← Trước', result.page - 1, result.page <= 1], ['Sau →', result.page + 1, !result.hasMore]]) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button';
    button.textContent = label; button.disabled = disabled;
    button.addEventListener('click', async () => { button.disabled = true; try { await refresh(page); } catch (error) { showNotice(error.message, 'error'); button.disabled = disabled; } });
    controls.append(button);
  }
  addText(controls, 'span', `Trang ${result.page}`); list.append(controls);
}

async function refreshJobs(page = 1) {
  const result = await api(`/admin/jobs?page=${page}&limit=50`);
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
          await refreshAccount(); showNotice('Đã đưa công việc vào hàng đợi thử lại.');
        } catch (error) { showNotice(error.message, 'error'); }
      });
      row.append(retry);
    }
    list.append(row);
  }
  appendPager(list, result, refreshJobs);
}

async function refreshUsers(page = 1) {
  const result = await api(`/admin/users?page=${page}&limit=50`);
  const list = byId('admin-user-list'); list.replaceChildren();
  if (!result.users.length) return addText(list, 'p', 'Chưa có tài khoản.', 'empty-state');
  for (const user of result.users) {
    const row = document.createElement('div'); row.className = 'match-row';
    addText(row, 'span', `${user.display_name} · ${user.email} · ${user.role}`);
    if (user.id !== currentUser.id) {
      const role = document.createElement('button'); role.type = 'button'; role.className = 'button';
      role.textContent = user.role === 'ADMIN' ? 'Hạ quyền' : 'Cấp quyền quản trị';
      role.addEventListener('click', async () => {
        role.disabled = true;
        try {
          await api(`/admin/users/${encodeURIComponent(user.id)}/role`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: user.role === 'ADMIN' ? 'USER' : 'ADMIN' }) });
          await refreshUsers(page); showNotice('Đã cập nhật vai trò.');
        } catch (error) { showNotice(error.message, 'error'); }
        finally { role.disabled = false; }
      });
      row.append(role);
    }
    list.append(row);
  }
  appendPager(list, result, refreshUsers);
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
      body: JSON.stringify(Object.fromEntries(new FormData(form))) });
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
  if (practiceBusy) return;
  practiceBusy = true;
  const form = event.currentTarget;
  const button = form.querySelector('button[type=submit]'); button.disabled = true;
  try {
    const created = await api('/practice/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownBotVersionId: form.elements.ownBotVersionId.value, opponentBotVersionId: form.elements.opponentBotVersionId.value,
        count: Number(form.elements.count.value) }) });
    showNotice('Đã xếp trận luyện tập vào hàng đợi. Trạng thái sẽ tự cập nhật.', 'info');
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const [jobs, bots] = await Promise.all([api('/practice/matches'), api('/practice/bots')]);
      renderPracticeMatches(jobs.matches); renderPracticeBots(bots.bots);
      const batch = jobs.matches.filter(item => created.matchIds.includes(item.id));
      if (batch.length === created.matchIds.length && batch.every(match => ['COMPLETED', 'FAILED'].includes(match.status))) {
        const failures = batch.filter(match => match.status === 'FAILED').length;
        showNotice(failures ? `${failures}/${batch.length} trận tập thất bại. Mở danh sách để kiểm tra từng trận.`
          : `${batch.length} trận tập đã kết thúc. Có thể mở replay để xem lại.`, failures ? 'error' : 'success');
        break;
      }
    }
  } catch (error) { showNotice(error.message, 'error'); }
  finally { practiceBusy = false; button.disabled = false; }
});

byId('bot-list').addEventListener('submit', async event => {
  const edit = event.target.closest('.bot-edit-row');
  if (edit) {
    event.preventDefault();
    const button = edit.querySelector('button[type=submit]'); button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(edit));
      await api(`/bots/${encodeURIComponent(edit.dataset.botId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      await refreshAccount(); showNotice('Đã cập nhật thông tin bot.');
    } catch (error) { showNotice(error.message, 'error'); }
    finally { button.disabled = false; }
    return;
  }
  const form = event.target.closest('.upload-row');
  if (!form) return;
  event.preventDefault();
  const file = form.querySelector('input[type=file]').files[0];
  if (!file) return;
  const isZip = /\.zip$/i.test(file.name);
  if (file.size > (isZip ? 128 : 64) * 1024) return showNotice(isZip ? 'ZIP phải nhỏ hơn hoặc bằng 128 KiB.' : 'Tệp Python phải nhỏ hơn hoặc bằng 64 KiB.', 'error');
  const button = form.querySelector('button'); button.disabled = true;
  try {
    await api(`/bots/${encodeURIComponent(form.dataset.botId)}/versions`, { method: 'POST',
      headers: { 'Content-Type': isZip ? 'application/zip' : 'text/x-python', 'X-Bot-Filename': file.name }, body: file });
    await refreshAccount(); showNotice('Đã nhận phiên bản và xếp hàng kiểm tra. Trạng thái và thông báo lỗi sẽ tự cập nhật.', 'info');
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
  stopValidationPolling();
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
