# Theo dõi vận hành giải đấu

Trang `/admin.html` có liên kết trong khu vực quản trị của Góc bot. Chỉ tài khoản ADMIN được đọc dữ liệu; mọi API theo dõi, lọc tác vụ và yêu cầu chạy lại đều kiểm tra quyền ở backend.

## Số liệu

- Hàng đợi kiểm tra mã và hàng đợi trận: số tác vụ chờ, đang chạy, thất bại, quá hạn giữ việc; thời điểm tạo tác vụ đang chờ lâu nhất.
- Trạng thái worker: vai trò, thời điểm gửi tín hiệu, khả năng kiểm tra mã/chạy trận. Cần đủ cả hai khả năng. Worker mất tín hiệu quá 90 giây không được tính là đang hoạt động.
- Danh sách hiển thị tối đa 50 worker gửi tín hiệu gần nhất; tổng khả năng hoạt động được tính trên toàn bộ worker, không phụ thuộc giới hạn này.
- Worker gửi CPU, RAM RSS và thời gian hoạt động của **tiến trình Node** khoảng 30 giây/lần. CPU đo theo chênh lệch thời gian CPU trong khoảng lấy mẫu, 100% = một lõi. Lần gửi đầu chưa có khoảng đo nên CPU là null, giao diện hiển thị “—”.
- Đây không phải CPU/RAM của sandbox Python, toàn bộ máy chủ hay số liệu thanh toán. Không suy ra năng lực chạy bot chỉ từ CPU worker. Chưa có giám sát tài nguyên sandbox hoặc cảnh báo qua email.
- Trang cập nhật khi mở hoặc khi quản trị viên bấm cập nhật; không tự truy vấn liên tục.

## Tìm lỗi và chạy lại

1. Trang mặc định lọc tác vụ thất bại. Có thể chọn chờ/đang chạy/hoàn tất, loại trận/kiểm tra mã và nhập một UUID đầy đủ.
2. Mã tra cứu có thể là mã tác vụ, trận, giải, vòng loại, bài vòng loại hoặc phiên bản bot. Danh sách có phân trang 25 mục, API tối đa 100.
3. Xem tên bot, trạng thái, số lần thử, mã liên quan và chẩn đoán. Nước đi sai hoặc bot quá thời gian được ghi kết quả trận theo thể lệ; chúng không nhất thiết là tác vụ FAILED. SUCCEEDED nghĩa là đã xử lý, không đồng nghĩa bot thắng hay mã được chấp nhận.
4. Sửa nguyên nhân hạ tầng, sau đó chọn “Đưa vào hàng đợi chạy lại”. Backend chỉ nhận tác vụ FAILED, đặt lại số lần thử và ghi audit trong cùng giao dịch. Yêu cầu lặp lại sau khi đã xếp hàng bị từ chối.
5. Tra cứu nhật ký bằng mã đối tượng để đối chiếu ai đã yêu cầu chạy lại và lúc nào. Nhật ký hiển thị các thao tác ứng dụng đã ghi, không phải toàn bộ log truy cập hay log máy chủ.

Các tác vụ chờ có thể thuộc giải đang tạm dừng, nên độ dài hàng đợi không tự động có nghĩa worker lỗi. Tác vụ quá hạn giữ việc sẽ được worker nhận lại hoặc đánh dấu thất bại theo số lần thử tối đa; không cho chạy lại thủ công một tác vụ RUNNING để tránh trùng xử lý.

## Triển khai

Migration `006_worker_metrics` thêm JSON số đo và chỉ mục. Cập nhật web và worker cùng phiên bản; worker cũ chưa gửi số đo sẽ hiện “—”. Không cần nhập số liệu hay tạo worker giả.

Kiểm thử gồm PostgreSQL nhúng riêng cho phân quyền, bộ lọc, tín hiệu quá hạn, chạy lại và nhật ký; kiểm thử sampler CPU/RAM và giao diện. Chưa phải kiểm chứng sandbox thật hoặc đo tải 5.000 người dùng. Worker công khai vẫn cần được triển khai riêng theo [hướng dẫn worker](bot-worker-deployment.md).
