# 11-15. Hướng Dẫn Tính Năng - Tham Khảo Nhanh

> **Lưu ý:** Đây là tổng hợp nhanh 5 hướng dẫn tính năng. Mỗi tính năng đã được trình bày chi tiết trong Doc 06 (Logic Engine).

---

## 11. Quy Tắc Tự Động Chọn (Auto-Selection Rules)

**Chi tiết đầy đủ:** [Doc 06 §3-5](./06-logic-engine.md)

### Hướng Dẫn Nhanh

**Các chiến lược:**
1. **SAME_RATING:** Khớp theo rating (CB 200A → MCT 200/5A)
2. **SIZE_MAPPING:** Dùng bảng mapping (CB 200A → Busbar 20x8)

**Thêm Rule Mới:**
```json
// logic-config.json
{
  "id": "rule_new",
  "mainGroup": "GRP_X",
  "dependentGroup": "GRP_Y",
  "strategy": "SAME_RATING",
  "enabled": true
}
```

**Kiểm tra:** Chọn item từ mainGroup → Kiểm tra items từ dependentGroup được thêm tự động

---

## 12. Logic Co Nhiệt (Heat Shrink)

**Chi tiết đầy đủ:** [Doc 06 §6](./06-logic-engine.md#6-heat-shrink-logic-chi-tiết)

### Hướng Dẫn Nhanh

**Kích hoạt:** Chọn CB từ GRP_3  
**Kết quả:** Tự động chọn 4 màu từ GRP_HEAT_SHRINK

**Bảng mapping:**
```json
{
  "200": {
    "main": "3x 20x8",    // → CN-20x8-DO/V/XD (floor(qty/3))
    "updown": "3x 20x5",  // → CN-20x5-DO/V/XD
    "neutral": "20x5"     // → CN-20x5-DEN (số lượng trực tiếp)
  }
}
```

**Debug:**
```
F12 → Console
[DEBUG] isHeatShrinkRule=true
[DEBUG] Column="main", isPhaseColumn=true
[DEBUG] Color match: CN-20x8-DO
```

**Sửa lỗi thường gặp:** Group đổi tên → Cập nhật logic phát hiện

---

## 13. Chọn Busbar (Thanh Cái)

**Chiến lược:** SIZE_MAPPING (giống Heat Shrink)

### Hướng Dẫn Nhanh

**Kích hoạt:** CB từ GRP_3  
**Đích:** GRP_BUSBAR

**Ví dụ:**
```
CB 200A được chọn
  ↓
Mapping: { main: "3x 20x8", neutral: "20x5" }
  ↓
Kết quả:
  - Busbar 20x8 x3 (từ "3x 20x8")
  - Busbar 20x5 x1 (neutral)
```

**Thêm Size Mới:**
```json
{
  "mappingTables": {
    "busbar": {
      "500": {
        "main": "3x 40x10",
        "updown": "3x 30x10",
        "neutral": "30x10"
      }
    }
  }
}
```

---

## 14. Logic MCT/PCT

**Chiến lược:** SAME_RATING

### Hướng Dẫn Nhanh

**Rule MCT:**
```json
{
  "id": "rule_mct",
  "mainGroup": "GRP_3",
  "dependentGroup": "GRP_17_MCT",
  "strategy": "SAME_RATING"
}
```

**Logic:**
```
CB 200A → Tìm MCT có "200" trong description → MCT 200/5A
```

**PCT:** Tương tự, dùng GRP_17_PCT

**Quy ước đặt tên sản phẩm:**
- Định dạng MCT: "MCT 100/5A", "MCT 200/5A"
- Trích xuất rating: `\d+` → "100", "200"

---

## 15. Xuất/Nhập Excel

**Module:** `src/utils/excel-export.ts`, `excel-import.ts`

### Hướng Dẫn Nhanh: Xuất

**Code:**
```typescript
import { exportToExcel } from './utils/excel-export';

// Xuất BOQ hiện tại
await exportToExcel(bom, summary);
// → Tải xuống "BOQ_Export_2025-12-07.xlsx"
```

**Sheets:**
1. **Detail:** Tất cả items BOQ nhóm theo starters
2. **Summary:** Tổng hợp theo mã sản phẩm

**Định dạng:**
- Headers: Nền xanh, chữ trắng, đậm
- Màu dòng xen kẽ
- Viền trên tất cả ô
- Tự động điều chỉnh độ rộng cột

### Hướng Dẫn Nhanh: Nhập

**Code:**
```typescript
import { importFromExcel } from './utils/excel-import';

// Nhập sản phẩm từ Excel
const file = ...; // Từ file input
const products = await importFromExcel(file);

// Thêm vào library
setLibrary([...library, ...products]);
```

**Các cột bắt buộc:**
- IBOM Code
- Description
- Code
- Brand
- Unit

**Xử lý lỗi:**
```typescript
try {
  const products = await importFromExcel(file);
} catch (error) {
  if (error.message.includes('Missing column')) {
    alert('File Excel thiếu cột bắt buộc!');
  }
}
```

---

## Kiểm Tra Tất Cả Tính Năng

**Ma trận kiểm tra:**

| Tính năng | Test Case | Kết quả mong đợi |
|-----------|-----------|-----------------|
| SAME_RATING | CB 100A → MCT | MCT 100/5A được chọn |
| SIZE_MAPPING | CB 200A → Busbar | Busbar 20x8 x3 |
| Heat Shrink | CB 200A → CN | 4 màu, số lượng đúng |
| Xuất Excel | Click Xuất | Tải file .xlsx |
| Nhập Excel | Upload file | Sản phẩm được thêm |

---

**Để xem chi tiết triển khai đầy đủ, xem:**
- [Doc 06: Logic Engine](./06-logic-engine.md)
- [Doc 02: ExcelJS](./02-technology-stack.md#5-exceljs)

---

**Hết Doc 11-15**
