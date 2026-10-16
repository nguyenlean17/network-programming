import { BoardRenderer } from './board.js';

const params = new URLSearchParams(location.search);
const matchId = params.get('id');
const renderer = new BoardRenderer(document.getElementById('board-container'));
renderer.initBoard();
renderer.setInteractive(false);

const status = document.getElementById('replay-status');
const counter = document.getElementById('move-counter');
const range = document.getElementById('move-range');
const description = document.getElementById('move-description');
const playButton = document.getElementById('play-pause');
let totalPlies = 0;
let currentPly = 0;
let timer = null;
let liveRefresh = null;
let matchResult = null;
let matchStatus = null;
let matchError = null;

function stopPlayback() {
  if (timer) clearInterval(timer);
  timer = null;
  playButton.textContent = '▶ Phát';
}

function describeResult(state = matchStatus, error = matchError) {
  if (state === 'FAILED') return `Trận lỗi · ${error || 'runner thất bại'}`;
  if (state === 'RUNNING') return `Đang thi đấu · ${totalPlies} nước đi`;
  if (state === 'QUEUED') return 'Đang chờ worker bắt đầu';
  if (!matchResult) return 'Trận chưa có kết quả cuối.';
  const reasons = {
    GOAL_REACHED: 'đã tới ô đích', NO_LEGAL_MOVES: 'không còn nước đi hợp lệ', MOVE_LIMIT: 'đạt giới hạn lượt',
    BOT_CRASH: 'bot bị lỗi khi chạy', BOT_TIMEOUT: 'bot vượt thời gian', MALFORMED_OUTPUT: 'bot trả dữ liệu sai định dạng',
    INVALID_MOVE: 'bot đi nước không hợp lệ'
  };
  const outcome = matchResult.winner ? `${matchResult.winner} thắng` : 'Hòa';
  const reason = reasons[matchResult.reason] || matchResult.reason || 'không rõ lý do';
  const fault = matchResult.faultPlayer ? ` · ${matchResult.faultPlayer} mắc lỗi` : '';
  const detail = matchResult.detail ? ` · ${matchResult.detail}` : '';
  return `${outcome} · ${reason}${fault}${detail}`;
}

function updateMatchState(data) {
  matchStatus = data.status;
  matchResult = data.result;
  matchError = data.errorMessage;
  status.textContent = `${describeResult(data.status, data.errorMessage)} · ${totalPlies} nước đi`;
}

async function showFrame(ply) {
  const response = await fetch(`/api/platform/matches/${encodeURIComponent(matchId)}/replay?ply=${ply}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Không tải được replay (${response.status})`);
  currentPly = data.frame.ply;
  renderer.render(data.frame.board, data.frame.currentTurn, data.frame.lastMove);
  range.value = String(currentPly);
  counter.textContent = `${currentPly} / ${totalPlies}`;
  description.textContent = data.frame.lastMove
    ? `${data.frame.lastMove.player}: ${data.frame.lastMove.from} → ${data.frame.lastMove.to}${data.frame.lastMove.isCapture ? ' · Ăn quân' : ''}`
    : 'Bàn cờ hiển thị trạng thái ban đầu.';
  if (currentPly >= totalPlies) stopPlayback();
}

async function moveTo(ply) {
  stopPlayback();
  try { await showFrame(Math.max(0, Math.min(totalPlies, ply))); }
  catch (error) { status.textContent = error.message; }
}

document.getElementById('first-move').addEventListener('click', () => moveTo(0));
document.getElementById('previous-move').addEventListener('click', () => moveTo(currentPly - 1));
document.getElementById('next-move').addEventListener('click', () => moveTo(currentPly + 1));
document.getElementById('last-move').addEventListener('click', () => moveTo(totalPlies));
range.addEventListener('input', () => moveTo(Number(range.value)));
playButton.addEventListener('click', async () => {
  if (timer) return stopPlayback();
  if (currentPly >= totalPlies) await moveTo(0);
  playButton.textContent = '⏸ Tạm dừng';
  timer = setInterval(() => {
    if (currentPly >= totalPlies) return stopPlayback();
    showFrame(currentPly + 1).catch(error => { stopPlayback(); status.textContent = error.message; });
  }, 700);
});

if (!matchId) status.textContent = 'Thiếu mã trận trong đường dẫn.';
else {
  fetch(`/api/platform/matches/${encodeURIComponent(matchId)}/replay?ply=0`)
    .then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Không tải được trận đấu');
      totalPlies = data.totalPlies;
      range.max = String(totalPlies);
      updateMatchState(data);
      renderer.render(data.frame.board, data.frame.currentTurn, data.frame.lastMove);
      counter.textContent = `0 / ${totalPlies}`;
      document.getElementById('player-summary').textContent =
        `${data.matchKind === 'PRACTICE' ? 'Trận luyện tập' : 'Trận giải'} · 🌸 P1 ${data.players.p1.botName} · ${data.players.p1.ownerName}  |  🌿 P2 ${data.players.p2.botName} · ${data.players.p2.ownerName}`;
      description.textContent = totalPlies ? 'Bàn cờ ở trạng thái ban đầu.' : 'Trận không có nước đi đã lưu.';
      if (data.status === 'RUNNING' || data.status === 'QUEUED') {
        liveRefresh = setInterval(async () => {
          const wasFollowing = currentPly === totalPlies && !timer;
          const priorPlies = totalPlies;
          try {
            const progress = await showProgress();
            if (wasFollowing && totalPlies > priorPlies) await showFrame(totalPlies);
            if (['COMPLETED', 'FAILED'].includes(progress.status)) {
              clearInterval(liveRefresh); liveRefresh = null;
              updateMatchState(progress);
            }
          } catch (error) { status.textContent = error.message; }
        }, 1500);
      }
    })
    .catch(error => { status.textContent = error.message; });
}

async function showProgress() {
  const response = await fetch(`/api/platform/matches/${encodeURIComponent(matchId)}/replay?ply=${currentPly}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Không tải được trạng thái (${response.status})`);
  const wasAtLast = currentPly === totalPlies;
  totalPlies = data.totalPlies;
  range.max = String(totalPlies);
  updateMatchState(data);
  if (wasAtLast && data.frame.ply === currentPly) {
    renderer.render(data.frame.board, data.frame.currentTurn, data.frame.lastMove);
  }
  return data;
}
