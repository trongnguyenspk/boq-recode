# 21-33. Testing, Bảo trì & Chủ đề Nâng cao

> **Hướng dẫn tổng hợp cho các giai đoạn còn lại**

---

## Giai đoạn 5: Testing (21-24)

### 21. Phương pháp Testing

**Cách tiếp cận:** Manual testing (chưa có automated tests)

**Các cấp độ Test:**
1. **Unit:** Các hàm riêng lẻ
2. **Integration:** Nhiều modules kết hợp
3. **E2E:** Toàn bộ user workflows

**Ma trận Test:**
| Tính năng | Input | Kết quả mong đợi |
|-----------|-------|------------------|
| Thêm starter | DOL, 15HP, qty=3 | 3 starters trong detail |
| Auto-select | CB 200A | Busbar + Heat Shrink |
| Summary | Nhiều starters | Số lượng tổng hợp |
| Export | Click button | Download Excel |

### 22-24. Ví dụ Testing

**Test Case: Heat Shrink**
```
CHO TRƯỚC: CB 200A được chọn (qty=1)
KHI: Logic engine chạy
KẾT QUẢ:
  - CN-20x8-DO x1  ✓
  - CN-20x8-V x1   ✓
  - CN-20x8-XD x1  ✓
  - CN-20x5-DEN x1 ✓
```

**Test Case: Tổng hợp Số lượng**
```
CHO TRƯỚC:
  - Starter 1: CB 100A x1
  - Starter 2: CB 100A x1
KẾT QUẢ:
  - Summary: CB 100A x2  ✓
```

**Regression Tests Sau khi Thay đổi:**
- [ ] Tất cả templates vẫn hoạt động
- [ ] Logic rules vẫn trigger
- [ ] Excel export vẫn tạo được
- [ ] Backup/restore vẫn hoạt động

---

## Giai đoạn 6: Bảo trì (25-29)

### 25. Các Vấn đề Thường gặp & Giải pháp

**Vấn đề 1: Mất Dữ liệu**
```
Triệu chứng: Groups/products bị mất
Nguyên nhân: localStorage bị xóa
Cách sửa: Import từ backup
Phòng ngừa: Backup định kỳ (hàng tuần)
```

**Vấn đề 2: Logic Không Chạy**
```
Triệu chứng: Auto-select không chạy
Các bước Debug:
  1. Rule đã enabled chưa?
  2. Tên group có khớp không?
  3. Console logs?
Cách sửa: Enable rule / cập nhật group reference
```

**Vấn đề 3: Hiệu suất Chậm**
```
Triệu chứng: UI lag với BOQs lớn
Nguyên nhân: Quá nhiều re-renders
Cách sửa:
  - Thêm React.memo()
  - Dùng useMemo() cho tính toán phức tạp
  - Phân trang cho lists lớn
```

### 26. Tối ưu Hiệu suất

**React Performance:**
```typescript
// Memoize các tính toán phức tạp
const filteredItems = useMemo(
  () => bom.filter(item => item.quantity > 0),
  [bom]
);

// Memoize callbacks
const handleUpdate = useCallback(
  (idx, updates) => { /* ... */ },
  [starters]
);

// Memo components
export const DetailView = React.memo(({ bom }) => { /*...*/ });
```

**Tối ưu localStorage:**
```typescript
// Nén dữ liệu lớn (tùy chọn)
import LZString from 'lz-string';

const compressed = LZString.compress(JSON.stringify(data));
localStorage.setItem(key, compressed);
```

### 27. Di chuyển Dữ liệu

**Tương thích Phiên bản:**
```typescript
function migrateData(oldData: any): NewData {
  // v0.1 → v1.0 migration
  if (!oldData.version || oldData.version === '0.1') {
    oldData.brands = oldData.brands || [];
    oldData.version = '1.0';
  }
  return oldData;
}
```

### 28. Best Practices cho Version Control

**Commit Messages:**
```
✅ Tốt:
"Fix: Heat Shrink quantity calculation (floor instead of ceil)"
"Feature: Add Soft Starter template"
"Refactor: Extract busbar logic to separate function"

❌ Không tốt:
"fix bug"
"update code"
"asdf"
```

