# Oẳn Tù Tì v2 (OTTv2) - Board Game Chiến Thuật 9×9
## Dự Án Web Game Oẳn Tù Tì v2: Chơi Cục Bộ & Đa Người Chơi

**Bản chính để mở và nộp là [`index.html`](index.html).** Trang [`playfun.html`](playfun.html) là chế độ online có tích hợp thư viện [PlayHTML](https://playhtml.fun/docs/). Đường dẫn cũ `OTTv2/index.html` chuyển về trang chính; `/playfull.html` chuyển tới `playfun.html` khi chạy bằng server của dự án.

**Bản công khai:** [Chơi OTTv2 trên Internet](https://ottv2-game-2hxh.onrender.com/playfun.html). Mỗi người chơi mở liên kết phòng được chia sẻ và bấm **Sẵn sàng** trước khi bắt đầu.

Trang web trò chơi chiến thuật bàn cờ 9×9 biến thể từ Oẳn tù tì (Rock - Paper - Scissors) dành cho **2 người chơi**, hỗ trợ:
1. **Chế độ 2 người chơi trên cùng một thiết bị (Local 2 Players - Phase 1)**: Lần lượt thay phiên thực hiện nước đi hoàn toàn ở client, không cần server.
2. **Chế độ Phòng Đấu Trực Tuyến & Danh sách phòng (Authoritative Multiplayer Server - Phase 2)**:
   * Máy chủ Node.js (Express + WebSocket) quản lý trạng thái trò chơi tập trung (Authoritative source of truth).
   * **Sảnh phòng trực tuyến (Live Room Lobby)**: Phòng do người dùng tạo xuất hiện trong danh sách thật; không có phòng hoặc số người xem giả. Người khác có thể chọn phòng hoặc dùng liên kết chia sẻ.
   * Hỗ trợ nhiều phòng cùng lúc (Room 001, Room 002, Room 003...).
3. **Chế độ PlayHTML (`playfun.html`)**: Server WebSocket cấp vai trò P1/P2/khán giả, xác thực mọi nước đi và chuyển biểu cảm. PlayHTML chia sẻ bản sao trạng thái bàn cờ và con trỏ trong từng phòng; dữ liệu PlayHTML không có quyền ghi đè ván đấu trên server. Mỗi phòng có tối đa hai người đi quân, người đến sau chỉ xem. P1 và P2 đều phải bấm **Sẵn sàng** thì server mới bắt đầu đồng hồ 30 giây; hết giờ server chuyển lượt. Nếu một người rời phòng, đồng hồ dừng.
4. **Chế độ Đấu với Máy (AI Engine 3 cấp độ)**: Minimax Alpha-Beta Pruning + Bảng Chuyển Vị RAM.
5. **Thiết kế giao diện mới (Redesign)**: Phong cách **Minimalistic (Tối giản), hoàn toàn KHÔNG SỬ DỤNG GRADIENTS**; màu sắc đơn sắc (solid colors), đường nét sắc nét (crisp 1px borders), độ tương phản cao và độ rõ ràng tối đa trên mọi kích thước màn hình.

---

## 1. Luật Chơi Chi Tiết Oẳn Tù Tì v2 (OTTv2)

### 1.1. Bàn cờ 9×9
* Kích thước: **9 hàng × 9 cột = 81 ô** (Cột `A → I`, Hàng `1 → 9`).
* Hệ tọa độ:
  ```
  A1 B1 C1 D1 E1 F1 G1 H1 I1
  A2 B2 C2 D2 E2 F2 G2 H2 I2
  ...
  A9 B9 C9 D9 E9 F9 G9 H9 I9
  ```
* **Hai ô đích đặc biệt**: **`A9`** và **`I1`**.
* P1 thắng khi đưa một quân tới **`I1`**; P2 thắng khi đưa một quân tới **`A9`**.

### 1.2. Các loại quân cờ
Mỗi người chơi có các quân cờ thuộc 3 loại:
* ✊ **Đấm** (Rock)
* ✋ **Lá** (Paper)
* ✌️ **Kéo** (Scissors)

Người chơi 1 (Player 1 - Phe Đỏ) và Người chơi 2 (Player 2 - Phe Xanh) được phân biệt rõ rệt bằng màu sắc và huy hiệu trên bàn cờ.

**Quy ước riêng của dự án:** Mỗi phe bắt đầu với 15 quân (5 quân mỗi loại). Hai bố cục khởi đầu chỉ dùng cho chế độ Local/AI; phòng online dùng bố cục chuẩn. Đề bài không ấn định số quân hoặc cách xếp ban đầu.

### 1.3. Di chuyển quân (King's Move)
* Mỗi quân cờ di chuyển tương tự **quân Vua trong cờ vua**:
  Mỗi lượt, quân có thể di chuyển tối đa **1 ô** theo bất kỳ một trong **8 hướng**:
  ```
  ↖  ↑  ↗   (Chéo trên trái, Lên, Chéo trên phải)
  ←  ●  →   (Trái, Quân cờ, Phải)
  ↙  ↓  ↘   (Chéo dưới trái, Xuống, Chéo dưới phải)
  ```
* **Ràng buộc di chuyển**:
  * Không được di chuyển quá 1 ô trong một lượt đi.
  * Không được đi ra ngoài bàn cờ.
  * Không thể đi vào ô đang bị chiếm bởi quân cùng phe.

### 1.4. Quy tắc ăn quân (Oẳn Tù Tì)
* ✊ **Đấm** ăn ✌️ **Kéo**
* ✌️ **Kéo** ăn ✋ **Lá**
* ✋ **Lá** ăn ✊ **Đấm**

Ví dụ: Quân Đấm của Player 1 di chuyển vào ô đang có quân Kéo của Player 2:
$\rightarrow$ Kéo bị ăn, quân Đấm chiếm ô đó.

### 1.5. Hai quân cùng loại (Chặn đường)
* **Hai quân cùng loại KHÔNG THỂ ăn nhau**:
  * Đấm vs Đấm $\rightarrow$ Không ăn, đứng chặn đường nhau.
  * Lá vs Lá $\rightarrow$ Không ăn, đứng chặn đường nhau.
  * Kéo vs Kéo $\rightarrow$ Không ăn, đứng chặn đường nhau.
* Hai quân chỉ đứng chặn đường nhau và không được chiếm cùng 1 ô.

### 1.6. Quân bị khắc chế
* Khi quân tấn công bị quân đối phương khắc chế:
  * Đấm tấn công Lá $\rightarrow$ Bị Lá khắc, không được thực hiện nước đi (nước đi không hợp lệ / bị chặn).
  * Kéo tấn công Đấm $\rightarrow$ Bị Đấm khắc, không được đi vào.
  * Lá tấn công Kéo $\rightarrow$ Bị Kéo khắc, không được đi vào.

### 1.7. Điều kiện thắng (Win Conditions)
Đưa một quân vào ô đích của đối phương: **P1 đến `I1`**, **P2 đến `A9`**. Ăn quân không tự động kết thúc ván đấu.

---

## 2. Kiến Trúc & Cấu Trúc Thư Mục

Dự án được phân tách rõ ràng giữa **Client UI**, **Server Authoritative Logic**, và **Shared Rules**:

```
network-programming/
├── index.html                   # Giao diện chính: Local 2 Players, Sảnh phòng Online & AI
├── playfun.html                 # Giao diện online dùng PlayHTML và server xác thực nước đi
├── rooms.html                   # Sảnh xem trực tiếp phụ trợ (Live Spectator Hub)
├── package.json                 # Cấu hình dự án & scripts chạy
├── .gitignore                   # Loại trừ node_modules và tệp tạm
├── README.md                    # Hướng dẫn chi tiết dự án & luật chơi
│
├── css/
│   └── style.css                # Hệ thống thiết kế Minimalistic (Hoàn toàn KHÔNG gradients)
│
├── js/
│   ├── app.js                   # Bộ điều khiển trung tâm (App Controller, Tabs, UI updates)
│   ├── board.js                 # Renderer bàn cờ 9×9, tương tác chuột & highlight nước đi
│   ├── constants.js             # Hằng số bàn cờ, âm thanh synthesizer, tọa độ
│   ├── gameRules.js             # Tầng logic luật chơi (chuẩn hóa trên Client)
│   ├── renderSync.js            # Engine kết nối WebSocket đồng bộ phòng đấu đa người chơi
│   ├── playhtmlSync.js          # Đồng bộ bản sao ván đấu và con trỏ qua PlayHTML
│   ├── playfunApp.js            # Bộ điều khiển trang PlayHTML
│   └── ai.js                    # Thuật toán AI Bot 3 cấp độ (RAM Transposition Table)
│
├── server/
│   ├── server.js                # Node.js HTTP & WebSocket Server (Express + ws)
│   ├── room.js                  # Quản lý danh sách phòng (RoomManager), người chơi & khán giả
│   └── game.js                  # Authoritative Server Game Session (xác thực nước đi trên server)
│
├── shared/
│   ├── constants.js             # Hằng số dùng chung giữa server và client
│   └── gameRules.js             # Bộ luật cờ OTTv2 dùng chung cho server validate
│
└── tests/
    ├── rules.test.js            # Kiểm thử luật chơi
    ├── multiplayer.test.js      # Vai trò trong phòng và đồng bộ PlayHTML
    ├── renderSync.test.js       # Vào phòng qua liên kết khi đang kết nối
    ├── server.integration.test.js # Tạo phòng, di chuyển và phân quyền
    └── server.timer.test.js     # Đồng hồ khi sẵn sàng, hết lượt và ngắt kết nối
```

---

## 3. Quy Trình Tạo Phòng & Danh Sách Phòng Trực Tuyến

Theo đúng yêu cầu: **"Khi tạo một phòng, không cần phải copy link (copy cũng được), nhưng khi tạo phòng nó sẽ thành 1 phòng trong danh sách các phòng. 1 người chơi khác có thể chọn phòng đó từ danh sách để bắt đầu chơi."**

### 3.1. Luồng hoạt động:
1. **Người chơi 1 (Tạo phòng)**:
   * Mở tab **`🌐 Phòng Đấu Online`**.
   * Nhập tên phòng (ví dụ: *Phòng của Nam*) hoặc để trống để sinh mã tự động.
   * Nhấn nút **`➕ Tạo phòng ngay`**.
   * Máy chủ ghi nhận phòng mới, thiết lập Người chơi 1 là **Player 1 (Đỏ)**, và **lập tức phát sóng danh sách phòng mới (ROOMS_LIST) tới tất cả các client đang kết nối**.
   * Màn hình của Người chơi 1 chuyển sang bàn cờ và chờ người thứ hai.
2. **Người chơi 2 (Vào chơi từ danh sách)**:
   * Mở tab **`🌐 Phòng Đấu Online`** (ở một tab khác, trình duyệt khác, hoặc máy tính khác trong mạng).
   * Ngay lập tức nhìn thấy phòng của Người chơi 1 trong danh sách với huy hiệu **`🟡 Chờ người chơi 2`**.
   * Nhấn nút **`⚔️ Vào chơi (P2)`** trực tiếp từ danh sách.
   * **Không cần copy link**! Người chơi 2 được gán vai trò **Player 2 (Xanh)** và vào trận ngay.
   * Cả hai bấm **✅ Sẵn sàng**. Lúc đó đồng hồ 30 giây của lượt P1 mới bắt đầu; server quyết định khi nào hết giờ và chuyển lượt.
3. **Khán giả (Spectator)**:
   * Khi hai người đã bấm sẵn sàng, trạng thái chuyển thành **`🟢 Đang thi đấu`**.
   * Người thứ ba bấm **`👁️ Xem trực tiếp`** để theo dõi trận đấu theo thời gian thực.
4. **Chia sẻ link tùy chọn**:
   * Mỗi phòng đều có nút **`📋 Copy link`** nếu người chơi muốn gửi trực tiếp cho bạn bè qua chat/tin nhắn.

---

## 4. Hướng Dẫn Cài Đặt & Chạy Dự Án

### Yêu cầu môi trường:
* **Node.js** (phiên bản 18 trở lên).
* **NPM** (đi kèm Node.js).
* Bất kỳ trình duyệt web hiện đại nào (Chrome, Edge, Firefox, Safari).

### Bước 1: Cài đặt thư viện dependencies
Mở Terminal / PowerShell tại thư mục dự án và chạy:
```bash
npm install
```

### Bước 2: Chạy bộ kiểm thử tự động (Unit Tests)
Kiểm tra tính chính xác của toàn bộ engine luật chơi OTTv2:
```bash
npm test
```
Lệnh này chạy các kiểm thử luật chơi, phòng online, phân quyền và đồng hồ lượt.

### Bước 3: Khởi chạy máy chủ Server Node.js
Chạy lệnh:
```bash
npm start
```
hoặc:
```bash
node server/server.js
```

Sau khi khởi chạy, console sẽ thông báo:
```
===============================================
🎮 OTTv2 Server running on http://0.0.0.0:3000 (Port: 3000)
🌐 WebSockets listening for multiplayer rooms
===============================================
```

### Bước 4: Mở và chơi game trên trình duyệt
* Mở trình duyệt và truy cập: **`http://localhost:3000`** (hoặc `http://<địa-chỉ-IP-máy-bạn>:3000` đối với thiết bị khác trong cùng mạng LAN).
* Để chơi **Chế độ 2 người chung máy (Local)**: Chọn tab `👥 2 Người (Local)`.
* Để chơi **Multiplayer Server**:
  * Người chơi 1: Chọn tab `🌐 Phòng Đấu Online`, bấm `➕ Tạo phòng ngay`.
  * Người chơi 2: Mở một cửa sổ trình duyệt ẩn danh hoặc tab mới tại `http://localhost:3000`, chọn tab `🌐 Phòng Đấu Online`, bấm `⚔️ Vào chơi (P2)` trên phòng vừa tạo.
  * Hai người đều bấm `✅ Sẵn sàng` để bắt đầu; tạo ván mới cần hai người bấm lại.
* Để chơi **chế độ PlayHTML**: Nhấn `⚡ PlayHTML` hoặc mở `http://localhost:3000/playfun.html`. Người đầu tiên được cấp P1 và có thể sao chép liên kết phòng. Người thứ hai mở liên kết đó để nhận P2; người tiếp theo là khán giả. P1/P2 đều bấm `✅ Sẵn sàng` trước khi chơi. Cần kết nối server để chơi; PlayHTML dùng để đồng bộ bản sao bàn cờ và con trỏ.

**Lưu ý triển khai:** Phòng và ván đấu hiện được giữ trong bộ nhớ của server. Khi server khởi động lại, các phòng cũ không còn; người chơi cần tạo phòng mới.

---

## 5. Hướng Dẫn Đẩy Mã Nguồn Lên Git (GitHub / GitLab)

Để upload toàn bộ dự án lên kho chứa Git của bạn:

```bash
# 1. Khởi tạo repository Git (nếu chưa có)
git init

# 2. Kiểm tra trạng thái các file
git status

# 3. Thêm toàn bộ các file vào staging
git add .

# 4. Commit với thông điệp rõ ràng
git commit -m "feat: redesign OTTv2 minimalistic UI (no gradients) and live room lobby"

# 5. Đặt nhánh chính là main
git branch -M main

# 6. Gán địa chỉ repository từ xa của bạn
git remote add origin https://github.com/<tai-khoan-cua-ban>/<ten-repo>.git

# 7. Đẩy mã nguồn lên GitHub
git push -u origin main
```
