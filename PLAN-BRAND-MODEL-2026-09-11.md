# KẾ HOẠCH SỬA BRAND MODEL — BOQ Generator

> ## ✅ ĐÃ THI CÔNG XONG — 11/09/2026
>
> Toàn bộ 6 pha đã hoàn thành và nghiệm thu trên chính thư mục này.
>
> | Nghiệm thu | Trước | Sau |
> | --- | --- | --- |
> | `npx tsc -b --force` | 0 lỗi | **0 lỗi** |
> | `npx vitest run` | 73/73 | **118/118** (+45 test mới) |
> | `npx vite build` | OK | **OK** |
> | `npx eslint` (7 file đụng tới) | 55 lỗi có sẵn | **54** (không thêm lỗi mới) |
>
> Kiểm thử thủ công trên app thật (`vite dev`) đã xác nhận N1, N2, N3, N6, N7 và vòng
> round-trip Matrix trên **toàn bộ 28 sản phẩm thật**: khớp 100%, giữ đủ 20 bản ghi OMEGA.
>
> **Hai lỗi PHÁT SINH chỉ lộ ra khi test trên dữ liệu thật** (không có trong bản phân tích ban đầu):
> 1. Matrix chỉ có MỘT cột `iBomCode` dùng chung ⇒ import ghi đè iBomCode giữa các brand.
>    Vì `ibomCode` là khoá gộp của `generateSummary`, hai biến thể khác nhau bị nhập làm một dòng.
>    → Sửa: thêm cột `<Brand>_iBomCode` cho từng brand.
> 2. Toàn bộ 20 món MCT/PCT thật có `code` RỖNG (chỉ định danh bằng `ibomCode`). Logic import chỉ
>    xét cột `_Code` nên coi chúng là ô trống ⇒ **OMEGA vẫn biến mất**.
>    → Sửa: một ô brand được coi là có dữ liệu khi `_Code` **hoặc** `_iBomCode` khác rỗng.
>
> Xem §9 cuối tài liệu để biết danh sách file đã sửa.

> **Ngày lập:** 11/09/2026
> **Người lập plan:** Claude Opus 5
> **Repo thi công:** `F:\Cong Trinh\_ProjectNguyenCode_anti_Codex_Claude\BOQ\boq-generator-main_20260824 - Copy`
> **Đọc kèm:** `SESSION-HANDOFF-2026-09-11.md` (§4 "Những điều PHẢI biết", §6 "Quy ước làm việc")

---

## 0. Nguyên tắc thi công (bắt buộc)

1. **Không sửa đoạn nào khi chưa nêu rõ đoạn đó đang làm gì.**
2. Mỗi pha phải chạy `npx vitest run` + `npx tsc -b` trước khi sang pha kế tiếp.
3. `tsconfig.app.json` bật `verbatimModuleSyntax` + `erasableSyntaxOnly` ⇒ mọi import chỉ dùng làm kiểu **phải** là `import type`; **cấm** `enum` / `namespace`.
4. `export type Brand = string` ⇒ **TypeScript không bắt được lỗi brand**. Mọi đảm bảo phải đến từ unit test, không từ compiler.
5. Toàn bộ thay đổi phải **giữ nguyên 73 test hiện có** — đặc biệt test có chữ `XSS` / `Hacker_Brand_XSS` trong `import-validation.test.ts` (chống injection từ Excel).

### Baseline đã đo (11/09/2026, trên chính thư mục này)

```
npx tsc -b      -> 0 lỗi
npx vitest run  -> 7 file, 73/73 pass
```

### Vùng cấm — KHÔNG được chạm

- `src/utils/logic-engine.ts` — thuật toán phân bổ pha busbar / co nhiệt / MCT, `SIZE_MAPPING`. (Handoff §6)
- `src/utils/common-logic.ts`, `src/components/CommonView.tsx` — luồng Common Logic đang bị ẩn (`ENABLE_COMMON_LOGIC = false`).
- Mọi nhánh điều kiện NGU-5 (`isolator_estop_FB`) trong `boq-logic.ts` / `template-validation.ts`.
- Không đổi `Product.brand` của dữ liệu người dùng thành rỗng (xem §3.2 — OMEGA là brand THẬT, phải giữ).

---

## 1. Chẩn đoán gốc rễ

> `brand` được thiết kế là **trường bắt buộc của mọi Product** (`src/types/index.ts:1,10`), trong khi nghiệp vụ chỉ có **một nhóm nhỏ thiết bị phụ thuộc nhãn hiệu**. Toàn bộ tri thức "món nào phụ thuộc brand" bị nhét vào **một mảng 7 tiền tố chuỗi** ở `src/utils/boq-logic.ts:6` — nơi DUY NHẤT trong repo biết điều đó. Mọi tầng còn lại (Admin UI, Brand Matrix, export, import) đều **giả định mọi món đều có brand**, nên chúng liên tục đóng dấu brand lên hàng không phụ thuộc brand; rồi `byKey` "ai vào trước thắng" biến cái dấu đó thành brand hiển thị trên BOQ.

### 1.1 Bảng mắt xích lỗi (đã grep xác minh trên thư mục này)

