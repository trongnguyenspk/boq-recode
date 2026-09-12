# 10. Common Logic System - Hướng Dẫn Sử Dụng

**Version:** 1.0 | **Updated:** 07/12/2025 | **Level:** Beginner

---

## 1. Common Logic Là Gì?

**Module:** `CommonView.tsx` + `data/common-logic.json`

**Mục đích:** Quản lý library vật tư theo nhóm và định nghĩa logic phụ thuộc

**Use case:**
- Tổ chức products thành groups (GRP_1, GRP_2, GRP_3...)
- Define logic text (mô tả nhóm)
- Làm nguồn cho auto-selection

---

## 2. Cấu Trúc Groups

### 2.1 Common Groups

```typescript
interface CommonGroup {
  id: string;           // "GRP_3", "GRP_HEAT_SHRINK"
  name: string;         // "CB Tổng", "Co Nhiệt"
  logicText?: string;   // Mô tả
  items: Product[];     // Danh sách vật tư
}
```

### 2.2 Groups Chính

| Group ID | Name | Mục đích |
|----------|------|----------|
| GRP_1 | Đầu Vào Nguồn | Input devices |
| GRP_2 | Đầu Ra Động Cơ | Output devices  |
| GRP_3 | CB Tổng | Main breakers (triggers rules) |
| GRP_BUSBAR | Thanh Cái | Busbar products |
| GRP_HEAT_SHRINK | Co Nhiệt | Heat shrink tubes |
| GRP_17_MCT | MCT | Main CT transformers |
| GRP_17_PCT | PCT | Phase CT transformers |

---

## 3. Thao Tác Trên Groups

### 3.1 Xem Groups

**UI:** Common Logic tab → Group list (left sidebar)

**Click group → Xem items bên phải**

### 3.2 Thêm Group Mới

```
1. Click "Add Group" button
2. Enter group ID (e.g., "GRP_NEW")
3. Enter name (e.g., "Nhóm Mới")
4. (Optional) Logic text
5. Save
```

**Code:**
```typescript
const newGroup: CommonGroup = {
  id: 'GRP_NEW',
  name: 'Nhóm Mới',
  items: []
};
setGroups([...groups, newGroup]);
```

### 3.3 Sửa Group

```
1. Select group
2. Click "Edit" icon
3. Update name/logic text
4. Save
```

### 3.4 Xóa Group

**⚠️ Warning:** Xóa group sẽ ảnh hưởng logic rules!

```
1. Select group
2. Click "Delete" icon
3. Confirm
```

---

## 4. Thao Tác Trên Items

### 4.1 Thêm Item Vào Group

**Option 1: Từ Library**
```
1. Select group
2. Click "Add from Library"
3. Search/select products
4. Click "Add Selected"
```

**Option 2: Manual Entry**
```
1. Select group
2. Click "Add Manual"
3. Fill form (IBOM code, description, code, brand, unit)
4. Save
```

### 4.2 Xóa Item

```
1. Select group
2. Find item in list
3. Click "X" icon
4. Confirm
```

### 4.3 Export Items to BOQ

**Use case:** Add group items vào BOQ Detail View

```
1. Select group
2. Select items (checkbox)
3. Click "Export to BOQ"
4. → Items added as manual items
```

---

## 5. Logic Text (Mô Tả Nhóm)

**Mục đích:** Document logic cho group

**Example:**
```
Group: GRP_3
Logic Text: "CB tổng, dùng làm nguồn cho rule_heat_shrink và rule_busbar. 
Khi chọn CB từ group này, tự động chọn busbar và heat shrink tương ứng."
```

**Best practice:**
- Mô tả mục đích group
- Note rules liên quan
- Ghi chú đặc biệt (nếu có)

---

## 6. Data Flow

```
common-logic.json (static data)
  ↓
Load vào localStorage.boq_common_groups
  ↓
CommonView load từ localStorage
  ↓
User edit groups/items
  ↓
Save to localStorage
  ↓
(Optional) Export backup to JSON
```

---

## 7. Best Practices

### 7.1 Naming Convention

**Group IDs:**
- Uppercase: `GRP_XXX`
- Descriptive: `GRP_HEAT_SHRINK` not `GRP_8`
- Stable: Đổi tên ảnh hưởng logic rules

**Group Names:**
- Tiếng Việt OK
- Clear & concise
- Can rename freely (không ảnh hưởng logic)

### 7.2 Organizing Items

**Grouping strategy:**
- By function (Input, Output, Protection)
- By type (CB, Contactor, Relay)
- By size (Busbar 20x5, 20x8, 30x10)

### 7.3 Maintenance

**Regular review:**
- Remove obsolete products
- Add new products
- Update brands
- Test logic rules after changes

---

## 8. Troubleshooting

### Issue: Group không xuất hiện

**Check:**
- localStorage key: `boq_common_groups`
- Data format valid?
- Browser console errors?

**Fix:** Import từ backup hoặc reset to default

### Issue: Items không match trong logic

**Check:**
- IBOM code đúng format?
- Description có size keywords?
- Group ID match trong rule?

---

**End Doc 10**
