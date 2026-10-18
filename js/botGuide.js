async function showExample(id, url, asJson = false) {
  const output = document.getElementById(id);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download unavailable');
    output.textContent = asJson ? JSON.stringify(await response.json(), null, 2) : await response.text();
  } catch {
    output.textContent = 'Chưa tải được ví dụ. Bạn có thể thử lại trang hoặc dùng liên kết tải file bên trên.';
  }
}
showExample('starter-source', '/bot-kit/main.py');
showExample('request-source', '/bot-kit/request.json', true);
