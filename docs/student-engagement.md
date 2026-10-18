# Nhập môn, thử thách và chia sẻ kết quả

## Đã triển khai

- `/challenges.html`: trang hành trình, liên kết từ trang game, Góc bot và hướng dẫn viết bot.
- Bốn cột mốc: có phiên bản đã tải lên, có phiên bản READY, hoàn tất trận tập với đối thủ, thắng trận tập đầu tiên. Tiến độ được tính từ dữ liệu tài khoản và trận đấu đang lưu, không có số liệu giả, không cho trình duyệt tự đánh dấu hoàn thành.
- Hai cửa ải dùng bot mẫu hiện có: chọn nước đầu tiên và tìm đường tới đích. Đây là hai chiến thuật để luyện tập, không phải mức độ khó đã được đo thống kê.
- Một nút tạo 2 trận đổi bên, dùng luồng Practice Arena và giới hạn 3 trận đang chờ/chạy mỗi tài khoản. Cặp trận mới cần ít nhất 2 chỗ trống.
- Cửa ải hoàn thành khi cùng một phiên bản của sinh viên thắng cả P1 và P2 trước cùng phiên bản bot mẫu. Các chiến thắng có thể đến từ nhiều lần thử. Không gộp hai phiên bản của sinh viên. Khi bot mẫu có phiên bản mới, tiến độ cửa ải hiện tại tính với phiên bản mới; lịch sử cũ không bị xóa.
- Không tính trận chưa hoàn tất, lỗi hạ tầng, trận người khác hoặc tự đấu hai bot cùng tài khoản thành thành tích thi đấu. Trận vòng loại và giải chính thức không được trộn vào tiến độ luyện tập.
- Có liên kết replay làm bằng chứng cho mỗi bên đã thắng. Trang cập nhật mỗi 15 giây khi còn trận hoặc phiên bản đang kiểm tra; có nút cập nhật thủ công.
- Trên `/match.html`, trận COMPLETED có thẻ kết quả, nút sao chép nội dung kèm liên kết replay và tải thẻ SVG. Nếu clipboard bị chặn, hiện ô để sao chép thủ công. Không tự gửi lên mạng xã hội.
- Nội dung chia sẻ ghi rõ luyện tập/vòng loại/giải, bên thắng hoặc hòa, lý do và số nước đi. Liên kết được tạo lại chỉ với mã trận; không sao chép token hay các tham số khác. Tên bot được xuất như văn bản và escape trong SVG.

## Phạm vi

Các cột mốc chỉ khuyến khích luyện tập, không có giá trị giải thưởng, không cộng điểm vòng loại. Replay hiện là công khai và đã hiển thị tên bot/tên người sở hữu; trang chia sẻ giải thích điều này. Nguồn Python không được đưa vào nội dung chia sẻ.

Chưa tự công bố giải thưởng, chứng nhận, sự kiện theo tuần hay lịch livestream. Các phần đó cần ban tổ chức quyết định thể lệ, lịch và nguồn lực. Không thay đổi bộ bot chuẩn của vòng loại đã tạo.

Hướng dẫn và trang hành trình tải được khi chưa cấu hình cơ sở dữ liệu. Để có đối thủ/tiến độ thật cần PostgreSQL; để trận thực sự chạy cần worker sandbox. Tính năng trong mã chưa đồng nghĩa đã triển khai lên website công khai.

## Kiểm chứng

- Kiểm thử PostgreSQL nhúng: phân quyền, các điều kiện nhận thành tích, không gộp phiên bản, đổi phiên bản mẫu, không tự thắng bot của mình.
- Kiểm thử giao diện: không tạo cặp trận hai lần khi bấm nhanh, giới hạn hàng đợi, giữ lựa chọn bot, dừng cập nhật khi không cần.
- Kiểm thử chia sẻ: đúng trạng thái/winner, phân biệt loại trận, không lộ tham số URL, xử lý tên chứa HTML và clipboard bị chặn.
- Các dữ liệu tình huống kiểm thử nằm riêng trong bộ nhớ, không ghi vào cơ sở dữ liệu website.
