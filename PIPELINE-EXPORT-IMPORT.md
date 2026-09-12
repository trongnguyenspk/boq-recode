# NGHIÊN CỨU PIPELINE EXPORT / IMPORT — BOQ Generator

> **Ngày:** 11/09/2026 · **Người lập:** Claude Opus 5
> **Câu hỏi gốc:** làm sao export/import an toàn? Chỉ dùng JSON thì sửa lặt vặt template / thêm thiết bị mới rất khó.
> **Trạng thái:** NGHIÊN CỨU + THIẾT KẾ.
> **ĐÃ THI CÔNG (11/09/2026):** gói **vá nhanh** (P1 + P3) và **hồi sinh 3 hàm chết** (§1.1).
> Pha A→D ở §4 vẫn còn nguyên, chưa làm. Chi tiết ở §6 cuối tài liệu.
> **Đọc kèm:** `PLAN-BRAND-MODEL-2026-09-11.md` (§9 nhật ký thi công brand model)

---

## 1. Hiện trạng — bản đồ đầy đủ các đường vào/ra

Đã grep xác minh toàn bộ `src/`. Có **6 đường xuất** và **5 đường nhập**, mỗi đường một ngữ nghĩa khác nhau, **không đường nào biết đường nào**.

| # | Đường | File | Ngữ nghĩa khi nhập | Caller |
|---|---|---|---|---|
| E1 | `exportLibraryToExcel` | `Product_Library.xlsx` | — | Admin → Products |
| E2 | `exportTemplatesToExcel` | `Starter_Templates.xlsx` | — | Admin → Templates |
| E3 | `exportMatchKeysToExcel` | `Match_Keys_Matrix.xlsx` | — | Admin → Match Keys |
| E4 | `exportToExcel` | BOQ kết quả | chỉ xuất, không nhập lại | Nút Export BOQ |
| E5 | `BackupRestoreModal` | `boq-backup-*.json` | ghi đè toàn bộ localStorage + reload | Nút Back-up/Restore |
| E6 | `exportInputToExcel` | `BOQ_Input_Data.xlsx` | — | **KHÔNG CÓ CALLER** |
| I1 | `importLibraryFromExcel` | ↑E1 | **MERGE** (mặc định) / REPLACE (gõ `REPLACE`) | Admin → Products |
| I2 | `importTemplatesFromExcel` | ↑E2 | **REPLACE TOÀN BỘ** (chỉ một `confirm()`) | Admin → Templates |
| I3 | `importMatchKeysFromExcel` | ↑E3 | MERGE + báo cáo | Admin → Match Keys |
| I4 | `BackupRestoreModal` | ↑E5 | ghi đè toàn bộ, **không có hoàn tác** | Nút Back-up/Restore |
| I5 | `importStartersFromExcel` | ↑E6 | — | **KHÔNG CÓ CALLER** |
| — | `downloadImportTemplate` | file mẫu Input | — | **KHÔNG CÓ CALLER** |

### 1.1 Ba hàm CHẾT (không nút nào gọi)

`exportInputToExcel`, `importStartersFromExcel`, `downloadImportTemplate`.

⚠️ Đáng chú ý: handoff NGU-5 ghi đã "vá 2 cột `IsolatorBFP`/`EstopBFP` thiếu trong Excel" và "thêm cột `IsolatorEstopFB`" — nhưng **cả hai hàm được vá đều không có caller**. Tức là vòng export/import dữ liệu Input hiện **không tồn tại trên UI**. Mục §3.4 của handoff bảo "ai giữ file mẫu cũ thì tải lại qua nút Download Import Template" — **nút đó không có**.

### 1.2 Bảy điểm yếu của pipeline hiện tại

