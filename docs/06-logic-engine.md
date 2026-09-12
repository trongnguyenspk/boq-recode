# 06. Logic Engine - Auto-Selection System ⭐

**Phiên bản:** 1.0  
**Cập nhật:** 07/12/2025  
**Độ khó:** Advanced  
**Importance:** 🔴 CRITICAL - Core của toàn bộ app

---

## Mục Lục

1. [Overview - Logic Engine](#1-overview---logic-engine)
2. [Architecture & Design](#2-architecture--design)
3. [Main Function: evaluateAutoSelection](#3-main-function-evaluateautoselection)
4. [Strategy: SAME_RATING](#4-strategy-same_rating)
5. [Strategy: SIZE_MAPPING](#5-strategy-size_mapping)
6. [Heat Shrink Logic Chi Tiết](#6-heat-shrink-logic-chi-tiết)
7. [Quantity Calculation](#7-quantity-calculation)
8. [Debugging & Troubleshooting](#8-debugging--troubleshooting)
9. [Extending Logic Engine](#9-extending-logic-engine)
10. [Performance Considerations](#10-performance-considerations)

---

## 1. Overview - Logic Engine

### 1.1 Logic Engine Là Gì?

**Module:** `src/utils/logic-engine.ts` (425 lines)  
**Nhiệm vụ:** Tự động chọn vật tư phụ thuộc dựa trên logic rules

**Ví dụ thực tế:**

```
User chọn: CB 3P 200A (từ GRP_3)

Logic Engine tự động add:
  ├─ Busbar 20x8 (3 thanh) - từ GRP_BUSBAR
  ├─ Heat Shrink 20x8 đỏ (2m) - từ GRP_HEAT_SHRINK
  ├─ Heat Shrink 20x8 vàng (2m)
  ├─ Heat Shrink 20x8 xanh (2m)
  ├─ Heat Shrink 20x8 đen (6m)
  └─ MCT 200/5A - từ GRP_17_MCT
```

### 1.2 Tại Sao Cần Logic Engine?

**Vấn đề:**
- Mỗi CB cần busbar, heat shrink, MCT tương ứng
- Chọn thủ công → Dễ thiếu, dễ sai size
- Không consistent giữa các dự án

**Giải pháp:**
- ✅ Rules-based system
- ✅ Configurable qua JSON
- ✅ Extensible (thêm strategies mới)
- ✅ Debuggable (console logs)

### 1.3 Input/Output

**Input:**
```typescript
evaluateAutoSelection(
  sourceItems: Product[],      // Items đã chọn (e.g., [CB 200A])
  allGroups: CommonGroup[],    // All groups (để tìm dependent group)
  rules: DependencyRule[],     // Active rules
  mappingTables: MappingTable[] // Mapping data (busbar, cable...)
)
```

**Output:**
```typescript
{
  matched: Product;   // Product được chọn
  quantity: number;   // Số lượng
}[]
```

**Example:**
```typescript
// Input:
sourceItems = [{ ibomCode: 'CB-200A', ... }]
rules = [{ strategy: 'SIZE_MAPPING', mappingKey: 'busbar', ... }]

// Output:
[
  { matched: { ibomCode: 'BUSBAR-20x8', ... }, quantity: 3 },
  { matched: { ibomCode: 'CN-20x8-DO', ... }, quantity: 2 },
  { matched: { ibomCode: 'CN-20x8-V', ... }, quantity: 2 },
  // ...
]
```

---

## 2. Architecture & Design

### 2.1 Design Patterns

**Strategy Pattern:**
```
Context (evaluateAutoSelection)
  └─ Strategy Interface (RuleStrategy)
       ├─ SAME_RATING
       ├─ SIZE_MAPPING
       └─ DEPENDENT (future)
```

**Tại sao Strategy Pattern?**
- ✅ Dễ thêm strategies mới (Open/Closed Principle)
- ✅ Logic isolated, dễ test
- ✅ Config-driven (không hard-code)

### 2.2 Flow Overview

```
Step 1: FILTER RULES
  └─ Tìm rules có mainGroup = selected group

Step 2: LOAD DEPENDENT GROUP
  └─ Lấy products từ dependentGroup

Step 3: APPLY STRATEGY
  ├─ SAME_RATING: Match by rating
  └─ SIZE_MAPPING: Use mapping table
      ├─ Extract size từ mapping
      ├─ Parse quantity (3x 20x8 → qty=3, size=20x8)
      ├─ Filter products by size
      └─ Match colors (for Heat Shrink)

Step 4: CALCULATE QUANTITY
  ├─ Phase items: floor(qty/3)
  └─ Neutral items: direct qty

Step 5: DEDUPLICATE & RETURN
```

### 2.3 Code Structure

```typescript
// src/utils/logic-engine.ts

export function evaluateAutoSelection(...) {
  const result: MatchedItem[] = [];
  
  // 1. Filter active rules
  const activeRules = rules.filter(r => 
    r.enabled && 
    sourceItems.some(item => belongsToGroup(item, r.mainGroup))
  );
  
  // 2. Process each rule
  for (const rule of activeRules) {
    const dependentGroup = allGroups.find(g => g.id === rule.dependentGroup);
    
    // 3. Apply strategy
    if (rule.strategy === 'SAME_RATING') {
      // ... SAME_RATING logic
    } else if (rule.strategy === 'SIZE_MAPPING') {
      // ... SIZE_MAPPING logic
    }
  }
  
  // 4. Deduplicate
  return deduplicateResults(result);
}
```

---

## 3. Main Function: evaluateAutoSelection

### 3.1 Signature Chi Tiết

```typescript
export function evaluateAutoSelection(
  sourceItems: Product[],
  allGroups: CommonGroup[],
  rules: DependencyRule[],
  mappingTables: MappingTable[]
): { matched: Product; quantity: number }[]
```

**Parameters:**

| Param | Type | Mô tả |
|-------|------|-------|
| `sourceItems` | `Product[]` | Items user đã chọn (trigger selection) |
| `allGroups` | `CommonGroup[]` | Tất cả groups (để tìm dependent items) |
| `rules` | `DependencyRule[]` | Logic rules configuration |
| `mappingTables` | `MappingTable[]` | Mapping data (busbar, cable...) |

**Returns:** Array of matched products with quantities

### 3.2 Step-by-Step Walkthrough

**Step 1: Filter Active Rules**

```typescript
const activeRules = rules.filter(rule => {
  if (!rule.enabled) return false;
  
  // Check if any sourceItem belongs to rule's mainGroup
  return sourceItems.some(item => {
    // Find group containing this item
    const group = allGroups.find(g => 
      g.items.some(i => i.ibomCode === item.ibomCode)
    );
    return group?.id === rule.mainGroup;
  });
});

console.log(`Found ${activeRules.length} active rules`);
```

**Step 2: Load Dependent Group**

```typescript
for (const rule of activeRules) {
  const dependentGroup = allGroups.find(g => g.id === rule.dependentGroup);
  
  if (!dependentGroup) {
    console.warn(`Group ${rule.dependentGroup} not found`);
    continue;
  }
  
  const potentialMatches = dependentGroup.items;
  console.log(`Processing ${potentialMatches.length} items from ${dependentGroup.name}`);
}
```

**Step 3: Apply Strategy** (detail ở sections 4, 5)

**Step 4: Accumulate Results**

```typescript
const matched = findMatchingProduct(potentialMatches, criteria);
if (matched) {
  result.push({
    matched,
    quantity: calculatedQty
  });
}
```

**Step 5: Deduplicate**

```typescript
function deduplicateResults(results: MatchedItem[]): MatchedItem[] {
  const map = new Map<string, MatchedItem>();
  
  results.forEach(item => {
    const existing = map.get(item.matched.ibomCode);
    
    if (existing) {
      // Sum quantities
      existing.quantity += item.quantity;
    } else {
      map.set(item.matched.ibomCode, { ...item });
    }
  });
  
  return Array.from(map.values());
}
```

---

## 4. Strategy: SAME_RATING

### 4.1 Concept

**Ý tưởng:** Chọn item có rating giống với source item

**Use case:** MCT, PCT (rating phải match với CB)

**Example:**
```
CB 100A → MCT 100/5A
CB 200A → MCT 200/5A
CB 400A → MCT 400/5A
```

### 4.2 Implementation

```typescript
if (rule.strategy === 'SAME_RATING') {
  for (const sourceItem of sourceItems) {
    // Extract rating từ sourceItem
    const rating = extractRating(sourceItem.description);
    // e.g., "CB 3P 200A" → "200"
    
    if (!rating) continue;
    
    // Find matching item with same rating
    const matched = potentialMatches.find(item => {
      const itemRating = extractRating(item.description);
      return itemRating === rating;
    });
    
    if (matched) {
      result.push({
        matched,
        quantity: sourceItem.quantity || 1
      });
    }
  }
}
```

### 4.3 Rating Extraction

**Helper function:**

```typescript
function extractRating(description: string): string | null {
  // Pattern: "100A", "200A", "400/5A"
  const match = description.match(/(\d+)(?:\/\d+)?A/);
  return match ? match[1] : null;
}

// Examples:
extractRating("CB 3P 100A")    // → "100"
extractRating("MCT 200/5A")    // → "200"
extractRating("CT 32A")        // → "32"
extractRating("Start Button")  // → null
```

### 4.4 Edge Cases

**Missing rating:**
```typescript
if (!rating) {
  console.warn(`Cannot extract rating from: ${sourceItem.description}`);
  continue;  // Skip this item
}
```

**No matching item:**
```typescript
if (!matched) {
  console.warn(`No match found for rating ${rating} in ${rule.dependentGroup}`);
  // Continue (không throw error)
}
```

**Multiple matches:**
```typescript
// Use `find()` → Lấy item đầu tiên
// Nếu cần multiple: Dùng `filter()` + loop
const allMatches = potentialMatches.filter(item => 
  extractRating(item.description) === rating
);
```

---

## 5. Strategy: SIZE_MAPPING

### 5.1 Concept

**Ý tưởng:** Dùng mapping table để determine size/quantity

**Use case:** Busbar, Heat Shrink (size phụ thuộc vào CB rating)

**Mapping table example:**

```json
{
  "100": { "main": "3x 20x5", "updown": "3x 20x5", "neutral": "20x5" },
  "200": { "main": "3x 20x8", "updown": "3x 20x5", "neutral": "20x5" },
  "300": { "main": "3x 30x10", "updown": "3x 20x8", "neutral": "20x8" }
}
```

**Logic:**
```
CB 200A selected
  ↓
Lookup rating "200" in table
  ↓
Get sizes: { main: "3x 20x8", updown: "3x 20x5", neutral: "20x5" }
  ↓
For each column (main, updown, neutral):
  Parse size string → Extract qty & size
  Find products matching size
  Calculate quantity
```

### 5.2 Implementation Overview

```typescript
if (rule.strategy === 'SIZE_MAPPING') {
  const mappingTable = mappingTables[rule.mappingKey];
  
  for (const sourceItem of sourceItems) {
    const rating = extract Rating(sourceItem.description);
    const matchedKey = findMappingKey(rating, mappingTable);
    
    if (!matchedKey) continue;
    
    const sizes = mappingTable[matchedKey];
    
    // Process each column (main, updown, neutral, earth)
    Object.entries(sizes).forEach(([colName, sizeVal]) => {
      // Parse size: "3x 20x8"
      const { qty, actualSize } = parseSize(sizeVal);
      
      // Find products matching size
      const matches = potentialMatches.filter(item => 
        item.description.includes(actualSize) ||
        item.productCode.includes(actualSize)
      );
      
      // Calculate quantity & add to result
      // ... (detail below)
    });
  }
}
```

### 5.3 Size Parsing

**Format:** `"3x 20x8"` hoặc `"20x5"`

```typescript
function parseSize(sizeString: string): { qty: number; actualSize: string } {
  const xCount = (sizeString.match(/x/gi) || []).length;
  
  if (xCount >= 2) {
    // Format: "3x 20x8" → qty=3, size="20x8"
    const match = sizeString.match(/^(\d+)\s*x\s*(.+)$/i);
    if (match) {
      return {
        qty: parseInt(match[1]),
        actualSize: match[2].trim()
      };
    }
  }
  
  // Format: "20x5" → qty=1, size="20x5"
  return {
    qty: 1,
    actualSize: sizeString.trim()
  };
}

// Examples:
parseSize("3x 20x8")  // → { qty: 3, actualSize: "20x8" }
parseSize("20x5")     // → { qty: 1, actualSize: "20x5" }
parseSize("2x30x10")  // → { qty: 2, actualSize: "30x10" }
```

### 5.4 Matching Products

**Fuzzy matching by size:**

```typescript
const matches = potentialMatches.filter(item => {
  // Check description
  if (item.description.toLowerCase().includes(actualSize.toLowerCase())) {
    return true;
  }
  
  // Check product code
  if (item.code?.includes(actualSize)) {
    return true;
  }
  
  // Check note field (if exists)
  if (item.note?.includes(`Size: ${actualSize}`)) {
    return true;
  }
  
  return false;
});

console.log(`[DEBUG] Found ${matches.length} matches for size ${actualSize}`);
```

---

## 6. Heat Shrink Logic Chi Tiết

### 6.1 Problem Statement

**Requirements:**
1. Khi chọn CB, tự động chọn Heat Shrink matching size
2. Chọn đủ 4 màu: Đỏ, Vàng, Xanh, Đen
3. Quantity:
   - **Phase colors (R/Y/B):** `floor(qty / 3)` từ `main` và `UpDown` columns
   - **Neutral (Black):** `qty` trực tiếp từ `neutral` column
4. Hỗ trợ group name thay đổi (`GRP_HEAT_SHRINK` → `CoNhiet`)

### 6.2 Heat Shrink Rule Config

```json
{
  "id": "rule_heat_shrink",
  "mainGroup": "GRP_3",
  "dependentGroup": "GRP_HEAT_SHRINK",
  "strategy": "SIZE_MAPPING",
  "mappingKey": "busbar",
  "enabled": true,
  "phaseColumns": ["main", "UpDown"]
}
```

### 6.3 Heat Shrink Detection

**Flexible detection cho renamed groups:**

```typescript
const isHeatShrinkRule = 
  rule.dependentGroup === 'GRP_HEAT_SHRINK' || 
  rule.dependentGroup === 'CoNhiet' ||
  rule.dependentGroup.toLowerCase().includes('heat') ||
  rule.dependentGroup.toLowerCase().includes('nhiet');

console.log(`[DEBUG] isHeatShrinkRule=${isHeatShrinkRule}`);
```

**Tại sao flexible?**
- User có thể rename group trong UI
- Không muốn hard-code group name
- Fallback: Check substring

### 6.4 Phase Column Identification

```typescript
const phaseColumns = rule.phaseColumns || ['main', 'updown'];

const colLower = colName.toLowerCase();
const isPhaseColumn = phaseColumns.some(col => 
  colLower.includes(col.toLowerCase())
);

console.log(`[DEBUG] Column="${colName}", isPhaseColumn=${isPhaseColumn}`);
```

**Logic:**
- `main` → Phase column → Select R/Y/B
- `UpDown` → Phase column → Select R/Y/B
- `neutral` → NOT phase → Select Black only
- `earth` → Ignored

### 6.5 Color Matching

**Color keywords:**

```typescript
const matchGroups: string[][] = [];

if (isPhaseColumn) {
  // Phase colors
  matchGroups.push(['đỏ', 'red']);
  matchGroups.push(['vàng', 'yellow']);
  matchGroups.push(['xanh dương', 'blue']);
} else if (colLower.includes('neutral') || colLower === 'trung tính') {
  // Neutral color
  matchGroups.push(['đen', 'black', 'trung tính']);
}
```

**Matching logic:**

```typescript
for (const colorKeywords of matchGroups) {
  const bestMatch = potentialMatches.find(item => {
    const desc = item.description.toLowerCase();
    return colorKeywords.some(keyword => desc.includes(keyword));
  });
  
  if (bestMatch) {
    console.log(`[DEBUG] Color match: ${bestMatch.ibomCode} (${colorKeywords[0]})`);
    result.push({
      matched: bestMatch,
      quantity: qtyPerItem
    });
  }
}
```

**Example:**
```
potentialMatches = [
  { ibomCode: 'CN-20x8-DO', description: 'Co nhiệt 20x8 đỏ' },
  { ibomCode: 'CN-20x8-V', description: 'Co nhiệt 20x8 vàng' },
  { ibomCode: 'CN-20x8-XD', description: 'Co nhiệt 20x8 xanh dương' },
  { ibomCode: 'CN-20x8-DEN', description: 'Co nhiệt 20x8 đen' }
]

matchGroups = [['đỏ'], ['vàng'], ['xanh dương']]

Result: 3 items matched (đỏ, vàng, xanh)
```

### 6.6 Quantity Calculation

**For phase columns (main, UpDown):**

```typescript
if (isPhaseColumn) {
  qtyPerItem = Math.floor(qty / 3);
}
```

**Why `Math.floor`?**
- 3 phases → Divide equally
- Integer division (không dùng `ceil` để tránh overstock)

**Example:**
```
qty = 6  → floor(6/3) = 2  ✅
qty = 7  → floor(7/3) = 2  ✅
qty = 8  → floor(8/3) = 2  ✅
qty = 9  → floor(9/3) = 3  ✅
```

**For neutral column:**

```typescript
else if (colLower.includes('neutral')) {
  qtyPerItem = qty;  // Direct quantity
}
```

### 6.7 Full Heat Shrink Flow

```
CB 200A selected (quantity = 1)
  ↓
Rule: rule_heat_shrink triggered
  ↓
Lookup busbar mapping: "200"
  ↓
Sizes: { main: "3x 20x8", updown: "3x 20x5", neutral: "20x5" }
  ↓
Process "main" column:
  Parse: qty=3, size="20x8"
  isPhaseColumn=true → Phase colors (R/Y/B)
  qtyPerItem = floor(3/3) = 1
  Match:
    - CN-20x8-DO (đỏ) x1
    - CN-20x8-V (vàng) x1
    - CN-20x8-XD (xanh) x1
  ↓
Process "updown" column:
  Parse: qty=3, size="20x5"
  isPhaseColumn=true
  qtyPerItem = floor(3/3) = 1
  Match:
    - CN-20x5-DO x1
    - CN-20x5-V x1
    - CN-20x5-XD x1
  ↓
Process "neutral" column:
  Parse: qty=1, size="20x5"
  isPhaseColumn=false → Neutral (Black)
  qtyPerItem = 1
  Match:
    - CN-20x5-DEN x1
  ↓
Total result: 7 heat shrink items
```

---

## 7. Quantity Calculation

### 7.1 Base Quantity

**Từ mapping table:**

```typescript
const { qty, actualSize } = parseSize(sizeVal);
// sizeVal = "3x 20x8" → qty = 3
```

### 7.2 Multipliers

**Starter quantity:**

```typescript
const starterQty = sourceItem.quantity || 1;
const finalQty = qty * starterQty;

// Example:
// Starter: CB 200A x2
// Mapping: main = "3x 20x8"
// → qty = 3 (from mapping) * 2 (starter qty) = 6
```

### 7.3 Division Logic (Heat Shrink)

**Phase items:**

```typescript
if (isPhaseColumn) {
  qtyPerItem = Math.floor(qty / 3);
}

// Example:
// qty = 6 (3 thanh x 2 starter)
// qtyPerItem = floor(6/3) = 2 (mỗi màu)
```

**Neutral items:**

```typescript
else {
  qtyPerItem = qty;  // No division
}
```

### 7.4 Accumulation

**Trường hợp multiple starters với same rating:**

```typescript
// Deduplication sẽ sum quantities
const deduplicated = deduplicateResults(result);

// Example:
// Starter 1: CB 200A → Busbar 20x8 x3
// Starter 2: CB 200A → Busbar 20x8 x3
// After dedup: Busbar 20x8 x6
```

---

## 8. Debugging & Troubleshooting

### 8.1 Console Logging

**Debug logs trong code:**

```typescript
console.log(`[DEBUG] isHeatShrinkRule=${isHeatShrinkRule}`);
console.log(`[DEBUG] phaseColumns=${JSON.stringify(phaseColumns)}`);
console.log(`[DEBUG] Column="${colName}", isPhaseColumn=${isPhaseColumn}`);
console.log(`[DEBUG] Potential matches: ${potentialMatches.length}`);
console.log(`[DEBUG] Color match: ${bestMatch.ibomCode}`);
console.log(`[DEBUG] Accumulated quantity: ${qtyPerItem}`);
```

**How to use:**
1. Open browser console (F12)
2. Perform action (select CB)
3. Check logs
4. Identify where logic breaks

### 8.2 Common Issues

#### Issue 1: Không có items được auto-select

**Check:**
```
1. Rule enabled? → Check logicConfig.rules[x].enabled
2. Main group correct? → Check rule.mainGroup matches selected item's group
3. Dependent group exists? → Check allGroups contains rule.dependentGroup
4. Items trong dependent group? → Check group.items.length > 0
```

**Debug:**
```typescript
console.log(`Active rules: ${activeRules.length}`);
// Nếu = 0 → Rule không match hoặc disabled
```

#### Issue 2: Thiếu màu (Heat Shrink)

**Possible causes:**
- Group name changed → `isHeatShrinkRule = false`
- Phase columns config sai → `isPhaseColumn = false`
- Products thiếu trong group → Filter không match

**Debug:**
```typescript
console.log(`isHeatShrinkRule=${isHeatShrinkRule}`);
// Nếu false → Check group name detection

console.log(`isPhaseColumn=${isPhaseColumn} for column ${colName}`);
// Nếu false cho "main"/"UpDown" → Check phaseColumns config
```

#### Issue 3: Quantity sai

**Check:**
- Mapping table entry đúng format? `"3x 20x8"` not `"3 x 20x8"`
- parseSize() extract đúng? → Log `{ qty, actualSize }`
- Division logic correct? → `Math.floor` not `Math.ceil`

**Debug:**
```typescript
console.log(`Parsed: qty=${qty}, size=${actualSize}`);
console.log(`qtyPerItem=${qtyPerItem} (after division)`);
```

### 8.3 Testing Checklist

**Manual test scenarios:**

- [ ] CB 100A → Busbar 20x5, Heat Shrink 20x5 (4 colors)
- [ ] CB 200A → Busbar 20x8 (main) + 20x5 (updown)
- [ ] CB 300A → Busbar 30x10 (main) + 20x8 (updown)
- [ ] Multiple starters → Quantities sum correctly
- [ ] Group renamed → Still works
- [ ] Strategy SAME_RATING → MCT matches CB rating

---

## 9. Extending Logic Engine

### 9.1 Adding New Strategy

**Step 1: Define strategy type**

```typescript
// types/logic.ts
export type RuleStrategy = 
  | 'SAME_RATING'
  | 'SIZE_MAPPING'
  | 'QUANTITY_BASED';  // NEW
```

**Step 2: Implement logic**

```typescript
// logic-engine.ts
else if (rule.strategy === 'QUANTITY_BASED') {
  // Custom logic here
  const refGroup = allGroups.find(g => g.id === rule.referenceGroup);
  const refQuantity = calculateTotalQuantity(refGroup.items);
  
  const ratio = rule.quantityRatio || 1;
  const matchedQty = refQuantity * ratio;
  
  result.push({
    matched: potentialMatches[0],
    quantity: matchedQty
  });
}
```

**Step 3: Add config**

```json
{
  "id": "rule_new",
  "strategy": "QUANTITY_BASED",
  "referenceGroup": "GRP_2",
  "quantityRatio": 0.5
}
```

### 9.2 Custom Quantity Formulas

**Support formula in rule config:**

```json
{
  "quantityFormula": "sourceQty * 2 + 1"
}
```

**Eval formula:**

```typescript
if (rule.quantityFormula) {
  const context = {
    sourceQty: sourceItem.quantity,
    rating: parseFloat(extractRating(sourceItem.description))
  };
  
  const qty = evaluateFormula(rule.quantityFormula, context);
  result.push({ matched, quantity: qty });
}

function evaluateFormula(formula: string, context: any): number {
  // Use Function constructor (careful with security!)
  const func = new Function(...Object.keys(context), `return ${formula}`);
  return func(...Object.values(context));
}
```

---

## 10. Performance Considerations

### 10.1 Time Complexity

**Current implementation:**
```
O(R * S * P * M)

R = Number of rules
S = Number of source items
P = Number of potential matches
M = Number of match groups (colors)
```

**Typical values:**
```
R ~= 5 rules
S ~= 10 source items
P ~= 50 items per group
M ~= 4 colors

Total: 5 * 10 * 50 * 4 = 10,000 operations
```

→ **Acceptable** for current scale

### 10.2 Optimization Strategies

**1. Memoization:**

```typescript
const matchCache = new Map<string, Product[]>();

function findMatches(size: string, products: Product[]): Product[] {
  const cacheKey = `${size}-${products.length}`;
  
  if (matchCache.has(cacheKey)) {
    return matchCache.get(cacheKey)!;
  }
  
  const matches = products.filter(/* ... */);
  matchCache.set(cacheKey, matches);
  return matches;
}
```

**2. Early termination:**

```typescript
for (const colorKeywords of matchGroups) {
  const match = potentialMatches.find(/* ... */);
  if (!match) break;  // Stop if color missing
}
```

**3. Index groups by ID:**

```typescript
const groupMap = new Map(allGroups.map(g => [g.id, g]));
const dependentGroup = groupMap.get(rule.dependentGroup);
// O(1) instead of O(n)
```

---

## 📚 Tài Liệu Liên Quan

- [05. Data Layer & Types](./05-data-layer.md) - Type definitions
- [19. Adding Logic Rules](./19-logic-rules.md) - Hướng dẫn thêm rules
- [24. Logic Testing Examples](./24-logic-testing.md) - Test cases

---

**Hết Document 06**