| # | Vị trí | Đang làm gì | Vì sao sai |
|---|---|---|---|
| M1 | `src/utils/boq-logic.ts:5-8` | `isSwitchingDevice()` — whitelist 7 tiền tố `MCB_ MCCB_ CONTACTOR_ RELAY_NHIET THERMAL_ ISOLATOR_ ISO_` | Phân loại thiết bị suy ra từ **cách gõ chuỗi**. Sót `CB_ ACB_ ELCB_ RCCB_ MPCB_ KHOI_DONG_TU_` và mọi key chữ thường ⇒ thiết bị đóng cắt bị coi là brand-agnostic, đổi brand ở Detail **vô tác dụng**. Ngược lại phụ kiện tên `ISO_TEM`, `THERMAL_SENSOR` bị ép theo brand starter ⇒ đẻ dòng `Missing … for <brand>`. |
| M2 | `src/utils/boq-logic.ts:32-34` | `createLibraryIndex().byKey` — `if (!byKey.has(k)) byKey.set(k, p)` | "Ai vào mảng `library` trước thì thắng". Brand hiển thị của hàng brand-agnostic **phụ thuộc thứ tự mảng**, tức phụ thuộc lịch sử import. Không tất định. |
| M3 | `src/utils/boq-logic.ts:128` | `brand: product.brand` | Gate ở dòng 101 chỉ quyết định **cách TRA CỨU**, không quyết định **giá trị GHI RA**. Hàng brand-agnostic vẫn bị in một brand cụ thể (do M2 chọn ra). |
| M4 | `src/utils/boq-logic.ts:107` | `item.matchKey.startsWith('ISO_')` để bật `isolatorBrand` | `'ISOLATOR_16A'.startsWith('ISO_') === false` (ký tự thứ 4 là `L`). ⇒ Isolator lấy **brand chính của starter**, bỏ qua ô "Isolator Brand", trừ khi component được gắn đúng `condition='isolator'`. Lệch với M1 vốn nhận cả hai tiền tố. |
| M5 | `src/utils/excel-import.ts:227-250` | `importMatchKeysFromExcel` → `brands.forEach(...)` | **Nhân bản MỌI matchKey ra MỌI brand** nếu ô `<brand>_code` có dữ liệu, không phân biệt loại thiết bị. `brands` mặc định `['Schneider','Mitsubishi','LS','Hyundai']` (`src/App.tsx:69`) ⇒ Schneider luôn được push trước ⇒ kết hợp M2 ⇒ **toàn BOQ ra Schneider**. |
| M6 | `src/utils/excel-export.ts:373-375` | `['Schneider','Mitsubishi','LS','Hyundai'].forEach(...)` | **Hard-code 4 cột brand.** Brand OMEGA / brand tự thêm **không có cột** ⇒ `code` bị rơi mất ngay khi xuất. Round-trip là **mất dữ liệu một chiều**. |
| M7 | `src/utils/excel-export.ts:360-369` | `refProduct = products[0]` | `Description` / `Unit` / `iBomCode` của cả matchKey lấy theo sản phẩm đầu tiên ⇒ mô tả riêng từng brand bị **đè phẳng**. |
| M8 | `src/utils/excel-import.ts:210-260` | import chỉ add/update | **Không bao giờ xoá.** Xoá trắng ô code trong Excel không xoá bản ghi cũ ⇒ brand "ma" tích tụ, rồi M2 vớ phải nó. Kết quả chỉ báo bằng `console.log` ở dòng 260 — người dùng không thấy. |
| M9 | `src/components/AdminPanel.tsx:952` | Nút **Clear Data**: `library.filter(p => !p.matchKey)` | Xoá sạch **cả 20 món MCT/PCT brand OMEGA** trong `src/data/library.ts`. Kết hợp M5+M6 ⇒ OMEGA không bao giờ quay lại. **Đây là kịch bản tái hiện chính xác "loạn nhãn hiệu"**: Clear Data → Import Matrix → tất cả thành Schneider. |
| M10 | `src/components/AdminPanel.tsx:471`<br>`src/components/DetailView.tsx:17` | Dropdown brand **hard-code 4 brand** | Product brand OMEGA mở ra sửa → `<select>` không có option khớp → hiển thị trống; chạm vào là ghi đè thành 1 trong 4. |
| M11 | `src/components/AdminPanel.tsx:1099-1133` | Brand Matrix `brands.map(...)` cho **mọi** matchKey | UI ép người dùng tạo 1 product/brand cho cả `MCT_50A`. Không có ô nào khai "món này không phân biệt nhãn hiệu". |
| M12 | `src/components/AdminPanel.tsx:199` | `brand: brands[0] \|\| 'Schneider'` | Tạo product từ Add Component đóng dấu Schneider vô điều kiện. |
| M13 | `src/App.tsx:68-75` vs `src/data/library.ts` | `brands` (localStorage `boq_brands`, mặc định 4) tách rời tập brand thật trong library (có OMEGA) | **Hai nguồn sự thật.** OMEGA vô hình với toàn bộ tầng quản trị brand dù nó nằm trong dữ liệu. |
| M14 | `src/utils/boq-logic.ts:147` | `brand: shouldRespectBrand ? targetBrand : 'Any'` | Chuỗi `'Any'` lọt vào cột "Nhãn hiệu" của Excel xuất ra như một brand giả. |
| M15 | `src/utils/import-validation.ts:57,98` | fallback `?? 'Schneider'` | Sai chính tả 1 ký tự trong Excel ⇒ món đó thành Schneider. Có `console.warn` (dòng 54) nhưng **không có UI nào hiển thị** ⇒ im lặng với người dùng. |

### 1.2 Dữ liệu nền (đã đếm trên `src/data/library.ts`, 28 sản phẩm)

| Brand | Số SP | matchKey |
|---|---|---|
| OMEGA | 20 | `MCT_*` (11), `PCT_*` (9) — **không phụ thuộc brand** |
| Schneider | 6 | `CONTACTOR_9A/12A`, `THERMAL_9A`, `MCB_32A`, `ISOLATOR_16A`, `ESTOP` |
| Mitsubishi | 2 | `CONTACTOR_9A`, `THERMAL_9A` |

⇒ Đúng 20/28 bản ghi seed là hàng **không phụ thuộc brand** nhưng vẫn mang brand cứng.

---

## 2. Mục tiêu nghiệm thu (định nghĩa "xong")

Sau khi thi công, các mệnh đề sau phải ĐÚNG và có test chứng minh:

