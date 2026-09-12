# 08. State Management

**Version:** 1.0 | **Updated:** 07/12/2025 | **Difficulty:** Intermediate

---

## 1. State Architecture

**Approach:** Component state + Props drilling (No Redux/MobX)

**Rationale:** App scale nhỏ (~10 components) → Không cần global state library

---

## 2. Root State (App.tsx)

### 2.1 State Variables

```typescript
const [library, setLibrary] = useState<Product[]>([]);
const [templates, setTemplates] = useState<Template[]>([]);
const [brands, setBrands] = useState<string[]>([]);
const [starters, setStarters] = useState<Starter[]>([]);
const [bom, setBom] = useState<BOMItem[]>([]);
const [summary, setSummary] = useState<SummaryItem[]>([]);
const [manualItems, setManualItems] = useState<BOMItem[]>([]);
const [showAdmin, setShowAdmin] = useState(false);
const [showBackup, setShowBackup] = useState(false);
const [activeTab, setActiveTab] = useState<'boq' | 'common'>('boq');
```

### 2.2 Derived State (useEffect)

**Auto-calculate BOM khi starters change:**

```typescript
useEffect(() => {
  const generatedBom = generateDetail(starters, library, templates);
  setBom([...generatedBom, ...manualItems]);
}, [starters, library, templates, manualItems]);
```

**Auto-calculate Summary khi BOM change:**

```typescript
useEffect(() => {
  setSummary(generateSummary(bom));
}, [bom]);
```

**Dependency chain:**
```
starters change
  → generateDetail()
  → bom updated
  → generateSummary()
  → summary updated
  → UI re-renders
```

---

## 3. Persistence (localStorage)

### 3.1 Load on Mount

```typescript
useEffect(() => {
  try {
    const savedLibrary = localStorage.getItem('boq_library');
    if (savedLibrary) {
      setLibrary(JSON.parse(savedLibrary));
    } else {
      setLibrary(PRODUCT_LIBRARY);  // Default fallback
    }
  } catch (error) {
    console.error('Failed to load library:', error);
  }
}, []);
```

### 3.2 Save on Change

```typescript
useEffect(() => {
  localStorage.setItem('boq_library', JSON.stringify(library));
}, [library]);
```

**Pattern:** Separate `useEffect` cho mỗi persisted state

---

## 4. State Update Patterns

### 4.1 Immutable Updates

**❌ Bad (mutate):**
```typescript
starters[0].rating = '20HP';
setStarters(starters);  // Won't trigger re-render!
```

**✅ Good (immutable):**
```typescript
const newStarters = [...starters];
newStarters[0] = { ...newStarters[0], rating: '20HP' };
setStarters(newStarters);
```

### 4.2 Functional Updates

**When new state depends on old state:**

```typescript
// ❌ Risky (stale closure)
setQuantity(quantity + 1);

// ✅ Safe
setQuantity(prev => prev + 1);
```

### 4.3 Batch Updates

**React 18 auto-batches, nhưng explicit batching:**

```typescript
import { unstable_batchedUpdates } from 'react-dom';

unstable_batchedUpdates(() => {
  setStarters(newStarters);
  setBom(newBom);
  setSummary(newSummary);
});
// → Only 1 re-render
```

---

## 5. Custom Hooks

### 5.1 useTheme Hook

```typescript
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved) setTheme(saved as 'light' | 'dark');
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  return { theme, setTheme, toggleTheme };
}
```

**Usage:** `const { theme, toggleTheme } = useTheme();`

---

## 6. When to Use Context?

**Current:** Không dùng Context (props drilling đủ)

**Nên dùng Context khi:**
- Theming (đã dùng hook thay vì Context)
- User authentication (if needed)
- Deeply nested component cần shared state (>5 levels)

**Example nếu cần:**
```typescript
const AppContext = createContext<{
  library: Product[];
  setLibrary: (lib: Product[]) => void;
}>(null!);

// Provider ở App.tsx
<AppContext.Provider value={{ library, setLibrary }}>
  {children}
</AppContext.Provider>

// Consumer ở deep component
const { library } = useContext(AppContext);
```

---

## 7. State Debugging

**React DevTools:**
1. Install extension: React Developer Tools
2. F12 → Components tab
3. Select component → Inspect hooks
4. See current state values

**Console logging:**
```typescript
useEffect(() => {
  console.log('[State] Starters updated:', starters);
}, [starters]);
```

---

## 8. Performance Optimization

**Memoization:**
```typescript
const filteredBom = useMemo(
  () => bom.filter(item => item.source === 'auto'),
  [bom]
);

const handleUpdate = useCallback(
  (idx: number, updates: Partial<Starter>) => {
    // ... update logic
  },
  [starters]  // Dependencies
);
```

**React.memo for components:**
```typescript
export const SummaryView = React.memo(({ summary }) => {
  // Only re-render if summary changes
});
```

---

**End Doc 08**
