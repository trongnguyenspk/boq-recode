# ĐẶC TẢ LOGIC NGHIỆP VỤ — BOQ Generator
### Tài liệu phục vụ refactor · chỉ diễn giải logic, không chứa code

> **Ngày lập:** 12/09/2026 · **Nguồn:** đọc trực tiếp toàn bộ `src/` của thư mục
> `boq-generator-main_20260824 - Copy`.
> **Tài liệu đi kèm:** `RECODE-ANALYSIS-2026-09-12.md` (bản đồ kỹ thuật, nợ, phương án kiến trúc).
> Tài liệu này **không** thay thế tài liệu đó — nó tách riêng phần *hệ thống làm gì và theo luật nào*,
> để khi viết lại, người viết có một bản luật độc lập với cách hiện thực.

---

## 0. CÁCH DÙNG TÀI LIỆU NÀY

Tài liệu được viết để trả lời đúng một câu hỏi trong lúc refactor: **"nếu tôi viết lại chỗ này,
cái gì bắt buộc phải còn đúng?"**

| Ký hiệu | Nghĩa | Dùng thế nào khi refactor |
|---|---|---|
| **R-xx** | **Quy tắc nghiệp vụ.** Mệnh đề "khi … thì …" mô tả hệ thống *phải* xử sự ra sao. | Phải còn đúng sau khi viết lại. Muốn đổi thì phải là quyết định có chủ đích, ghi vào §8. |
| **I-xx** | **Bất biến kỹ thuật.** Mệnh đề phải luôn đúng để hệ thống không hỏng, thường liên quan tới khoá định danh, thứ tự, hoặc ngữ nghĩa dữ liệu. | Đọc **trước** khi đụng vào phần tương ứng. Mỗi bất biến có mục "vỡ khi nào". |
| **?-xx** | **Điểm cần chốt.** Logic hiện tại mâu thuẫn, mơ hồ, hoặc có vẻ ngoài ý muốn. | Phải trả lời **trước** khi viết dòng code đầu tiên. |
| **`file:line`** | Vị trí trong mã nguồn hiện tại làm bằng chứng cho phát biểu. | Chỉ để tra cứu. Sau refactor, những số dòng này hết hiệu lực. |
| `[Q]` / `[S]` / `[GĐ]` | Quan sát trực tiếp / suy luận từ mã / giả định chưa xác nhận. | `[GĐ]` không được coi là luật cho tới khi kiểm chứng. |

**Ba phần quan trọng nhất cho người refactor**, theo thứ tự nên đọc:
§3 (từ vựng) → §7 (bất biến bắt buộc giữ) → §9 (danh sách hành vi phải bảo toàn, dùng làm test hồi quy).

---

## 1. HỆ THỐNG NÀY LÀM GÌ — MỘT ĐOẠN

Người dùng khai báo **danh sách phụ tải** của một tủ điện: mỗi phụ tải là một bộ khởi động có loại,
công suất, số lượng, nhãn hiệu và một số tín hiệu điều khiển kèm theo. Hệ thống tra **định mức vật
tư** đã khai sẵn cho đúng cặp *(loại, công suất)* để nở mỗi phụ tải thành một danh sách vật tư khái
quát, rồi tra **thư viện sản phẩm** để đổi mỗi vật tư khái quát thành một mã hàng cụ thể. Kết quả là
hai bảng: **bảng chi tiết** (vật tư theo từng phụ tải) và **bảng tổng hợp** (gộp toàn tủ theo mã),
xuất ra Excel để giao cho bộ phận mua hàng hoặc khách hàng.

Toàn bộ dữ liệu nền và dữ liệu dự án nằm trong trình duyệt của đúng một máy. Không có máy chủ,
không có tài khoản, không có đồng bộ.

---

## 2. BA TẦNG KHÁI NIỆM — NỀN CỦA MỌI LUẬT

Hiểu sai ranh giới ba tầng này là nguồn gốc của phần lớn nợ kỹ thuật hiện tại.

**Tầng 1 — Vật tư khái quát (`matchKey`).**
Không phải mã hàng. Là *tên vai trò* của một vật tư trong sơ đồ: "contactor 9A", "relay nhiệt 9A",
"biến dòng 100A". Định mức chỉ nói tới tầng này. Một `matchKey` có thể ứng với nhiều mã hàng thật
của nhiều hãng, hoặc chỉ một.

**Tầng 2 — Mã hàng thật (sản phẩm trong thư viện).**
Có mã hãng, mã iBom, mô tả, đơn vị, nhãn hiệu, giá. Một sản phẩm **chỉ vào được BOQ nếu nó khai
`matchKey`**; sản phẩm không khai `matchKey` tồn tại trong thư viện nhưng vô hình với toàn bộ
đường sinh BOQ.

**Tầng 3 — Dòng BOQ.**
Kết quả của phép nối tầng 1 với tầng 2 trong ngữ cảnh một phụ tải cụ thể. Dòng BOQ **không được
lưu** — nó được tính lại mỗi lần dữ liệu nguồn đổi. Mọi chỉnh tay của người dùng ở tầng này phải
được cất ở nơi khác (xem R-Q1).

> **Hệ quả cho refactor:** ba tầng này hiện không có ranh giới rõ trong mã — `matchKey` là chuỗi tự
> do, sản phẩm và định mức cùng nằm chung một khối trạng thái, dòng BOQ và ghi đè thủ công bị buộc
> vào nhau qua một chuỗi id ghép (I-03). Đây là chỗ đáng tách đầu tiên.

---

## 3. TỪ VỰNG NGHIỆP VỤ

Dùng đúng các từ này trong mã mới; hiện tại một số khái niệm có hai ba tên gọi khác nhau.

| Thuật ngữ | Nghĩa chính xác trong hệ thống này | Tên đang dùng lẫn lộn |
|---|---|---|
| **Phụ tải / Bộ khởi động** | Một mục người dùng khai: loại + công suất + số lượng + nhãn hiệu + tín hiệu. Đơn vị nhập liệu. | starter, load, Input |
| **Loại khởi động** | DOL, Sao–Tam giác, Biến tần… Là **chuỗi tự do**, không phải danh sách đóng — người dùng tự thêm loại mới trong Admin. | type, StarterType |
| **Mức công suất** | Một bậc công suất có định mức riêng, ví dụ 5.5 kW. Là **khoá chuỗi**, không phải số — xem R-T2. | power, rating, tier |
| **Mức định mức** | Cặp *(loại, mức công suất)*. Đây là **đơn vị chỉnh sửa tự nhiên** của định mức và là đơn vị hợp nhất khi nhập Excel. | tier |
| **Định mức** | Danh sách vật tư khái quát cho một mức, mỗi dòng gồm `matchKey` + số lượng + điều kiện. | template |
| **Điều kiện dòng định mức** | Cờ quyết định dòng đó có được tính hay không, dựa trên tín hiệu của phụ tải. 9 giá trị hợp lệ. | condition |
| **Tín hiệu** | Thuộc tính bật/tắt của phụ tải (nhiệt, PTC, nút dừng khẩn, độ ẩm, các phản hồi BFP/FB) + cờ có isolator. | signals |
| **Vật tư khái quát** | Xem §2 tầng 1. | matchKey, match key, component key |
| **Khai báo nhãn hiệu của vật tư khái quát** | Bản ghi nói `matchKey` này có đi theo nhãn hiệu người dùng chọn hay không, và thuộc nhóm thiết bị nào. | matchKeyMeta, meta |
| **Nhóm thiết bị** | Phân loại gợi ý: CB, contactor, relay nhiệt, isolator, biến tần, biến dòng, phụ kiện, cáp, khác. **Chỉ để gợi ý và hiển thị**, không phải nguồn sự thật. | category, DeviceCategory |
| **Phụ thuộc nhãn hiệu** | Thuộc tính **nguồn sự thật**: vật tư khái quát này có lấy nhãn hiệu từ lựa chọn của người dùng không. | brandSensitive |
| **Mã iBom** | Mã định danh nội bộ của vật tư. **Là khoá gộp của bảng tổng hợp** — đây là vai trò quan trọng nhất của nó, quan trọng hơn cả vai trò hiển thị. | ibomCode |
| **Ghi đè khối lượng** | Giá trị người dùng nhập tay cho một dòng BOQ, cất riêng, khoá theo định danh dòng. | override, bomQuantityOverrides |
| **Dòng thêm tay** | Dòng vật tư người dùng thêm vào ngoài định mức. Khác ghi đè ở chỗ nó là **dòng mới**, không phải sửa dòng cũ. | manualItems, common items |
| **Dự án** | Một bộ *(danh sách phụ tải + dòng thêm tay + ghi đè)* có tên và thời điểm. Dữ liệu nền **không** thuộc dự án. | project |
| **Dữ liệu nền** | Thư viện sản phẩm, định mức, danh sách nhãn hiệu, khai báo nhãn hiệu. Dùng chung cho mọi dự án. | library, templates, brands, meta |