- **N1.** Starter brand = Schneider, BOQ có `MCT_100A` ⇒ cột Nhãn hiệu của dòng MCT hiện **`OMEGA`**, không phải Schneider.
- **N2.** Đổi brand starter Schneider → Mitsubishi ⇒ **chỉ** dòng CB / contactor / relay nhiệt đổi; dòng MCT/PCT/phụ kiện **không đổi một ký tự nào**.
- **N3.** Bật Isolator + chọn Isolator Brand = LS ⇒ dòng `ISOLATOR_16A` lấy **LS**, không lấy brand chính. (sửa M4)
- **N4.** Xuất Match Key Matrix ⇒ file Excel **có cột `OMEGA_Code`** và ô code của MCT không rỗng. Nhập lại đúng file đó ⇒ library **giống hệt** trước khi xuất (deep-equal theo `matchKey|brand|code|ibomCode`).
- **N5.** Nhập Match Key Matrix **không** tạo thêm bản sao brand cho matchKey brand-agnostic.
- **N6.** Brand Manager và MỌI dropdown brand đều hiển thị **OMEGA** cùng brand tự thêm.
- **N7.** Kết quả `generateDetail` **tất định**: xáo trộn thứ tự mảng `library` không làm đổi brand của bất kỳ dòng BOQ nào.
- **N8.** 73 test cũ vẫn pass; `tsc -b` 0 lỗi.
- **N9.** (chốt Q1) Dòng `VFD_*` / `SOFT_STARTER_*` in **brand của bản ghi trong Product Library**, không đổi khi người dùng đổi brand starter.
- **N10.** (chốt Q1) matchKey đặt tên `CB_100A` / `ACB_*` / `ELCB_*` / `RCCB_*` / `MPCB_*` **từ nay theo brand starter** — trước đây bị bỏ sót.

---

## 3. Thiết kế mới

### 3.1 Quyết định kiến trúc: `brandSensitive` gắn ở cấp **MatchKey**, không ở cấp Product

Lý do: câu hỏi "món này có phụ thuộc nhãn hiệu không" là thuộc tính của **vai trò linh kiện** (CB, contactor, relay nhiệt), không phải của từng dòng sản phẩm. Template, Brand Matrix và BOQ đều đã key theo `matchKey`. Nếu đặt cờ ở Product thì N dòng cùng matchKey có thể mâu thuẫn nhau, phải hoà giải — phức tạp vô ích.

Phương án đã loại bỏ (ghi lại để không bàn lại):
- *Đặt `brandSensitive` trên Product*: mâu thuẫn giữa các dòng cùng key.
- *Chỉ cho phép sửa danh sách 7 tiền tố trong Admin*: vẫn là đoán chuỗi, không giải quyết M2 / M5 / M11.

### 3.2 Phân biệt hai khái niệm đang bị gộp làm một

| | Ý nghĩa | Quy tắc mới |
|---|---|---|
| **Brand hiển thị** (`Product.brand`) | Hãng sản xuất thật của món hàng. MCT **đúng là** hàng OMEGA. | **Luôn giữ nguyên**, in thẳng lên BOQ. KHÔNG đổi thành rỗng. |
| **Brand dùng để tra cứu** (`starter.brand` / `isolatorBrand`) | Lựa chọn của người dùng để chọn ra biến thể thiết bị đóng cắt. | **Chỉ áp** cho matchKey có `brandSensitive === true`. |

Đây là điểm mấu chốt: BOQ phải in `OMEGA` cho MCT — không in rỗng, cũng không in Schneider.

> **Phát biểu nghiệp vụ đã chốt (lời anh Nguyên, 11/09/2026):**
> *"Khi lựa chọn Brand trên Admin Panel chỉ ảnh hưởng đến nhãn hiệu của CB / contactor / relay nhiệt / Isolator. Ngoài ra, TẤT CẢ các thiết bị khác giữ brand như Product Library."*
>
> ⇒ `BRAND_SENSITIVE_CATEGORIES = ['BREAKER', 'CONTACTOR', 'THERMAL', 'ISOLATOR']` — **đúng 4 nhóm, chốt cứng.**
> ⇒ **VFD / Soft-starter KHÔNG** phụ thuộc brand: `VFD_5.5KW` in đúng brand của bản ghi trong Product Library, bất kể starter chọn hãng gì.

### 3.3 Kiểu dữ liệu mới (`src/types/index.ts`)

```ts
export type DeviceCategory =
    | 'BREAKER'      // MCB / MCCB / ACB / ELCB / RCCB / MPCB
    | 'CONTACTOR'
    | 'THERMAL'      // relay nhiệt
    | 'ISOLATOR'
    | 'DRIVE'        // VFD / soft starter
    | 'CT'           // MCT / PCT
    | 'ACCESSORY'    // estop, timer, đèn báo, nút nhấn…
    | 'CABLE'
    | 'OTHER';

export interface MatchKeyMeta {
    matchKey: string;
    category: DeviceCategory;
    brandSensitive: boolean;  // NGUỒN SỰ THẬT. category chỉ để gợi ý mặc định + hiển thị.
}

export type MatchKeyMetaMap = Record<string, MatchKeyMeta>;
```

### 3.4 Module mới `src/utils/brand-policy.ts` (nơi DUY NHẤT biết quy tắc brand)

```ts
// Giữ nguyên 7 tiền tố cũ CHỈ để seed migration + fallback cho key chưa khai báo.
export const LEGACY_SWITCHING_PREFIXES: string[]

// ĐÃ CHỐT (§8 Q1) — ĐÚNG 4 nhóm này, không thêm không bớt.
export const BRAND_SENSITIVE_CATEGORIES: DeviceCategory[] =
    ['BREAKER', 'CONTACTOR', 'THERMAL', 'ISOLATOR'];

export function inferCategory(matchKey: string): DeviceCategory
export function isBrandSensitive(matchKey: string, meta: MatchKeyMetaMap): boolean
export function categoryOf(matchKey: string, meta: MatchKeyMetaMap): DeviceCategory
export function seedMeta(library: Product[], templates: ...): MatchKeyMetaMap
export const BRAND_AGNOSTIC_LABEL = '—'   // thay cho chuỗi 'Any' ở M14
```

