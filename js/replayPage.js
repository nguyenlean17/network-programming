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

function stopPlayback() {
  if (timer) clearInterval(timer);
  timer = null;
  playButton.textContent = '▶ Phát';
}

function describeResult(result) {
  if (!result) return 'Trận chưa có kết quả cuối.';
  if (result.winner) return `${result.winner} thắng · ${result.reason}`;
  return `Hòa · ${result.reason}`;
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
      renderer.render(data.frame.board, data.frame.currentTurn, data.frame.lastMove);
      counter.textContent = `0 / ${totalPlies}`;
      document.getElementById('player-summary').textContent =
        `🌸 P1 ${data.players.p1.botName} · ${data.players.p1.ownerName}  |  🌿 P2 ${data.players.p2.botName} · ${data.players.p2.ownerName}`;
      status.textContent = `${describeResult(data.result)} · ${totalPlies} nước đi`;
      description.textContent = totalPlies ? 'Bàn cờ ở trạng thái ban đầu.' : 'Trận không có nước đi đã lưu.';
    })
    .catch(error => { status.textContent = error.message; });
}
