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
- Cấu hình `render.yaml` nối web service Render miễn phí với PostgreSQL `ottv2-db` cùng khu vực. Database miễn phí chỉ phù hợp thử nghiệm vì [Render Free](https://render.com/docs/free) quy định hết hạn sau 30 ngày; dữ liệu cần được nâng cấp hoặc sao lưu trước hạn. Runner chưa được triển khai; không được mở API nhận mã Python công khai trước khi runner cách ly và lưu trữ bền vững sẵn sàng. [Render Sandboxes](https://render.com/docs/sandboxes) đang early access và cần quyền truy cập workspace.
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
3. **Quản lý + sandbox**: đã có `auth.js`, `platformRouter.js`, `migrate.js`, migration PostgreSQL, validator/runner Render Sandbox và worker hàng đợi. Bản nộp `.py` hoặc ZIP đơn `main.py` được cách ly; bot có thể sửa mô tả và xóa khi chưa được dùng trong lịch sử. Chưa xác minh bằng tài khoản Render Sandbox thật, chưa có xác minh email hoặc kiểm thử end-to-end trên hạ tầng thật.
4. **Website**: đã có trang đăng nhập, quản lý/tải bot, Practice Arena với bot mẫu do hệ thống seed, loạt 1/3 trận đổi bên, replay trực tiếp, đăng ký giải, chỉnh sửa draft/open, hủy trước khi lập lịch, quản lý vòng đời giải, trạng thái job và replay.
5. **Giải đấu**: API và UI hiện hỗ trợ vòng tròn, khóa phiên bản, queue, bảng 3/1/0, replay, pause/resume và retry job. Single elimination và tiêu chí phụ xếp hạng chưa triển khai.
6. **Triển khai**: mã nguồn có cấu hình API web và worker riêng. Cần cấp Postgres bền vững, quyền Render Sandboxes, cấu hình worker an toàn rồi chạy kiểm thử tích hợp thực tế trước khi mở nhận bot công khai. Không thể xác nhận triển khai production khi chưa có các thông tin/quyền đó.

## Quyết định nghiệp vụ cần xác nhận

- Đã nhận đề xuất thể lệ: không còn nước đi hợp lệ hoặc đạt 300 lượt là hòa; bot lỗi, timeout hoặc đi sai xử thua. Cần công bố trước khi mở giải.
- Điểm đã được chốt: thắng 3, hòa 1, thua 0. Chưa có tiêu chí phụ; hiện xếp đồng hạng khi cùng điểm, chưa so đối đầu hay hiệu số.
- Cần xác nhận hạ tầng cho worker container và lưu trữ bền vững trước khi tuyên bố website công khai hỗ trợ nộp bot.

## Rủi ro cần kiểm soát

Không chạy file nộp trong Node/host. File ZIP cần chống zip slip, bom nén và giới hạn kích thước. Container không có mạng, quyền root, secret hay mount nhạy cảm, có quota CPU/RAM/process/output/thời gian. Đảm bảo một job được ghi kết quả đúng một lần sau khi worker chết hoặc chạy lại. Quy tắc hòa 300 lượt hoặc không còn nước hợp lệ cần được công bố cùng thể lệ trước trận giải đầu tiên.

## Trạng thái hiện tại

- Có Bot API 1.0, coordinator dùng `ServerGameSession`, hai bot Python mẫu, schema/migration PostgreSQL, tài khoản, tải bot cách ly, API giải vòng tròn, bảng xếp hạng 3/1/0, replay, worker và UI người chơi/quản trị.
- Nguồn `.py` giới hạn 64 KiB; ZIP giới hạn 128 KiB, chỉ nhận một `main.py` ở thư mục gốc, giải nén tối đa 64 KiB và xác minh CRC. Nguồn lưu trong DB, worker mới được lấy từ DB để chạy; Sandbox per-seat tắt mạng. Retry dành cho lỗi worker/hạ tầng, lỗi bot hợp lệ trong sandbox được ghi kết quả theo thể lệ.
- Bộ kiểm thử `npm test` đạt trên máy dev (bao gồm chạy hai bot mẫu Python); kiểm thử sandbox Render thật, migration trên Postgres thật và worker end-to-end chưa thể chạy nếu chưa có dịch vụ/credentials.
- Practice Arena tạo trận vào cùng hàng đợi cách ly; hai bot mẫu được seed như các phiên bản thật và phải qua validator; người dùng có thể chạy loạt ba trận đổi bên; mỗi người dùng giới hạn tối đa ba trận đang chạy/chờ. Chưa triển khai xác minh email, single elimination, quản lý người dùng/người tham gia của admin hoặc tiêu chí phụ xếp hạng. Chưa bật/cấu hình worker trong Render Blueprint để tránh khởi tạo tài nguyên tính phí ngoài ý muốn.
- Render Sandbox cần quyền workspace. Gói Postgres miễn phí hiện có hạn dùng 30 ngày; trước khi mở nhận mã bot công khai cần nâng cấp hoặc có phương án duy trì dữ liệu, bật worker riêng và xác nhận chạy an toàn trên workspace thật.