Quy tắc `isBrandSensitive`:

```
meta[matchKey]?.brandSensitive  ??  (inferCategory(matchKey) ∈ BRAND_SENSITIVE_CATEGORIES)
```

⇒ Khi `meta` rỗng, hành vi **giống hệt hôm nay** ⇒ 73 test cũ không đổi.

### 3.5 Lưu trữ

| Key localStorage | Trạng thái | Ghi chú |
|---|---|---|
| `boq_matchkey_meta` | **MỚI** | `MatchKeyMetaMap` |
| `boq_schema_version` | **MỚI** | chặn chạy migration nhiều lần |
| `boq_library`, `boq_brands`, `boq_templates` | giữ nguyên | |

Ghi qua `safeSaveToStorage` (`src/App.tsx:33`) để giữ cảnh báo QuotaExceeded.

---

## 4. Kế hoạch thi công — 6 pha

> Mỗi pha là **một commit độc lập**, tự chạy được, không làm vỡ pha trước.
> Cuối mỗi pha: `npx tsc -b` (0 lỗi) + `npx vitest run` (không giảm số test pass).

### PHA 0 — Cờ an toàn + chốt baseline · ~15 phút

- Thêm `export const ENABLE_BRAND_POLICY = true;` trong `src/App.tsx` (cùng chỗ, cùng kiểu với `ENABLE_COMMON_LOGIC` — theo đúng quy ước repo).
- Khi `false`, toàn bộ thay đổi của pha 2–5 phải rơi về hành vi cũ (`meta = {}`).
- Commit riêng, chưa đổi hành vi.

**Nghiệm thu:** 73/73 pass, `tsc -b` 0 lỗi.

---

### PHA 1 — Nền: kiểu + module `brand-policy` + test · ~1–2 giờ

| File | Việc |
|---|---|
| `src/types/index.ts` | Thêm `DeviceCategory`, `MatchKeyMeta`, `MatchKeyMetaMap` (§3.3). **Không** đụng `Product`, `BOMItem`, `StarterConfig`. |
| `src/utils/brand-policy.ts` | **File mới.** Viết đủ 6 hàm ở §3.4. |
| `src/utils/brand-policy.test.ts` | **File mới.** Xem §5 nhóm A. |

**Nghiệm thu:** 73 + (test mới) pass. Chưa có hành vi nào của app đổi (chưa ai gọi module này).

---

### PHA 2 — Sửa lõi sinh BOQ · ~2 giờ — **pha quan trọng nhất**

File: `src/utils/boq-logic.ts`

| Sửa | Từ | Thành |
|---|---|---|
| **2a** (M1) | `isSwitchingDevice(item.matchKey)` — dòng 101 | `isBrandSensitive(item.matchKey, meta)` |
| **2b** (M1) | hàm `isSwitchingDevice` dòng 5-8 | **Xoá**, chuyển tri thức về `brand-policy.ts`. |
| **2c** (M4) | `item.matchKey.startsWith('ISO_')` — dòng 107 | `categoryOf(item.matchKey, meta) === 'ISOLATOR'` |
| **2d** (M2) | `createLibraryIndex` dòng 32-34 | Thêm `byKeyAll: Map<string, Product[]>`. `byKey` chọn theo **quy tắc tất định**: ưu tiên bản ghi có `ibomCode` không rỗng → rồi `brand` A→Z → rồi `id` A→Z. **Không** phụ thuộc thứ tự mảng. |
| **2e** (M2) | — | Trả thêm `conflicts: string[]` — matchKey brand-agnostic có >1 bản ghi, để pha 5 cảnh báo. |
| **2f** (M14) | `brand: … : 'Any'` dòng 147 | `BRAND_AGNOSTIC_LABEL` (`'—'`). |
| **2g** | chữ ký `generateDetail(starters, library, templates)` | Thêm tham số thứ 4 `meta: MatchKeyMetaMap = {}` — **có giá trị mặc định** để không vỡ caller / test cũ. |

Caller cần cập nhật: `src/App.tsx` (nơi gọi `generateDetail` + `createLibraryIndex` trong `useMemo`).

**Nghiệm thu:** N1, N2, N3, N7 có test pass (§5 nhóm B). 73 test cũ vẫn pass.

---

### PHA 3 — Một nguồn sự thật cho danh sách brand · ~1 giờ

| File | Việc |
|---|---|
| `src/App.tsx:68-110` | **Không** đổi state `brands` (danh sách người dùng quản lý) và **không** ghi đè `boq_brands` — tránh vòng lặp ghi. Thêm `const allBrands = useMemo(() => union(brands, library.map(p => p.brand).filter(Boolean)), [brands, library])`. Truyền `allBrands` xuống các component. |
| `src/components/DetailView.tsx:17` | **Xoá** `const BRANDS = [...]`. Nhận `brands` qua prop từ `App.tsx`. Dùng ở dòng 324. |
| `src/components/AdminPanel.tsx:471` | Thay `['Schneider',…].map` → `brands.map` (giống hệt dòng 1194 đã đúng). |
| `src/components/InputWizard.tsx:24,26` | `useState<Brand>('Schneider')` → `useState<Brand>(brands[0] ?? 'Schneider')`. |
| `src/components/DetailView.tsx` (cạnh dòng 319) | Thêm chú thích UI: *"Nhãn hiệu chỉ áp dụng cho thiết bị đóng cắt"* — để người dùng hết ngộ nhận. |

**Nghiệm thu:** N6. Mở Brand Manager thấy OMEGA. Sau pha này `grep -rn "'Schneider', 'Mitsubishi', 'LS', 'Hyundai'" src/components` phải ra **0 kết quả**.