| # | Điểm yếu | Hậu quả thực tế |
|---|---|---|
| P1 | **Vắng mặt = xoá.** `importTemplatesFromExcel` dựng lại `templates` từ đầu bằng đúng những dòng có trong file ⇒ starter type / mức công suất nào không có trong file sẽ **biến mất**. | Sửa một dòng DOL 5.5kW bằng file xuất từ tuần trước ⇒ **mất sạch** các type/power thêm sau đó. Chỉ có một `confirm()` tiếng Anh chung chung. |
| P2 | **Không có ngữ nghĩa XOÁ.** Không file nào diễn đạt được "bỏ linh kiện này". | Muốn xoá phải vào UI bấm từng cái, hoặc dùng REPLACE/Clear Data (dao mổ trâu). |
| P3 | **`Condition` không được kiểm tra.** `excel-import.ts:168`: `(row['Condition'] \|\| 'always') as ComponentCondition` — ép kiểu trần, `VALID_CONDITIONS` trong `template-validation.ts:40` **không được dùng ở đây**. | Gõ nhầm `themal` thay vì `thermal` ⇒ linh kiện **không bao giờ xuất hiện** trong BOQ, **không một cảnh báo nào**. Đúng họ với lỗi P0-1 cũ. |
| P4 | **Không có dấu phiên bản trên file Excel.** Không cách nào phân biệt file xuất hôm nay với file xuất 3 tháng trước. | App phải đoán qua sự có/không của cột (`BrandSensitive`…). Người dùng không biết mình đang cầm file đời nào. |
| P5 | **Không có xem trước (dry-run).** Mọi import ghi thẳng, chỉ có `confirm()` với con số tổng. | Không ai biết trước dòng nào sẽ bị sửa/xoá. Sai rồi mới biết. |
| P6 | **Không có hoàn tác.** `BackupRestoreModal` ghi đè localStorage rồi `location.reload()`. | Restore nhầm file = mất trắng dữ liệu đang làm. |
| P7 | **Không kiểm tra chéo giữa các bảng.** Template có thể tham chiếu `matchKey` không tồn tại; library có thể chứa brand không nằm trong danh sách. | Sinh hàng loạt dòng `NOT_FOUND` mà chỉ phát hiện được sau khi đã ghi. |

### 1.3 Vì sao "chỉ dùng JSON" không khả thi — đúng như anh nói

JSON backup là **ảnh chụp toàn bộ trạng thái**. Nó an toàn cho việc sao lưu/khôi phục, nhưng để sửa một dòng template thì phải:

1. Mở file JSON ~vài trăm KB, tìm đúng nhánh `templates.DOL["5.5"]`.
2. Sửa tay, giữ đúng cú pháp JSON (sai một dấu phẩy là hỏng cả file).
3. Restore **toàn bộ** → ghi đè cả library, brands, projects, meta — kể cả những thứ không định đụng tới.

Tức là JSON **không có đơn vị thay đổi nhỏ hơn "toàn bộ"**. Đó chính là lý do Excel phải tồn tại — nhưng Excel hiện tại lại thiếu đúng những thứ khiến nó an toàn.

---

## 2. Nguyên tắc thiết kế

> **JSON = ảnh chụp. Excel = bản vá.**
>
> - **JSON** chỉ dùng cho: sao lưu định kỳ, khôi phục sau sự cố, chuyển máy. Ngữ nghĩa **thay thế toàn bộ** — và phải có hoàn tác.
> - **Excel** chỉ dùng cho: sửa có chủ đích từng dòng. Ngữ nghĩa **hợp nhất (upsert) + xoá tường minh**. **Vắng mặt KHÔNG BAO GIỜ có nghĩa là xoá.**

Bốn quy tắc bắt buộc cho mọi đường nhập:

1. **Khoá ổn định** — mỗi dòng phải có một khoá xác định được bản ghi đích, không phụ thuộc thứ tự.
2. **Ý định tường minh** — muốn xoá phải ghi rõ `delete`, không suy ra từ việc thiếu dòng.
3. **Xem trước rồi mới ghi** — luôn có bước diff + preview, người dùng bấm Áp dụng mới ghi.
4. **Luôn có đường lùi** — tự chụp snapshot trước khi ghi, có nút Hoàn tác.

---

## 3. Thiết kế đề xuất

### 3.1 Một workbook, nhiều sheet — `BOQ_Workbook.xlsx`

Thay 3 file rời bằng **một file duy nhất** (vẫn giữ 3 nút export cũ để không phá thói quen — xem §3.6).

