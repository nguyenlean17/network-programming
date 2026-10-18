# Triển khai dịch vụ chạy bot

## Điều kiện hiện tại (17/10/2026)

Workspace Render đang đăng nhập chưa có mục **Sandbox Group** trong menu **New**.
Theo [hướng dẫn Render](https://render.com/docs/sandboxes#1-confirm-access), workspace
này chưa được bật Sandboxes. Chỉ tạo Background Worker sẽ không giải quyết được
việc chạy Python; cần được Render cấp quyền trước.

`deploy/render-worker.yaml` là cấu hình worker riêng, chưa được áp dụng lên Render.
Worker dùng gói trả phí. Cần xem và đồng ý chi phí Render hiển thị trước khi tạo;
không giả định chi phí Sandboxes đã nằm trong giá worker.

## Các bước sau khi được cấp quyền

1. Đưa mã nguồn đã kiểm thử lên GitHub.
2. Tạo Blueprint riêng với đường dẫn `deploy/render-worker.yaml`, hoặc tạo Background
   Worker cùng repo/nhánh, khu vực Singapore, build `npm ci`, start `npm run bot-worker`.
3. Trong phần cấu hình bí mật của worker, đặt:
   - `DATABASE_URL`: URL nội bộ của database `ottv2-db` đang dùng bởi web.
   - `RENDER_API_KEY`: khóa Render có quyền truy cập workspace được bật Sandboxes.
   - `RENDER_WORKSPACE_ID`: ID workspace tương ứng.
   Không lưu khóa hoặc URL có mật khẩu vào GitHub, mã nguồn hay nhật ký.
4. Worker chạy migration, kiểm tra quyền Sandboxes và chạy một bot mẫu tin cậy trong
   sandbox trước khi nhận bản nộp. Nếu thiếu quyền hoặc kiểm tra thất bại, worker dừng;
   không tiêu tốn lượt thử của các bot đang chờ.
5. Web và worker cần dùng cùng phiên bản migration. Kiểm tra `/api/health`:
   - `botStorage: ready`, `botRunner: offline`, `botPlatform: worker_offline`: DB đã có,
     chưa có worker báo hoạt động trong 90 giây gần nhất.
   - `botRunner: online`, `botPlatform: ready`: có worker đã qua bước kiểm tra khởi động
     và đang gửi tín hiệu hoạt động. Điều này không bảo đảm mọi trận đều thành công.
   - `botStorage: unavailable`: cấu hình hoặc kết nối DB chưa sẵn sàng; runner là `unknown`.
   `status: ok` ở cấp ngoài vẫn chỉ phản ánh máy chủ game người với người.
6. Dùng tài khoản được chủ dự án cho phép để nộp bot mẫu, đợi `READY`, tạo trận tập,
   kiểm tra kết quả và mở replay. Sau đó chạy giải thử ít nhất hai bot để kiểm tra
   việc chốt giải và bảng điểm 3/1/0. Không coi kiểm thử giả lập là bằng chứng triển khai thật.

Chưa tạo worker, API key, sandbox hay phát sinh chi phí trong lần sửa này.