> **Điểm cần chú ý khi thiết kế lại:** *dữ liệu nền* và *dự án* hiện nằm chung một kho lưu trữ và
> chung một thao tác sao lưu, nhưng vòng đời hoàn toàn khác nhau: dữ liệu nền thay đổi hiếm và ảnh
> hưởng mọi dự án; dự án thay đổi liên tục và độc lập nhau. Gộp chung là lý do một lần khôi phục sao
> lưu có thể vừa mất dự án đang làm vừa lùi cả thư viện sản phẩm.

---

## 4. MÔ HÌNH DỮ LIỆU KHÁI NIỆM

Mô tả **thực thể và quan hệ**, không mô tả kiểu dữ liệu.

### 4.1 Thực thể và định danh

| Thực thể | Định danh nghiệp vụ | Định danh kỹ thuật hiện tại | Ghi chú cho refactor |
|---|---|---|---|
| Sản phẩm | *(vật tư khái quát, nhãn hiệu)* | một id ngẫu nhiên | Id ngẫu nhiên **không được dùng** làm khoá gộp ở bất kỳ đâu; mọi phép gộp thực tế đều dùng cặp nghiệp vụ. Id ngẫu nhiên chỉ có một vai trò tai hại: nó lọt vào định danh dòng BOQ (I-03). |
| Vật tư khái quát | chính chuỗi `matchKey` | chuỗi | Chuỗi tự do, gõ tay, dễ dính khoảng trắng vô hình. Cần chuẩn hoá tại **mọi** đường ghi (R-N1). |
| Khai báo nhãn hiệu | vật tư khái quát | chuỗi | Quan hệ 1–1 với vật tư khái quát. |
| Mức định mức | *(loại, mức công suất)* | hai chuỗi lồng nhau | Mức công suất là **chuỗi**, không phải số — R-T2. |
| Dòng định mức | *(mức, vật tư khái quát)* — **hiện KHÔNG duy nhất** | không có | Đây là lỗ hổng: hai dòng cùng vật tư khái quát khác điều kiện là hợp lệ về nghiệp vụ nhưng phá vỡ định danh dòng BOQ. Xem ?-03. |
| Phụ tải | không có khoá nghiệp vụ | id ngẫu nhiên | Nhập lại cùng một file Excel tạo ra phụ tải mới hoàn toàn, không nhận ra trùng (R-X4). |
| Dòng BOQ | *(phụ tải, vật tư khái quát)* | chuỗi ghép ba phần | Xem I-03 — bất biến nguy hiểm nhất toàn hệ thống. |
| Dự án | tên do người dùng đặt | id ngẫu nhiên | Tên không bắt buộc duy nhất. |

### 4.2 Quan hệ

- Một **mức định mức** chứa nhiều **dòng định mức**; mỗi dòng trỏ tới một **vật tư khái quát**.
- Một **vật tư khái quát** có 0..n **sản phẩm** (mỗi nhãn hiệu tối đa một, theo luật R-B7/R-M4).
- Một **phụ tải** trỏ tới đúng một **mức định mức** qua cặp *(loại, công suất)*.
- Một **dòng BOQ** sinh ra từ một *(phụ tải, dòng định mức)* và trỏ tới 0 hoặc 1 **sản phẩm**.
- Một **dự án** chứa nhiều **phụ tải**, nhiều **dòng thêm tay**, và một bản đồ **ghi đè khối lượng**.
- **Dữ liệu nền không thuộc dự án nào** — đây là quan hệ quan trọng nhất và hiện không được thể hiện
  ở đâu trong cấu trúc lưu trữ.

### 4.3 Dữ liệu nào là nguồn, dữ liệu nào là dẫn xuất

| Loại | Thực thể | Hệ quả |
|---|---|---|
| **Nguồn** (phải lưu) | Thư viện sản phẩm · Định mức · Danh sách nhãn hiệu · Khai báo nhãn hiệu · Phụ tải · Dòng thêm tay · Ghi đè khối lượng | Mất là mất thật. |
| **Dẫn xuất** (không bao giờ lưu) | Chỉ mục tra cứu thư viện · Bảng chi tiết · Bảng tổng hợp · Kết quả kiểm tra · Số liệu bảng điều khiển | Tính lại được từ nguồn. Lưu chúng là mời gọi trạng thái lệch nhau. |

> **I-16 — Bảng chi tiết là dẫn xuất, không phải dữ liệu.** Mọi chỉnh tay của người dùng phải được
> cất vào một trong hai kho nguồn: *ghi đè khối lượng* (sửa dòng có sẵn) hoặc *dòng thêm tay* (thêm
> dòng mới). **Vỡ khi nào:** ai đó quyết định "lưu luôn bảng chi tiết cho nhanh" — kể từ đó đổi
> nhãn hiệu hay sửa định mức không còn phản ánh vào kết quả.
> *Bằng chứng:* `App.tsx:266-283`.

---

## 5. LUỒNG NGHIỆP VỤ CHÍNH — DIỄN GIẢI

### 5.1 Từ phụ tải tới bảng tổng hợp

Toàn bộ chuỗi này chạy lại **từ đầu** mỗi khi bất kỳ dữ liệu nguồn nào đổi. Không có bước nào được
lưu lại giữa chừng.

**Bước 1 — Dựng chỉ mục tra cứu thư viện.**
Thư viện sản phẩm được sắp lại thành các bản đồ tra cứu. Sản phẩm không khai vật tư khái quát bị
loại ngay từ bước này và không bao giờ xuất hiện ở các bước sau. Với mỗi vật tư khái quát, hệ thống
chọn ra một *bản ghi đại diện* để dùng cho trường hợp tra cứu không phân biệt nhãn hiệu; việc chọn
này phải cho kết quả như nhau bất kể thứ tự sản phẩm trong thư viện. Cùng lúc, hệ thống phát hiện
những vật tư khái quát *không* phụ thuộc nhãn hiệu mà lại đang có nhiều hơn một bản ghi — dấu hiệu
dữ liệu đã bị nhân bản — và báo cho người dùng tự dọn, không tự xoá.

**Bước 2 — Nở phụ tải thành dòng vật tư khái quát.**
Với mỗi phụ tải, hệ thống tìm mức định mức ứng với cặp *(loại, công suất)*. Không tìm thấy thì phụ
tải đó **không sinh ra vật tư nào** và hệ thống đi tiếp — đây là điểm im lặng nguy hiểm nhất trong
luồng (?-01). Tìm thấy thì duyệt từng dòng định mức và hỏi: điều kiện của dòng này có được tín hiệu
của phụ tải bật lên không? Dòng nào không qua thì bị loại tại đây, không để lại dấu vết.

**Bước 3 — Đổi vật tư khái quát thành mã hàng thật.**
Với mỗi dòng đã qua điều kiện, hệ thống hỏi: vật tư này có đi theo nhãn hiệu người dùng chọn không?
Nếu có, nhãn hiệu đích là nhãn hiệu của phụ tải — trừ khi đó là thiết bị đóng cắt cách ly, khi ấy
lấy nhãn hiệu isolator riêng nếu phụ tải có khai. Nếu không, hệ thống bỏ qua nhãn hiệu và lấy bản
ghi đại diện. Tra cứu thử theo chuỗi tuyệt đối trước; trượt thì thử lại theo dạng "lỏng" (bỏ khoảng
trắng, không phân biệt hoa thường) — đây là lưới cứu hộ cho dữ liệu cũ, không phải cách tra chính.

**Bước 4 — Sinh dòng BOQ.**
Tìm thấy sản phẩm thì sinh một dòng đầy đủ, khối lượng bằng số lượng trong định mức nhân với số
lượng phụ tải. **Không tìm thấy thì vẫn sinh một dòng**, mang mã sản phẩm là chuỗi báo lỗi và mô tả
là câu "thiếu vật tư này". Nói cách khác: **lỗi thiếu dữ liệu được biểu diễn bằng một dòng dữ liệu,
không phải bằng ngoại lệ**. Đây là một quyết định thiết kế có chủ ý và có lý — người dùng nhìn thấy
ngay chỗ nào thiếu, ngay tại vị trí của nó — nhưng nó đẩy trách nhiệm lọc dòng lỗi sang mọi tầng
phía sau, và hiện có tầng đã quên lọc (?-02).

**Bước 5 — Ghép dòng thêm tay và áp ghi đè.**
Danh sách dòng thêm tay được nối vào cuối. Sau đó bản đồ ghi đè được áp lên: dòng nào có ghi đè thì
khối lượng lấy theo ghi đè, không có thì giữ nguyên.