| Sheet | Vai trò | Cột |
|---|---|---|
| `_Meta` | Dấu phiên bản, không sửa tay | `SchemaVersion`, `ExportedAt`, `Counts_Products`, `Counts_MatchKeys`, `Counts_Templates` |
| `Products` | Toàn bộ library, **kể cả món không có MatchKey** | `Action`, `RowKey`, `MatchKey`, `Brand`, `Code`, `iBomCode`, `Description`, `Unit`, `Price` |
| `MatchKeys` | Khai báo brand + ma trận mã theo hãng | `Action`, `MatchKey`, `BrandSensitive`, `Category`, `Description`, `Unit`, `<Brand>_Code`, `<Brand>_iBomCode` |
| `Templates` | Định mức theo starter | `Action`, `StarterType`, `Power`, `ComponentMatchKey`, `Quantity`, `Condition` |
| `Brands` | Danh sách nhãn hiệu | `Action`, `Brand` |
| `Starters` *(tuỳ chọn)* | Input dự án — **hồi sinh E6/I5 đang chết** | `Action`, `Type`, `Power`, `Quantity`, `LoadName`, `Brand`, `Isolator`, `IsolatorBrand`, 7 cột tín hiệu |

### 3.2 Cột `Action` — chìa khoá của toàn bộ thiết kế

| Giá trị | Ý nghĩa |
|---|---|
| *(rỗng)* hoặc `upsert` | Thêm nếu chưa có, cập nhật nếu đã có. **Mặc định** — người dùng không phải học gì thêm. |
| `delete` | Xoá đúng bản ghi mà khoá dòng này trỏ tới. |
| `skip` | Bỏ qua dòng này. Dùng để giữ dòng làm tham chiếu mà không áp dụng. |
| — | **Dòng không có mặt trong file ⇒ KHÔNG bị đụng tới.** Đây là điểm khác biệt căn bản với `importTemplatesFromExcel` hiện tại (P1). |

### 3.3 Khoá ổn định từng sheet

| Sheet | Khoá |
|---|---|
| `Products` | `MatchKey\|Brand` khi có MatchKey; ngược lại `RowKey` (= `id` sinh sẵn khi export) |
| `MatchKeys` | `MatchKey` |
| `Templates` | `StarterType\|Power\|ComponentMatchKey` |
| `Brands` | `Brand` |
| `Starters` | `RowKey` |

`RowKey` do app sinh khi export và **không được sửa tay** — có ghi chú ngay trên header.

### 3.4 Quy trình nhập 3 bước

```
Đọc file  →  Đối chiếu sinh DIFF  →  Modal XEM TRƯỚC  →  [Áp dụng]  →  Ghi + snapshot hoàn tác
                                          ↑
                                    dừng được ở đây
```

Modal xem trước hiển thị, **tách theo từng sheet**:

- **Thêm mới** N — liệt kê khoá.
- **Cập nhật** N — liệt kê khoá + trường nào đổi (`Code: LC1D09 → LC1D12`).
- **Xoá** N — **luôn bung đầy đủ danh sách**, không bao giờ chỉ hiện con số.
- **Cảnh báo** N — xem §3.5.
- **Bỏ qua** N — thiếu khoá / `Action=skip`.

Không có nút "Áp dụng tất" khi có cảnh báo mức *lỗi*; phải sửa file rồi nhập lại.

### 3.5 Kiểm tra chéo trước khi ghi

| Kiểm tra | Mức | Xử lý |
|---|---|---|
| `Condition` không thuộc `VALID_CONDITIONS` | **Lỗi** | Chặn — vá P3, hiện đang im lặng |
| `ComponentMatchKey` không tồn tại (sau khi áp dụng cả file) | Cảnh báo | Cho qua, nêu rõ sẽ sinh dòng `NOT_FOUND` |
| `Brand` lạ, chưa có trong danh sách | Cảnh báo | **Hỏi "thêm vào danh sách nhãn hiệu?"** thay vì âm thầm ép về Schneider — vá M15 |
| MatchKey brand-agnostic có >1 bản ghi | Cảnh báo | Nêu key, đề nghị dọn |
| `Quantity` ≤ 0 hoặc NaN | Cảnh báo | Về 1, có nêu |
| `SchemaVersion` cũ hơn app | Thông báo | Chạy bộ chuyển đổi tương thích, nêu rõ mục nào không có trong file cũ |
| `_Meta.Counts` lệch số dòng thật | Cảnh báo | Dấu hiệu file bị cắt/sửa hỏng |

