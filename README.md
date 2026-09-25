# BÁO CÁO BÀI TẬP LỚN LẬP TRÌNH MẠNG (VNU-UET)
## ĐỀ TÀI: GAME OẲN TÙ TÌ CHIẾN THUẬT BÀN CỜ 9x9 (OTTv2)
### Chế Độ Chơi Cục Bộ (Local Hotseat / AI Bot) & Đa Người Chơi Trực Tuyến (Multiplayer Server / playfun.html)

---

## 1. THÀNH VIÊN VÀ BẢNG PHÂN CHIA CÔNG VIỆC NHÓM (4 SINH VIÊN)

Dự án được phân bổ khoa học theo mô hình **RACI Matrix** cho nhóm tối đa 4 sinh viên:

| STT | Họ và Tên | Vai Trò Chuyên Trách | Nhiệm Vụ Cụ Thể | Module / Tệp Phụ Trách | Đóng Góp |
|:---:|:---|:---|:---|:---|:---:|
| 1 | **Nguyễn Văn A** *(Nhóm trưởng)* | **Game Logic Engine Lead** | • Thiết kế cấu trúc dữ liệu bàn cờ 9x9.<br>• Xây dựng Engine tính toán nước đi 8 hướng (như quân Vua cờ vua).<br>• Lập trình luật ăn quân Đấm-Lá-Kéo và luật chặn đường hai quân cùng loại.<br>• Lập trình bộ kiểm tra 3 điều kiện thắng cuộc (a1/i9, ăn sạch 1 loại quân, hết nước đi).<br>• Viết bộ Unit Test kiểm thử tự động. | `js/game-engine.js`<br>`tests/game-engine.test.js` | 25% |
| 2 | **Trần Thị B** | **Frontend & UI/UX Engineer** | • Thiết kế giao diện web hiện đại Cyberpunk Glassmorphism.<br>• Xây dựng bàn cờ 9x9 chuẩn bằng CSS Grid với tọa độ a1–i9.<br>• Thiết kế quân cờ, hiệu ứng chọn quân, gợi ý nước đi hợp lệ (chấm xanh/vòng đỏ).<br>• Tích hợp hệ thống âm thanh Web Audio API (nước đi, ăn quân, chiến thắng).<br>• Xây dựng Dashboard theo dõi số lượng quân bị bắt của 2 phe. | `index.html`<br>`css/style.css` | 25% |
| 3 | **Lê Văn C** | **Local Controller & AI Developer** | • Lập trình bộ điều khiển chơi 2 người trên cùng 1 máy (Hotseat Mode).<br>• Xây dựng hệ thống hoàn tác nước cờ (Undo / Replay Move).<br>• Lập trình đồng hồ đếm ngược lượt đi (Timer 30s) và cảnh báo thời gian.<br>• Phát triển Bot AI ngoại tuyến với hàm heuristic đánh giá thế cờ (ưu tiên đột kích căn cứ và ăn quân). | `js/local-controller.js` | 25% |
| 4 | **Phạm Văn D** | **Network & Multiplayer Engineer** | • Lập trình máy chủ thời gian thực Node.js + Express + Socket.IO.<br>• Xây dựng hệ thống phòng đấu (Room Management), sảnh chờ (Lobby).<br>• Đồng bộ hóa trạng thái bàn cờ, lượt đi, và chat nội bộ phòng đấu.<br>• Tích hợp chế độ thư viện `playfun.html` (`playhtml.fun`) đồng bộ qua PartyKit.<br>• Đóng gói cấu hình dự án, Docker/NPM scripts. | `server/server.js`<br>`js/online-controller.js`<br>`playfun.html`<br>`package.json` | 25% |

---

## 2. TỔNG QUAN VỀ LUẬT CHƠI OTTv2 (OẲN TÙ TÌ v2)

Trò chơi là sự kết hợp độc đáo giữa trò chơi dân gian **Đấm - Lá - Kéo (Oẳn Tù Tì)** và chiến thuật cờ vua/cờ vây trên bàn cờ **9x9**:

1. **Bàn cờ 9x9:**
   - Hệ trục tọa độ chuẩn quốc tế: Cột từ `a` đến `i`, Hàng từ `1` đến `9`.
   - **Cứ điểm của Phe 1 (Đỏ):** Ô `a1` (Góc dưới bên trái).
   - **Cứ điểm của Phe 2 (Xanh):** Ô `i9` (Góc trên bên phải).
2. **Quân cờ mỗi bên:**
   - Mỗi bên gồm 9 quân cờ tinh nhuệ (3 quân **Đấm ✊**, 3 quân **Lá ✋**, 3 quân **Kéo ✌️**).
   - Bố trí cân bằng tại 2 hàng xuất phát của mỗi phe.
3. **Quy tắc di chuyển:**
   - Mỗi quân cờ được di chuyển **1 ô theo mọi hướng trong 8 hướng** (ngang, dọc, và 4 hướng chéo), tương tự như quân Vua trong cờ vua.
4. **Quy tắc ăn quân & Chặn đường:**
   - **Khắc chế:**
     - ✊ **Đấm** ăn ✌️ **Kéo**
     - ✌️ **Kéo** ăn ✋ **Lá**
     - ✋ **Lá** ăn ✊ **Đấm**
   - **Luật hai quân cùng loại:** Hai quân cùng loại (Đấm vs Đấm, Lá vs Lá, Kéo vs Kéo) **tuyệt đối không thể ăn nhau mà chỉ đứng chặn đường nhau** (không thể di chuyển vào ô của quân cùng loại, đóng vai trò như chướng ngại vật cản đường).
   - Không thể tự sát đi vào ô có quân khắc chế mình hoặc ô có quân đồng minh.
