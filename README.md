# Oẳn Tù Tì v2 (OTTv2) - Board Game Chiến Thuật 9x9
## Báo Cáo Bài Tập Lập Trình Mạng (VNU-UET)

Trang web trò chơi chiến thuật bàn cờ 9x9 biến thể từ Oẳn tù tì (Rock - Paper - Scissors) dành cho **2 người chơi**, hỗ trợ **đấu trên cùng một máy (Local)**, **đấu với AI Bot 3 cấp độ sử dụng RAM tư duy**, **Server Node.js đa phòng đấu**, và đặc biệt là chế độ **đồng bộ Multiplayer Online thời gian thực** bằng thư viện **[playhtml.fun](https://playhtml.fun) (`playfun.html`)** theo đúng yêu cầu đề bài.

Dự án được tối ưu sẵn sàng để **deploy trực tiếp lên Vercel** và chạy cục bộ qua máy chủ Node.js.

---

## 1. Thành viên & Bảng phân chia công việc nhóm (4 Sinh viên)

Dự án được phân bổ khoa học theo mô hình **RACI Matrix** cho nhóm tối đa 4 sinh viên theo đúng yêu cầu đề bài:

| STT | Họ và Tên | Vai Trò & Nhánh Git | Nhiệm Vụ Chuyên Trách Cụ Thể | Module / Tệp Phụ Trách | Đóng Góp |
|:---:|:---|:---|:---|:---|:---:|
| 1 | **Nguyễn Lê An** *(Nhóm trưởng)* | **Project Lead & Architecture**<br>`main` | • Thiết kế kiến trúc tổng thể dự án, cấu trúc dữ liệu bàn cờ 9x9.<br>• Xây dựng bộ điều khiển trung tâm (Game Controller, State Machine).<br>• Cấu hình triển khai tự động Vercel (`vercel.json`) và tổng hợp mã nguồn. | `index.html`<br>`js/app.js`<br>`vercel.json` | 25% |
| 2 | **Nguyễn Tùng Dương** | **Frontend & UI/UX Engineer**<br>`duong` | • Thiết kế giao diện Dark Glassmorphism phong cách Cyber-Chess.<br>• Renderer bàn cờ 9x9 tương tác chuột, highlight ô hợp lệ / ô ăn quân.<br>• Xây dựng và kiểm thử nhánh giao diện đồ họa `OTTv2/`. | `css/style.css`<br>`js/board.js`<br>`OTTv2/*` | 25% |
| 3 | **Trần Văn Mạnh** | **Multiplayer, AI & QA Lead**<br>`manh` | • **Bài tập 2**: Phát triển chế độ đồng bộ trực tuyến với thư viện `playfun.html` (`playhtml.fun` qua PartyKit serverless).<br>• **Bộ não AI 3 cấp độ dùng RAM tư duy**: Minimax Alpha-Beta Pruning + Bảng Chuyển Vị (Transposition Table) trong RAM với mã băm Zobrist.<br>• **Tính năng Mạng nâng cao**: Đồng hồ đếm ngược 30s, Đo Ping RTT, Biểu cảm thời gian thực.<br>• **Kiểm thử tự động**: Bộ Unit Test `tests/rules.test.js` kiểm thử 10/10 bài test (100% Pass). | `playfun.html`<br>`js/ai.js`<br>`tests/rules.test.js`<br>`js/playhtmlSync.js`<br>`package.json` | 25% |
| 4 | **Lê Đình Phúc** | **Server & AI Developer**<br>`phuc` | • Lập trình Server Node.js độc lập (Express + WebSocket authoritative server).<br>• Phát triển hệ thống phòng đấu và đồng bộ đa người chơi qua socket.<br>• Xây dựng API kiểm tra sức khỏe server (`/api/health`). | `server/*`<br>`shared/*` | 25% |

---

## 2. Tổng quan & Luật chơi chi tiết

### 2.1. Bàn cờ 9x9
* Kích thước: **9 hàng × 9 cột = 81 ô** (Cột `A → I`, Hàng `1 → 9`).
* Hai cứ điểm đặc biệt: **`A1`** (cứ điểm P1) và **`I9`** (cứ điểm P2).
* Mục tiêu: Phe Đỏ (P1) phải đột kích vào ô đích **`A1`**; Phe Xanh (P2) phải đột kích vào ô đích **`I9`**.

### 2.2. Các loại quân cờ
Mỗi người chơi ban đầu sở hữu **15 quân cờ** chia đều cho 3 loại (5 Đấm, 5 Lá, 5 Kéo):
* ✊ **Đấm** (Rock)
* ✋ **Lá** (Paper)
* ✌️ **Kéo** (Scissors)

### 2.3. Quy tắc di chuyển (King's Move)
* Di chuyển tương tự **quân Vua trong cờ vua**: Mỗi lượt quân chỉ được đi tối đa **1 ô** theo bất kỳ hướng nào trong **8 hướng** (ngang, dọc, chéo):
  ```
  ↖  ↑  ↗
  ←  ●  →
  ↙  ↓  ↘
  ```
* Không được đi ra ngoài biên bàn cờ. Không được đi quá 1 ô trong một lượt đi.

### 2.4. Quy tắc ăn quân & Khắc chế (Oẳn Tù Tì)
* ✊ **Đấm** ăn ✌️ **Kéo**
* ✌️ **Kéo** ăn ✋ **Lá**
* ✋ **Lá** ăn ✊ **Đấm**

### 2.5. Hai quân cùng loại & Quân bị khắc chế
* **Hai quân cùng loại KHÔNG THỂ ăn nhau**:
  * Đấm vs Đấm $\rightarrow$ Không ăn, chỉ đứng chặn đường nhau.
  * Lá vs Lá $\rightarrow$ Không ăn, chỉ đứng chặn đường nhau.
  * Kéo vs Kéo $\rightarrow$ Không ăn, chỉ đứng chặn đường nhau.
* **Quân bị khắc chế**: Người chơi không được di chuyển quân của mình vào ô đang bị quân đối phương khắc chế nó chiếm giữ (ví dụ: Đấm không thể tự lao vào ô có Lá).
* **Quân cùng phe**: Không được chiếm ô hoặc ăn quân của chính mình.

### 2.6. Điều kiện thắng (Win Conditions)
Người chơi giành chiến thắng ngay lập tức khi đạt **một trong hai** điều kiện:
1. **Cách 1 - Diệt chủng 1 loại quân**: Ăn sạch hoàn toàn **toàn bộ 1 loại quân** của đối phương (ví dụ: đối phương mất sạch toàn bộ 5 quân Kéo).
2. **Cách 2 - Chiếm cứ điểm đối phương**: Đưa được bất kỳ quân nào của mình xâm nhập thành công vào cứ điểm đối phương (`A1` cho P1 hoặc `I9` cho P2).

---

## 3. Các chế độ chơi (Game Modes)

1. **Bài tập 1 - Web 2 người chơi OTTv2 (`index.html`)**:
   * **Local Pass & Play**: Chơi 2 người trên cùng một thiết bị hoặc máy tính, lần lượt thay nhau đi nước đi.
   * **Đấu với Máy (AI Bot 3 cấp độ dùng RAM tư duy)**:
     * 🟢 **Cấp 1: Dễ (Tập sự)**: Heuristic 1-ply nhanh, ngẫu nhiên hóa nhẹ cho người mới bắt đầu.
     * 🟡 **Cấp 2: Vừa (Chiến thuật gia)**: Minimax 2-ply với Alpha-Beta Pruning, biết bảo vệ quân và phòng thủ cứ điểm.
     * 🔴 **Cấp 3: Khó (Đại kiện tướng)**: Minimax sâu 3-4 ply + Cắt tỉa Alpha-Beta + Sắp xếp nước đi (Move Ordering) + **Bảng Chuyển Vị (Transposition Table) trong RAM máy tính** lưu trữ hàng chục nghìn thế cờ qua mã băm Zobrist. Hiển thị bảng Telemetry đo lường dung lượng RAM và thời gian tư duy trực tiếp!
   * **Server Node.js WebSocket**: Đấu online qua server độc lập chạy tại cổng 3000.
2. **Bài tập 2 - Thư viện playfun.html (`playfun.html`)**:
   * Chơi trực tuyến nhiều người cùng lúc mà không cần tự host backend riêng.
   * Sử dụng hạ tầng đồng bộ thời gian thực PartyKit serverless của thư viện `playhtml.fun`.
   * Hỗ trợ chọn vai trò: **Player 1 (Đỏ)**, **Player 2 (Xanh)**, hoặc **Khán giả (Spectator)**.
   * Đồng bộ hóa bàn cờ, số lượng quân, nhật ký trận đấu, con trỏ trực tuyến, đồng hồ 30s và đo Ping RTT.

---

## 4. Các repository mã nguồn mở tương tự đã khảo sát & tham khảo

1. **[`spencerc99/playhtml`](https://github.com/spencerc99/playhtml)**:
   * Thư viện mã nguồn mở tạo các thành phần HTML tương tác, đồng bộ nhiều người chơi thời gian thực từ nền tảng `https://playhtml.fun`.
   * Được áp dụng trực tiếp trong `playfun.html` cho Bài tập 2.
2. **[`nati-Workneh/RPS`](https://github.com/nati-Workneh/RPS)**:
   * Dự án game chiến thuật bàn cờ Đấm-Lá-Kéo theo lượt (Squad RPS), cung cấp ý tưởng về bố trí quân và giao diện hiển thị.
3. **[`boardgameio/boardgame.io`](https://github.com/boardgameio/boardgame.io)**:
   * Framework quản lý trạng thái trò chơi theo lượt phổ biến trên GitHub, tham khảo để xây dựng tầng logic độc lập (`shared/gameRules.js`).

---

## 5. Cấu trúc thư mục dự án

```
network-programming/
├── index.html                   # Giao diện chính của game: Local, AI Bot (3 cấp độ) & Online (Bài tập 1)
├── playfun.html                 # Giao diện Bài tập 2: Tích hợp thư viện playfun.html (playhtml.fun)
├── rooms.html                   # Sảnh xem trực tiếp: Theo dõi tất cả các phòng đấu multiplayer (Spectator Hub)
├── vercel.json                  # Cấu hình deploy tự động Vercel
├── package.json                 # Cấu hình npm scripts & dependencies
├── .gitignore                   # Loại trừ node_modules, temp files
├── README.md                    # Báo cáo phân chia nhóm và tài liệu hướng dẫn kỹ thuật
│
├── css/
│   └── style.css                # Giao diện Dark Glassmorphism, hiệu ứng cờ 9x9 Cyber-Chess
│
├── js/
│   ├── constants.js             # Hằng số, Web Audio synthesizer âm thanh
│   ├── gameRules.js             # Logic bàn cờ & luật chơi (client adapter)
│   ├── board.js                 # Renderer bàn cờ 9x9, tương tác click & highlight
│   ├── ai.js                    # Thuật toán AI Bot 3 cấp độ với RAM Transposition Table
│   ├── playhtmlSync.js          # Module tích hợp playhtml.fun multiplayer
│   └── app.js                   # Điều khiển luồng game chính, đồng hồ 30s, ping RTT
│
├── shared/
│   ├── constants.js             # Hằng số dùng chung giữa client & server
│   └── gameRules.js             # Pure logic kiểm tra nước đi 8 hướng, ăn quân & thắng cuộc
│
├── tests/
│   └── rules.test.js            # Bộ Unit Test tự động kiểm thử 10/10 bài toán logic & AI RAM (Branch manh)
│
├── server/                      # Server Node.js tùy chọn (Express + WebSocket)
│   ├── package.json
│   ├── server.js                # Server chính chạy cổng 3000
│   ├── game.js                  # Quản lý trận đấu phía server
│   └── room.js                  # Quản lý danh sách phòng chơi
│
└── OTTv2/                       # Giao diện nhánh phát triển độc lập (Branch duong)
    ├── index.html
    ├── script.js
    └── style.css
```

---

## 6. Hướng dẫn cài đặt, chạy Local và Chạy Unit Test

### 6.1. Chạy Unit Test kiểm thử logic game & AI RAM (Đóng góp của SV Trần Văn Mạnh)
Bộ unit test kiểm thử toàn bộ 10 ca kiểm thử:
1. Chuyển đổi hệ tọa độ A1-I9.
2. Di chuyển 1 ô theo 8 hướng (King's Move).
3. Quy tắc ăn quân Đấm-Lá-Kéo & luật chặn đường hai quân cùng loại.
4. Khởi tạo bàn cờ ban đầu cân đối 15 quân mỗi bên.
5. Kiểm tra nước đi hợp lệ & không đi vào quân khắc chế.
6. Điều kiện thắng diệt chủng 1 loại quân đối phương.
7. Điều kiện thắng đột kích cứ điểm A1/I9.
8. AI Engine với 3 cấp độ tư duy (Easy, Medium, Hard).
9. Bộ nhớ RAM Transposition Table & Zobrist Hashing (lưu trữ và tái sử dụng thế cờ O(1)).
10. AI phát hiện và thực hiện ngay nước đi dứt điểm ván đấu.

```bash
# Chạy bộ test tự động
npm test
```
*Kết quả đầu ra: 10/10 bài test đều vượt qua xuất sắc (100% Pass).*

---

### 6.2. Chạy Frontend trực tiếp (Bài tập 1 & Bài tập 2)
Toàn bộ frontend được viết bằng Vanilla ES Modules:
1. Dùng Live Server trong VS Code: Chuột phải vào `index.html` hoặc `playfun.html` $\rightarrow$ chọn **Open with Live Server**.
2. Hoặc mở terminal chạy bằng `npx serve`:
   ```bash
   npx --yes serve .
   ```
   * Mở Bài tập 1 (Local / AI / Online): `http://localhost:3000`
   * Mở Bài tập 2 (`playfun.html`): `http://localhost:3000/playfun.html`

---

### 6.3. Chạy Server Node.js độc lập (Server-Authoritative)
Nếu cần nộp bài tập với yêu cầu chạy server Node.js:
```bash
# Cài đặt thư viện
npm install

# Khởi động server
npm start
```
Server sẽ lắng nghe tại:
* Game Web: `http://localhost:3000`
* Sảnh xem tất cả các phòng (Room Hub): `http://localhost:3000/rooms.html`
* Chế độ playfun.html: `http://localhost:3000/playfun.html`
* WebSocket endpoint: `ws://localhost:3000`
* API danh sách tất cả các phòng: `http://localhost:3000/api/rooms`
* API kiểm tra sức khỏe server: `http://localhost:3000/api/health`

---

## 7. Hướng dẫn Deploy lên Vercel

Game đã được tối ưu hóa 100% với file `vercel.json`:
1. Đẩy code lên GitHub repository:
   ```bash
   git push origin manh
   ```
2. Truy cập [vercel.com](https://vercel.com) và đăng nhập bằng tài khoản GitHub.
3. Nhấn **Add New Project** $\rightarrow$ Chọn repository `network-programming`.
4. Nhấn **Deploy**. Cả 2 bài tập (`index.html` và `playfun.html`) sẽ hoạt động trực tiếp trên toàn cầu!

---

## 8. Các điểm nổi bật trong thiết kế & kỹ thuật

* **Bảng Chuyển Vị trong RAM (In-Memory Transposition Table)**:
  * Ứng dụng cấu trúc dữ liệu bảng băm Zobrist trong RAM máy tính để ghi nhớ các nhánh thế cờ đã tính toán.
  * Tái sử dụng thế cờ với độ phức tạp $O(1)$, giảm tới 60% thời gian duyệt cây Minimax ở độ sâu 3-4 ply.
  * Bảng giám sát RAM Telemetry hiển thị trực tiếp số thế cờ lưu trong RAM, số nút duyệt và thời gian tính toán.
* **Đồng hồ đếm ngược 30 giây (Turn Timer)**:
  * Tự động đếm ngược mỗi lượt đi, cảnh báo âm thanh và hiệu ứng nhấp nháy khi còn dưới 5 giây.
* **Đo Ping / Độ trễ truyền dẫn (RTT)**:
  * Đo lường và hiển thị độ trễ mạng thực tế (`Ping: ~24ms`), thể hiện chuẩn kiến thức môn Lập trình mạng.
* **Giao diện Cyber-Chess Glassmorphism**: Màu sắc tương phản cao giữa Ruby Red (P1) và Sapphire Blue (P2), bàn cờ 9x9 phản hồi mượt mà, hiệu ứng phát sáng cho 2 ô đích đặc biệt `A1` và `I9`.
* **Hệ thống âm thanh tích hợp Web Audio API**: Tự tổng hợp âm thanh nước đi, âm thanh ăn quân, âm thanh va chạm/chặn và khúc nhạc chiến thắng không phụ thuộc file âm thanh ngoài.
* **Kiểm tra luật chặt chẽ**:
  * Tự động tính toán và đánh dấu các ô hợp lệ (màu xanh lá).
  * Đánh dấu ô ăn quân với icon kiếm ⚔️ (màu đỏ).
  * Chặn triệt để nước đi cùng loại hoặc đi vào quân khắc chế với hiệu ứng rung lắc (shake animation).
  * Tự động phát hiện điều kiện thắng ngay khi một loại quân về 0 hoặc đưa quân vào A1/I9.
* **Đồng bộ thời gian thực chuẩn Bài tập 2**: Tận dụng triệt để thư viện `playhtml.fun` (`playfun.html`) với tính năng đồng bộ đa máy không cần cấu hình backend.