### 3.6 Lưới an toàn — snapshot & hoàn tác

- Trước **mọi** thao tác ghi (Excel import, JSON restore, Clear Data, REPLACE), tự chụp toàn bộ state vào `boq_undo_snapshot` (kèm nhãn thời gian + tên thao tác).
- Thêm nút **"Hoàn tác lần nhập gần nhất"** trong Back-up/Restore.
- Giữ **1 snapshot** là đủ — tránh phình localStorage (đã có `safeSaveToStorage` bắt QuotaExceeded).

### 3.7 Tương thích ngược

- Ba nút export cũ **giữ nguyên**, nhưng xuất ra định dạng mới (có `Action` + `_Meta`).
- Ba đường import cũ vẫn đọc được file cũ: thiếu cột `Action` ⇒ coi toàn bộ là `upsert`, **không bao giờ xoá**. ⇒ Riêng điều này đã vá xong P1 cho `Starter_Templates.xlsx` cũ.
- Thêm nút **Export Workbook** / **Import Workbook** cho file gộp.

---

## 4. Nếu thi công — 4 pha

| Pha | Nội dung | Ước lượng |
|---|---|---|
| **A** | Lõi diff thuần: `buildDiff(sheet, rows, current)` + `applyDiff` + validate chéo, không đụng UI. Test trước, UI sau. | 3–4 giờ |
| **B** | Modal Xem trước dùng chung cho cả 5 sheet. | 2–3 giờ |
| **C** | Snapshot + nút Hoàn tác; gắn vào cả 4 đường ghi. | 1,5 giờ |
| **D** | Workbook gộp + `_Meta` + bộ chuyển đổi file cũ; hồi sinh hoặc xoá hẳn 3 hàm chết ở §1.1. | 3 giờ |
| | **Tổng** | **~10 giờ** |

**Cắt gọt được:** Pha A + C đã chặn gần hết rủi ro mất dữ liệu. Pha B là thứ khiến pipeline *dùng được hàng ngày*. Pha D là tiện lợi.

**Vá nhanh tách riêng (30 phút, độc lập với mọi pha):** chặn `Condition` không hợp lệ ở `importTemplatesFromExcel` (P3) và đổi `importTemplatesFromExcel` từ REPLACE sang MERGE (P1). Hai thứ này đang là rủi ro mất dữ liệu cao nhất trong toàn pipeline.

---

## 5. Quy trình AN TOÀN cho anh — dùng được NGAY hôm nay, chưa cần sửa gì

1. **Trước mọi lần nhập: Back-up/Restore → Export JSON.** Đây là đường lùi duy nhất đang có.
2. **Thêm thiết bị mới / sửa mã theo hãng** → dùng **Match Keys Matrix**. Đường này đã an toàn sau đợt sửa brand model: merge, không xoá, có báo cáo chi tiết.
3. **Sửa định mức template** → **KHÔNG dùng Import Templates** cho tới khi vá xong P1. Nó REPLACE toàn bộ. Hãy sửa trực tiếp trong **Admin → Templates** trên UI.
4. **Cập nhật giá / mô tả hàng loạt** → **Product_Library.xlsx**, luôn chọn **GỘP (OK)**, không chọn REPLACE.
5. **Không bao giờ** Clear Data rồi import file cũ.
6. Sau mỗi đợt nhập: mở **Admin → Match Keys**, dọn key có badge `!`.

---

*Nghiên cứu bởi Claude Opus 5 — 11/09/2026. Mọi `file:line` và khẳng định "không có caller" đều đã grep xác minh trên thư mục `" - Copy"`.*

---

## 6. ĐÃ THI CÔNG — 11/09/2026

### 6.1 Gói vá nhanh

