# 04. Cấu Trúc Codebase

**Phiên bản:** 1.0  
**Cập nhật:** 07/12/2025  
**Độ khó:** Intermediate

---

## Mục Lục

1. [Overview - Cây Thư Mục](#1-overview---cây-thư-mục)
2. [Folder `/src` - Source Code](#2-folder-src---source-code)
3. [Folder `/src/components` - UI Components](#3-folder-srccomponents---ui-components)
4. [Folder `/src/utils` - Utilities](#4-folder-srcutils---utilities)
5. [Folder `/src/data` - Static Data](#5-folder-srcdata---static-data)
6. [Folder `/src/types` - TypeScript Types](#6-folder-srctypes---typescript-types)
7. [Root Files](#7-root-files)
8. [File Naming Conventions](#8-file-naming-conventions)
9. [Import Patterns](#9-import-patterns)
10. [Module Responsibilities](#10-module-responsibilities)

---

## 1. Overview - Cây Thư Mục

```
boq-app/
├── 📁 src/                    # Source code chính
│   ├── 📁 components/         # React components
│   ├── 📁 utils/              # Helper functions
│   ├── 📁 data/               # Static data & configs
│   ├── 📁 types/              # TypeScript type definitions
│   ├── 📁 hooks/              # Custom React hooks
│   ├── 📄 App.tsx             # Root component
│   ├── 📄 main.tsx            # Entry point
│   └── 📄 index.css          # Global styles
│
├── 📁 public/                 # Static assets
│   └── 📄 vite.svg            # Favicon
│
├── 📁 docs/                   # Documentation (this file!)
│   ├── 📄 README.md
│   ├── 📄 01-project-overview.md
│   ├── 📄 02-technology-stack.md
│   └── ...
│
├── 📁 scripts/                # Utility scripts (ignored by Git)
│   ├── 📄 *.py                # Python data processing scripts
│   └── 📄 test_*.js           # Test scripts
│
├── 📁 node_modules/           # NPM dependencies (Git ignored)
│
├── 📄 package.json            # Dependencies & scripts
├── 📄 package-lock.json       # Locked dependency versions
├── 📄 tsconfig.json          # TypeScript config
├── 📄 vite.config.ts         # Vite build config
├── 📄 tailwind.config.js     # Tailwind CSS config
├── 📄 .gitignore             # Git ignore rules
└── 📄 README.md              # Project README
```

**Tổng số files:** ~50 files (không kể node_modules)

---

## 2. Folder `/src` - Source Code

### 2.1 Entry Points

#### `main.tsx` - Application Entry
**Nhiệm vụ:** Khởi động React app

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Flow:**
1. Import `App` component
2. Import global CSS
3. Render `<App />` vào `<div id="root">` trong `index.html`
4. Wrap trong `<StrictMode>` để detect bugs

#### `App.tsx` - Root Component
**Nhiệm vụ:** Root component, quản lý global state

**Kích thước:** ~300 lines

**State quản lý:**
```typescript
const [library, setLibrary] = useState<Product[]>([]);
const [templates, setTemplates] = useState<Template[]>([]);
const [brands, setBrands] = useState<string[]>([]);
const [starters, setStarters] = useState<Starter[]>([]);
const [bom, setBom] = useState<BOMItem[]>([]);
const [summary, setSummary] = useState<SummaryItem[]>([]);
const [showAdmin, setShowAdmin] = useState(false);
const [showBackup, setShowBackup] = useState(false);
const [activeTab, setActiveTab] = useState<'boq' | 'common'>('boq');
```

**Components con:**
- `InputWizard` - Nhập thông số
- `DetailView` - Bảng chi tiết
- `SummaryView` - Bảng tổng hợp
- `CommonView` - Logic quản lý
- `AdminPanel` - Quản trị
- `BackupRestoreModal` - Backup/restore

#### `index.css` - Global Styles
**Nhiệm vụ:** Tailwind directives + custom CSS

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .btn-primary {
    @apply px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700;
  }
}
```

---

## 3. Folder `/src/components` - UI Components

### 3.1 Main Views (Trang chính)

#### `InputWizard.tsx`
**Nhiệm vụ:** Form để chọn template, rating, quantity

**Props:**
```typescript
interface Props {
  starters: Starter[];
  onAddStarter: (starter: Starter) => void;
  onRemoveStarter: (index: number) => void;
  onUpdateStarter: (index: number, updates: Partial<Starter>) => void;
}
```

**Features:**
- Dropdown chọn template (DOL, Star-Delta...)
- Input rating (15HP, 20HP...)
- Input quantity
- Add/Remove starter cards

**Dependencies:**
- `STARTER_TEMPLATES` từ `data/library.ts`

---

#### `DetailView.tsx`
**Nhiệm vụ:** Hiển thị BOQ chi tiết theo từng starter

**Props:**
```typescript
interface Props {
  starters: Starter[];
  bom: BOMItem[];
  manualItems: BOMItem[];
  onUpdateStarter: (index: number, updates: Partial<Starter>) => void;
}
```

**Structure:**
```tsx
<DetailView>
  {starters.map((starter, idx) => (
    <StarterCard key={idx}>
      <Header />
      <ItemsTable>
        {bomItems
          .filter(item => item.starterIndex === idx)
          .map(item => <ItemRow />)}
      </ItemsTable>
    </StarterCard>
  ))}
  <ManualItemsSection />
</DetailView>
```

**Features:**
- Expandable/Collapsible starter cards
- Edit starter parameters
- Add manual items
- Color coding (template/auto/manual)

---

#### `SummaryView.tsx`
**Nhiệm vụ:** Bảng tổng hợp sản phẩm

**Props:**
```typescript
interface Props {
  summary: SummaryItem[];
}
```

**Columns:**
- STT (index)
- IBOM Code
- Description
- Code
- Brand
- Unit
- Quantity
- Note

**Features:**
- Auto group by product code
- Sum quantities
- Sticky header

---

#### `CommonView.tsx`
**Nhiệm vụ:** Quản lý Common Logic groups & items

**Kích thước:** ~700 lines (largest component!)

**State:**
```typescript
const [groups, setGroups] = useState<CommonGroup[]>([]);
const [selectedGroup, setSelectedGroup] = useState<CommonGroup | null>(null);
const [editingGroup, setEditingGroup] = useState<CommonGroup | null>(null);
const [showPicker, setShowPicker] = useState(false);
```

**Features:**
- List groups (GRP_1, GRP_3, GRP_BUSBAR...)
- Edit group name & logic text
- Add/Remove items from group
- Import items from library
- Export items to BOQ Detail

**Components con:**
- `ProductPicker` - Modal chọn products
- `Collapsible` - Expandable sections

---

### 3.2 Modals

#### `AdminPanel.tsx`
**Nhiệm vụ:** Quản lý Product Library, Templates, Brands

**Props:**
```typescript
interface Props {
  library: Product[];
  templates: Template[];
  brands: string[];
  onUpdateLibrary: (library: Product[]) => void;
  onUpdateTemplates: (templates: Template[]) => void;
  onUpdateBrands: (brands: string[]) => void;
  onClose: () => void;
}
```

**Tabs:**
1. **Product Library:** Add/edit/delete products
2. **Templates:** Manage starter templates
3. **Brands:** Add/remove brands
4. **Import:** Bulk import từ Excel

---

#### `BackupRestoreModal.tsx`
**Nhiệm vụ:** Export/Import data backup

**Props:**
```typescript
interface Props {
  onClose: () => void;
  onImport: (data: any) => void;
}
```

**Features:**
- **Export:** Download JSON backup với File System Access API
- **Import:** Upload JSON file để restore
- Backup includes: groups, library, templates, brands, config

---

### 3.3 UI Components (Reusable)

#### `ui/Toast.tsx`
**Nhiệm vụ:** Notification system

```typescript
export const useToast = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    // Add toast
  };

  return { showToast, Toast: ToastContainer };
};
```

**Usage:**
```typescript
const { showToast, Toast } = useToast();
showToast('Saved successfully!', 'success');
```

---

#### `ui/Collapsible.tsx`
**Nhiệm vụ:** Expandable sections

**Props:**
```typescript
interface Props {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}
```

**Usage:**
```tsx
<Collapsible title="Group Items" defaultOpen={true}>
  <ItemsList />
</Collapsible>
```

---

## 4. Folder `/src/utils` - Utilities

### 4.1 Logic Modules

#### `logic-engine.ts` ⭐ **KỲ QUAN NHẤT!**
**Nhiệm vụ:** Auto-selection logic engine

**Kích thước:** ~400 lines

**Main Function:**
```typescript
export function evaluateAutoSelection(
  sourceItems: Product[],
  allGroups: CommonGroup[],
  rules: DependencyRule[],
  mappingTables: MappingTable[]
): { matched: Product; quantity: number }[]
```

**Strategies implemented:**
1. **SAME_RATING:** Match by rating (CB 200A → MCT 200/5A)
2. **SIZE_MAPPING:** Map via table (CB 200A → Busbar 20x8)
3. **DEPENDENT:** (Future) Based on other group quantities

**Xem chi tiết:** [06-logic-engine.md](./06-logic-engine.md)

---

#### `boq-logic.ts`
**Nhiệm vụ:** Generate BOQ từ starters

**Main Functions:**
```typescript
// Generate detail items
export function generateDetail(
  starters: Starter[],
  library: Product[],
  templates: Template[]
): BOMItem[];

// Generate summary
export function generateSummary(bom: BOMItem[]): SummaryItem[];
```

**Flow:**
```
starters → Loop templates → Create BOMItems
BOMItems → Group by code → SummaryItems
```

---

#### `common-logic.ts`
**Nhiệm vụ:** Load CommonGroups từ file

```typescript
import commonData from '../data/common-logic.json';

export function getCommonGroups(): CommonGroup[] {
  return commonData as CommonGroup[];
}
```

---

### 4.2 Excel Operations

#### `excel-export.ts`
**Nhiệm vụ:** Export BOQ ra Excel

**Main Function:**
```typescript
export async function exportToExcel(
  bom: BOMItem[],
  summary: SummaryItem[]
): Promise<void>
```

**Process:**
1. Create workbook với ExcelJS
2. Add "Detail" sheet với BOM items
3. Add "Summary" sheet với grouped items
4. Apply formatting (colors, borders, headers)
5. Auto-fit columns
6. Download file

**Xem chi tiết:** [15-excel-operations.md](./15-excel-operations.md)

---

#### `excel-import.ts`
**Nhiệm vụ:** Import products từ Excel

**Main Function:**
```typescript
export async function importFromExcel(
  file: File
): Promise<Product[]>
```

**Expected columns:**
- IBOM Code
- Description
- Code
- Brand
- Unit

---

## 5. Folder `/src/data` - Static Data

### 5.1 Configuration Files

#### `library.ts`
**Sample product library (28 items)**

```typescript
export const PRODUCT_LIBRARY: Product[] = [
  {
    ibomCode: 'CB-3P-32A',
    description: 'CB 3P 32A',
    code: 'CB3032',
    brand: 'Schneider',
    unit: 'cái'
  },
  // ... more products
];

export const STARTER_TEMPLATES: Template[] = [
  {
    type: 'DOL',
    name: 'DOL Starter',
    requiresRating: true,
    items: [
      { ibomCode: 'CB-{rating}', quantity: 1 },
      { ibomCode: 'CT-{rating}', quantity: 3 },
      // ...
    ]
  }
];
```

---

#### `common-logic.json` ⭐ **DATA QUAN TRỌNG**
**Full product library & groups (~2500 lines!)**

**Structure:**
```json
[
  {
    "id": "GRP_3",
    "name": "CB Tổng",
    "logicText": "Circuit breakers for main protection",
    "items": [
      {
        "ibomCode": "CB-100A",
        "description": "CB 3P 100A",
        "code": "...",
        "brand": "Schneider",
        "unit": "cái"
      }
    ]
  },
  {
    "id": "GRP_HEAT_SHRINK",
    "name": "Co Nhiệt",
    "items": [
      // All heat shrink items (4 colors x 8 sizes = 32 items)
    ]
  }
]
```

**Groups:**
- GRP_1, GRP_2, GRP_3
- GRP_BUSBAR, GRP_HEAT_SHRINK
- GRP_17_MCT, GRP_17_PCT
- SHT_1, SHT_2, SHT_3

---

#### `logic-config.json`
**Dependency rules & mapping tables**

```json
{
  "rules": [
    {
      "id": "rule_heat_shrink",
      "mainGroup": "GRP_3",
      "dependentGroup": "GRP_HEAT_SHRINK",
      "strategy": "SIZE_MAPPING",
      "mappingKey": "busbar",
      "enabled": true,
      "phaseColumns": ["main", "UpDown"]
    }
  ],
  "mappingTables": {
    "busbar": {
      "100": { "main": "3x 20x5", "updown": "3x 20x5", "neutral": "20x5" },
      "200": { "main": "3x 20x8", "updown": "3x 20x5", "neutral": "20x5" }
    }
  }
}
```

---

## 6. Folder `/src/types` - TypeScript Types

### 6.1 Core Types (`types/index.ts`)

```typescript
// Product definition
export interface Product {
  ibomCode: string;
  description: string;
  code: string;
  brand: string;
  unit: Unit;
}

// BOM Item (Product + quantity + metadata)
export interface BOMItem extends Product {
  starterIndex?: number;
  quantity: number;
  source: 'template' | 'auto' | 'manual';
  note?: string;
}

// Summary Item (aggregated)
export interface SummaryItem extends Product {
  quantity: number;
  totalQuantity: number;
}

// Starter configuration
export interface Starter {
  type: string;
  rating?: string;
  quantity: number;
  customParams?: Record<string, any>;
}

// Template definition
export interface Template {
  type: string;
  name: string;
  requiresRating: boolean;
  items: TemplateItem[];
}

export interface TemplateItem {
  ibomCode: string;
  quantity: number | string;  // Can be formula like "{quantity}*3"
}
```

### 6.2 Logic Types (`types/logic.ts`)

```typescript
// Common group
export interface CommonGroup {
  id: string;
  name: string;
  logicText?: string;
  items: CommonItem[];
}

export interface CommonItem extends Product {
  // Additional fields if needed
}

// Dependency rule
export interface DependencyRule {
  id: string;
  mainGroup: string;
  dependentGroup: string;
  strategy: 'SAME_RATING' | 'SIZE_MAPPING' | 'DEPENDENT';
  mappingKey?: string;
  enabled: boolean;
  phaseColumns?: string[];
}

// Mapping table
export interface MappingTable {
  [key: string]: {
    main?: string;
    updown?: string;
    neutral?: string;
    earth?: string;
  };
}

// Logic configuration
export interface LogicConfig {
  rules: DependencyRule[];
  mappingTables: Record<string, MappingTable>;
}
```

---

## 7. Root Files

### 7.1 `package.json`
**Dependencies & scripts**

```json
{
  "name": "boq-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "exceljs": "^4.4.0",
    // ...
  }
}
```

### 7.2 `tsconfig.json`
**TypeScript compiler options**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "moduleResolution": "bundler"
  },
  "include": ["src"]
}
```

### 7.3 `.gitignore`
**Files to ignore**

```
node_modules/
dist/
*.local
scripts/
*.py
```

---

## 8. File Naming Conventions

### 8.1 React Components
- **PascalCase:** `InputWizard.tsx`, `DetailView.tsx`
- **Suffix `.tsx`:** Nếu có JSX

### 8.2 Utilities
- **kebab-case:** `logic-engine.ts`, `excel-export.ts`
- **Suffix `.ts`:** Pure TypeScript, no JSX

### 8.3 Data Files
- **kebab-case:** `common-logic.json`, `logic-config.json`
- **Format:** `.json` hoặc `.ts` (if need types)

### 8.4 Types
- **kebab-case:** `index.ts`, `logic.ts` (inside `types/`)

---

## 9. Import Patterns

### 9.1 Relative Imports

```typescript
// Good: Relative imports for local files
import { InputWizard } from './components/InputWizard';
import { generateDetail } from './utils/boq-logic';
import type { Product, BOMItem } from './types';

// Bad: Absolute imports without alias
import { InputWizard } from 'src/components/InputWizard';
```

### 9.2 Type Imports

```typescript
// Performance: Use type-only imports
import type { Product } from './types';

// vs
import { Product } from './types';  // Imports value too (unnecessary)
```

### 9.3 Default vs Named Exports

**Prefer Named Exports:**
```typescript
// ✅ Good: Named export
export function generateDetail() { ... }

// Import:
import { generateDetail } from './utils/boq-logic';
```

**Default Exports only for Components:**
```typescript
// OK for React components
export default function App() { ... }

// Import:
import App from './App';
```

---

## 10. Module Responsibilities

### 10.1 Separation of Concerns

| Layer | Folder | Nhiệm vụ | Example |
|-------|--------|----------|---------|
| **View** | `components/` | Render UI, handle user input | `DetailView.tsx` |
| **Logic** | `utils/` | Business logic, calculations | `logic-engine.ts` |
| **Data** | `data/` | Static data, configs | `common-logic.json` |
| **Types** | `types/` | Type definitions | `index.ts` |
| **State** | `App.tsx` | Global state management | `useState` hooks |

### 10.2 Dependency Direction

```
Components → Utils → Data
    ↓         ↓
  Types  ←  Types
```

**Quy tắc:**
- ✅ Components có thể import Utils
- ✅ Utils có thể import Data
- ❌ Utils KHÔNG được import Components
- ❌ Data KHÔNG được import bất kỳ thứ gì

### 10.3 File Size Guidelines

| Size | Action |
|------|--------|
| < 200 lines | ✅ OK |
| 200-400 lines | ⚠️ Consider splitting |
| > 400 lines | ❌ Refactor into smaller modules |

**Exceptions:**
- `CommonView.tsx` (700 lines) - Complex UI, acceptable
- `logic-engine.ts` (400 lines) - Core logic, tightly coupled

---

## 📚 Next Steps

Giờ bạn đã hiểu structure, có thể:
1. [Tìm hiểu Logic Engine](./06-logic-engine.md) - Core của app
2. [Học cách thêm features mới](./16-new-features.md)
3. [Debug common issues](./25-troubleshooting.md)

---

**Hết Document 04**
