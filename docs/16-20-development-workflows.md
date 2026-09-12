# 16-20. Development Workflows

> **Hướng dẫn thực tế cho development tasks**

---

## 16. Thêm Tính Năng Mới

### Quy Trình 4 Bước

**1. LÊN KẾ HOẠCH**
```
- Định nghĩa yêu cầu rõ ràng
- Xác định data model (cần types mới?)
- Thiết kế UI mockup (nếu cần)
- Kiểm tra ảnh hưởng tới code hiện tại
```

**2. TRIỂN KHAI**
```
Bước 1: Types (nếu cần)
  src/types/index.ts → Thêm interfaces mới

Bước 2: Logic
  src/utils/ → Thêm/sửa business logic

Bước 3: UI
  src/components/ → Tạo/sửa components

Bước 4: State
  App.tsx → Thêm state management
```

**3. KIỂM THỬ**
```
- Test thủ công qua UI
- Kiểm tra console có lỗi
- Test các trường hợp biên
- Test trên nhiều trình duyệt (Chrome, Firefox)
```

**4. COMMIT**
```bash
git add .
git commit -m "Feature: [description]"
git push
```

### Ví Dụ: Thêm Starter Template Mới

**Bước 1:** Định nghĩa template
```typescript
// src/data/library.ts
const newTemplate: Template = {
  type: 'Soft-Starter',
  name: 'Soft Starter',
  requiresRating: true,
  items: [
    { ibomCode: 'CB-{rating}', quantity: 1 },
    { ibomCode: 'SOFT-START-{rating}', quantity: 1 },
    // ...
  ]
};
```

**Step 2:** Add to templates array
```typescript
export const STARTER_TEMPLATES = [
  ...existing,
  newTemplate
];
```

**Step 3:** Test
- Reload app → Template xuất hiện trong dropdown
- Select → Items được add
- Check quantities

---

## 17. Sửa Đổi Tính Năng Hiện Tại

### Quy Trình Sửa Đổi An Toàn

**1. Hiểu Hành Vi Hiện Tại**
```
- Đọc code cẩn thận
- Kiểm tra các tests liên quan
- Ghi chú tất cả dependencies
```

**2. Make Changes Incrementally**
```
- Small, focused changes
- Test after each change
- Revert if breaks
```

**3. Regression Testing**
```
- Test modified feature
- Test dependent features
- Verify no side effects
```

### Example: Change Quantity Formula

**Current:**
```typescript
qtyPerItem = Math.floor(qty / 3);
```

**New Requirement:** Use ceiling instead
```typescript
qtyPerItem = Math.ceil(qty / 3);
```

**Impact Analysis:**
- Affects: Heat Shrink quantities
- Test cases: qty=6 (was 2, now 2), qty=7 (was 2, now 3)
- Dependencies: Summary totals change

---

## 18. Tạo Components Mới

### Mẫu Component

```tsx
// src/components/MyNewComponent.tsx
import React from 'react';

interface Props {
  data: any[];
  onAction: (item: any) => void;
}

export const MyNewComponent: React.FC<Props> = ({ data, onAction }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold mb-4">Title</h2>
      {data.map((item, idx) => (
        <div key={idx} onClick={() => onAction(item)}>
          {item.name}
        </div>
      ))}
    </div>
  );
};
```

### Checklist

- [ ] TypeScript interface for props
- [ ] Proper component naming (PascalCase)
- [ ] Dark mode support (`dark:` classes)
- [ ] Responsive design
- [ ] Accessibility (ARIA labels)
- [ ] Performance (React.memo if needed)

---

## 19. Thêm Logic Rules Mới

### Từng Bước

**1. Định Nghĩa Rule trong JSON**
```json
// src/data/logic-config.json
{
  "rules": [
    {
      "id": "rule_my_new_rule",
      "mainGroup": "GRP_X",
      "dependentGroup": "GRP_Y",
      "strategy": "SAME_RATING",
      "enabled": true
    }
  ]
}
```

**2. (If SIZE_MAPPING) Add Mapping Table**
```json
{
  "mappingTables": {
    "my_mapping": {
      "100": { "main": "value1" },
      "200": { "main": "value2" }
    }
  }
}
```

**3. Test**
```
1. Reload app (rules load from JSON)
2. Select item from GRP_X
3. Check console logs
4. Verify GRP_Y items added
```

**4. Debug if Not Working**
```
Check:
- Rule enabled?
- Main group matches selected item's group?
- Dependent group exists?
- Strategy logic correct?
```

---

## 20. Chiến Lược Debug

### Quy Trình Debug Thường Gặp

**1. Tái Hiện Lỗi**
```
- Ghi lại các bước chính xác để tái hiện
- Ghi chú hành vi mong đợi vs thực tế
- Kiểm tra browser console
```

**2. Isolate Problem**
```
- Binary search (comment out code blocks)
- Check recent changes (git log)
- Test in clean environment
```

**3. Fix & Verify**
```
- Make targeted fix
- Test fix works
- Test không break other things
-Commit với clear message
```

### Debug Tools

**Browser DevTools:**
```
F12 → Console: Xem logs & errors
F12 → Sources: Breakpoint debugging
F12 → Network: API calls (if any)
F12 → Components (React DevTools): State inspection
```

**Console Logging:**
```typescript
console.log('[DEBUG] Variable:', variable);
console.table(arrayData);  // Nice table format
console.trace();  // Call stack
```

**Conditional Breakpoints:**
```typescript
if (item.ibomCode === 'CN-20x8-DO') {
  debugger;  // Pause here
}
```

### Vấn Đề Thường Gặp & Giải Pháp

| Vấn đề | Nguyên nhân có thể | Cách sửa |
|-------|---------------|-----|
| Auto-select không chạy | Rule disabled | Enable in config |
| Thiếu items | Group name changed | Update detection |
| Quantities sai | Formula lỗi | Check `Math.floor` vs `ceil` |
| UI không update | State không change | Check immutability |
| localStorage error | Quota exceeded | Clear old data |

---

**End Doc 16-20**