| Mã | Nội dung | File |
|---|---|---|
| **P3** | `Condition` đọc từ Excel nay được **kiểm tra** thay vì ép kiểu trần. Thêm `normalizeCondition()` + export `VALID_CONDITIONS` dùng chung một danh sách. Sai chính tả ⇒ **chặn cả lần nhập**, báo kèm **số dòng Excel** và giá trị sai. | `template-validation.ts`, `excel-import.ts`, `AdminPanel.tsx` |
| **P1** | `Import Templates` từ **REPLACE TOÀN BỘ** → **MERGE theo từng mức (type, power)**. Mức có trong file thì lấy theo file (vẫn xoá được linh kiện bằng cách bỏ dòng); mức **không** có trong file thì **giữ nguyên**. Hộp thoại xác nhận liệt kê rõ "sẽ cập nhật N mức / giữ nguyên M mức". | `excel-import.ts`, `AdminPanel.tsx` |

Hàm mới, thuần, test được không cần trình duyệt: `parseTemplateRows`, `mergeTemplates`, `untouchedTiers`.
`importTemplatesFromExcel` nay trả `{ templates, report }` thay vì trả thẳng object templates.

### 6.2 Hồi sinh 3 hàm chết

Thêm 3 nút vào đầu thẻ **Input Wizard**: **Xuất Input** · **Nhập Input** · **File mẫu**.

- **Nhập Input** dùng whitelist động: starter type lấy từ template đang có, brand lấy từ danh sách brand động ⇒ không ép nhầm về `DOL`/`Schneider`.
- Cảnh báo trước nếu file có mức công suất **chưa có template** (sẽ không sinh ra vật tư nào).
- Mặc định **THÊM** vào danh sách; **THAY THẾ** phải gõ đúng chữ `REPLACE`.
- **Vá kèm:** `loadName` (tên phụ tải) trước đây bị bỏ trống khi xuất (`Description: ''`) và `sanitizeStarter` không hề đọc lại ⇒ round-trip là mất tên phụ tải. Nay xuất cột `LoadName` (giữ luôn `Description` cho tương thích file cũ) và đọc lại theo thứ tự `LoadName` → `Description`.

### 6.3 Nghiệm thu

| | Trước | Sau |
|---|---|---|
| `npx tsc -b --force` | 0 lỗi | **0 lỗi** |
| `npx vitest run` | 126/126 | **142/142** (+16 test mới) |
| `npx vite build` | OK | **OK** |
| `npx eslint` (cùng 8 file) | 58 lỗi có sẵn | **56** |

File test mới: `src/utils/template-import.test.ts`.

**Kiểm thử trên app thật** (`vite dev`, gọi thẳng module đang chạy):

| Kịch bản | Kết quả |
|---|---|
| File chỉ chứa `DOL 5.5kW`, hệ đang có thêm `DOL 0.18kW` + `VFD 11kW` | Hai mức kia **giữ nguyên** ✔ — trước đây mất sạch |
| Bỏ một linh kiện khỏi mức `DOL 5.5kW` trong file | Linh kiện đó bị xoá đúng mức đó ✔ |
| `Condition = "themal"` và `Condition = "Iso/Estop FB"` | Cả hai **bị chặn**, báo đúng dòng 3 và dòng 4 ✔ |
| Ba nút Input Wizard | Hiện đủ trên UI ✔ |
| Round-trip Input qua file `.xlsx` thật | **Khớp 100%**: type, power, quantity, brand, loadName, isolator, isolatorBrand, cả 7 tín hiệu ✔ |

> Lưu ý nghiệp vụ: nhãn hiển thị trên UI là `Iso/Estop FB`, nhưng giá trị hợp lệ trong file Excel là
> `isolator_estop_FB`. Ai copy nhãn UI vào cột `Condition` sẽ bị chặn kèm thông báo rõ — trước đây
> nó lọt vào template và linh kiện im lặng biến mất khỏi BOQ.

### 6.4 Còn lại

Pha A→D ở §4 chưa làm. Sau gói vá này, rủi ro còn lại theo thứ tự ưu tiên:

1. **P6 — không có hoàn tác** (Pha C, ~1,5 giờ). Restore JSON nhầm file vẫn mất trắng.
2. **P5 — không có xem trước** (Pha B). Hiện chỉ có `confirm()` liệt kê số liệu, chưa có diff từng dòng.
3. **P2 — chưa có cột `Action`** (Pha A/D). Xoá sản phẩm / brand vẫn phải làm trên UI.
4. **P4 — Excel chưa có dấu phiên bản** (Pha D).
