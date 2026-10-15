# OTTv2 Bot API 1.0

Bot Python đọc **một** JSON từ stdin và ghi **một** JSON vào stdout cho mỗi lượt. Runner tạo tiến trình cách ly mới cho mỗi lượt; bot muốn nhớ dữ liệu qua lượt dùng trường `memory` (JSON, tối đa 1 KiB). Không ghi thông tin gỡ lỗi ra stdout; dùng stderr. Trạng thái bàn cờ do server gửi là bản sao; sửa bản sao không thay đổi trận.

## Request

```json
{
  "apiVersion": "1.0",
  "player": "P1",
  "turn": 1,
  "goals": { "P1": "I1", "P2": "A9" },
  "board": [[null, { "player": "P2", "type": "ROCK" }]],
  "legalMoves": [{ "from": "A8", "to": "A7" }],
  "memory": null
}
```

`board` thực tế luôn gồm 9 hàng × 9 cột; ví dụ trên chỉ rút gọn để dễ đọc. `board[0][0]` là A1; mỗi ô là `null` hoặc `{player: "P1"|"P2", type: "ROCK"|"PAPER"|"SCISSORS"}`. `legalMoves` được tạo từ `shared/gameRules.js`, nhưng server vẫn kiểm tra lại nước đi. `turn` là số thứ tự lượt trong trận, bắt đầu từ 1.

## Response

```json
{"apiVersion":"1.0","move":{"from":"A8","to":"A7"},"memory":null}
```

Chỉ chấp nhận một JSON object, phiên bản `1.0`, tọa độ A1–I9 và `memory` là JSON tối đa 1 KiB. Toàn bộ stdout tối đa 4 KiB. JSON lỗi, thiếu nước đi, phiên bản sai, nước không hợp lệ, crash hoặc hết thời gian đều là lỗi bot và xử thua theo đề xuất thể lệ. Kết quả phân biệt `MALFORMED_OUTPUT`, `INVALID_MOVE`, `BOT_CRASH` và `BOT_TIMEOUT`. Lớp Docker runner đặt giới hạn 2 giây/lượt, 0,5 CPU, 64 MiB RAM, 32 tiến trình và tắt mạng; cần kiểm thử container thực trước khi dùng cho file nộp. Không gọi bot từ web process.

## Đề xuất xử lý ván không kết thúc

Nếu đến lượt mà không có nước đi hợp lệ: hòa (`NO_LEGAL_MOVES`). Sau 300 lượt đi mà chưa tới ô đích: hòa (`MOVE_LIMIT`). Đây là **đề xuất thể lệ**, cần công bố trước khi mở giải; không làm thay đổi luật phòng người với người. Thắng mục tiêu vẫn chỉ là P1 đến I1 hoặc P2 đến A9. Công thức điểm và tiêu chí phụ chưa được ấn định, chờ thể lệ từ chủ dự án.

## Chạy bot mẫu cục bộ

`examples/bots/first_legal.py` và `examples/bots/goal_seeker.py` là ví dụ hợp lệ. Với request JSON đầy đủ lưu trong `request.json`, chạy `python examples/bots/first_legal.py < request.json` trên máy của chính bạn. **Không dùng lệnh này cho file bot từ người lạ.** Hệ thống công khai chỉ được nhận file sau khi worker sandbox hoạt động.

Phiên bản `apiVersion` sẽ được gắn vào từng bot version và từng match. Nếu thay đổi schema không tương thích, phát hành phiên bản lớn mới và giữ bộ chuyển đổi hoặc từ chối rõ ràng bot cũ.
