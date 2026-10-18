# Vòng loại bằng bộ bot chuẩn

## Thể lệ đang triển khai

- Trang `/qualifiers.html`, liên kết từ Góc bot. Quản trị viên tạo đợt, chọn 1–8 **phiên bản** bot chuẩn đã kiểm tra, hạn nộp và 1–3 cặp trận đổi bên cho mỗi đối thủ.
- Bot chuẩn phải thuộc quản trị viên tạo đợt hoặc là bot mẫu công khai. Nên chuẩn bị bộ bot đủ sức phân loại trước giải; các bot mẫu chủ yếu phục vụ học tập.
- Các phiên bản bot chuẩn, số trận và thể lệ được cố định khi tạo đợt. Tải phiên bản mới không thay đổi bộ chuẩn của đợt cũ. Muốn đổi thể lệ, tạo đợt mới.
- Mỗi bài đấu cả P1 và P2 với từng đối thủ. Thắng 3 điểm, hòa 1, thua 0. Hết nước đi hoặc đủ tổng cộng 300 nước đi (mỗi lần P1 hoặc P2 di chuyển tính một nước): hòa. Bot quá thời gian, lỗi hoặc trả nước đi sai: thua theo bộ chạy hiện tại.
- Chỉ sau khi **tất cả trận của bài nộp hoàn tất**, kết quả mới được tính vào BXH. Lỗi hạ tầng không tính thành thua hoặc hòa; quản trị viên xử lý rồi chạy lại trận lỗi ở Góc bot.
- BXH lấy **bài hoàn tất có tổng điểm cao nhất của mỗi tài khoản**. Không cộng dồn nhiều bài. Bằng điểm được đồng hạng; nếu chính tài khoản có nhiều bài cùng điểm thì hiển thị bài nộp trước.
- Đóng nhận bài vẫn cho các trận đã xếp hàng chạy tiếp. Chỉ chốt kết quả khi không còn bài chờ chấm. Đợt hết hạn tự ngừng nhận bài và có thể chốt khi đã chấm đủ.

Đây là xếp hạng theo **tài khoản**, chưa xác minh mỗi tài khoản thuộc một sinh viên trong danh sách lớp. Trước giải chính thức cần liên kết tài khoản với mã sinh viên/danh sách được phép dự thi và chốt cách chọn người đi tiếp khi đồng điểm ở ngưỡng tuyển.

## Giới hạn để kiểm soát hàng đợi

| Hoạt động | Giới hạn mỗi tài khoản |
| --- | --- |
| Bài vòng loại đang chờ chấm | 1, tính chung các đợt |
| Nộp chấm điểm | 5 bài trong 24 giờ gần nhất, tính chung các đợt |
| Tổng bài trong đợt | Do quản trị viên đặt, mặc định 20 |
| Nộp lại cùng mã nguồn trong cùng đợt | Từ chối, kể cả đổi tên bot/tạo phiên bản khác |
| Phiên bản tải lên đang chờ kiểm tra | 3 |
| Phiên bản tải lên | 20 trong 24 giờ gần nhất; tối đa 100 phiên bản đang lưu |
| Giải vòng tròn | Tối đa 64 người; dùng vòng loại cho quy mô lớn |

Giới hạn tải phiên bản tính trên dữ liệu đang lưu, không phải nhật ký chống lạm dụng lâu dài. Việc đổi mã nguồn dù chỉ một ký tự tạo hash khác; giới hạn số lần nộp giúp kiểm soát trường hợp này.

## Số trận và khả năng mở rộng

Số trận = số bài được nhận × số bot chuẩn × 2 × số cặp trận mỗi đối thủ.

Ví dụ: 5.000 tài khoản, mỗi người nộp một bài, 2 bot chuẩn, mỗi đối thủ 1 cặp đổi bên → **20.000 trận**. Mỗi vòng nộp thêm như vậy tạo thêm 20.000 trận. Không tổ chức vòng tròn giữa toàn bộ 5.000 người.

- Bài nộp được ghi vào PostgreSQL và xếp hàng; web không chạy Python của sinh viên.
- Worker nhận việc có khóa và thời hạn giữ việc, hỗ trợ nhiều tiến trình. `BOT_WORKER_ROLE=all` luân phiên kiểm tra mã và chạy trận để bài nộp mới không chiếm hết lượt xử lý.
- Có thể chia tiến trình thành `BOT_WORKER_ROLE=validation` và `BOT_WORKER_ROLE=matches`. Phải bố trí cả hai loại nếu không dùng `all`.
- Health check chỉ báo nền tảng sẵn sàng khi có đủ khả năng kiểm tra mã và chạy trận; thiếu một loại thì `botRunner` là `partial`.
- BXH đọc điểm tổng kết của từng bài; không đọc toàn bộ replay để tính lại mỗi lần xem. BXH, lịch sử vòng loại, danh sách tài khoản và tác vụ quản trị được phân trang, tối đa 100 mục/lần gọi.
- Khi theo dõi bài đang chấm, trang vòng loại cập nhật mỗi 15 giây; dừng khi hoàn tất hoặc gặp trận lỗi cần xử lý.

Chưa xác nhận chịu tải 4.000–5.000 người dùng thực tế. Kiểm thử trong bộ mã dùng PostgreSQL nhúng riêng với 5.000 bản ghi để kiểm chứng truy vấn và phân trang; không đo tải truy cập đồng thời, năng lực sandbox, hay nhiều worker cùng chạy.

## Triển khai và vận hành

1. Sao lưu cơ sở dữ liệu. Cập nhật web và worker cùng phiên bản mã. Khi khởi động, hệ thống áp dụng migration `005_qualifiers` sau các migration trước đó; migration thay kiểm tra loại trận và thêm bảng, chỉ mục.
2. Chuẩn bị worker chạy Python cách ly theo [hướng dẫn worker](bot-worker-deployment.md). Worker cần quyền Render Sandboxes và cấu hình kết nối; chỉ có web và PostgreSQL thì bài sẽ nằm chờ.
3. Tạo đợt thử nhỏ, kiểm tra bot chuẩn và replay, kiểm tra khôi phục trận lỗi; sau đó tạo đợt chính thức với bộ chuẩn đã chốt.
4. Đo thời gian trung bình một trận, số trận hoàn tất/phút, độ dài hàng đợi, CPU/RAM và số kết nối PostgreSQL. Chọn số worker dựa trên thời gian cần chấm hết bài và ngân sách sandbox. Mỗi worker hiện chạy tuần tự và dùng pool tối đa 3 kết nối.
5. Trước khi nhận hàng nghìn bài: kiểm thử nhiều worker trên PostgreSQL thật, thử mất kết nối/khởi động lại, đo tải đăng nhập/nộp bài/xem BXH, chuẩn bị sao lưu và giám sát hàng đợi. Danh sách đối thủ đấu thử hiện vẫn tải mọi phiên bản READY; đây là phần cần phân trang/tìm kiếm tiếp nếu sử dụng đấu thử rộng rãi.

Blueprint worker là cấu hình tùy chọn, có phí, chưa tự tạo tài nguyên. Các thay đổi trong mã và kiểm thử cục bộ không đồng nghĩa website công khai đã được cập nhật.