---

### PHA 4 — Sửa vòng Export/Import Match Key Matrix · ~3 giờ — **rủi ro cao nhất**

**4a. Export** — `src/utils/excel-export.ts:346-380`

- Chữ ký: `exportMatchKeysToExcel(library, brands, meta)`.
- Cột brand **động**: `union(brands, brand có thật trong library)` thay cho mảng cứng dòng 373 ⇒ có `OMEGA_Code`.
- Thêm cột **`BrandSensitive`** (`Yes` / `No`) lấy từ `meta`.
- Với dòng `BrandSensitive = No`: chỉ đúng **một** ô brand được điền (brand thật của món đó).
- M7: `Description` / `Unit` / `iBomCode` lấy theo bản ghi đầu tiên đã **sắp xếp tất định** (cùng quy tắc 2d), không phải `products[0]` theo thứ tự mảng.

**4b. Import** — `src/utils/excel-import.ts:191-266`

- Chữ ký: `importMatchKeysFromExcel(file, currentLibrary, brands, meta)`.
- Trả về `{ library, meta, report }` thay vì chỉ `Product[]`.
- Đọc cột `BrandSensitive` → cập nhật `meta`. Thiếu cột ⇒ giữ `meta` cũ; thiếu cả `meta` ⇒ dùng `inferCategory`.
- **Sửa M5:** nếu `brandSensitive === false` ⇒ **chỉ tạo/cập nhật 1 bản ghi** (ô brand đầu tiên không rỗng). Nếu có >1 ô không rỗng ⇒ đẩy vào `report.conflicts`, dùng ô đầu, **không** tạo phần còn lại.
- **Sửa M8:** thêm `report.cleared` — matchKey+brand có trong library nhưng ô code trong file đã bị xoá trắng. **Không tự xoá**; chỉ liệt kê để người dùng quyết.
- **Sửa M8:** bỏ `console.log` dòng 260, trả `report` cho UI.

**4c. UI** — `src/components/AdminPanel.tsx:913-952`

- Sau import: hiện **modal báo cáo** (added / updated / skipped / conflicts / cleared) thay cho `showToast` một dòng.
- **Sửa M9** — nút Clear Data (dòng 952): confirm phải nêu rõ *"sẽ xoá N sản phẩm, trong đó M sản phẩm thuộc brand không nằm trong danh sách brand hiện tại (vd OMEGA) và **sẽ KHÔNG được tạo lại** khi Import Matrix"*, và bắt gõ đúng chữ `CLEAR` (theo đúng khuôn mẫu P0-3 ở dòng 165-167).

**Nghiệm thu:** N4, N5 có test pass (§5 nhóm C).

---

### PHA 5 — Admin UI cho `matchKeyMeta` · ~2 giờ

File: `src/components/AdminPanel.tsx`, tab **Match Keys**

- Header của matchKey đang chọn (cạnh dòng 1105): thêm toggle **"Phụ thuộc nhãn hiệu"** + select **Nhóm thiết bị** (`DeviceCategory`) ⇒ ghi vào `meta`.
- **Sửa M11 (dòng 1099-1133):**
  - `brandSensitive = true` ⇒ giữ nguyên lưới N thẻ brand như hiện tại.
  - `brandSensitive = false` ⇒ render **một** thẻ duy nhất *"Sản phẩm (không phân biệt nhãn hiệu)"*; nút "Add Product" **không** gán sẵn brand (dòng 1128) mà để người dùng nhập brand thật.
- **Sửa M12 (dòng 199):** khi tạo product cho matchKey brand-agnostic, **không** gán `brands[0]`.
- Hiển thị `conflicts` từ 2e ngay trong tab: badge cảnh báo trên matchKey brand-agnostic đang có nhiều bản ghi.

**Nghiệm thu:** thao tác tay — đặt `MCT_100A` = không phụ thuộc brand ⇒ BOQ vẫn ra OMEGA khi starter là Schneider (N1) và không đổi khi chuyển sang Mitsubishi (N2).

---

### PHA 6 — Migration + Backup · ~1.5 giờ

| File | Việc |
|---|---|
| `src/App.tsx` | Khi khởi động: nếu `boq_schema_version` < 2 ⇒ `seedMeta(library, templates)` → ghi `boq_matchkey_meta` → đặt `boq_schema_version = 2`. Chạy **một lần**, không ghi đè meta người dùng đã sửa. |
| `src/App.tsx` | Sau migration, nếu `conflicts.length > 0` ⇒ modal liệt kê matchKey brand-agnostic đang có nhiều brand để người dùng dọn tay. **Tuyệt đối không tự xoá dữ liệu.** |
| `src/components/BackupRestoreModal.tsx:22` | Thêm `matchKeyMeta: localStorage.getItem('boq_matchkey_meta')` vào payload backup. |
| `src/components/BackupRestoreModal.tsx:100` | Thêm nhánh restore tương ứng. |
| `src/utils/import-validation.ts:18` | Thêm `'matchKeyMeta'` vào `keysToCheck` của `validateBackupJSON` (giữ nguyên cơ chế chống injection). |
| `src/components/BackupRestoreModal.tsx:144` | Thêm dòng `✓ Match Key Meta` vào danh sách UI. |

**Nghiệm thu:** Backup → xoá localStorage → Restore ⇒ brand của toàn bộ BOQ không đổi một ký tự.

---

## 5. Ma trận test bắt buộc

> Đặt trong `src/utils/brand-policy.test.ts` và bổ sung `src/utils/boq-logic.test.ts`.

### Nhóm A — `brand-policy` (pha 1)

