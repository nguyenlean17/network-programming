# Oẳn Tù Tì v2 (OTTv2) - Board Game Chiến Thuật 9×9
## Dự Án Web Game Oẳn Tù Tì v2: Chơi Cục Bộ (Local 2 Players) & Đa Người Chơi (Multiplayer Server / playfull.html)

Trang web trò chơi chiến thuật bàn cờ 9×9 biến thể từ Oẳn tù tì (Rock - Paper - Scissors) dành cho **2 người chơi**, hỗ trợ:
1. **Chế độ 2 người chơi trên cùng một thiết bị (Local 2 Players - Phase 1)**: Lần lượt thay phiên thực hiện nước đi hoàn toàn ở client, không cần server.
2. **Chế độ Phòng Đấu Trực Tuyến & Danh sách phòng (Authoritative Multiplayer Server - Phase 2)**:
   * Máy chủ Node.js (Express + WebSocket) quản lý trạng thái trò chơi tập trung (Authoritative source of truth).
   * **Sảnh phòng trực tuyến (Live Room Lobby)**: Khi tạo một phòng mới, phòng đó **lập tức xuất hiện trong danh sách phòng**. Người chơi khác có thể **chọn phòng đó từ danh sách để vào chơi ngay mà không bắt buộc phải copy link** (vẫn có nút copy link nếu muốn chia sẻ).
   * Hỗ trợ nhiều phòng cùng lúc (Room 001, Room 002, Room 003...).
3. **Chế độ Đồng bộ Thư viện `playfull.html` / `playfun.html` (`playhtml.fun`)**: Đồng bộ thời gian thực qua thư viện playhtml và máy chủ serverless.
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
* **Hai ô đích đặc biệt**: **`A1`** và **`I9`**.
* Nếu người chơi đưa được bất kỳ quân nào của mình vào một trong hai ô này (`A1` hoặc `I9`) thì **người đó thắng ngay lập tức**.

### 1.2. Các loại quân cờ
Mỗi người chơi có các quân cờ thuộc 3 loại:
* ✊ **Đấm** (Rock)
* ✋ **Lá** (Paper)
* ✌️ **Kéo** (Scissors)

Người chơi 1 (Player 1 - Phe Đỏ) và Người chơi 2 (Player 2 - Phe Xanh) được phân biệt rõ rệt bằng màu sắc và huy hiệu trên bàn cờ.

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
Có **2 cách** để giành chiến thắng:
1. **Cách 1: Ăn hết một loại quân của đối phương**
   * Nếu một người chơi ăn sạch hoàn toàn một loại quân bất kỳ của đối phương (ví dụ đối phương ban đầu có 5 Kéo và mất toàn bộ 5 Kéo, số Kéo về 0) $\rightarrow$ Người chơi đó thắng ngay lập tức.
   * Không cần phải ăn hết toàn bộ quân đối phương.
2. **Cách 2: Đưa quân vào ô đích (`A1` hoặc `I9`)**
   * Nếu người chơi đưa bất kỳ quân nào của mình vào ô đích **`A1`** hoặc **`I9`** $\rightarrow$ Thắng ngay lập tức.

---

## 2. Kiến Trúc & Cấu Trúc Thư Mục

Dự án được phân tách rõ ràng giữa **Client UI**, **Server Authoritative Logic**, và **Shared Rules**:

```
network-programming/
├── index.html                   # Giao diện chính: Local 2 Players, Sảnh phòng Online & AI
├── playfun.html                 # Giao diện Bài tập 2: Thư viện playfun.html (playhtml.fun)
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
│   ├── playhtmlSync.js          # Module tích hợp thư viện playhtml.fun
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
    └── rules.test.js            # Bộ kiểm thử Unit Test 12/12 bài kiểm tra luật chơi (100% Pass)
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
   * Màn hình của Người chơi 1 chuyển sang bàn cờ với trạng thái: *"Đang chờ đối thủ tham gia..."*.
2. **Người chơi 2 (Vào chơi từ danh sách)**:
   * Mở tab **`🌐 Phòng Đấu Online`** (ở một tab khác, trình duyệt khác, hoặc máy tính khác trong mạng).
   * Ngay lập tức nhìn thấy phòng của Người chơi 1 trong danh sách với huy hiệu **`🟡 Chờ người chơi 2`**.
   * Nhấn nút **`⚔️ Vào chơi (P2)`** trực tiếp từ danh sách.
   * **Không cần copy link**! Người chơi 2 được gán vai trò **Player 2 (Xanh)** và vào trận ngay.
   * Trận đấu chính thức bắt đầu và đồng bộ thời gian thực cho cả hai người chơi.
3. **Khán giả (Spectator)**:
   * Nếu một phòng đã có đủ 2 người chơi, trạng thái chuyển thành **`🟢 Đang thi đấu`**.
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
*Kết quả: 12/12 bài kiểm thử vượt qua xuất sắc (100% Pass).*

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
* Để chơi **Bài tập 2 (`playfull.html`)**: Nhấn vào liên kết `⚡ playfull.html` trên thanh điều hướng hoặc truy cập `http://localhost:3000/playfun.html`.

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