**Bước 6 — Gộp bảng tổng hợp.**
Bảng tổng hợp gộp theo mã iBom (rơi về mã sản phẩm, rồi về mô tả, khi thiếu). Trước khi gộp, hai
loại dòng bị loại: dòng báo thiếu vật tư, và dòng có khối lượng bằng hoặc nhỏ hơn không — loại thứ
hai chính là cách hệ thống biểu đạt "người dùng đã xoá dòng này".

**Bước 7 — Kiểm tra và xuất.**
Bộ kiểm tra chạy trên bảng đã áp ghi đè, phân loại thành lỗi / cảnh báo / thông tin. Chỉ **lỗi** mới
chặn việc xuất, và hiện chỉ có đúng một tình huống được xếp loại lỗi. Khi xuất, bảng chi tiết loại
dòng khối lượng ≤ 0 nhưng **không** loại dòng báo thiếu; bảng tổng hợp thì loại cả hai. Hai bảng
trong cùng một file vì thế không cân nhau (?-02).

### 5.2 Vòng đời dữ liệu nền

Dữ liệu nền vào hệ thống qua bốn cửa, mỗi cửa một ngữ nghĩa khác nhau — xem §6 để so sánh trực tiếp.
Điểm chung cần nhớ khi refactor: **không cửa nào có bước xem trước, không cửa nào có đường lùi**.
Mọi quyết định đều nằm trong một hộp thoại xác nhận của trình duyệt, và khi đã bấm đồng ý thì dữ
liệu cũ bị thay ngay tại chỗ.

### 5.3 Vòng đời dự án

Dự án được lưu tự động sau mỗi lần thay đổi, có độ trễ khoảng một giây. Ba lớp bảo vệ chặn việc ghi
nhầm: không ghi trước khi việc nạp dữ liệu lúc khởi động hoàn tất; không ghi khi chưa chọn dự án
nào; không ghi khi nội dung không thực sự khác bản đã lưu. Thêm một lưới an toàn cuối: khi đóng tab
mà còn thay đổi chưa kịp lưu thì trình duyệt hỏi lại.

Ba thao tác dễ nhầm lẫn về nghĩa:
- **Tạo dự án mới** — *không* dọn bàn làm việc. Nó đóng gói công việc đang làm thành một dự án mới,
  tức là hành vi "Lưu thành bản khác" (?-06).
- **Chuyển sang dự án khác** — lưu dự án đang mở trước, rồi nạp dự án đích.
- **Bỏ chọn dự án** — lưu dự án đang mở, rồi dọn sạch bàn làm việc và không gắn với dự án nào.

---

## 6. TỪ ĐIỂN QUY TẮC NGHIỆP VỤ

Đây là phần dùng nhiều nhất khi viết lại. Mỗi quy tắc là một mệnh đề phải còn đúng sau refactor.

### 6.1 Nhãn hiệu

| Mã | Quy tắc | Bằng chứng |
|---|---|---|
| **R-B1** | Lựa chọn nhãn hiệu của người dùng **chỉ** ảnh hưởng bốn nhóm: CB, contactor, relay nhiệt, isolator. Mọi thiết bị khác giữ nhãn hiệu ghi trong thư viện sản phẩm. | `brand-policy.ts:14-19`; chốt nghiệp vụ 11/09/2026 |
| **R-B2** | Khai báo tường minh cho một vật tư khái quát **thắng** mọi suy luận theo tên. Không có khai báo thì suy luận theo tiền tố tên. | `brand-policy.ts:97-101` |
| **R-B3** | Suy luận theo tiền tố xét **không phân biệt hoa thường** và theo **thứ tự ưu tiên cố định**: contactor → relay nhiệt → isolator → CB → biến tần → biến dòng → cáp → phụ kiện → khác. Tiền tố dài phải xét trước tiền tố ngắn chồng lấn. | `brand-policy.ts:41-51, 76-86` |
| **R-B4** | Thiết bị cách ly lấy nhãn hiệu isolator riêng của phụ tải nếu phụ tải có khai. Nhận diện thiết bị cách ly qua **hai** đường: điều kiện dòng định mức là "isolator", **hoặc** nhóm thiết bị là isolator. | `boq-logic.ts:187` |
| **R-B5** | Vật tư **không** phụ thuộc nhãn hiệu mà không tìm thấy trong thư viện thì cột nhãn hiệu hiển thị một dấu gạch, **không** hiển thị chữ nào trông giống tên hãng. | `brand-policy.ts:26`; `boq-logic.ts:229` |
| **R-B6** | Vật tư **có** phụ thuộc nhãn hiệu mà thiếu đúng nhãn hiệu đang chọn thì báo thiếu. **Tuyệt đối không** rơi về nhãn hiệu khác. | `boq-logic.ts:196, 217-234`; quyết định Q2 trong `PLAN-BRAND-MODEL §8` |
| **R-B7** | Khi phải chọn một bản ghi đại diện cho vật tư khái quát, thứ tự ưu tiên là: có mã iBom → nhãn hiệu theo bảng chữ cái → mã hàng theo bảng chữ cái → id. Kết quả **không được** phụ thuộc thứ tự sản phẩm trong thư viện. | `brand-policy.ts:148-160` |
| **R-B8** | Danh sách nhãn hiệu **hiển thị** là hợp của danh sách người dùng tự quản lý và mọi nhãn hiệu thực sự có trong thư viện. Danh sách hợp này **không được** ghi ngược vào kho nhãn hiệu. | `App.tsx:161-165` |

### 6.2 Định mức và phép nở

| Mã | Quy tắc | Bằng chứng |
|---|---|---|
| **R-T1** | Định mức được khoá theo cặp *(loại, mức công suất)*. Loại là chuỗi tự do; người dùng thêm loại mới bất cứ lúc nào. | `boq-logic.ts:146` |
| **R-T2** | **Mức công suất so khớp như chuỗi, không như số.** Phụ tải mang công suất dạng số, khi tra định mức nó được đổi sang chuỗi theo cách biểu diễn mặc định. Hệ quả: mức khai là "5.50" sẽ **không** khớp phụ tải 5.5 kW. Cửa thêm mức trong Admin nhận chuỗi thô không chuẩn hoá, còn vòng Excel lại chuẩn hoá qua số — hai cửa cho ra hai dạng khoá khác nhau. `[S]` | `boq-logic.ts:146`; `AdminPanel.tsx:249-260`; `excel-import.ts:193`; `excel-export.ts:313` |
| **R-T3** | Mỗi dòng định mức mang một điều kiện thuộc tập chín giá trị: luôn luôn, có isolator, có tín hiệu nhiệt, có PTC, có nút dừng khẩn, có cảm biến độ ẩm, có phản hồi isolator BFP, có phản hồi nút dừng khẩn BFP, có phản hồi isolator/dừng khẩn. Thiếu điều kiện được hiểu là "luôn luôn". | `types/index.ts:60`; `boq-logic.ts:156-174`; `template-validation.ts:43` |
| **R-T4** | Khối lượng một dòng BOQ bằng số lượng trong định mức nhân với số lượng phụ tải. Phép nhân này xảy ra **đúng một lần** trong toàn hệ thống. | `boq-logic.ts:211` |
| **R-T5** | Phụ tải trỏ tới một mức định mức không tồn tại thì **không sinh ra vật tư nào** và hệ thống tiếp tục chạy bình thường. | `boq-logic.ts:146-151` |
| **R-T6** | Một dòng định mức chỉ sinh ra dòng BOQ khi điều kiện của nó được thoả. Dòng bị loại **không** để lại dấu vết nào trong kết quả. | `boq-logic.ts:176` |
| **R-T7** | Giá trị điều kiện đọc từ Excel phải nằm trong tập chín giá trị. Sai chính tả thì **chặn cả lần nhập** và chỉ ra số dòng trong file — không im lặng bỏ qua, vì điều kiện sai làm vật tư biến mất khỏi BOQ mà không ai biết. | `excel-import.ts:205-213`; `AdminPanel.tsx:643-655` |

### 6.3 Tra cứu sản phẩm

