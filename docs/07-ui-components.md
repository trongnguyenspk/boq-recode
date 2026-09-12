# 07. UI Component System

**Version:** 1.0 | **Updated:** 07/12/2025 | **Difficulty:** Intermediate

---

## Quick Overview

**App Component Hierarchy:**
```
App (Root State)
├─ Header
├─ InputWizard
├─ DetailView
│   └─ Starter Cards (collapsible)
├─ SummaryView
├─ CommonView
│   ├─ Group List
│   └─ ProductPicker (modal)
├─ AdminPanel (modal)
└─ BackupRestoreModal
```

---

## 1. Main Components

### InputWizard (`components/InputWizard.tsx`)

**Nhiệm vụ:** Form nhập starter configuration

**Props:**
```typescript
interface Props {
  starters: Starter[];
  onAddStarter: (starter: Starter) => void;
  onRemoveStarter: (index: number) => void;
  onUpdateStarter: (index: number, updates: Partial<Starter>) => void;
}
```

**Key Features:**
- Template dropdown from `STARTER_TEMPLATES`
- Rating selector (conditional on `requiresRating`)
- Quantity input
- Add/Remove starter buttons

**State:** Stateless (controlled by App.tsx)

---

### DetailView (`components/DetailView.tsx`)

**Nhiệm vụ:** Display BOQ chi tiết grouped by starters

**Structure:**
```tsx
{starters.map((starter, idx) => (
  <StarterCard key={idx}>
    <Header>Starter #{idx+1} - {starter.type} {starter.rating}</Header>
    <Table>
      {bom
        .filter(item => item.starterIndex === idx)
        .map(item => <Row item={item} />)}
    </Table>
  </StarterCard>
))}
<ManualSection>
  {bom.filter(item => !item.starterIndex)}
</ManualSection>
```

**Features:**
- Expand/collapse cards
- Edit starter rating inline
- Color-coded sources (`template`=blue, `auto`=green, `manual`=yellow)

---

### SummaryView (`components/SummaryView.tsx`)

**Nhiệm vụ:** Show aggregated summary table

**Columns:** STT | IBOM | Description | Code | Brand | Unit | Quantity

**Logic:** Receives `summary` prop (already aggregated by `generateSummary()`)

**Features:**
- Sticky header
- Alternating row colors
- Total row at bottom

---

## 2. Modal Components

### AdminPanel (`components/AdminPanel.tsx`)

**Tabs:**
1. **Product Library:** CRUD products
2. **Templates:** Manage starter templates
3. **Brands:** Add/remove brands
4. **Import:** Bulk import from Excel

**State:** Internal state for current tab

**Why modal?** Không cần thường xuyên access → Modal cleaner than dedicated route

---

### BackupRestoreModal (`components/BackupRestoreModal.tsx`)

**Actions:**
- Export: Download JSON backup với File System Access API
- Import: Upload JSON to restore

**Data included:** `boq_common_groups`, `logicConfig`, `boq_library`, `boq_templates`, `boq_brands`

---

## 3. Reusable UI Components

### Toast (`ui/Toast.tsx`)

**Pattern:** Custom hook + component

```typescript
const { showToast, Toast } = useToast();

// Usage:
showToast('Success!', 'success');
showToast('Error occurred', 'error');

return <div>{Toast}{/* ... */}</div>
```

### Collapsible (`ui/Collapsible.tsx`)

```tsx
<Collapsible title="Items" defaultOpen={true}>
  <ItemsList />
</Collapsible>
```

**Implementation:** `useState` for open/closed + CSS transition

---

## 4. Component Communication

### Props Down, Callbacks Up

```
App.tsx (state)
  │
  ├─ props ─────▶ InputWizard
  │                  │
  │                  └─ callback ─▶ onAddStarter()
  │
  └─ props ─────▶ DetailView
                     │
                     └─ callback ─▶ onUpdateStarter()
```

**No Context API:** State ở root đủ đơn giản, không cần Context

---

## 5. Styling Approach

**Tailwind Utility Classes:**
```tsx
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
  <h2 className="text-xl font-bold mb-4">Title</h2>
</div>
```

**Dark Mode:**
- Toggle via `useTheme()` hook
- Apply/remove `.dark` class on `<html>`
- Use `dark:` variants in Tailwind

---

## 6. Performance Tips

**Avoid unnecessary re-renders:**
- Use `React.memo()` for pure components
- `useMemo()` for expensive calculations
- `useCallback()` for stable function references

**Example:**
```typescript
const DetailView = React.memo(({ bom, starters }) => {
  const filteredItems = useMemo(
    () => bom.filter(item => item.quantity > 0),
    [bom]
  );
  
  return <Table items={filteredItems} />;
});
```

---

**Chi tiết:** [Full component specs](./QUICK-REFERENCE.md#4-cấu-trúc-code)

---

**End Doc 07**