| # | Test | Kỳ vọng |
|---|---|---|
| A1 | `inferCategory('MCCB_3P_50')` | `'BREAKER'` |
| A2 | `inferCategory('MCT_100A')` | `'CT'` |
| A3 | `isBrandSensitive('MCT_100A', {})` | `false` |
| A4 | `isBrandSensitive('CONTACTOR_9A', {})` | `true` |
| A5 | meta ghi đè được suy luận: `isBrandSensitive('MCT_100A', { MCT_100A: { …, brandSensitive: true } })` | `true` |
| A6 | `meta = {}` cho mọi key có thật trong `src/data/library.ts` + `STARTER_TEMPLATES` | kết quả **trùng khít** `isSwitchingDevice` cũ (chống hồi quy). *Tập key hiện có không chứa `CB_/ACB_/ELCB_/RCCB_/MPCB_` nên A6 và A8 không mâu thuẫn.* |
| A7 | `isBrandSensitive('VFD_5.5KW', {})` và `isBrandSensitive('SOFT_STARTER_11KW', {})` | `false` — **chốt Q1**, VFD giữ brand Product Library |
| A8 | `isBrandSensitive('CB_100A', {})`, `'ACB_1600A'`, `'ELCB_63A'`, `'RCCB_40A'`, `'MPCB_16A'` | `true` — **thay đổi có chủ đích** so với hôm nay (M1 đang sót các tiền tố này) |
| A9 | `isBrandSensitive('contactor_9a', {})` (chữ thường) | `true` — so khớp không phân biệt hoa/thường |
| A10 | `isBrandSensitive('ESTOP', {})`, `'TIMER_STAR_DELTA'` | `false` |

### Nhóm B — `generateDetail` (pha 2)

| # | Test | Kỳ vọng |
|---|---|---|
| B1 | Starter Schneider + template có `MCT_100A`, library có MCT brand OMEGA | dòng BOQ `brand === 'OMEGA'` **(N1)** |
| B2 | Cùng dữ liệu, đổi starter sang Mitsubishi | dòng MCT **không đổi**; dòng `CONTACTOR_9A` đổi sang bản Mitsubishi **(N2)** |
| B3 | `ISOLATOR_16A`, `starter.isolatorBrand='LS'`, `condition` KHÔNG phải `'isolator'` | dòng đó tra theo **LS** — hiện tại đang FAIL vì M4 **(N3)** |
| B4 | Đảo ngược thứ tự mảng `library` rồi chạy lại | BOM giống hệt lần đầu **(N7)** |
| B5 | matchKey brand-sensitive thiếu brand đang chọn | `productCode === 'NOT_FOUND'`, `brand === targetBrand` (giữ hành vi cũ — trừ khi §8 Q2 chốt khác) |
| B6 | matchKey brand-agnostic không tìm thấy | `brand === '—'`, không phải `'Any'` |
| B7 | `meta = {}` (mặc định) với toàn bộ fixture cũ | BOM **y hệt** trước khi sửa |
| B8 | Starter `VFD` brand = Mitsubishi, library có `VFD_5.5KW` brand Schneider | dòng VFD `brand === 'Schneider'` **(N9)** |
| B9 | Template có `CB_100A`, starter brand = LS, library có `CB_100A\|LS` và `CB_100A\|Schneider` | chọn đúng bản **LS** **(N10)** |

### Nhóm C — Excel round-trip (pha 4)

| # | Test | Kỳ vọng |
|---|---|---|
| C1 | `exportMatchKeysToExcel` với library có OMEGA | có cột `OMEGA_Code`, ô code MCT không rỗng **(N4)** |
| C2 | export → import cùng file | library deep-equal theo `matchKey\|brand\|code\|ibomCode` **(N4)** |
| C3 | import file có `BrandSensitive=No` và 2 ô code | tạo **1** product + 1 `conflicts` **(N5)** |
| C4 | import file có `BrandSensitive=Yes` và 3 ô code | tạo 3 product (hành vi cũ, đúng) |
| C5 | ô code bị xoá trắng so với library | xuất hiện trong `report.cleared`, **không** bị tự xoá |

### Nhóm D — Hồi quy (mọi pha)

- **D1:** 14 test `import-validation.test.ts` — đặc biệt `Hacker_Brand_XSS` — vẫn pass.
- **D2:** 10 test `template-validation.test.ts` (`VALID_CONDITIONS` gồm `isolator_estop_FB`) vẫn pass.
- **D3:** 34 test `logic-engine.test.ts` vẫn pass (pha này không được chạm engine).

---

## 6. Rủi ro & cách chặn

| Rủi ro | Mức | Chặn bằng |
|---|---|---|
| Đổi chữ ký `generateDetail` / `createLibraryIndex` làm vỡ caller | Trung bình | Tham số `meta` **có default `{}`** ⇒ mọi caller cũ vẫn biên dịch. `tsc -b` sẽ liệt kê chỗ còn thiếu. |
| Migration ghi đè meta người dùng đã chỉnh | **Cao** | Gác bằng `boq_schema_version`; migration chỉ ghi khi key chưa tồn tại. |
| Migration / import xoá nhầm sản phẩm | **Cao** | Nguyên tắc tuyệt đối: **không tự xoá**, chỉ báo cáo. |
| Đổi format Excel Matrix làm hỏng file mẫu người dùng đang giữ | Trung bình | Import phải đọc được file **thiếu** cột `BrandSensitive` (fallback `inferCategory`). Nhắc người dùng tải lại file mẫu như đã làm ở NGU-5. |
| Sửa sai làm loạn brand nặng hơn | **Cao** | `ENABLE_BRAND_POLICY = false` (pha 0) trả về hành vi cũ ngay lập tức. Test B7 canh giữ điều này. |
| Quên đồng bộ `brands` ⇒ vẫn lệch nguồn sự thật | Trung bình | Sau pha 3: `grep -rn "'Schneider', 'Mitsubishi', 'LS', 'Hyundai'" src/components src/utils` phải **chỉ** còn `DEFAULT_BRANDS` trong `import-validation.ts`. |