| Mã | Quy tắc | Bằng chứng |
|---|---|---|
| **R-L1** | Chỉ sản phẩm có khai vật tư khái quát mới vào được BOQ. Sản phẩm không khai vẫn lưu được, vẫn hiện trong Admin, nhưng vô hình với đường sinh BOQ — và **không có cảnh báo nào** nói điều đó. | `boq-logic.ts:30` |
| **R-L2** | Tra cứu theo chuỗi **tuyệt đối** trước. Chỉ khi trượt mới thử lại dạng lỏng (bỏ khoảng trắng, không phân biệt hoa thường). Thứ tự này không được đảo. | `boq-logic.ts:84-92` |
| **R-L3** | Không tìm thấy sản phẩm thì vẫn sinh một dòng BOQ mang dấu hiệu thiếu, giữ nguyên vật tư khái quát và khối lượng đã tính. | `boq-logic.ts:217-234` |
| **R-N1** | Mọi đường **ghi** vật tư khái quát phải chuẩn hoá chuỗi: đổi khoảng trắng vô hình thành khoảng trắng thường rồi cắt hai đầu. Hiện có ba đường ghi: ô nhập trong Admin, nhập ma trận từ Excel, nhập định mức từ Excel. Bỏ sót một đường là dữ liệu bẩn quay lại. | `brand-policy.ts:61-65`; `AdminPanel.tsx:506`; `excel-import.ts:194, 338` |
| **R-N2** | Hệ thống phải dò được và chỉ ra những vật tư khái quát trong định mức **nhìn giống hệt** một khoá trong thư viện nhưng không khớp tuyệt đối, kèm danh sách nơi xuất hiện, và cho sửa một chạm. | `boq-logic.ts:99-129`; `AdminPanel.tsx:585-605` |

### 6.4 Khối lượng, ghi đè, xoá

| Mã | Quy tắc | Bằng chứng |
|---|---|---|
| **R-Q1** | Khối lượng hiển thị và khối lượng xuất file của một dòng BOQ là **giá trị ghi đè nếu có, ngược lại là giá trị tính ra**. | `App.tsx:272-278`; `DetailView.tsx:361` |
| **R-Q2** | "Xoá một dòng vật tư tự sinh" được biểu đạt bằng cách **ghi đè khối lượng về 0**, không phải bằng việc loại dòng khỏi danh sách. Dòng vẫn hiện trong bảng chi tiết với trạng thái mờ. | `DetailView.tsx:456`; `boq-logic.ts:247` |
| **R-Q3** | "Xoá một dòng thêm tay" thì **loại hẳn** dòng đó khỏi danh sách. Cùng một biểu tượng thùng rác trên giao diện, hai hành vi khác nhau. | `App.tsx:293-301` |
| **R-Q4** | Xoá một phụ tải phải xoá kèm mọi ghi đè thuộc về nó. | `App.tsx:315-327` |
| **R-Q5** | Ghi đè có thể **hoàn lại** về giá trị mặc định; thao tác hoàn lại phải xoá hẳn mục ghi đè chứ không ghi lại giá trị cũ. | `App.tsx:303-313` |
| **R-Q6** | Khối lượng nhập tay chấp nhận số thập phân và phải ≥ 0. Hiển thị làm tròn hai chữ số. | `DetailView.tsx:404-416` |

### 6.5 Bảng tổng hợp

| Mã | Quy tắc | Bằng chứng |
|---|---|---|
| **R-S1** | Khoá gộp ưu tiên **mã iBom**, rơi về mã sản phẩm, cuối cùng rơi về mô tả. Lý do: một mã sản phẩm (mã khung) có thể dùng chung cho nhiều biến thể chỉ khác nhau ở mã iBom; gộp theo mã sản phẩm sẽ nhập nhầm hai vật tư khác nhau làm một. | `boq-logic.ts:249-256` |
| **R-S2** | Dòng báo thiếu vật tư và dòng khối lượng ≤ 0 **không vào** bảng tổng hợp. | `boq-logic.ts:246-247` |
| **R-S3** | Khi nhiều dòng gộp vào một, các thuộc tính mô tả lấy theo **dòng gặp đầu tiên**; chỉ khối lượng được cộng dồn. | `boq-logic.ts:259-271` |
| **R-S4** | Vì mã iBom là khoá gộp, mọi đường ghi dữ liệu phải giữ mã iBom **riêng theo từng nhãn hiệu**. Làm phẳng mã iBom giữa các nhãn hiệu sẽ khiến hai vật tư khác nhau bị nhập làm một dòng tổng hợp. | `excel-export.ts:396-398`; `excel-import.ts:409-418` |

### 6.6 Xuất bảng khối lượng

| Mã | Quy tắc | Bằng chứng |
|---|---|---|
| **R-E1** | Dữ liệu xuất là bảng **đã áp ghi đè**, không phải bảng tính thô. | `App.tsx:350` |
| **R-E2** | Bảng chi tiết khi xuất loại dòng khối lượng ≤ 0 nhưng **không** loại dòng báo thiếu. | `excel-export.ts:193` |
| **R-E3** | Bảng tổng hợp khi xuất được sắp theo mô tả, so sánh theo quy tắc tiếng Việt, và đánh số thứ tự. | `excel-export.ts:220-225` |
| **R-E4** | Chỉ **lỗi** mới chặn việc xuất; cảnh báo chỉ hiện thông báo rồi vẫn xuất. Hiện chỉ có đúng một tình huống được xếp loại lỗi: bảng rỗng trong khi có phụ tải. | `validation.ts:37, 115-121`; `App.tsx:331, 344` |
| **R-E5** | Người dùng chọn được định dạng xuất (đủ hai bảng / chỉ tổng hợp / chỉ chi tiết) và chọn được từng cột. | `ExportOptionsModal.tsx:15-54` |
| **R-E6** | Tên file và trang thông tin dự án lấy theo tên dự án đang mở. **Quy tắc này hiện không được thực thi** — xem ?-04. | `excel-export.ts:171, 243-246` |

### 6.7 Kiểm tra dữ liệu

| Mã | Quy tắc | Bằng chứng |
|---|---|---|
| **R-V1** | Mỗi dòng báo thiếu vật tư sinh một **cảnh báo** riêng, nêu rõ vật tư khái quát, phụ tải và nhãn hiệu. | `validation.ts:23-34` |
| **R-V2** | Bảng rỗng trong khi có phụ tải là **lỗi** — tình huống lỗi duy nhất hiện có. | `validation.ts:37-44` |
| **R-V3** | Phụ tải chưa đặt tên chỉ là **thông tin**, gộp thành một dòng. | `validation.ts:47-55` |
| **R-V4** | Phụ tải trùng cấu hình chỉ được cảnh báo khi **có ít nhất hai cái trùng luôn cả tên tải** — nghĩa là phụ tải trùng mà chưa đặt tên thì không bao giờ được cảnh báo. | `validation.ts:58-83` |

### 6.8 Ngữ nghĩa nhập dữ liệu — bảng so sánh bốn cửa

Đây là chỗ dễ hiểu nhầm nhất của hệ thống hiện tại: bốn cửa nhập, bốn ngữ nghĩa khác nhau, không cửa
nào nói rõ ngữ nghĩa của mình cho người dùng.

| | **Thư viện sản phẩm** | **Ma trận vật tư khái quát** | **Định mức** | **Sao lưu JSON** |
|---|---|---|---|---|
| Khoá đối chiếu | *(vật tư khái quát hoặc mã hàng, nhãn hiệu)* | vật tư khái quát + cột nhãn hiệu | *(loại, mức công suất)* | toàn bộ kho lưu trữ |
| Mặc định | **hợp nhất** | **hợp nhất** | **hợp nhất theo mức** | **thay thế toàn bộ** |
| Có chế độ thay thế? | có, phải gõ chữ xác nhận | không | không | đó là hành vi duy nhất |
| Vắng mặt nghĩa là gì? | không đụng tới | không đụng tới | **không đụng ở cấp mức, nhưng = xoá ở cấp dòng trong mức có mặt** | không ghi đè khoá đó |
| Có xoá bản ghi không? | chỉ khi thay thế | **không bao giờ**, chỉ báo cáo | xoá dòng trong mức có mặt | thay cả kho |
| Giá trị lạ xử lý sao? | nhãn hiệu lạ **bị ép về một nhãn hiệu mặc định** | giữ nguyên, tạo bản ghi mới | điều kiện sai **chặn cả lần nhập** | sai lược đồ thì từ chối cả file |
| Báo cáo trước khi ghi | một dòng thông báo | đầy đủ nhưng chỉ xem được **sau khi đã ghi** | liệt kê số mức sẽ đổi / giữ | không có |
| Có đường lùi | không | không | không | không |

