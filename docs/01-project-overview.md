# 01. Tổng Quan Dự Án BOQ Generator

**Phiên bản:** 1.0  
**Ngày cập nhật:** 07/12/2025  
**Tác giả:** Development Team

---

## 📋 Mục Lục

1. [Giới Thiệu](#1-giới-thiệu)
2. [Mục Đích & Phạm Vi](#2-mục-đích--phạm-vi)
3. [Tính Năng Chính](#3-tính-năng-chính)
4. [Kiến Trúc Hệ Thống](#4-kiến-trúc-hệ-thống)
5. [Quyết Định Công Nghệ](#5-quyết-định-công-nghệ)
6. [Luồng Dữ Liệu](#6-luồng-dữ-liệu)
7. [Phân Tầng Ứng Dụng](#7-phân-tầng-ứng-dụng)
8. [Lịch Sử Phát Triển](#8-lịch-sử-phát-triển)

---

## 1. Giới Thiệu

### 1.1 BOQ Generator là gì?

**BOQ Generator** (Bill of Quantities Generator) là ứng dụng web tự động hóa việc tạo bảng khối lượng công việc cho hệ thống điện công nghiệp. Ứng dụng giúp kỹ sư điện nhanh chóng tạo danh sách vật tư, thiết bị cần thiết dựa trên cấu hình hệ thống điều khiển.

### 1.2 Vấn Đề Giải Quyết

**Trước khi có BOQ Generator:**
- ❌ Tạo BOQ thủ công qua Excel → Tốn thời gian (2-4 giờ/dự án)
- ❌ Dễ sai sót, thiếu vật tư phụ kiện
- ❌ Không nhất quán giữa các dự án
- ❌ Khó cập nhật khi thay đổi cấu hình
- ❌ Phụ thuộc vào kinh nghiệm cá nhân

**Sau khi có BOQ Generator:**
- ✅ Tạo BOQ tự động trong vài phút
- ✅ Đảm bảo đầy đủ vật tư theo logic phụ thuộc
- ✅ Nhất quán, chuẩn hóa
- ✅ Dễ dàng điều chỉnh và cập nhật
- ✅ Tích lũy kiến thức trong hệ thống

### 1.3 Người Dùng Mục Tiêu

- **Kỹ sư điện:** Thiết kế hệ thống điều khiển công nghiệp
- **Estimator:** Lập dự toán chi phí dự án
- **Procurement:** Mua sắm vật tư, thiết bị
- **Project Manager:** Quản lý danh sách vật tư dự án

---

## 2. Mục Đích & Phạm Vi

### 2.1 Mục Tiêu Chính

1. **Tự động hóa việc tạo BOQ** cho hệ thống điện điều khiển động cơ
2. **Quản lý logic phụ thuộc** giữa các thiết bị (CB → MCT, Busbar → Heat Shrink...)
3. **Tính toán số lượng chính xác** dựa trên cấu hình hệ thống
4. **Xuất báo cáo Excel** chi tiết và tổng hợp
5. **Backup/Restore** dữ liệu để đảm bảo tính liên tục

### 2.2 Phạm Vi Ứng Dụng

**Trong phạm vi (In Scope):**
- ✅ Hệ thống điều khiển động cơ (DOL, Star-Delta, VFD...)
- ✅ Tủ điện hạ thế (≤ 1000V)
- ✅ Vật tư phổ biến (CB, Contactor, Relay, Busbar, Heat Shrink...)
- ✅ Logic tự động chọn vật tư phụ thuộc
- ✅ Quản lý thư viện sản phẩm

**Ngoài phạm vi (Out of Scope):**
- ❌ Hệ thống điện cao thế (>1000V)
- ❌ Hệ thống PLC phức tạp
- ❌ Thiết kế sơ đồ mạch
- ❌ Tính toán ngắn mạch, chọn cáp
- ❌ ERP/MRP integration

---

## 3. Tính Năng Chính

### 3.1 BOQ Builder

**Mô tả:** Module chính để tạo BOQ từ templates hoặc manual

**Chức năng:**
1. **Chọn Template:** DOL, Star-Delta, Star-Delta w/ Timer, Soft Starter...
2. **Điều chỉnh tham số:** Rating động cơ, số lượng starter
3. **Tự động tính toán:** Dựa trên logic rules
4. **Thêm items thủ công:** Cho các vật tư đặc biệt
5. **Xem chi tiết:** Detail View & Summary View realtime

**Screenshot minh họa:**

```
┌─────────────────────────────────────────────┐
│ BOQ Builder                                 │
├─────────────────────────────────────────────┤
│ Template: [DOL ▼]  Rating: [15HP ▼]        │
│ Quantity: [3]                               │
│                                             │
│ Detail View          │  Summary View        │
│ ─────────────────────┼──────────────────   │
│ • CB 3P 32A      x3  │  Total Items: 25    │
│ • CT 32A         x9  │  Total Value: ...   │
│ • ...                │                      │
└─────────────────────────────────────────────┘
```

### 3.2 Common Logic System

**Mô tả:** Hệ thống quản lý nhóm vật tư và logic phụ thuộc

**Cấu trúc:**
```
Common Groups:
├── GRP_1: Đầu Vào Nguồn (Inputs)
├── GRP_2: Đầu Ra Động Cơ (Outputs)
├── GRP_3: CB Tổng (Main Breakers)
├── GRP_BUSBAR: Thanh Cái
├── GRP_HEAT_SHRINK: Co Nhiệt
├── GRP_17_MCT: Máy Cắt Tổng
└── GRP_17_PCT: Máy Cắt Phân Đoạn
```

**Logic Phụ Thuộc:**
- Khi chọn **CB 200A** trong GRP_3:
  - ✅ Tự động chọn **Busbar 20x8** (theo mapping table)
  - ✅ Tự động chọn **Heat Shrink 20x8** (đủ 4 màu: đỏ, vàng, xanh, đen)
  - ✅ Tính số lượng: Main/3 + UpDown/3 cho mỗi màu pha

### 3.3 Auto-Selection Engine

**Mô tả:** Module xử lý logic tự động chọn vật tư

**Các chiến lược (Strategies):**

#### 3.3.1 SAME_RATING
Chọn vật tư cùng rating với nguồn

**Ví dụ:**
```
CB 200A → MCT 200/5A (cùng rating 200A)
CB 400A → MCT 400/5A
```

#### 3.3.2 SIZE_MAPPING
Chọn vật tư dựa trên bảng mapping

**Ví dụ:** Busbar mapping
```json
{
  "100": { "main": "3x 20x5", "updown": "3x 20x5", "neutral": "20x5" },
  "200": { "main": "3x 20x8", "updown": "3x 20x5", "neutral": "20x5" },
  "300": { "main": "3x 30x10", "updown": "3x 20x8", "neutral": "20x8" }
}
```

#### 3.3.3 DEPENDENT (Future)
Chọn dựa trên quantity của group khác

### 3.4 Excel Export/Import

**Export:**
- ✅ Detail sheet: Chi tiết từng starter
- ✅ Summary sheet: Tổng hợp theo sản phẩm
- ✅ Format chuẩn: Màu sắc, border, header

**Import:**
- ✅ Import Product Library từ Excel
- ✅ Bulk add items

### 3.5 Backup & Restore

**Chức năng:**
- 📦 Export toàn bộ data ra file JSON
- 💾 Chọn nơi lưu file (Chrome/Edge)
- 📥 Restore từ file backup
- ☁️ Tương thích với Google Drive

**Data được backup:**
- Common Logic Groups
- Logic Configuration (rules + mappings)
- Product Library
- Templates & Brands

---

## 4. Kiến Trúc Hệ Thống

### 4.1 Kiến Trúc Tổng Quan (4 Tầng)

```
┌─────────────────────────────────────────────────┐
│         PRESENTATION LAYER (UI)                 │
│  ┌─────────────┐  ┌─────────────┐              │
│  │ BOQ Builder │  │ Common View │              │
│  │   Module    │  │   Module    │              │
│  └─────────────┘  └─────────────┘              │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────┐
│         APPLICATION LAYER (Logic)               │
│  ┌──────────────┐  ┌──────────────┐            │
│  │Logic Engine  │  │ BOQ Logic    │            │
│  │(Auto Select) │  │ (Calculation)│            │
│  └──────────────┘  └──────────────┘            │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────┐
│         DATA LAYER (Models & State)             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │Products  │ │ Common   │ │  Logic   │        │
│  │(Library) │ │ Groups   │ │  Config  │        │
│  └──────────┘ └──────────┘ └──────────┘        │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────┐
│         STORAGE LAYER (Persistence)             │
│        ┌────────────────────────┐               │
│        │   localStorage         │               │
│        │  (Browser Database)    │               │
│        └────────────────────────┘               │
└─────────────────────────────────────────────────┘
```

### 4.2 Component Hierarchy (React)

```
App
├── Header
│   ├── Navigation Tabs
│   ├── Export BOQ Button
│   ├── Backup/Restore Button
│   └── Admin Panel Button
│
├── BOQ Builder View
│   ├── InputWizard
│   │   ├── Template Selector
│   │   ├── Rating Selector
│   │   └── Quantity Input
│   ├── DetailView
│   │   └── Starter Cards (expandable)
│   └── SummaryView
│       └── Summary Table
│
└── Common Logic View
    ├── Group List
    ├── Item Manager
    └── Logic Config Editor
```

### 4.3 Data Flow (Luồng Dữ Liệu)

**Luồng tạo BOQ:**

```mermaid
graph LR
    A[User chọn Template] --> B[Set Starters State]
    B --> C[Generate Detail]
    C --> D[Apply Logic Rules]
    D --> E[Auto-select Items]
    E --> F[Calculate Quantities]
    F --> G[Update BOM State]
    G --> H[Generate Summary]
    H --> I[Display to User]
```

**Chi tiết từng bước:**

1. **User Input:** Chọn template (DOL), rating (15HP), quantity (3)
2. **Set State:** `starters = [{ type: 'DOL', rating: 15, qty: 3 }]`
3. **Generate Detail:** Loop qua starters, tạo base items
4. **Apply Logic:** Evaluate dependency rules (CB → Busbar → Heat Shrink)
5. **Auto-select:** Engine chọn items dựa trên strategies
6. **Calculate Qty:** Tính số lượng theo quantity rules
7. **Update BOM:** Cập nhật `bom` state
8. **Generate Summary:** Group by product code
9. **Display:** Render DetailView & SummaryView

---

## 5. Quyết Định Công Nghệ

### 5.1 Frontend Framework: React + TypeScript

**Lý do chọn React:**
- ✅ Component-based architecture → Dễ tái sử dụng
- ✅ Virtual DOM → Performance tốt với large lists
- ✅ Rich ecosystem → Nhiều libraries
- ✅ Developer-friendly → Dễ tìm talent

**Lý do chọn TypeScript:**
- ✅ Type safety → Giảm bugs runtime
- ✅ Better IDE support → Autocomplete, refactoring
- ✅ Self-documenting → Types = documentation
- ✅ Scalability → Dễ maintain khi app lớn

### 5.2 Build Tool: Vite

**Lý do chọn Vite (vs Create React App):**
- ✅ **Tốc độ:** Dev server khởi động tức thì
- ✅ **HMR nhanh:** Hot reload gần như instant
- ✅ **Modern:** Native ESM, optimized bundling
- ✅ **Simple config:** Ít boilerplate hơn

### 5.3 Styling: Tailwind CSS

**Lý do chọn Tailwind (vs CSS-in-JS/SCSS):**
- ✅ **Utility-first:** Viết CSS ngay trong JSX
- ✅ **Consistency:** Design tokens built-in
- ✅ **Performance:** Purge unused CSS tự động
- ✅ **Dark mode:** Built-in support

### 5.4 Storage: localStorage

**Lý do chọn localStorage (vs Backend Database):**
- ✅ **No backend needed:** Pure frontend app
- ✅ **Offline-first:** Hoạt động không cần internet
- ✅ **Fast:** Read/write instant
- ✅ **Simple:** No authentication, no server costs

**Trade-offs:**
- ❌ Limited capacity (~10MB)
- ❌ No sync across devices (→ Giải pháp: Backup to Drive)
- ❌ Single-user only

### 5.5 Excel Generation: ExcelJS

**Lý do chọn ExcelJS:**
- ✅ Pure JavaScript → No backend needed
- ✅ Rich formatting → Colors, borders, formulas
- ✅ Multi-sheet support
- ✅ Active maintenance

---

## 6. Luồng Dữ Liệu

### 6.1 Lifecycle của một BOQ

```
1. INIT (Khởi tạo)
   ↓
   Load từ localStorage
   ├─ boq_library → Set library state
   ├─ boq_common_groups → Set groups
   ├─ logicConfig → Set config
   └─ boq_templates → Set templates

2. INPUT (Nhập liệu)
   ↓
   User chọn template, rating, quantity
   ↓
   Set starters state

3. PROCESSING (Xử lý)
   ↓
   useEffect triggers
   ↓
   generateDetail(starters, library, templates)
   ├─ Loop qua starters
   ├─ Get template from library
   ├─ Create base BOMItems
   └─ Return generatedBom[]

4. LOGIC EVALUATION (Áp dụng logic)
   ↓
   evaluateAutoSelection()
   ├─ Find active rules for selected items
   ├─ Apply strategies (SAME_RATING, SIZE_MAPPING...)
   ├─ Calculate quantities
   └─ Return matched items + quantities

5. AGGREGATION (Tổng hợp)
   ↓
   generateSummary(bom)
   ├─ Group by productCode
   ├─ Sum quantities
   ├─ Calculate totals
   └─ Return SummaryItem[]

6. DISPLAY (Hiển thị)
   ↓
   Render DetailView & SummaryView

7. EXPORT (Xuất báo cáo)
   ↓
   exportToExcel(bom, summary)
   ├─ Create workbook
   ├─ Add sheets (Detail, Summary)
   ├─ Apply formatting
   └─ Download file
```

### 6.2 State Management Flow

```
App.tsx (Root)
  │
  ├─ library (Product[]) ────────────┐
  ├─ templates (Template[]) ─────────┤
  ├─ brands (string[]) ──────────────┤
  ├─ starters (Starter[]) ───────────┤
  ├─ bom (BOMItem[]) ────────────────┤
  └─ summary (SummaryItem[]) ────────┤
                                     │
  ┌──────────────────────────────────┘
  │
  ├─▶ InputWizard (props: {starters, onUpdate})
  │
  ├─▶ DetailView (props: {starters, bom, onUpdate})
  │
  ├─▶ SummaryView (props: {summary})
  │
  ├─▶ CommonView (props: {library, onAddToDetail})
  │
  └─▶ AdminPanel (props: {library, templates, brands, onUpdate})
```

**Đặc điểm:**
- **Single source of truth:** State tập trung ở App.tsx
- **Props drilling:** Pass state xuống children via props
- **Callback pattern:** Children update state via callbacks
- **useEffect for sync:** Auto re-calculate khi dependency thay đổi

---

## 7. Phân Tầng Ứng Dụng

### 7.1 Presentation Layer (UI Components)

**Nhiệm vụ:**
- Hiển thị dữ liệu cho user
- Nhận input từ user
- Dispatch actions to parent components

**Ví dụ components:**
- `InputWizard.tsx`: Form nhập thông số
- `DetailView.tsx`: Bảng chi tiết BOQ
- `SummaryView.tsx`: Bảng tổng hợp
- `BackupRestoreModal.tsx`: Dialog backup

**Nguyên tắc:**
- ✅ Stateless khi có thể (Controlled components)
- ✅ Prop validation với TypeScript
- ✅ Responsive design với Tailwind

### 7.2 Application Layer (Business Logic)

**Nhiệm vụ:**
- Xử lý nghiệp vụ
- Tính toán, transformation
- Orchestrate data flow

**Modules chính:**
- `logic-engine.ts`: Auto-selection logic
- `boq-logic.ts`: BOQ generation logic
- `excel-export.ts`: Excel export logic
- `excel-import.ts`: Excel import logic

**Nguyên tắc:**
- ✅ Pure functions khi có thể
- ✅ No side effects
- ✅ Testable đơn giản

### 7.3 Data Layer (Types & Models)

**Nhiệm vụ:**
- Define data structures
- Type safety
- Data validation

**Files:**
- `types/index.ts`: Core types (Product, BOMItem, SummaryItem...)
- `types/logic.ts`: Logic types (DependencyRule, LogicConfig...)

**Ví dụ:**
```typescript
export interface Product {
  ibomCode: string;
  description: string;
  code: string;
  brand: string;
  unit: Unit;
}

export interface BOMItem extends Product {
  starterIndex?: number;
  quantity: number;
  source: 'template' | 'auto' | 'manual';
}
```

### 7.4 Storage Layer (Persistence)

**Nhiệm vụ:**
- Lưu trữ dữ liệu persistent
- CRUD operations
- Data migration

**Keys trong localStorage:**
```
boq_library          → Product[]
boq_common_groups    → CommonGroup[]
logicConfig          → LogicConfig
boq_templates        → Template[]
boq_brands           → string[]
```

**Utilities:**
- `App.tsx`: Load/save logic
- `BackupRestoreModal.tsx`: Export/import JSON

---

## 8. Lịch Sử Phát Triển

### 8.1 Timeline

**Giai đoạn 1: Prototype (Week 1-2)**
- ✅ Setup React + TypeScript + Vite
- ✅ Basic BOQ Builder với DOL template
- ✅ Manual item management
- ✅ Simple Excel export

**Giai đoạn 2: Logic Engine (Week 3-4)**
- ✅ Thiết kế Logic Engine architecture
- ✅ Implement SAME_RATING strategy
- ✅ Implement SIZE_MAPPING strategy
- ✅ Busbar auto-selection

**Giai đoạn 3: Heat Shrink & Common Logic (Week 5-6)**
- ✅ Common Logic view
- ✅ Heat Shrink logic với phase colors
- ✅ Quantity calculation refinement
- 🐛 Debug heat shrink bugs (missing colors, wrong quantities)

**Giai đoạn 4: Data Management (Week 7)**
- ✅ Admin Panel
- ✅ Backup/Restore feature
- ✅ Product Library management
- ✅ Git version control setup

**Giai đoạn 5: Documentation (Current)**
- 📝 Comprehensive documentation system
- 📝 Developer guides
- 📝 Maintenance manuals

### 8.2 Lessons Learned

**Thành công:**
- ✅ TypeScript giúp catch nhiều bugs sớm
- ✅ Logic Engine architecture scale tốt
- ✅ localStorage đơn giản nhưng hiệu quả

**Thách thức:**
- ⚠️ Heat Shrink logic phức tạp hơn dự kiến
- ⚠️ Group name changes gây breaking changes
- ⚠️ Excel formatting tricky với ExcelJS

**Cải tiến trong tương lai:**
- 🔮 Unit tests cho Logic Engine
- 🔮 Better error handling
- 🔮 Performance optimization cho large BOQs
- 🔮 Real-time collaboration (if needed)

---

## 📚 Tài Liệu Liên Quan

- [02. Technology Stack Deep Dive](./02-technology-stack.md)
- [03. Development Environment Setup](./03-dev-environment.md)
- [04. Codebase Structure](./04-codebase-structure.md)
- [06. Logic Engine Architecture](./06-logic-engine.md)

---

**Hết Document 01**