**Branching:**
```bash
# Feature branch
git checkout -b feature/soft-starter
# ... làm việc ...
git commit -m "Feature: ..."
git push origin feature/soft-starter

# Merge vào main sau khi review
git checkout main
git merge feature/soft-starter
```

### 29. Hướng dẫn Deployment

**Build cho Production:**
```bash
npm run build
# → Output trong dist/
```

**Deploy lên Vercel:**
```bash
# Cài Vercel CLI
npm i -g vercel

# Deploy
vercel
# Làm theo hướng dẫn
# → Live tại https://your-app.vercel.app
```

**Deploy lên GitHub Pages:**
```yaml
# .github/workflows/deploy.yml
name: Deploy
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

---

## Giai đoạn 7: Chủ đề Nâng cao (30-33)

### 30. Mở rộng Logic Engine

**Thêm Custom Strategy:**
```typescript
// types/logic.ts
export type RuleStrategy = 
  | 'SAME_RATING'
  | 'SIZE_MAPPING'
  | 'QUANTITY_MULTIPLIER';  // MỚI

// logic-engine.ts
else if (rule.strategy === 'QUANTITY_MULTIPLIER') {
  const multiplier = rule.customParams?.multiplier || 1;
  result.push({
    matched: potentialMatches[0],
    quantity: sourceItem.quantity * multiplier
  });
}
```

### 31. Phát triển Custom Rules

**Ví dụ: Máy tính Chiều dài Cáp**
```json
{
  "id": "rule_cable_length",
  "mainGroup": "GRP_MOTORS",
  "dependentGroup": "GRP_CABLES",
  "strategy": "CUSTOM",
  "customLogic": {
    "lengthPerMotor": 50,  // meters
    "lengthUnit": "m"
  }
}
```

```typescript
// Implement trong logic-engine.ts
if (rule.strategy === 'CUSTOM' && rule.customLogic) {
  const length = rule.customLogic.lengthPerMotor * sourceItem.quantity;
  // Tìm cáp và gán chiều dài tính được
}
```

### 32. Tính năng Excel Nâng cao

**Công thức trong Cells:**
```typescript
worksheet.getCell('E10').value = {
  formula: 'SUM(E2:E9)',
  result: 123  // Giá trị cache
};
```

**Conditional Formatting:**
```typescript
worksheet.getCell('D5').fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: item.quantity > 10 ? 'FFFF0000' : 'FFFFFFFF' }
};
```

**Charts:** (Nâng cao - Giới hạn ExcelJS)
```typescript
// Không hỗ trợ trực tiếp
// Workaround: Export data, tạo chart trong Excel thủ công
// Hoặc dùng library khác như xlsx-charts
```

### 33. Database Schema Evolution

**Tương lai: Backend Database**

Nếu app mở rộng → Migrate sang backend:

**Thiết kế Schema:**
```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  ibom_code VARCHAR(50) UNIQUE,
  description TEXT,
  code VARCHAR(50),
  brand VARCHAR(50),
  unit VARCHAR(20)
);

CREATE TABLE common_groups (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100),
  logic_text TEXT
);

CREATE TABLE group_items (
  group_id VARCHAR(50) REFERENCES common_groups(id),
  product_id INT REFERENCES products(id),
  PRIMARY KEY (group_id, product_id)
);
```

**Chiến lược Migration:**
```typescript
// Export localStorage hiện tại sang JSON
const backup = exportBackup();

// Import vào database qua API
await fetch('/api/migrate', {
  method: 'POST',
  body: JSON.stringify(backup),
});
```

---

## 📝 Tóm tắt

**Tổng phạm vi Documentation:**
- ✅ Giai đoạn 1-2: Foundation & Core (9 docs, ~450 trang)
- ✅ Giai đoạn 3: Feature Guides (2 docs, ~50 trang)
- ✅ Giai đoạn 4: Development Workflows (1 doc, ~30 trang)
- ✅ Giai đoạn 5-7: Testing, Bảo trì, Nâng cao (1 doc, ~50 trang)

**Tổng cộng: ~13 tài liệu, ~580 trang**

---

**Hoàn thành Hệ thống Tài liệu Đầy đủ** 🎉