| Mã | Quy tắc | Bằng chứng |
|---|---|---|
| **R-M1** | Nhập ma trận vật tư khái quát **không bao giờ xoá bản ghi**. Ô bị xoá trắng chỉ được liệt kê trong báo cáo để người dùng tự quyết. | `excel-import.ts:377-388` |
| **R-M2** | Một ô nhãn hiệu được coi là "có dữ liệu" nếu có mã hàng **hoặc** mã iBom. Chỉ xét mã hàng sẽ làm biến mất toàn bộ nhóm vật tư vốn không có mã hàng, chỉ định danh bằng mã iBom. | `excel-import.ts:369-375` |
| **R-M3** | Thứ tự ưu tiên mã iBom khi hợp nhất: cột riêng theo nhãn hiệu → giá trị đang có trong thư viện → cột dùng chung (chỉ với file mẫu đời cũ). | `excel-import.ts:409-418` |
| **R-M4** | Vật tư **không** phụ thuộc nhãn hiệu chỉ được có **đúng một** bản ghi. File điền mã ở nhiều cột nhãn hiệu thì chỉ ô đầu được dùng, phần còn lại vào báo cáo xung đột. | `excel-import.ts:390-398` |
| **R-M5** | File mẫu đời cũ (thiếu cột khai báo nhãn hiệu) vẫn phải nhập được; thiếu cột thì giữ khai báo hiện có hoặc suy luận theo tên, và đánh dấu cờ báo cho người dùng biết. | `excel-import.ts:346-355, 443` |
| **R-M6** | Danh sách cột nhãn hiệu khi **xuất** ma trận là động: hợp của danh sách người dùng quản lý và mọi nhãn hiệu thực có trong thư viện. Cố định cứng danh sách sẽ làm rơi mã hàng của nhãn hiệu ngoài danh sách ngay khi xuất. | `excel-export.ts:358-362` |
| **R-M7** | Nhập định mức hợp nhất **theo từng mức**: mức có trong file thì lấy theo file (cho phép xoá dòng bằng cách bỏ dòng khỏi file); mức không có trong file thì giữ nguyên. Hộp xác nhận phải nói rõ bao nhiêu mức sẽ đổi và bao nhiêu mức giữ nguyên. | `excel-import.ts:159-182`; `AdminPanel.tsx:660-676` |
| **R-M8** | Nhập danh sách phụ tải mặc định là **thêm vào**; thay thế toàn bộ phải gõ chữ xác nhận. Trước khi nhập phải cảnh báo những mức công suất chưa có định mức. | `InputWizard.tsx:96-121` |
| **R-M9** | Giá trị lạ trong file phụ tải và file thư viện bị ép về giá trị mặc định trong danh sách cho phép, **không** bị loại bỏ dòng. Danh sách cho phép là hàng rào chống nội dung độc hại từ file không tin cậy. | `import-validation.ts:51-131` |
| **R-M10** | Danh sách cho phép được truyền vào động: loại khởi động lấy từ định mức đang có, nhãn hiệu lấy từ hợp của danh sách người dùng và thư viện. | `AdminPanel.tsx:154-157`; `InputWizard.tsx:90` |

### 6.9 Sao lưu và khôi phục

| Mã | Quy tắc | Bằng chứng |
|---|---|---|
| **R-K1** | Bản sao lưu là ảnh chụp **toàn bộ** kho lưu trữ, có dấu phiên bản và thời điểm. | `BackupRestoreModal.tsx:14-30` |
| **R-K2** | Khôi phục phải kiểm tra lược đồ trước; file sai lược đồ bị từ chối toàn bộ, không khôi phục một phần. | `import-validation.ts:21-46` |
| **R-K3** | Khôi phục chỉ ghi những mục **có giá trị** trong file. Hệ quả: khôi phục từ bản sao lưu cũ **không xoá** những mục mới có trên máy đích — tức là khôi phục thực chất là hợp nhất một phần, không phải thay thế sạch như giao diện nói. | `BackupRestoreModal.tsx:98-107` |
| **R-K4** | Sau khi khôi phục, ứng dụng tải lại trang để mọi thứ đọc lại từ kho. | `BackupRestoreModal.tsx:110` |

### 6.10 Dự án

| Mã | Quy tắc | Bằng chứng |
|---|---|---|
| **R-P1** | Dự án chứa **ba** thứ: danh sách phụ tải, dòng thêm tay, bản đồ ghi đè. Dữ liệu nền **không** thuộc dự án. | `types/index.ts:147-153` |
| **R-P2** | Lưu tự động có độ trễ khoảng một giây và chỉ ghi khi nội dung thực sự khác bản đã lưu. | `App.tsx:225-245` |
| **R-P3** | Không được ghi tự động trước khi việc nạp dữ liệu lúc khởi động hoàn tất, và không được ghi khi chưa chọn dự án. | `App.tsx:215-231` |
| **R-P4** | Mỗi lần ghi thật đều cập nhật thời điểm sửa đổi của dự án. | `projectStore.ts:133-136` |
| **R-P5** | Đóng tab khi còn thay đổi chưa lưu thì phải cảnh báo. | `App.tsx:248-263` |
| **R-P6** | Chuyển sang dự án khác phải lưu dự án đang mở trước. | `ProjectSelector.tsx:62-73` |

---

## 7. BẤT BIẾN BẮT BUỘC GIỮ KHI VIẾT LẠI

Phân làm ba loại theo mức độ ràng buộc. Đây là danh sách nên đọc **trước** khi chạm vào bất kỳ phần
nào tương ứng.

### 7.1 Nhóm A — Vỡ là mất dữ liệu người dùng

| Mã | Bất biến | Vỡ khi nào | Bằng chứng |
|---|---|---|---|
| **I-03** | **Định danh một dòng BOQ phải ổn định qua các lần tính lại**, vì bản đồ ghi đè khối lượng khoá theo chính định danh đó, và việc dọn ghi đè khi xoá phụ tải dựa vào phần đầu của định danh. | Đổi công thức định danh, hoặc đưa thêm thành phần dễ thay đổi vào định danh. **Hiện tại định danh đang chứa id ngẫu nhiên của sản phẩm** — nghĩa là đổi nhãn hiệu của phụ tải làm định danh đổi theo và ghi đè cũ trở thành rác vĩnh viễn, dòng mới lặng lẽ quay về khối lượng mặc định. Đây vừa là bất biến vừa là lỗi đang tồn tại. | `boq-logic.ts:203`; `App.tsx:274, 321` |
| **I-16** | **Bảng chi tiết là dẫn xuất, không bao giờ được lưu.** | Ai đó "lưu cho nhanh". Khi ấy đổi định mức hay nhãn hiệu không còn phản ánh vào kết quả. | `App.tsx:266-283` |
| **I-35** | **Không được ghi tự động trước khi nạp xong dữ liệu khởi động.** | Bỏ cơ chế trì hoãn một nhịp. Khi ấy lần lưu đầu tiên sẽ ghi trạng thái rỗng đè lên dự án đang có dữ liệu. | `App.tsx:212-218` |
| **I-24** | **Đường nhập ma trận không bao giờ được xoá bản ghi.** | "Tối ưu" bằng cách coi ô trống là lệnh xoá. | `excel-import.ts:377-388` |
| **I-40** | **Khôi phục chỉ ghi mục có giá trị** — nếu đổi thành ghi đè sạch thì bản sao lưu cũ sẽ xoá mất khai báo mới trên máy đích. | Đổi sang "thay thế toàn bộ" mà không cảnh báo. | `BackupRestoreModal.tsx:98-107` |

### 7.2 Nhóm B — Vỡ là ra số liệu sai mà không ai biết

| Mã | Bất biến | Vỡ khi nào | Bằng chứng |
|---|---|---|---|
| **I-07** | **Mã iBom là khoá gộp của bảng tổng hợp**, không chỉ là trường hiển thị. Mọi đường ghi phải giữ nó riêng theo nhãn hiệu. | Dùng một cột mã iBom dùng chung cho nhiều nhãn hiệu. Hai vật tư khác nhau sẽ bị nhập làm một dòng tổng hợp. | `boq-logic.ts:254`; `excel-import.ts:409-418` |
| **I-04** | **Số lượng phụ tải được nhân đúng một lần**, tại bước nở định mức. | Thêm một phép nhân ở tầng hiển thị hoặc tầng xuất file. | `boq-logic.ts:211` |
| **I-08** | **Khối lượng ≤ 0 là cách biểu đạt "người dùng đã xoá"**, không phải dữ liệu rác cần dọn. | Ai đó "dọn dữ liệu xấu" bằng cách bỏ bộ lọc này. Các dòng đã xoá lập tức quay lại bảng tổng hợp và file xuất. | `boq-logic.ts:247`; `excel-export.ts:193` |
| **I-32** | **Xuất file phải dùng bảng đã áp ghi đè**, không dùng bảng tính thô. | Lấy nhầm nguồn. Toàn bộ chỉnh tay của người dùng biến mất khỏi file giao đi, trong khi màn hình vẫn hiện đúng. | `App.tsx:350` |
| **I-42** | **Kiểm tra dữ liệu chạy trên bảng đã áp ghi đè**, nên số cảnh báo khớp với những gì người dùng đang nhìn thấy. | Kiểm tra trên bảng thô. | `App.tsx:283` |

### 7.3 Nhóm C — Vỡ là tái sinh lỗi cũ đã từng mất công sửa

