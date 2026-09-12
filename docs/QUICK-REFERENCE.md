# 📘 BOQ Generator - Bảng Tổng Hợp & Tra Cứu Nhanh

**Version:** 1.0 | **Updated:** 07/12/2025 | **Language:** Tiếng Việt

> 💡 **Mục đích:** File này là bảng tổng hợp ngắn gọn tất cả kiến thức quan trọng. Khi cần chi tiết, click link để đọc full document.

---

## 🎯 Quick Navigation

| Nếu bạn muốn... | Đọc phần... |
|-----------------|-------------|
| Hiểu app làm gì, kiến trúc tổng quan | [1. Tổng Quan](#1-tổng-quan-dự-án) |
| Biết dùng công nghệ gì, tại sao | [2. Công Nghệ](#2-công-nghệ-stack) |
| Setup môi trường lần đầu | [3. Cài Đặt](#3-setup-môi-trường) |
| Tìm file/folder nào ở đâu | [4. Cấu Trúc](#4-cấu-trúc-code) |
| Hiểu logic tự động chọn vật tư | [5. Logic Engine](#5-logic-engine-core) |
| Thêm tính năng mới | [6. Development](#6-thêm-tính-năng-mới) |
| Fix bug/debug | [7. Debug](#7-debug--troubleshooting) |
| Test code | [8. Testing](#8-testing) |

---

## 1. Tổng Quan Dự Án

### 1.1 BOQ Generator Là Gì?
Ứng dụng web tự động tạo **Bill of Quantities** (bảng khối lượng công việc) cho hệ thống điện điều khiển động cơ.

**Vấn đề giải quyết:**
- ❌ Trước: Tạo BOQ thủ công qua Excel (2-4h/dự án, dễ sai)
- ✅ Sau: Tự động trong vài phút, đầy đủ vật tư

### 1.2 Tính Năng Chính

| Tính năng | Mô tả ngắn | Chi tiết |
|-----------|------------|----------|
| **BOQ Builder** | Tạo BOQ từ templates (DOL, Star-Delta...) | [Doc 01 §3.1](./01-project-overview.md#31-boq-builder) |
| **Common Logic** | Quản lý nhóm vật tư & logic phụ thuộc | [Doc 01 §3.2](./01-project-overview.md#32-common-logic-system) |
| **Auto-Selection** | Tự động chọn Busbar, Heat Shrink, MCT/PCT | [Doc 01 §3.3](./01-project-overview.md#33-auto-selection-engine) |
| **Excel Export** | Xuất Detail + Summary sheets | [Doc 01 §3.4](./01-project-overview.md#34-excel-exportimport) |
| **Backup/Restore** | Sao lưu data ra JSON, restore từ file | [Doc 01 §3.5](./01-project-overview.md#35-backup--restore) |

### 1.3 Kiến Trúc (4 Tầng)

```
UI (React Components)
    ↓
Logic (Auto-selection, Calculations)
    ↓
Data (State management, Models)
    ↓
Storage (localStorage)
```

**Chi tiết:** [Doc 01 §4 - Kiến Trúc Hệ Thống](./01-project-overview.md#4-kiến-trúc-hệ-thống)

### 1.4 Luồng Tạo BOQ

```
1. User chọn Template + Rating
2. Generate Detail (base items)
3. Apply Logic Rules (auto-select phụ thuộc)
4. Calculate Quantities
5. Generate Summary (group by product)
6. Display → Export Excel
```

**Chi tiết:** [Doc 01 §6 - Luồng Dữ Liệu](./01-project-overview.md#6-luồng-dữ-liệu)

---

## 2. Công Nghệ Stack

### 2.1 Technologies Chính

| Tech | Version | Dùng để làm gì | Tại sao chọn |
|------|---------|----------------|--------------|
| **React** | 18.3.1 | UI framework | Component-based, Virtual DOM, ecosystem |
| **TypeScript** | 5.6.2 | Type safety | Giảm bugs, better IDE support |
| **Vite** | 5.4.2 | Build tool | Dev server nhanh (<1s startup) |
| **Tailwind CSS** | 3.4.1 | Styling | Utility-first, dark mode built-in |
| **ExcelJS** | 4.4.0 | Excel export | Rich formatting (colors, borders) |
| **localStorage** | Native | Storage | Offline-first, no backend needed |

**Chi tiết:** [Doc 02 - Technology Stack](./02-technology-stack.md)

### 2.2 Key Configurations

```bash
# package.json - Scripts
npm run dev       # Dev server (Vite)
npm run build     # Production build
npm run preview   # Test production build

# tsconfig.json - Compiler
"strict": true              # Strict type checking
"jsx": "react-jsx"         # React 18 JSX transform

# tailwind.config.js - Styling
darkMode: 'class'          # Dark mode strategy
```

**Chi tiết:** [Doc 02 §8 - Configuration Files](./02-technology-stack.md#8-configuration-files)

---

## 3. Setup Môi Trường

### 3.1 Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | v18.0+ | v20.x |
| RAM | 4GB | 8GB+ |
| OS | Windows 10 | Windows 11 |

### 3.2 Cài Đặt Nhanh (3 Bước)

```bash
# 1. Cài Node.js từ nodejs.org (LTS version)

# 2. Clone & install
cd "path/to/BOQ-Qwen/boq-app"
npm install

# 3. Run
npm run dev
# → http://localhost:5173
```

**Chi tiết:** [Doc 03 - Setup Môi Trường](./03-dev-environment.md)

### 3.3 VS Code Extensions (Khuyến nghị)

- ✅ **ES7+ React Snippets**
- ✅ **Tailwind CSS IntelliSense**
- ✅ **Prettier** (format on save)

**Chi tiết:** [Doc 03 §6 - VS Code Setup](./03-dev-environment.md#6-vs-code-setup)

### 3.4 Troubleshooting Nhanh

| Lỗi | Fix |
|-----|-----|
| Port 5173 in use | `taskkill /PID <PID> /F` |
| Module not found | `rm -rf node_modules && npm install` |
| TS errors | Restart TS Server (Ctrl+Shift+P) |

**Chi tiết:** [Doc 03 §7 - Troubleshooting](./03-dev-environment.md#7-troubleshooting)

---

## 4. Cấu Trúc Code

### 4.1 Folder Structure

```
src/
├── components/     # React UI components
│   ├── InputWizard.tsx
│   ├── DetailView.tsx
│   ├── SummaryView.tsx
│   ├── CommonView.tsx
│   ├── AdminPanel.tsx
│   └── BackupRestoreModal.tsx
│
├── utils/          # Business logic
│   ├── logic-engine.ts      ⭐ Auto-selection
│   ├── boq-logic.ts         # BOQ generation
│   ├── excel-export.ts      # Excel export
│   └── excel-import.ts      # Excel import
│
├── data/           # Static data
│   ├── library.ts           # Sample products
│   ├── common-logic.json    # Full product DB
│   └── logic-config.json    # Rules & mappings
│
├── types/          # TypeScript types
│   ├── index.ts             # Core types
│   └── logic.ts             # Logic types
│
└── hooks/          # Custom hooks
    └── useTheme.ts          # Dark mode
```

**Chi tiết:** [Doc 04 - Cấu Trúc Codebase](./04-codebase-structure.md)

### 4.2 File Tìm Gì Ở Đâu?

| Muốn tìm... | File | Dòng |
|-------------|------|------|
| Entry point | `src/main.tsx` | - |
| Root component | `src/App.tsx` | - |
| Auto-selection logic | `src/utils/logic-engine.ts` | 1-425 |
| Heat Shrink logic | `src/utils/logic-engine.ts` | 239-320 |
| Excel export | `src/utils/excel-export.ts` | - |
| Product types | `src/types/index.ts` | 1-100 |
| Logic rules config | `src/data/logic-config.json` | - |
| Full product DB | `src/data/common-logic.json` | 1-2546 |

**Chi tiết:** [Doc 04 §2-6](./04-codebase-structure.md#2-folder-src---source-code)

### 4.3 Import Patterns

```typescript
// ✅ Good: Named imports
import { generateDetail } from './utils/boq-logic';
import type { Product } from './types';

// ❌ Bad: Default imports cho utils
import generateDetail from './utils/boq-logic';
```

**Chi tiết:** [Doc 04 §9 - Import Patterns](./04-codebase-structure.md#9-import-patterns)

---

## 5. Logic Engine (Core)

### 5.1 Overview

**Module:** `src/utils/logic-engine.ts`  
**Nhiệm vụ:** Tự động chọn vật tư phụ thuộc dựa trên logic rules

**Main Function:**
```typescript
evaluateAutoSelection(
  sourceItems: Product[],
  allGroups: CommonGroup[],
  rules: DependencyRule[],
  mappingTables: MappingTable[]
): { matched: Product; quantity: number }[]
```

### 5.2 Strategies

| Strategy | Mô tả | Ví dụ |
|----------|-------|-------|
| **SAME_RATING** | Match by rating | CB 200A → MCT 200/5A |
| **SIZE_MAPPING** | Dùng mapping table | CB 200A → Busbar 20x8 |
| **DEPENDENT** | (Future) Dựa vào qty group khác | - |

### 5.3 Heat Shrink Logic (Quan Trọng!)

**Trigger:** Khi chọn CB trong `GRP_3`  
**Target:** `GRP_HEAT_SHRINK` (hoặc `CoNhiet`)

**Mapping:**
```json
{
  "200": {
    "main": "3x 20x8",    // → Chọn Heat Shrink 20x8
    "updown": "3x 20x5",  // → Chọn Heat Shrink 20x5
    "neutral": "20x5"     // → Chọn Heat Shrink 20x5 (đen)
  }
}
```

**Quantity Calculation:**
- **Phase colors (đỏ/vàng/xanh):** `Math.floor(qty / 3)` từ `main` và `UpDown`
- **Neutral (đen):** `qty` trực tiếp từ `neutral`

**Code location:** `logic-engine.ts` lines 239-320

**Debugging tips:**
- Check console logs: `[DEBUG] isHeatShrink=true`
- Verify group name: `GRP_HEAT_SHRINK` hoặc `CoNhiet`
- Phase columns phải là `["main", "updown"]`

**Chi tiết đầy đủ:** Phase 2 Doc 06 - Logic Engine Architecture (Coming soon)

---

## 6. Thêm Tính Năng Mới

### 6.1 Workflow Chuẩn

```
1. PLAN
   └─ Xác định requirements
   └─ Design data model (nếu cần thêm types)

2. IMPLEMENT
   └─ Tạo/sửa types (src/types/)
   └─ Thêm logic (src/utils/)
   └─ Tạo/sửa UI components (src/components/)
   └─ Update state management (App.tsx)

3. TEST
   └─ Manual test qua UI
   └─ Check console logs
   └─ Test edge cases

4. COMMIT
   └─ git add .
   └─ git commit -m "Feature: ..."
   └─ git push
```

### 6.2 Ví Dụ: Thêm Logic Rule Mới

**Bước 1:** Define rule trong `logic-config.json`
```json
{
  "id": "rule_new_feature",
  "mainGroup": "GRP_X",
  "dependentGroup": "GRP_Y",
  "strategy": "SAME_RATING",
  "enabled": true
}
```

**Bước 2:** Test
- Reload app (F5)
- Chọn item từ GRP_X
- Kiểm tra console → Thấy auto-select từ GRP_Y

**Chi tiết:** Phase 2 Doc 16 - Adding New Features (Coming soon)

---

## 7. Debug & Troubleshooting

### 7.1 Debug Tools

| Tool | Cách dùng | Mục đích |
|------|-----------|----------|
| **Browser Console** | F12 → Console tab | Xem logs, errors |
| **React DevTools** | F12 → Components tab | Inspect state, props |
| **VS Code Debugger** | F5 | Breakpoint debugging |

### 7.2 Common Issues

| Vấn đề | Nguyên nhân | Fix |
|--------|-------------|-----|
| Auto-select không chạy | Rule disabled | Check `enabled: true` trong config |
| Thiếu màu Heat Shrink | Group name đổi | Update `isHeatShrinkRule` check |
| Quantity sai | Formula lỗi | Check `Math.floor` vs `Math.ceil` |
| Excel lỗi format | ExcelJS version | Update ExcelJS: `npm update exceljs` |

### 7.3 Console Log Patterns

**Heat Shrink debugging:**
```
[DEBUG] isHeatShrink=true
[DEBUG] phaseColumns=["main","updown"]
[DEBUG] Column="main", isPhaseColumn=true
[DEBUG] Potential matches: [CN-20x8-DO, CN-20x8-V, CN-20x8-XD]
[DEBUG] Color match: CN-20x8-DO (đỏ)
[DEBUG] Accumulated quantity: 2
```

**Nếu thiếu:** Check từng bước trong console

**Chi tiết:** Phase 2 Doc 20 - Debugging Strategies & Doc 25 - Troubleshooting (Coming soon)

---

## 8. Testing

### 8.1 Manual Testing Workflow

```
1. Start dev server: npm run dev
2. Test scenario (e.g., "Tạo BOQ với DOL 15HP x3")
3. Verify kết quả:
   ✓ Detail View có đủ items?
   ✓ Quantities đúng?
   ✓ Summary tổng hợp correct?
   ✓ Excel export OK?
4. Test edge cases:
   - Quantity = 0
   - Rating không có trong mapping
   - Xóa/edit starters
```

### 8.2 Test Checklist Mẫu

**Feature: Heat Shrink Auto-Select**
- [ ] CB 100A → Heat Shrink 20x5 (4 colors)
- [ ] CB 200A → Heat Shrink 20x8 (main) + 20x5 (updown)
- [ ] Quantity: Red = `floor(main_qty/3)` ✓
- [ ] Quantity: Black = `neutral_qty` ✓
- [ ] Group renamed `CoNhiet` vẫn hoạt động ✓

**Chi tiết:** Phase 2 Doc 21-24 - Testing Guides (Coming soon)

---

## 9. Data Management

### 9.1 localStorage Keys

| Key | Chứa gì | Size ước tính |
|-----|---------|---------------|
| `boq_library` | Product[] | ~500KB |
| `boq_common_groups` | CommonGroup[] | ~1MB |
| `logicConfig` | Rules + Mappings | ~50KB |
| `boq_templates` | Template[] | ~10KB |
| `boq_brands` | string[] | ~5KB |

**Total:** ~1.5MB / 10MB limit

### 9.2 Backup/Restore

**Export:**
```typescript
// Click "Back-up/Restore" → "Export Backup"
// → Download boq-backup-YYYY-MM-DD.json
```

**Restore:**
```typescript
// Click "Restore from Backup" → Select file
// → Page reload with restored data
```

**Save location (Chrome/Edge):**
- File System Access API cho phép chọn folder tùy ý
- Khuyến nghị: Lưu vào Google Drive sync folder

**Chi tiết:** Phase 2 Doc 09 - Storage & Backup (Coming soon)

---

## 10. Git Workflow

### 10.1 Daily Workflow

```bash
# Sáng: Pull latest
git pull

# Làm việc: Commit thường xuyên
git add .
git commit -m "Fix: Heat Shrink quantity calculation"

# Cuối ngày: Push
git push
```

### 10.2 Useful Commands

```bash
# Xem status
git status

# Xem history
git log --oneline

# Undo commit gần nhất (giữ changes)
git reset HEAD~1

# Xem thay đổi chưa commit
git diff
```

**Chi tiết:** [Workflow guide: /git-workflow](../.agent/workflows/git-workflow.md)

---

## 📚 Full Documentation

### Phase 1: Foundation (✅ Complete)
1. [Project Overview](./01-project-overview.md) - Tổng quan, kiến trúc, features
2. [Technology Stack](./02-technology-stack.md) - React, TS, Vite, Tailwind, ExcelJS
3. [Dev Environment Setup](./03-dev-environment.md) - Cài đặt, chạy, troubleshoot
4. [Codebase Structure](./04-codebase-structure.md) - Folders, files, patterns

### Phase 2: Core Systems (⏳ Coming)
5. Data Layer & Types
6. Logic Engine Architecture ⭐
7. UI Component System
8. State Management
9. Storage & Backup

### Phase 3-7: Features, Testing, Advanced (📋 Planned)
- 10-15: Feature-specific guides
- 16-20: Development workflows
- 21-24: Testing
- 25-29: Maintenance
- 30-33: Advanced topics

---

## 🔖 Quick Links

**Tìm kiếm nhanh:**
- 🔍 Ctrl+F trong file này để search keyword
- 📁 Xem [Master Index](./README.md) để navigate toàn bộ docs
- 🐛 Debug issue? → [§7 Debug](#7-debug--troubleshooting)
- ✨ Thêm feature? → [§6 Development](#6-thêm-tính-năng-mới)

**External:**
- [React Docs](https://react.dev/)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)
- [Tailwind Docs](https://tailwindcss.com/docs)
- [ExcelJS Docs](https://github.com/exceljs/exceljs)

---

**💡 Tip:** Bookmark file này để tra cứu nhanh mọi lúc!

---

*Last updated: 07/12/2025*
