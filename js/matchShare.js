const kinds = { PRACTICE: 'Trận luyện tập', QUALIFICATION: 'Trận vòng loại', TOURNAMENT: 'Trận giải' };
const reasons = { GOAL_REACHED: 'Tới ô đích', NO_LEGAL_MOVES: 'Hết nước hợp lệ', MOVE_LIMIT: 'Đạt giới hạn lượt',
  BOT_CRASH: 'Bot bị lỗi', BOT_TIMEOUT: 'Bot quá thời gian', MALFORMED_OUTPUT: 'Đầu ra sai định dạng', INVALID_MOVE: 'Nước đi không hợp lệ' };

export function matchShareSummary(data, origin) {
  if (data?.status !== 'COMPLETED' || !data.result || !['P1', 'P2', null].includes(data.result.winner) ||
      data.result.reason === 'RUNNER_ERROR' || !kinds[data.matchKind] || !data.players?.p1 || !data.players?.p2 ||
      !Number.isSafeInteger(data.totalPlies) || data.totalPlies < 0 || typeof data.matchId !== 'string') return null;
  const p1 = String(data.players.p1.botName), p2 = String(data.players.p2.botName);
  const winnerName = data.result.winner === 'P1' ? p1 : p2;
  const outcome = data.result.winner ? `${data.result.winner} · ${winnerName} thắng` : 'Hai bot hòa nhau';
  const reason = reasons[data.result.reason] || 'Kết quả được game engine xác nhận';
  const url = new URL('/match.html', origin); url.searchParams.set('id', data.matchId);
  return { title: `${kinds[data.matchKind]} · OTTv2`, p1, p2, outcome, reason,
    resultLabel: data.result.winner ? `${data.result.winner} chiến thắng` : 'Hai bot hòa nhau',
    plies: data.totalPlies, matchId: data.matchId, url: url.href,
    text: `${kinds[data.matchKind]} OTTv2: ${p1} vs ${p2}\n${outcome} · ${reason} · ${data.totalPlies} nước đi\nXem lại trận: ${url.href}\nBiết Python cơ bản là có thể viết bot của riêng bạn!` };
}

const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const short = value => Array.from(value).slice(0, 48).join('') + (Array.from(value).length > 48 ? '…' : '');
export function resultCardSvg(summary) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#faf7f0"/><rect x="32" y="32" width="1136" height="566" rx="36" fill="#fffefa" stroke="#d7e0cd" stroke-width="3"/>
  <circle cx="1070" cy="120" r="50" fill="#edf3e7"/><text x="1070" y="135" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#637f55">★</text>
  <g font-family="Arial, sans-serif" fill="#3e493c">
    <text x="80" y="105" font-size="24" fill="#637f55">${xml(summary.title)}</text>
    <text x="80" y="190" font-size="34" font-weight="bold">P1 · ${xml(short(summary.p1))}</text>
    <text x="80" y="250" font-size="34" font-weight="bold">P2 · ${xml(short(summary.p2))}</text>
    <rect x="64" y="294" width="1072" height="108" rx="20" fill="#edf3e7"/>
    <text x="80" y="360" font-size="32" font-weight="bold">${xml(summary.resultLabel)}</text>
    <text x="80" y="451" font-size="24">${xml(summary.reason)} · ${summary.plies} nước đi</text>
    <text x="80" y="515" font-size="21" fill="#727766">Mã trận: ${xml(summary.matchId)}</text>
    <text x="80" y="555" font-size="20" fill="#727766">Xem replay bằng liên kết chia sẻ kèm thẻ kết quả.</text>
  </g></svg>`;
}

export function setupResultSharing({ document, navigator, location, URL, Blob, setTimeout }) {
  let summary = null;
  const panel = document.getElementById('result-share');
  const feedback = document.getElementById('share-feedback');
  const fallback = document.getElementById('share-text');
  document.getElementById('copy-result').addEventListener('click', async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.text);
      feedback.textContent = 'Đã sao chép nội dung và liên kết replay. Bạn có thể dán vào nhóm lớp.';
    } catch {
      fallback.hidden = false; fallback.value = summary.text; fallback.focus(); fallback.select();
      feedback.textContent = 'Trình duyệt chưa cho phép sao chép. Hãy sao chép nội dung trong ô dưới đây.';
    }
  });
  document.getElementById('download-result').addEventListener('click', () => {
    if (!summary) return;
    const url = URL.createObjectURL(new Blob([resultCardSvg(summary)], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'ottv2-ket-qua.svg';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    feedback.textContent = 'Đã tạo thẻ SVG. Sao chép thêm liên kết replay để bạn bè xem trận.';
  });
  return data => {
    summary = matchShareSummary(data, location.origin);
    panel.hidden = !summary;
    if (!summary) return;
    document.getElementById('share-title').textContent = summary.title;
    document.getElementById('share-bots').textContent = `🌸 ${summary.p1}  —  🌿 ${summary.p2}`;
    document.getElementById('share-outcome').textContent = summary.outcome;
    document.getElementById('share-detail').textContent = `${summary.reason} · ${summary.plies} nước đi`;
  };
}