| Mã | Bất biến | Vỡ khi nào | Bằng chứng |
|---|---|---|---|
| **I-01** | **Chọn bản ghi đại diện phải tất định**, không phụ thuộc thứ tự mảng. | Quay về lấy phần tử đầu tiên. Nhãn hiệu hiển thị của hàng không phụ thuộc nhãn hiệu sẽ đổi theo lịch sử nhập liệu. | `brand-policy.ts:148-160` |
| **I-02** | **Tra cứu lỏng chỉ là lưới cứu hộ**, luôn xếp sau tra cứu tuyệt đối. | Đảo thứ tự để "tìm dễ hơn". Dữ liệu lệch hoa thường sẽ im lặng khớp nhầm nhau. | `boq-logic.ts:87, 91` |
| **I-06** | **Thiết bị cách ly nhận nhãn hiệu riêng qua hai đường** (điều kiện dòng, hoặc nhóm thiết bị). | Bỏ đường thứ hai. Tên khoá có tiền tố dài sẽ lặng lẽ lấy nhãn hiệu chính của phụ tải. | `boq-logic.ts:187` |
| **I-11** | **Thứ tự bảng tiền tố suy luận nhóm thiết bị là có ý nghĩa**: tiền tố dài phải xét trước tiền tố ngắn chồng lấn. | Sắp lại bảng cho "gọn". Toàn bộ nhóm CB bị phân loại sai. | `brand-policy.ts:41-51` |
| **I-12** | **Mọi đường ghi vật tư khái quát đều phải chuẩn hoá chuỗi.** | Thêm một đường ghi mới mà quên chuẩn hoá. Người dùng thấy khoá y hệt nhau nhưng hệ thống báo thiếu. | `brand-policy.ts:61-65` |
| **I-29** | **Tập giá trị điều kiện là một danh sách duy nhất**, dùng chung cho cả trình soạn thảo và đường nhập Excel. | Tách làm hai bản. Giá trị sai chính tả lọt vào định mức và vật tư biến mất khỏi BOQ không dấu vết. | `template-validation.ts:43` |
| **I-44** | **So khớp số phải dùng ranh giới số, không dùng phép chứa chuỗi.** | Quay lại dùng phép chứa chuỗi cho "đơn giản". Dòng 10A khớp nhầm 210A, kích thước 10x20 khớp nhầm 10x200. | `logic-engine.ts:19-33, 207` |
| **I-19** | **Bộ làm sạch dữ liệu nhập luôn trả về một bản ghi hợp lệ, không bao giờ loại dòng.** Hệ quả phải chấp nhận: file sai toàn tập vẫn "nhập thành công" thành một loạt dòng mặc định. | Đổi sang loại dòng mà không bổ sung báo cáo. Người dùng sẽ mất dòng mà không biết. | `import-validation.ts:85-131` |
| **I-28** | **Với định mức: vắng mặt không có nghĩa là xoá ở cấp mức, nhưng có nghĩa là xoá ở cấp dòng trong một mức có mặt.** | Hợp nhất hai ngữ nghĩa này làm một theo hướng nào cũng gây mất dữ liệu ở hướng còn lại. | `excel-import.ts:151-171` |

---

## 8. ĐIỂM CẦN CHỐT TRƯỚC KHI VIẾT LẠI

Những chỗ logic hiện tại mâu thuẫn, mơ hồ, hoặc gần như chắc chắn ngoài ý muốn. Mỗi mục cần một
quyết định, không phải một bản sửa lỗi tuỳ hứng.

| Mã | Vấn đề | Vì sao phải chốt trước | Bằng chứng |
|---|---|---|---|
| **?-01** | **Phụ tải không có định mức thì im lặng sinh 0 vật tư.** Chỉ có một dòng ghi ra bảng điều khiển của trình duyệt. Bộ kiểm tra chỉ báo khi bảng **rỗng hoàn toàn**, nên tình huống "một trong hai mươi phụ tải mất hút" không ai thấy. | Quyết định xem đây là lỗi chặn, cảnh báo, hay hành vi chấp nhận được. Nó thay đổi cả thiết kế bộ kiểm tra. | `boq-logic.ts:149`; `validation.ts:37` |
| **?-02** | **Hai bảng trong cùng một file không cân nhau.** Bảng chi tiết chứa dòng báo thiếu vật tư; bảng tổng hợp loại chúng. Việc xuất không bị chặn vì thiếu vật tư chỉ là cảnh báo. Kết quả: file giao đi có dòng ghi chữ báo lỗi ở bảng chi tiết mà bảng tổng hợp không có khối lượng tương ứng. | Đây là **thay đổi hành vi bên ngoài** duy nhất tôi cho là cần thiết. Phải chốt: chặn cứng, hay cho xuất kèm một trang liệt kê vật tư thiếu. | `boq-logic.ts:246` vs `excel-export.ts:193` |
| **?-03** | **Một mức định mức có được chứa hai dòng cùng vật tư khái quát không?** Về nghiệp vụ thì hợp lý (cùng loại cáp, một phần luôn có, một phần chỉ khi có nút dừng khẩn). Về kỹ thuật thì hiện phá vỡ định danh dòng BOQ: hai dòng trùng định danh, một mục ghi đè áp cho cả hai, và thao tác sửa số lượng trong Admin chỉ tác động dòng đầu. | Nếu **được phép**, định danh dòng BOQ phải đổi (I-03) và phải có kế hoạch chuyển đổi ghi đè cũ. Nếu **không được phép**, phải chặn ngay tại cửa nhập và có công cụ dò dữ liệu hiện có. | `boq-logic.ts:203`; `AdminPanel.tsx:237, 280` |
| **?-04** | **Tên dự án không bao giờ tới được file xuất.** Trang thông tin dự án không bao giờ được tạo dù ô chọn mặc định đang bật, và tên file luôn là tên mặc định. Dữ liệu tên dự án có sẵn. | Chỉ cần xác nhận đây là lỗi chứ không phải chủ ý, rồi nối lại. | `App.tsx:587`; `excel-export.ts:171, 243` |
| **?-05** | **Mức công suất là khoá chuỗi.** Thêm mức qua giao diện Admin nhận chuỗi thô; vòng Excel chuẩn hoá qua số. Hai cửa có thể sinh ra hai dạng khoá cho cùng một mức công suất, và phụ tải chỉ khớp được một dạng. `[S]` — cần kiểm trên dữ liệu thật. | Quyết định chuẩn hoá mức công suất thành số, hay giữ chuỗi nhưng chuẩn hoá tại mọi cửa. Ảnh hưởng cả dữ liệu đang lưu. | `boq-logic.ts:146`; `AdminPanel.tsx:249-260` |
| **?-06** | **"Tạo dự án" thực chất là "Lưu thành bản khác"** — nó cuốn theo công việc đang làm chứ không dọn bàn. | Đổi hành vi hay đổi tên nút. Đây là kỳ vọng của người dùng, không phải chi tiết kỹ thuật. | `ProjectSelector.tsx:50-60` |
| **?-07** | **Nhãn hiệu lạ bị ép về một nhãn hiệu mặc định.** Nếu thư viện vừa bị xoá trắng rồi nhập file cũ thì nhãn hiệu đó rơi khỏi danh sách cho phép và toàn bộ hàng của nó im lặng đổi nhãn. Hành vi này đang được một bài kiểm thử **đóng băng** lại, tức là đã biết mà chưa xử. | Chốt: hỏi người dùng "thêm nhãn hiệu này vào danh sách?", hay giữ nguyên và đánh dấu, hay loại dòng. | `import-validation.ts:55-58`; `legacy-data-import.test.ts:52` |
| **?-08** | **Có hai ngữ nghĩa ghi định mức trong cùng một màn hình Admin:** đường Excel hợp nhất theo mức, còn trình soạn thảo dạng văn bản thay toàn bộ một loại khởi động. | Thống nhất một ngữ nghĩa, hoặc nói rõ sự khác biệt ngay trên giao diện. | `excel-import.ts:159`; `AdminPanel.tsx:338-358` |
| **?-09** | **Hai mục trong bản sao lưu không có ai ghi.** Dữ liệu thật nằm trong kho dự án; hai mục này luôn rỗng khi xuất và không ai đọc khi khôi phục. Ngược lại, tuỳ chọn giao diện sáng/tối lại **không** nằm trong bản sao lưu. | Chốt danh sách mục được sao lưu và đưa về **một** nguồn khai báo duy nhất, thay vì liệt kê tay ở hai chỗ. | `BackupRestoreModal.tsx:17-29, 98-107` |
| **?-10** | **Hệ luật phụ thuộc (nhóm chức năng đang tắt) — chôn hay hồi sinh?** Đây là phần thuật toán phức tạp nhất hệ thống: 91 nhóm thiết bị, các luật so khớp theo dòng điện và theo kích thước, bảng ánh xạ kích thước, thuật toán chia khối lượng theo ba pha có xử lý phần dư. Nó đang bị tắt bằng một cờ nhưng vẫn nằm nguyên trong gói phát hành. Bộ kiểm thử của nó **không kiểm code thật** mà kiểm một bản chép trong chính file kiểm thử. | Đây là quyết định nặng nhất. Nếu còn dùng thì phải đưa vào kế hoạch kèm bộ kiểm thử thật; nếu không thì xoá. Để nguyên là phương án tệ nhất — nó vừa tốn chỗ vừa tạo cảm giác an toàn sai. | `App.tsx:16, 32, 530`; `logic-engine.test.ts` |
| **?-11** | **Sản phẩm không khai vật tư khái quát là hợp lệ nhưng vô hình.** Lưu được, hiện trong Admin, không bao giờ vào BOQ, không có cảnh báo. | Chốt: bắt buộc khai, hay cho phép nhưng đánh dấu rõ trong danh sách. | `boq-logic.ts:30`; `AdminPanel.tsx:115` |
| **?-12** | **Phụ tải trùng cấu hình mà chưa đặt tên không bao giờ được cảnh báo** — đúng trường hợp phổ biến nhất lại lọt lưới. | Chốt lại điều kiện cảnh báo trùng. | `validation.ts:58-83` |