**Thứ tự nếu phải cắt gọt:** Pha 0 → 1 → 2 → 4 là lõi bắt buộc (sửa hẳn M1–M9). Pha 3, 5, 6 có thể tách sang đợt sau — nhưng **thiếu pha 6 thì không được release** (mất meta khi restore backup).

---

## 7. Ước lượng

| Pha | Nội dung | Ước lượng |
|---|---|---|
| 0 | Cờ an toàn | 15 phút |
| 1 | Types + `brand-policy.ts` + test | 1–2 giờ |
| 2 | Lõi `boq-logic.ts` | 2 giờ |
| 3 | Một nguồn brand | 1 giờ |
| 4 | Export / Import Matrix | 3 giờ |
| 5 | Admin UI meta | 2 giờ |
| 6 | Migration + Backup | 1.5 giờ |
| | **Tổng** | **~11 giờ** |

---

## 8. QUYẾT ĐỊNH ĐÃ CHỐT (11/09/2026)

> Ba câu dưới đây **đã được anh Nguyên chốt**. Model 4.8 **không được tự thay đổi**; nếu thấy mâu thuẫn khi thi công thì **dừng và hỏi lại**, không tự quyết.

### Q1 — Nhóm phụ thuộc nhãn hiệu: ✅ **CHỐT 4 nhóm**

> *"Khi lựa chọn Brand trên Admin Panel chỉ ảnh hưởng đến nhãn hiệu của CB / contactor / relay nhiệt / Isolator. Ngoài ra, TẤT CẢ các thiết bị khác giữ brand như Product Library."*

| Nhóm | Ví dụ matchKey | Chốt |
|---|---|---|
| `BREAKER` | `MCB_*`, `MCCB_*`, `CB_*`, `ACB_*`, `ELCB_*`, `RCCB_*`, `MPCB_*` | ✅ **CÓ** |
| `CONTACTOR` | `CONTACTOR_*`, `KHOI_DONG_TU_*` | ✅ **CÓ** |
| `THERMAL` | `THERMAL_*`, `RELAY_NHIET_*` | ✅ **CÓ** |
| `ISOLATOR` | `ISOLATOR_*`, `ISO_*` | ✅ **CÓ** |
| `DRIVE` | `VFD_*`, `SOFT_STARTER_*` | ❌ **KHÔNG** — giữ brand trong Product Library |
| `ACCESSORY` | `ESTOP`, `TIMER_STAR_DELTA`, đèn báo, nút nhấn | ❌ **KHÔNG** |
| `CT` | `MCT_*`, `PCT_*` | ❌ **KHÔNG** |
| `CABLE` | cáp, đầu cos, co nhiệt | ❌ **KHÔNG** |
| `OTHER` | còn lại | ❌ **KHÔNG** |

**Hệ quả cần model 4.8 nắm rõ:**

1. Tập 4 nhóm này **trùng khớp về ý đồ** với whitelist 7 tiền tố cũ ở `boq-logic.ts:6` ⇒ **rủi ro hồi quy thấp**, đây là chuẩn hoá chứ không phải đảo chiều nghiệp vụ.
2. `inferCategory` **phải bổ sung** các tiền tố hiện đang bị sót vào `BREAKER`: `CB_`, `ACB_`, `ELCB_`, `RCCB_`, `MPCB_`, và `KHOI_DONG_TU_` vào `CONTACTOR`. Đây là **thay đổi hành vi có chủ đích** — trước đây `CB_100A` không theo brand, từ nay phải theo.
3. So khớp tiền tố phải **không phân biệt hoa/thường** (dùng `matchKey.toUpperCase()`), vì key do người dùng gõ tay.
4. `VFD_5.5KW` / `SOFT_STARTER_11KW` từ nay in **brand của bản ghi trong library**, không đổi theo starter. Nếu library đang có nhiều bản ghi `VFD_5.5KW` khác brand ⇒ rơi vào `conflicts` (mục 2e) và phải hiện cảnh báo cho người dùng dọn tay — **không tự chọn hộ, không tự xoá**.

### Q2 — Thiếu brand trong library: ✅ **CHỐT giữ `NOT_FOUND`**

Giữ đúng hành vi hôm nay: sinh dòng `Missing <matchKey> for <brand>`, `productCode = 'NOT_FOUND'`, kèm cảnh báo ở `ValidationWarnings` (qua `src/utils/validation.ts:22-33`). **Không** tự rơi về brand khác — tuyệt đối không sinh hồ sơ sai hãng.
⇒ Test **B5** giữ nguyên như mô tả ở §5.

### Q3 — Định dạng Match Key Matrix: ✅ **CHỐT 1 sheet, cột brand động**

Một sheet duy nhất, cột brand sinh động từ `union(brands, brand có thật trong library)` + thêm cột `BrandSensitive` (`Yes`/`No`).
**Ràng buộc bắt buộc:** file mẫu cũ (thiếu cột `BrandSensitive`, chỉ có 4 cột brand) **vẫn phải import được** — thiếu cột thì fallback về `inferCategory`. Sau khi xong, nhắc người dùng tải lại file mẫu mới (giống cách đã làm ở NGU-5).

---

*Plan lập bởi Claude Opus 5 — 11/09/2026. Mọi `file:line` trong tài liệu này đã được grep xác minh trên chính thư mục `" - Copy"`. Baseline `tsc -b` = 0 lỗi, `vitest` = 73/73 là kết quả chạy thật.*

---

## 9. NHẬT KÝ THI CÔNG (11/09/2026)

### 9.1 File đã thay đổi

