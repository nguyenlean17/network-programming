# Kế hoạch nâng cấp OTTv2 thành nền tảng bot

## Kiểm kê ngày 16/10/2026

```text
Trình duyệt (index.html, playfun.html, rooms.html)
  ├─ local / AI sẵn có: js/app.js, js/ai.js
  └─ WebSocket: js/renderSync.js, js/playfunApp.js
                    ↓
Express + ws: server/server.js → server/room.js → server/game.js
                                                   ↓
                                        shared/gameRules.js
```

- Server quản lý phòng và luật đi quân. PlayHTML chỉ đồng bộ bản sao; server quyết định nước đi và lượt. Phòng và lịch sử hiện ở RAM; khởi động lại là mất. Không có đăng nhập, quyền quản trị, cơ sở dữ liệu, hàng đợi, lưu mã bot hoặc runner.
- `js/ai.js` là đối thủ máy chạy trong trình duyệt, không phải API cho mã Python do người dùng nộp.
- Luật chuẩn hiện có: bàn 9×9, 15 quân mỗi bên, mỗi lượt đi một ô theo 8 hướng; không đi vào quân cùng phe; khác phe cùng loại chặn; chỉ ăn theo quan hệ Đấm > Kéo > Lá > Đấm. P1 thắng khi đến I1, P2 thắng khi đến A9. Server hiện không quy định hòa, hết nước đi hay giới hạn lượt.
- Cấu hình `render.yaml` là một web service Render miễn phí. Cơ sở dữ liệu bền vững và container runner không có trong cấu hình. Không được mở API nhận mã Python công khai trước khi runner cách ly và lưu trữ bền vững sẵn sàng. Theo [Render Free](https://render.com/docs/free), filesystem web miễn phí không bền vững và Postgres miễn phí hết hạn sau 30 ngày. [Render Sandboxes](https://render.com/docs/sandboxes) phù hợp hơn với mã không tin cậy nhưng đang early access và cần quyền truy cập workspace; Docker-based deploy chỉ là cách đóng gói service, không chứng minh có Docker daemon để tạo container trong service.
- Bộ kiểm thử gốc `npm test` đạt trước khi nâng cấp. Multiplayer người với người cần tiếp tục dùng luồng WebSocket hiện tại.

## Kiến trúc bổ sung

```text
Frontend bot/giải/replay ── HTTPS ── Express API + xác thực/phân quyền
                                      ├─ dữ liệu bền vững: user, bot, version, giải,
                                      │  participant, match, move, job, audit log
                                      ├─ scheduler + queue có giới hạn đồng thời
                                      └─ match coordinator → shared/gameRules.js
                                                ↓ yêu cầu một lượt
                                         worker → sandbox container Python
```

WebSocket và phòng người chơi hiện tại tiếp tục tách khỏi lịch đấu bot. Runner chỉ nhận trạng thái công khai của trận, trả lời nước đi; coordinator tự kiểm tra bằng `server/game.js`. Kết quả và replay được lưu theo đúng phiên bản bot, cấu hình giải và lịch sử nước đi. Không lưu một bảng xếp hạng không thể tính lại từ match.

## Thiết kế dữ liệu dự kiến

`users(id, login, password_hash, role, created_at)`, `bots(id, owner_id, name, description)`, `bot_versions(id, bot_id, api_version, sha256, object_key, validation_status, created_at)`, `tournaments(id, status, format, submission_deadline, rules_json, scoring_json, created_by)`, `participants(tournament_id, user_id, bot_version_id, locked_at)`, `matches(id, tournament_id nullable, kind, p1_version_id, p2_version_id, state, winner, reason, created_at)`, `match_moves(match_id, ply, player, from_cell, to_cell, event_json)`, `runner_jobs(id, match_id, status, attempts, lease_until)`, `audit_logs(id, actor_id, action, subject_id, created_at)`.

Các khóa ngoại phải trỏ tới phiên bản bất biến. Cần ràng buộc duy nhất `(match_id, ply)`, `(tournament_id, user_id)` và chỉ mục cho chủ bot, trạng thái job, thứ tự match. Bảng điểm tính lại từ các match đã công bố theo `scoring_json` bị khóa trước trận đầu. Với hosting hiện tại cần chọn cơ sở dữ liệu và nơi chứa file bền vững trước khi tạo migration.

## Giai đoạn và file

1. **Audit**: tài liệu này; không sửa game hiện hữu.
2. **Engine + Bot API**: `server/bots/protocol.js`, `server/bots/match.js`, `server/bots/replay.js`, `docs/bot-api-v1.md`, `examples/bots/*.py`, các bài kiểm thử `tests/bot-*.test.js`. Tận dụng `shared/gameRules.js` và `server/game.js`.
3. **Quản lý + sandbox**: `server/bots/dockerRunner.js` là lớp gọi Docker cách ly ban đầu; tiếp tục thêm API xác thực, migration, kho file, validator, worker và kiểm thử container thực. Không dùng subprocess Python không cách ly cho file nộp.
4. **Website**: trang bot, upload, luyện tập; dùng lại bàn cờ cho replay.
5. **Giải đấu**: scheduler, đăng ký, khóa phiên bản, điểm cấu hình, replay, admin và audit log.
6. **Triển khai**: worker container riêng, cơ sở dữ liệu và kho file bền vững, kiểm thử tích hợp và hồi quy, cập nhật README. Chỉ bật upload công khai khi toàn bộ ranh giới bảo mật hoạt động.

## Quyết định nghiệp vụ cần xác nhận

- Đã nhận đề xuất thể lệ: không còn nước đi hợp lệ hoặc đạt 300 lượt là hòa; bot lỗi, timeout hoặc đi sai xử thua. Cần công bố trước khi mở giải.
- Công thức điểm và tiêu chí phụ của giải là gì? Nếu chưa có quy định, bắt buộc khai báo và công bố khi tạo giải, trước trận đầu.
- Cần xác nhận hạ tầng cho worker container và lưu trữ bền vững trước khi tuyên bố website công khai hỗ trợ nộp bot.

## Rủi ro cần kiểm soát

Không chạy file nộp trong Node/host. File ZIP cần chống zip slip, bom nén và giới hạn kích thước. Container không có mạng, quyền root, secret hay mount nhạy cảm, có quota CPU/RAM/process/output/thời gian. Đảm bảo một job được ghi kết quả đúng một lần sau khi worker chết hoặc chạy lại. Quy tắc hòa 300 lượt hoặc không còn nước hợp lệ cần được công bố cùng thể lệ trước trận giải đầu tiên.

## Kết quả thực hiện tại mốc này

- Giai đoạn 1: kiểm kê xong; bộ kiểm thử gốc đạt trước khi sửa.
- Giai đoạn 2: Bot API 1.0, coordinator, hai bot mẫu và kiểm thử giao thức/trận cục bộ đã thêm. Bộ kiểm thử gốc và mới đạt trên máy có Python.
- Giai đoạn 3: có lớp Docker runner với giới hạn mạng, quyền, CPU, RAM, tiến trình, file, stdout và thời gian; **chưa kiểm thử với Docker thật**, vì máy hiện tại không có lệnh Docker. Chưa có upload, auth, DB hay worker chạy nền. Không gọi runner từ web API.
- Đề xuất mới từ chủ dự án: trận bị kẹt hoặc chạm giới hạn lượt được tính hòa; điểm giải chờ công thức chính thức từ chủ dự án. Hiện `runBotMatch` biểu diễn hai trường hợp bằng `NO_LEGAL_MOVES` và `MOVE_LIMIT`, với giới hạn mặc định 300 lượt.