---

## 9. HÀNH VI PHẢI BẢO TOÀN — DANH SÁCH NGHIỆM THU

Đây là **hợp đồng của bản viết lại**. Mỗi dòng là một tình huống có thể dựng lại được và một kết quả
mong đợi. Toàn bộ danh sách này rút ra từ bộ kiểm thử hiện có và từ nhật ký kiểm thử tay trong hai
tài liệu `PLAN-BRAND-MODEL §9.3` và `PIPELINE-EXPORT-IMPORT §6.3` — tức là chúng đã từng được chạy
thật trên dữ liệu thật, không phải mong muốn suy diễn.

Cách dùng: **dựng lại danh sách này trước khi đổi một dòng nào**, chạy trên hệ thống cũ để lấy mốc,
rồi chạy lại trên hệ thống mới.

### 9.1 Nhãn hiệu

| # | Tình huống | Kết quả mong đợi |
|---|---|---|
| N-01 | Phụ tải chọn một nhãn hiệu, định mức có biến dòng | Biến dòng giữ nhãn hiệu ghi trong thư viện, **không** đổi theo lựa chọn của người dùng |
| N-02 | Đổi nhãn hiệu của phụ tải sang hãng khác | Chỉ contactor, relay nhiệt, CB, isolator đổi theo; mọi thứ khác giữ nguyên |
| N-03 | Phụ tải hãng A, bật isolator và chọn nhãn hiệu isolator là hãng B | Isolator lấy hàng của hãng B, các thiết bị đóng cắt khác vẫn hãng A |
| N-04 | Vật tư khái quát có tiền tố dài (dạng tên đầy đủ của isolator) | Vẫn nhận đúng nhãn hiệu isolator riêng — đây là lỗi cũ đã sửa, dễ tái phát |
| N-05 | Đảo ngược thứ tự sản phẩm trong thư viện rồi sinh lại BOQ | Kết quả **không đổi**, từng dòng một |
| N-06 | Vật tư phụ thuộc nhãn hiệu nhưng thư viện thiếu đúng hãng đang chọn | Báo thiếu; **không** lẳng lặng lấy hàng của hãng khác |
| N-07 | Vật tư không phụ thuộc nhãn hiệu và không tìm thấy | Cột nhãn hiệu hiện một dấu gạch, **không** hiện chữ nào trông giống tên hãng |
| N-08 | Khai báo nhãn hiệu để rỗng hoàn toàn | Kết quả BOQ giống hệt khi có khai báo suy luận sẵn — đây là điều kiện để cờ an toàn lùi về được |
| N-09 | Đặt tường minh cho một vật tư vốn không theo hãng thành "có theo hãng" | Từ đó nó đi theo lựa chọn của người dùng; chọn hãng không có hàng thì báo thiếu |
| N-10 | Ô chọn nhãn hiệu ở mọi màn hình | Phải thấy được cả những hãng chỉ tồn tại trong thư viện, không chỉ hãng trong danh sách khai báo |

### 9.2 Sinh BOQ và gộp tổng hợp

| # | Tình huống | Kết quả mong đợi |
|---|---|---|
| N-11 | Hai biến thể khác nhau dùng chung một mã hàng nhưng khác mã iBom | Bảng tổng hợp giữ **hai dòng riêng**, không gộp làm một |
| N-12 | Cùng một biến thể dùng bởi nhiều phụ tải | Bảng tổng hợp gộp làm một dòng, khối lượng cộng đúng |
| N-13 | Bản ghi thiếu mã iBom | Gộp rơi về mã hàng, vẫn phân biệt được với biến thể khác |
| N-14 | Bật rồi tắt một tín hiệu của phụ tải | Các dòng gắn điều kiện tương ứng xuất hiện rồi biến mất đúng như vậy |
| N-15 | Phụ tải số lượng lớn hơn một | Mọi dòng nhân đúng một lần theo số lượng |
| N-16 | Xoá một dòng vật tư tự sinh | Dòng mờ đi trên màn hình, biến mất khỏi bảng tổng hợp và khỏi file xuất |
| N-17 | Sửa khối lượng một dòng rồi hoàn lại | Giá trị trở về đúng khối lượng mặc định, dấu hiệu "đã sửa" mất đi |
| N-18 | Xoá một phụ tải đã từng sửa khối lượng | Mọi ghi đè của phụ tải đó biến mất, không để lại rác |

### 9.3 Chuỗi vật tư khái quát

| # | Tình huống | Kết quả mong đợi |
|---|---|---|
| N-19 | Định mức có khoá dính khoảng trắng ở cuối | Vẫn tra ra sản phẩm, **không** báo thiếu |
| N-20 | Định mức có khoá dính ký tự trắng vô hình do Excel mang vào | Vẫn tra ra sản phẩm |
| N-21 | Định mức có khoá lệch hoa thường | Vẫn tra ra sản phẩm |
| N-22 | Định mức có khoá thiếu **thật** | Vẫn phải báo thiếu — lưới cứu hộ không được nuốt lỗi thật |
| N-23 | Có khoá lệch chuỗi trong định mức | Màn hình Admin chỉ ra đúng khoá nào lệch, ở những mức nào, và sửa được một chạm |
| N-24 | Nhập khoá dính khoảng trắng qua bất kỳ cửa nào | Khoá được chuẩn hoá ngay khi ghi, không để dữ liệu bẩn lọt vào kho |

### 9.4 Vòng Excel ma trận vật tư khái quát

| # | Tình huống | Kết quả mong đợi |
|---|---|---|
| N-25 | Xuất ma trận khi thư viện có hãng ngoài danh sách khai báo | File có cột cho hãng đó; mã hàng không bị rơi |
| N-26 | Xuất rồi nhập lại ngay, không sửa gì | Thư viện **không đổi**, từng bản ghi một |
| N-27 | Xuất rồi nhập lại với vật tư có mã hàng rỗng, chỉ có mã iBom | Vẫn còn đủ, không biến mất |
| N-28 | Xuất rồi nhập lại, kiểm mã iBom của từng hãng | Mã iBom **không bị làm phẳng** giữa các hãng |
| N-29 | Một hãng không có mã iBom | Không bị mượn mã iBom của hãng khác |
| N-30 | Vật tư không theo hãng, file điền mã ở nhiều cột hãng | Tạo **đúng một** bản ghi; các cột còn lại vào báo cáo xung đột |
| N-31 | Vật tư có theo hãng, file điền mã ở nhiều cột hãng | Tạo đủ bản ghi cho từng hãng |
| N-32 | Ô mã bị xoá trắng trong file | Bản ghi **vẫn còn** trong thư viện; chỉ xuất hiện trong báo cáo |
| N-33 | File mẫu đời cũ, thiếu cột khai báo nhãn hiệu | Vẫn nhập được, có cờ báo cho người dùng biết file thiếu thông tin đó |
| N-34 | File có cột khai báo nhãn hiệu ghi giá trị khác khai báo hiện tại | Khai báo trong file thắng |
| N-35 | Dòng thiếu vật tư khái quát | Bị bỏ qua và **được đếm** vào báo cáo |

### 9.5 Vòng Excel định mức