| File | Trạng thái | Nội dung |
|---|---|---|
| `src/utils/brand-policy.ts` | **MỚI** | Nơi DUY NHẤT biết quy tắc brand: `inferCategory`, `isBrandSensitive`, `categoryOf`, `seedMeta`, `defaultMetaFor`, `pickPreferredProduct`, `BRAND_AGNOSTIC_LABEL` |
| `src/utils/brand-policy.test.ts` | **MỚI** | 16 test — nhóm A |
| `src/utils/matchkey-matrix.test.ts` | **MỚI** | 15 test — nhóm C, round-trip qua file .xlsx thật |
| `src/types/index.ts` | sửa | `DeviceCategory`, `MatchKeyMeta`, `MatchKeyMetaMap` |
| `src/utils/boq-logic.ts` | sửa | Xoá `isSwitchingDevice`; `byKey` tất định + `byKeyAll` + `conflicts`; sửa lỗi `ISO_`; `'Any'` → `'—'`; thêm tham số `meta` |
| `src/utils/boq-logic.test.ts` | sửa | +13 test — nhóm B |
| `src/utils/excel-export.ts` | sửa | `resolveMatrixBrands`, `buildMatchKeyMatrixRows` (cột brand động + `BrandSensitive` + `<Brand>_iBomCode`) |
| `src/utils/excel-import.ts` | sửa | `applyMatchKeyMatrixRows` thuần + `MatchKeyImportReport`; hết nhân bản brand; không tự xoá |
| `src/utils/import-validation.ts` | sửa | `matchKeyMeta` vào schema backup |
| `src/utils/import-validation.test.ts` | sửa | +1 test schema |
| `src/App.tsx` | sửa | `ENABLE_BRAND_POLICY`, state + persist `matchKeyMeta`, migration `boq_schema_version=2`, `allBrands`, cảnh báo conflict |
| `src/components/AdminPanel.tsx` | sửa | Toggle "Phụ thuộc nhãn hiệu" + "Nhóm thiết bị", badge `—`/`!`, Brand Matrix 1 thẻ cho key brand-agnostic, modal báo cáo import, Clear Data gõ `CLEAR` |
| `src/components/DetailView.tsx` | sửa | Bỏ hard-code 4 brand, nhận prop `brands`, tooltip giải thích phạm vi |
| `src/components/InputWizard.tsx` | sửa | Mặc định `brands[0]` thay cho `'Schneider'` |
| `src/components/BackupRestoreModal.tsx` | sửa | Backup/restore `boq_matchkey_meta` + `boq_schema_version` |
| `.claude/launch.json` | **MỚI** | Cấu hình chạy dev server để kiểm thử |

### 9.2 Khác biệt so với plan ban đầu

1. **Thêm cột `<Brand>_iBomCode`** vào Match Key Matrix — plan chỉ coi việc làm phẳng mô tả (M7) là "hạn chế đã biết". Test round-trip chứng minh nó **thực sự làm hỏng `ibomCode`**, mà đó là khoá gộp của `generateSummary`. Buộc phải sửa.
2. **Ô brand tính theo `_Code` HOẶC `_iBomCode`** — phát hiện khi chạy trên dữ liệu thật: 20/28 sản phẩm (toàn bộ MCT/PCT) có `code` rỗng.
3. **Cảnh báo conflict sau migration dùng Toast** thay vì modal riêng như plan — Admin → Match Keys đã có badge `!` và banner giải thích ngay tại key, nên thêm modal khởi động là thừa.
4. **`handleSaveProduct` bỏ yêu cầu brand bắt buộc** với matchKey brand-agnostic — không có trong plan, nhưng nếu không sửa thì không thể tạo sản phẩm brand-agnostic mà không đóng dấu brand bừa.

### 9.3 Kiểm thử thủ công đã chạy trên app thật

| Kịch bản | Kết quả |
|---|---|
| Starter brand = Schneider, template có MCT_100A | MCT hiện **OMEGA** ✔ (N1) |
| Đổi starter sang Mitsubishi | Contactor/Thermal → Mitsubishi; **MCT vẫn OMEGA** ✔ (N2) |
| Isolator + Isolator Brand = Schneider trên starter Mitsubishi | Isolator lấy **Vario-16 Schneider** ✔ (N3) — trước đây ra NOT_FOUND |
| Dropdown Brand | Có **OMEGA** ✔ (N6) |
| Đảo ngược thứ tự mảng library | BOQ **không đổi** ✔ (N7) |
| Bơm bản ghi MCT_100A giả brand Schneider | Toast cảnh báo + badge `!` + banner trong Admin ✔ |
| Bật toggle "Phụ thuộc nhãn hiệu" cho MCT_100A | Matrix chuyển sang lưới 5 brand; BOQ ra NOT_FOUND cho Mitsubishi ✔ |
| Export → Import Matrix trên **28 sản phẩm thật** | Khớp 100%, đủ **20/20** bản ghi OMEGA ✔ (N4) |

### 9.4 Việc TK còn phải làm

1. **Chạy lại nghiệm thu tại máy**: `npm test` (kỳ vọng 118/118), `npm run build`.
2. **Git commit** — các thay đổi đang nằm ngoài git (phần lớn `src/` vốn là untracked trong repo này).
3. **Tải lại file mẫu Match Key Matrix**: bấm **Export Matrix** để lấy file có cột `BrandSensitive` và `<Brand>_iBomCode`. File cũ vẫn import được nhưng thiếu hai thông tin đó.
4. **Kiểm tra danh sách conflict**: mở **Admin → Match Keys**, dọn các key có badge `!` (dữ liệu nhân bản do Import Matrix cũ để lại). Ứng dụng **không tự xoá** bất cứ bản ghi nào.
5. **Rà lại tên matchKey đang dùng**: các key đặt tên `CB_*`, `ACB_*`, `ELCB_*`, `RCCB_*`, `MPCB_*` **từ nay đi theo brand starter** (trước bị bỏ sót). Nếu có key nào không mong muốn như vậy, tắt toggle "Phụ thuộc nhãn hiệu" cho key đó.

*Thi công & nghiệm thu bởi Claude Opus 5 — 11/09/2026. Mọi con số trong §9 là kết quả chạy thật.*
