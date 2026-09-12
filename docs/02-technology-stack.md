# 02. Chi Tiết Công Nghệ (Technology Stack)

**Phiên bản:** 1.0  
**Ngày cập nhật:** 07/12/2025

---

## 📋 Mục Lục

1. [Tổng Quan Stack](#1-tổng-quan-stack)
2. [React + TypeScript](#2-react--typescript)
3. [Vite Build System](#3-vite-build-system)
4. [Tailwind CSS](#4-tailwind-css)
5. [ExcelJS](#5-exceljs)
6. [Dependencies Chi Tiết](#6-dependencies-chi-tiết)
7. [DevDependencies](#7-devdependencies)
8. [Configuration Files](#8-configuration-files)

---

## 1. Tổng Quan Stack

### 1.1 Technology Map

```
┌──────────────────────────────────────────────┐
│           BOQ Generator Stack                │
├──────────────────────────────────────────────┤
│                                              │
│ Frontend Framework                           │
│ ├─ React 18.3.1                             │
│ └─ TypeScript 5.6.2                         │
│                                              │
│ Build Tools                                  │
│ ├─ Vite 5.4.2 (Dev Server + Bundler)       │
│ └─ SWC (Fast TypeScript compiler)           │
│                                              │
│ UI/Styling                                   │
│ ├─ Tailwind CSS 3.4.1                      │
│ ├─ PostCSS 8.4.31                           │
│ └─ Autoprefixer 10.4.16                     │
│                                              │
│ Libraries                                    │
│ ├─ ExcelJS 4.4.0 (Excel generation)         │
│ ├─ Lucide React 0.344.0 (Icons)            │
│ └─ clsx 2.1.0 (Conditional classes)         │
│                                              │
│ Storage                                      │
│ └─ localStorage API (Native browser)        │
│                                              │
└──────────────────────────────────────────────┘
```

### 1.2 Version Matrix

| Package | Version | Mục đích | Bắt buộc |
|---------|---------|----------|----------|
| react | 18.3.1 | UI framework | ✅ |
| react-dom | 18.3.1 | React DOM renderer | ✅ |
| typescript | 5.6.2 | Type safety | ✅ |
| vite | 5.4.2 | Build tool | ✅ |
| tailwindcss | 3.4.1 | Styling | ✅ |
| exceljs | 4.4.0 | Excel export | ✅ |
| lucide-react | 0.344.0 | Icons | ⚪ Optional |

---

## 2. React + TypeScript

### 2.1 React 18 Features

**Tính năng sử dụng trong app:**

#### 2.1.1 Automatic Batching
React 18 tự động batch multiple state updates → Giảm re-renders

**Ví dụ trong app:**
```typescript
// App.tsx
const handleUpdateStarter = (index: number, updates: Partial<Starter>) => {
  const newStarters = [...starters];
  newStarters[index] = { ...newStarters[index], ...updates };
  setStarters(newStarters);  // Update 1
  // BOM sẽ tự update qua useEffect - nhưng chỉ re-render 1 lần!
};
```

#### 2.1.2 Concurrent Features (Future)
Chưa dùng nhưng có thể áp dụng:
- `useTransition()`: Cho các operations nặng (filter large lists)
- `useDeferredValue()`: Delay render khi typing search

#### 2.1.3 Strict Mode
Enabled trong `main.tsx` để detect bugs sớm

```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

### 2.2 TypeScript Configuration

**tsconfig.json** - Compiler options quan trọng:

```json
{
  "compilerOptions": {
    "target": "ES2020",              // Modern JavaScript
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",              // ES Modules
    "jsx": "react-jsx",              // React 18 JSX transform
    "strict": true,                  // Strict type checking
    "noUnusedLocals": true,         // Catch unused variables
    "noUnusedParameters": true,     // Catch unused params
    "noImplicitReturns": true,      // Ensure all code paths return
    "esModuleInterop": true         // Better CommonJS interop
  }
}
```

**Lợi ích:**
- ✅ Catch errors at compile time
- ✅ Better IDE autocomplete
- ✅ Self-documenting code via types
- ✅ Safer refactoring

**Type Safety trong app:**

```typescript
// types/index.ts
export type Unit = 'cái' | 'bộ' | 'chiếc' | 'mét' | 'm' | 'md';

export interface Product {
  ibomCode: string;
  description: string;
  code: string;
  brand: string;
  unit: Unit;  // Type-safe units!
}

// TypeScript sẽ error nếu dùng unit không hợp lệ:
const product: Product = {
  unit: 'kg'  // ❌ Error: Type '"kg"' is not assignable to type 'Unit'
};
```

---

## 3. Vite Build System

### 3.1 Tại Sao Chọn Vite?

**So sánh với Create React App (CRA):**

| Feature | Vite | CRA |
|---------|------|-----|
| Dev start time | <1s | ~30s |
| HMR speed | Instant | ~2-5s |
| Build time | ~15s | ~45s |
| Bundle size | Smaller (tree-shaking tốt hơn) | Larger |
| Config | Simple | Complex (need eject) |

### 3.2 Vite Configuration

**vite.config.ts:**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],  // SWC for fast compilation
  server: {
    port: 5173,       // Dev server port
    open: true        // Auto open browser
  },
  build: {
    outDir: 'dist',   // Output directory
    sourcemap: true   // Generate source maps for debugging
  }
})
```

**Plugins:**

#### @vitejs/plugin-react-swc
- SWC compiler (viết bằng Rust) → **Nhanh hơn Babel 20x**
- Fast Refresh (HMR) out of the box
- JSX transform tự động

### 3.3 Development Workflow

**Khởi động dev server:**
```bash
npm run dev
```

**Vite sẽ:**
1. Start dev server tại `http://localhost:5173`
2. Use native ESM (không bundle trong dev)
3. Hot Module Replacement (HMR) tức thì
4. Auto-restart khi thay đổi config

**Build cho production:**
```bash
npm run build
```

**Vite sẽ:**
1. Bundle code với Rollup
2. Minify với esbuild
3. Tree-shake unused code
4. Generate optimized chunks
5. Output vào folder `dist/`

### 3.4 Environment Variables

**Cách dùng trong Vite:**

`.env` file:
```
VITE_API_URL=https://api.example.com
VITE_APP_VERSION=1.0.0
```

Truy cập trong code:
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
const version = import.meta.env.VITE_APP_VERSION;
```

**Lưu ý:**
- ⚠️ Prefix `VITE_` là bắt buộc
- ⚠️ Chỉ được dùng biến public (không chứa secrets)
- ⚠️ Rebuild khi thay đổi `.env`

---

## 4. Tailwind CSS

### 4.1 Setup & Configuration

**tailwind.config.js:**

```javascript
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",  // Scan all component files
  ],
  darkMode: 'class',  // Enable dark mode with class strategy
  theme: {
    extend: {
      // Custom colors, fonts, spacing...
    },
  },
  plugins: [],
}
```

**Purge Strategy:**
Tailwind tự động xóa unused CSS dựa trên `content` config → Bundle size nhỏ

### 4.2 Utility-First Approach

**Ví dụ styling trong app:**

```tsx
// Traditional CSS
<div className="card">
  <h2 className="card-title">Title</h2>
</div>

// CSS file:
.card { padding: 1rem; background: white; border-radius: 0.5rem; }
.card-title { font-size: 1.25rem; font-weight: bold; }

// Tailwind Way
<div className="p-4 bg-white rounded-lg">
  <h2 className="text-xl font-bold">Title</h2>
</div>
```

**Lợi ích:**
- ✅ Không cần đặt tên class
- ✅ Thay đổi nhanh (chỉnh trực tiếp trong JSX)
- ✅ Responsive dễ dàng: `md:text-xl lg:text-2xl`
- ✅ Dark mode: `dark:bg-gray-900`

### 4.3 Custom Utilities

**Tái sử dụng với `@apply`:**

```css
/* src/index.css */
@layer components {
  .btn-primary {
    @apply px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700;
  }
  
  .card {
    @apply bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6;
  }
}
```

Dùng như class thông thường:
```tsx
<button className="btn-primary">Click me</button>
<div className="card">Content</div>
```

### 4.4 Dark Mode Implementation

**Kích hoạt dark mode:**

```typescript
// hooks/useTheme.ts
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return { theme, toggleTheme: () => setTheme(t => t === 'light' ? 'dark' : 'light') };
}
```

**Dùng trong components:**
```tsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  Content tự động đổi màu theo theme!
</div>
```

---

## 5. ExcelJS

### 5.1 Tại Sao Chọn ExcelJS?

**So sánh alternatives:**

| Library | ExcelJS | XLSX.js | SheetJS |
|---------|---------|---------|---------|
| Styling support | ✅ Full | ❌ No | ⚠️ Limited |
| File size | ~500KB | ~150KB | ~200KB |
| Formulas | ✅ | ✅ | ✅ |
| Multi-sheet | ✅ | ✅ | ✅ |
| Active? | ✅ | ❌ | ✅ |

→ Chọn ExcelJS vì cần **rich formatting** (colors, borders, merge cells)

### 5.2 Core Features Sử Dụng

#### 5.2.1 Workbook & Worksheets

```typescript
import ExcelJS from 'exceljs';

// Tạo workbook
const workbook = new ExcelJS.Workbook();

// Thêm worksheet
const detailSheet = workbook.addWorksheet('Detail');
const summarySheet = workbook.addWorksheet('Summary');
```

#### 5.2.2 Cell Styling

```typescript
// Set row colors
row.eachCell(cell => {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }  // Blue background
  };
  cell.font = {
    bold: true,
    color: { argb: 'FFFFFFFF' },  // White text
    size: 11
  };
});

// Borders
cell.border = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' }
};

// Alignment
cell.alignment = {
  horizontal: 'center',
  vertical: 'middle'
};
```

#### 5.2.3 Column Width & Row Height

```typescript
// Auto-fit columns
worksheet.columns.forEach(column => {
  let maxLength = 0;
  column.eachCell({ includeEmpty: true }, cell => {
    const length = cell.value ? cell.value.toString().length : 10;
    if (length > maxLength) maxLength = length;
  });
  column.width = maxLength + 2;
});

// Set row height
row.height = 25;
```

#### 5.2.4 Merge Cells

```typescript
// Merge header cells
worksheet.mergeCells('A1:F1');
worksheet.getCell('A1').value = 'BOQ DETAIL';
worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
```

#### 5.2.5 Save & Download

```typescript
// Generate buffer
const buffer = await workbook.xlsx.writeBuffer();

// Create download link
const blob = new Blob([buffer], { 
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
});
const url = URL.createObjectURL(blob);

// Trigger download
const a = document.createElement('a');
a.href = url;
a.download = 'BOQ_Export.xlsx';
a.click();
URL.revokeObjectURL(url);
```

### 5.3 Performance Considerations

**Tối ưu cho large datasets:**

```typescript
// ❌ Chậm: Loop từng cell
for (let row of data) {
  for (let col in row) {
    worksheet.getCell(`${col}${rowNum}`).value = row[col];
  }
}

// ✅ Nhanh: Add row bulk
data.forEach(item => {
  worksheet.addRow([
    item.ibomCode,
    item.description,
    item.quantity,
    // ...
  ]);
});
```

**Memory usage:**
- ExcelJS giữ entire workbook in memory
- Avoid với datasets > 100,000 rows
- Nếu cần: Dùng streaming API (advanced)

---

## 6. Dependencies Chi Tiết

### 6.1 Production Dependencies

Xem trong `package.json`:

```json
{
  "dependencies": {
    "clsx": "^2.1.0",              // Conditional className utility
    "exceljs": "^4.4.0",           // Excel generation
    "lucide-react": "^0.344.0",    // Icon library
    "react": "^18.3.1",            // Core React
    "react-dom": "^18.3.1"         // React DOM renderer
  }
}
```

#### clsx (2.1.0)
**Mục đích:** Utility để combine classNames conditionally

**Ví dụ:**
```typescript
import clsx from 'clsx';

// Instead of:
className={`btn ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}

// Use clsx:
className={clsx('btn', { active, disabled })}

// Or with cn() helper:
import { cn } from '@/utils/cn';
className={cn('btn', active && 'active', disabled && 'disabled')}
```

#### lucide-react (0.344.0)  
**Mục đích:** Icon library (modern alternative to Font Awesome)

**Features:**
- ✅ Tree-shakeable (chỉ bundle icons được dùng)
- ✅ Consistent design
- ✅ React components (không cần SVG imports)

**Ví dụ:**
```typescript
import { Download, Upload, Settings, Moon, Sun } from 'lucide-react';

<button>
  <Download className="w-4 h-4" />
  Export
</button>
```

Icons trong app:
- `LayoutDashboard`: Logo
- `FileText`: Export button
- `Database`: Backup button
- `Settings`: Admin button
- `Sun/Moon`: Theme toggle

---

## 7. DevDependencies

### 7.1 Build & Compile

```json
{
  "devDependencies": {
    "@vitejs/plugin-react-swc": "^3.5.0",
    "vite": "^5.4.2",
    "typescript": "~5.6.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0"
  }
}
```

**@types packages:**
- Type definitions cho libraries không có built-in types
- Cho phép TypeScript hiểu API của React, React-DOM

### 7.2 Styling Tools

```json
{
  "tailwindcss": "^3.4.1",
  "postcss": "^8.4.31",
  "autoprefixer": "^10.4.16"
}
```

**PostCSS:** CSS processor, Tailwind chạy trên PostCSS  
**Autoprefixer:** Tự động thêm vendor prefixes (-webkit-, -moz-...)

### 7.3 Linting & Formatting (Recommended to add)

**Chưa có trong project, nên thêm:**

```bash
npm install -D eslint @typescript-eslint/eslint-plugin prettier
```

**ESLint config:**
```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended"
  ]
}
```

---

## 8. Configuration Files

### 8.1 File Structure

```
boq-app/
├── package.json           # Dependencies & scripts
├── tsconfig.json         # TypeScript compiler options
├── tsconfig.node.json    # TypeScript for Vite config
├── vite.config.ts        # Vite configuration
├── tailwind.config.js    # Tailwind CSS config
├── postcss.config.js     # PostCSS plugins
└── .gitignore            # Git ignore rules
```

### 8.2 package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",                    // Start dev server
    "build": "tsc -b && vite build",  // Type check + build
    "preview": "vite preview"         // Preview production build
  }
}
```

**Workflow:**
```bash
# Development
npm run dev        # → http://localhost:5173

# Build for production
npm run build      # → Output: dist/

# Test production build locally
npm run preview    # → http://localhost:4173
```

### 8.3 TypeScript Configs

**tsconfig.json** (App code):
```json
{
  "include": ["src"],  // Only compile src/
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true
  }
}
```

**tsconfig.node.json** (Vite config):
```json
{
  "include": ["vite.config.ts"],  // For vite.config.ts only
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

Tách 2 configs vì Vite config cần settings khác với app code.

### 8.4 PostCSS Config

**postcss.config.js:**
```javascript
export default {
  plugins: {
    tailwindcss: {},      // Process Tailwind directives
    autoprefixer: {},     // Add vendor prefixes
  },
}
```

Vite tự động chạy PostCSS khi encounter CSS files.

---

## 9. Browser Compatibility

### 9.1 Target Browsers

**Vite default targets:**
```
> 0.5%
last 2 versions
Firefox ESR
not dead
```

**Nghĩa là:**
- ✅ Chrome/Edge (last 2 versions)
- ✅ Firefox (last 2 versions + ESR)
- ✅ Safari (last 2 versions)
- ❌ IE11 (not supported)

### 9.2 Polyfills

**Không cần polyfills** vì:
- Target modern browsers (ES2020+)
- localStorage API có sẵn mọi browser hiện đại
- No IE11 support needed

---

## 10. Dependency Management

### 10.1 Update Strategy

**Semantic Versioning:**
```
^18.3.1 = Cho phép updates 18.x.x (minor + patch)
~18.3.1 = Chỉ cho phép 18.3.x (patch only)
18.3.1 = Lock exact version
```

**Update workflow:**
```bash
# Check outdated packages
npm outdated

# Update minor versions
npm update

# Update major versions (cẩn thận!)
npm install react@latest
```

### 10.2 Lock File

**package-lock.json:**
- Lock exact versions của **tất cả** dependencies (including transitive)
- Đảm bảo builds reproducible
- Commit vào Git

**Lưu ý:**
- ✅ LUÔN commit package-lock.json
- ❌ KHÔNG xóa để "fix" issues
- ✅ Run `npm ci` trong CI/CD (thay vì `npm install`)

---

## 📚 Tài Liệu Liên Quan

- [03. Development Environment Setup](./03-dev-environment.md) - Hướng dẫn setup môi trường
- [08. State Management](./08-state-management.md) - React state patterns
- [15. Excel Export/Import](./15-excel-operations.md) - ExcelJS deep dive

---

**Hết Document 02**