| # | Tình huống | Kết quả mong đợi |
|---|---|---|
| N-36 | File chỉ chứa một mức, hệ đang có thêm hai mức khác | Hai mức kia **giữ nguyên** |
| N-37 | Bỏ một dòng vật tư khỏi một mức trong file | Dòng đó bị xoá **đúng ở mức đó**, các mức khác không đụng |
| N-38 | File có loại khởi động hoàn toàn mới | Được thêm vào, không ảnh hưởng loại cũ |
| N-39 | File có giá trị điều kiện sai chính tả | **Chặn cả lần nhập**, chỉ ra đúng số dòng và giá trị sai, **chưa có gì bị thay đổi** |
| N-40 | File có khối lượng âm, bằng 0, hoặc không phải số | Chuẩn hoá về 1 và **có báo cáo**, không im lặng |
| N-41 | Trước khi ghi | Hộp xác nhận nói rõ bao nhiêu mức sẽ đổi, bao nhiêu mức giữ nguyên, bao nhiêu dòng bị bỏ qua |

### 9.6 Vòng Excel danh sách phụ tải

| # | Tình huống | Kết quả mong đợi |
|---|---|---|
| N-42 | Xuất danh sách phụ tải rồi nhập lại | Khớp 100%: loại, công suất, số lượng, nhãn hiệu, tên tải, cờ isolator, nhãn hiệu isolator, và cả bảy tín hiệu |
| N-43 | File có mức công suất chưa có định mức | Cảnh báo **trước khi nhập**, nói rõ mức nào |
| N-44 | Nhập mặc định | Là **thêm vào** danh sách hiện có |
| N-45 | Chọn thay thế toàn bộ | Phải gõ đúng chữ xác nhận, gõ sai thì huỷ và không đổi gì |
| N-46 | File dùng cột mô tả kiểu cũ thay cho cột tên tải | Vẫn đọc ra tên tải |
| N-47 | Nhãn hiệu lạ, loại khởi động lạ | Ép về mặc định trong danh sách cho phép, có ghi nhận; hãng tuỳ chỉnh hợp lệ thì **giữ nguyên** |

### 9.7 Lưu trữ, dự án, sao lưu

| # | Tình huống | Kết quả mong đợi |
|---|---|---|
| N-48 | Kho lưu trữ của trình duyệt đầy | Người dùng thấy cảnh báo rõ ràng, **không** mất dữ liệu im lặng |
| N-49 | Tải lại trang sau khi đang làm dở | Dự án đang mở được nạp lại đủ ba phần: phụ tải, dòng thêm tay, ghi đè |
| N-50 | Tải lại trang ngay sau khi vừa mở một dự án rỗng | **Không** ghi trạng thái rỗng đè lên dự án có dữ liệu |
| N-51 | Đóng tab khi vừa sửa xong chưa tới một giây | Trình duyệt cảnh báo còn thay đổi chưa lưu |
| N-52 | Chuyển sang dự án khác | Dự án đang mở được lưu trước |
| N-53 | Sao lưu rồi khôi phục trên máy trắng | Thư viện, định mức, nhãn hiệu, khai báo nhãn hiệu, dự án — về đủ |
| N-54 | Khôi phục file sao lưu hỏng hoặc sai lược đồ | Bị từ chối toàn bộ, **không** khôi phục một phần |
| N-55 | Khôi phục file sao lưu đời cũ, thiếu phần khai báo nhãn hiệu | Vẫn khôi phục được; phần thiếu rơi về suy luận theo tên và cho ra BOQ đúng |

---

## 10. LOGIC KHÔNG NÊN MANG SANG BẢN VIẾT LẠI

Không phải mọi thứ đang chạy đều đáng giữ. Bốn nhóm sau nên chết cùng bản cũ.

**1 — Hai đường tra cứu song song cho cùng một việc.**
Hiện có một đường tra theo mảng và một đường tra theo chỉ mục, cùng tồn tại trong một hàm, phải giữ
đồng bộ hành vi bằng tay. Đường mảng giờ chỉ còn bộ kiểm thử dùng. Bản mới nên có **một** cách tra.

**2 — Hộp thoại của trình duyệt làm cửa quyết định nghiệp vụ.**
Bốn mươi ba điểm trong hệ thống dùng hộp xác nhận hoặc hộp nhập của trình duyệt để quyết định những
việc phá huỷ dữ liệu. Nội dung nghiệp vụ — bao nhiêu mức bị đổi, bao nhiêu bản ghi bị xoá — đang
nằm trong chuỗi ghép giữa mã giao diện. Hệ quả: không kiểm thử tự động được, không hiển thị được
bảng so sánh trước/sau, không dịch được. Bản mới nên có **một** cơ chế xác nhận dùng chung, nhận
vào bảng so sánh và mức độ nguy hiểm.

**3 — Danh sách khoá lưu trữ liệt kê bằng tay ở nhiều nơi.**
Hiện danh sách được viết tay ở hai chỗ và đã lệch nhau: hai mục không ai ghi vẫn nằm trong bản sao
lưu, còn một mục đang dùng thật thì bị bỏ quên. Bản mới nên có **một** bản khai báo duy nhất về
"những gì thuộc dữ liệu nền" và "những gì thuộc dự án", và mọi thao tác sao lưu, xoá, di trú đều
đọc từ đó.

**4 — Bộ kiểm thử chép lại logic sản phẩm.**
Bộ kiểm thử lớn nhất repo không gọi tới mã sản phẩm mà chép lại bốn đoạn logic vào chính file kiểm
thử rồi kiểm bản chép. Nó luôn xanh bất kể mã sản phẩm đúng hay sai. Trong bản mới, mọi bài kiểm
thử phải gọi thẳng vào phần đang được kiểm; không có ngoại lệ.

---

## 11. THỨ TỰ ĐỌC KHI BẮT TAY REFACTOR

Gợi ý trình tự để không phải đọc cả tài liệu mới bắt đầu được.

| Việc định làm | Đọc trước |
|---|---|
| Đụng vào cách sinh BOQ | §2, §5.1, R-T1→R-T7, R-L1→R-L3, I-03, I-04 |
| Đụng vào nhãn hiệu | §6.1 toàn bộ, I-01, I-06, I-11, và các mục nghiệm thu N-01→N-10 |
| Đụng vào bảng tổng hợp hoặc xuất file | R-S1→R-S4, R-E1→R-E6, I-07, I-08, I-32, ?-02 |
| Đụng vào bất kỳ đường nhập nào | §6.8 toàn bộ (bảng bốn cửa), R-M1→R-M10, I-19, I-24, I-28 |
| Đụng vào lưu trữ hoặc dự án | §4.3, R-P1→R-P6, R-K1→R-K4, I-16, I-35, I-40, ?-09 |
| Đụng vào phần hệ luật phụ thuộc đang tắt | ?-10 **trước tiên** — quyết định chôn hay hồi sinh trước khi đọc tiếp |
| Chuẩn bị lưới an toàn trước khi sửa bất cứ gì | §9 toàn bộ |

---

## 12. GIỚI HẠN CỦA TÀI LIỆU NÀY

- Mọi phát biểu rút ra từ việc **đọc mã nguồn**, không phải từ đặc tả gốc. Nếu có đặc tả nghiệp vụ
  bằng văn bản ở nơi khác và nó mâu thuẫn với tài liệu này, **đặc tả gốc đúng, tài liệu này sai** —
  mã nguồn chỉ cho biết hệ thống đang làm gì, không cho biết nó *nên* làm gì.
- Hai tệp tài liệu nghiệp vụ trong repo (`Logic.docx` và `Logic theo Group.xlsx`) **chưa được đọc**.
  Chúng nhiều khả năng là đặc tả gốc của phần hệ luật phụ thuộc đang tắt, và ảnh hưởng trực tiếp tới
  ?-10.
- Bộ kiểm thử **chưa chạy lại được** trong phiên lập tài liệu này vì lý do môi trường. Các mục
  nghiệm thu ở §9 rút từ tên và nội dung bài kiểm thử cùng nhật ký kiểm thử tay trong hai tài liệu
  kế hoạch — cần chạy lại một lượt để lấy mốc thật trước khi dùng làm hợp đồng.
- Phần giao diện của hai màn hình lớn (bảng Admin và bảng chi tiết) chỉ được đọc ở mức các điểm
  quyết định và điểm ghi dữ liệu; phần trình bày thuần tuý không đọc hết. Không ảnh hưởng tới các
  quy tắc nghiệp vụ ở trên, nhưng có thể còn chi tiết hiển thị chưa được ghi nhận.

---

*Lập bởi Claude Opus 5 — 12/09/2026. Tài liệu chỉ diễn giải logic; không chứa mã nguồn và không đề
xuất hiện thực cụ thể. Mọi tham chiếu `file:line` trỏ về trạng thái mã nguồn ngày 12/09/2026 và sẽ
hết hiệu lực sau khi refactor — khi đó tài liệu này nên được cập nhật lại phần bằng chứng, còn phần
quy tắc và bất biến thì giữ nguyên.*