5. **Điều kiện chiến thắng:**
   - **Điều kiện 1 (Tiêu diệt chủng loại):** Ăn sạch hoàn toàn 1 loại quân của đối phương (Ví dụ: đối phương mất toàn bộ 3 quân Đấm, hoặc 3 quân Lá, hoặc 3 quân Kéo) $\implies$ **Thắng ngay lập tức!**
   - **Điều kiện 2 (Đột kích căn cứ):** Đưa bất kỳ một quân cờ nào của mình xâm nhập thành công vào cứ điểm đối phương (Ô `i9` đối với Phe Đỏ, hoặc Ô `a1` đối với Phe Xanh) $\implies$ **Thắng ngay lập tức!**
   - **Điều kiện 3 (Khóa cờ):** Đối phương đến lượt đi nhưng không còn bất kỳ nước đi hợp lệ nào $\implies$ **Bên còn nước đi chiến thắng.**

---

## 3. CÁC REPOSITORY MÃ NGUỒN MỞ TƯƠNG TỰ ĐÃ KHẢO SÁT & KẾ THỪA

Thực hiện theo quy tắc phát hiện và tích hợp mã nguồn mở:
1. **[`spencerc99/playhtml`](https://github.com/spencerc99/playhtml) (Đã clone về `/home/wolf/playhtml`):**
   - Thư viện mã nguồn mở tạo các thành phần HTML tương tác, đồng bộ nhiều người chơi thời gian thực từ nền tảng `https://playhtml.fun`.
   - Cung cấp hạ tầng đồng bộ không cần cấu hình backend (Zero-backend setup) dựa trên PartyKit, được áp dụng trực tiếp trong `playfun.html` cho Bài tập 2.
2. **[`nati-Workneh/RPS`](https://github.com/nati-Workneh/RPS) (Đã clone về `/home/wolf/RPS`):**
   - Dự án game chiến thuật bàn cờ Đấm-Lá-Kéo theo lượt (Squad RPS), cung cấp cảm hứng về bố trí quân, giao diện hiển thị và quản lý lượt đấu.
3. **[`boardgameio/boardgame.io`](https://github.com/boardgameio/boardgame.io):**
   - Framework quản lý trạng thái trò chơi theo lượt phổ biến nhất trên GitHub, được tham khảo để xây dựng lớp Game Engine độc lập cho cả Client và Server.

---

## 4. CẤU TRÚC THƯ MỤC DỰ ÁN

```
OTTv2-Game/
├── index.html                   # Giao diện chính: Sảnh đấu, chế độ Local 2 người, chế độ Đấu với AI Bot
├── playfun.html                 # Giao diện Bài tập 2: Tích hợp thư viện playhtml (playfun.html) đồng bộ Realtime
├── css/
│   └── style.css                # Toàn bộ CSS phong cách Cyberpunk, bàn cờ 9x9, hiệu ứng quân cờ
├── js/
│   ├── game-engine.js           # Core Game Logic (Bàn cờ 9x9, 8 hướng, luật ăn quân, kiểm tra thắng thua)
│   ├── local-controller.js      # Bộ điều khiển chế độ Local Hotseat (2 người 1 máy) & AI Bot
│   └── online-controller.js     # Bộ điều khiển chế độ Online Multiplayer qua Socket.IO Server
├── server/
│   └── server.js                # Máy chủ Node.js + Express + Socket.IO đa phòng đấu đồng thời
├── tests/
│   └── game-engine.test.js      # Bộ Unit Test kiểm thử tự động toàn diện logic game (100% Pass)
├── package.json                 # Cấu hình dependency Node.js
└── README.md                    # Báo cáo phân chia nhóm và tài liệu hướng dẫn kỹ thuật
```

---

## 5. HƯỚNG DẪN CÀI ĐẶT & CHẠY THỬ NGHIỆM

### Bước 1: Khởi động Server
Tại thư mục dự án `/home/wolf/W10/lap-trinh-mang/OTTv2-Game/`:

```bash
# Cài đặt thư viện nếu chưa cài (đã được cài đặt sẵn)
npm install

# Khởi chạy server Node.js Socket.IO
npm start
```

### Bước 2: Truy cập Trò Chơi trên Trình Duyệt
* **Chế độ đầy đủ (Local + AI + Online Server):**
  Mở trình duyệt truy cập: `http://localhost:3000`
* **Chế độ Thư viện playfun.html (Bài tập 2):**
  Mở trình duyệt truy cập: `http://localhost:3000/playfun.html`

### Bước 3: Chạy Kiểm Thử Logic Tự Động
```bash
npm test
```
*Kết quả:* Tất cả 7 bộ kiểm thử về tọa độ, di chuyển 8 hướng, luật ăn quân, luật chặn đường và điều kiện thắng đều đạt **100% Pass**.

---

## 6. HƯỚNG DẪN NỘP BÀI LÊN GIT

1. Kiểm tra trạng thái Git cục bộ:
   ```bash
   git status
   ```
2. Thêm Remote Repository của nhóm (trên GitHub/GitLab):
   ```bash
   git remote add origin https://github.com/<tai-khoan-nhom-truong>/OTTv2-Game.git
   ```
3. Đẩy toàn bộ mã nguồn lên:
   ```bash
   git branch -M main
   git push -u origin main
   ```
4. Gửi đường link repository Git đã push cho giảng viên theo yêu cầu.
