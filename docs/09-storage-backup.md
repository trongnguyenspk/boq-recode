# 09. Storage & Backup System

**Version:** 1.0 | **Updated:** 07/12/2025 | **Difficulty:** Beginner

---

## 1. Storage Strategy

**Approach:** Browser `localStorage` (No backend database)

**Why localStorage?**
- ✅ Pure frontend app (no server needed)
- ✅ Offline-first design
- ✅ Fast read/write (~instant)
- ✅ Persists across sessions
- ❌ Limited to ~10MB
- ❌ Single-device only

---

## 2. localStorage Schema

### 2.1 Keys & Data

| Key | Type | Size | Mô tả |
|-----|------|------|-------|
| `boq_library` | `Product[]` | ~500KB | Product library |
| `boq_common_groups` | `CommonGroup[]` | ~1MB | Common Logic groups |
| `logicConfig` | `LogicConfig` | ~50KB | Rules + mappings |
| `boq_templates` | `Template[]` | ~10KB | Starter templates |
| `boq_brands` | `string[]` | ~5KB | Brand list |
| `theme` | `'light'\|'dark'` | ~10B | UI theme |

**Total:** ~1.5MB / 10MB limit

### 2.2 Data Flow

```
App Lifecycle:

1. LOAD (on mount)
   localStorage → JSON.parse() → setState()

2. UPDATE (on change)
   User action → setState() → useEffect → JSON.stringify() → localStorage

3. PERSIST
   Automatic via useEffect dependencies
```

---

## 3. CRUD Operations

### 3.1 Read

```typescript
function loadLibrary(): Product[] {
  try {
    const saved = localStorage.getItem('boq_library');
    return saved ? JSON.parse(saved) : PRODUCT_LIBRARY;
  } catch (error) {
    console.error('Load failed:', error);
    return PRODUCT_LIBRARY;  // Fallback
  }
}
```

### 3.2 Write

```typescript
function saveLibrary(library: Product[]): void {
  try {
    localStorage.setItem('boq_library', JSON.stringify(library));
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      alert('Storage full! Cannot save.');
    }
    console.error('Save failed:', error);
  }
}
```

### 3.3 Delete

```typescript
localStorage.removeItem('boq_library');
```

### 3.4 Clear All

```typescript
localStorage.clear();  // ⚠️ Xóa TẤT CẢ data
```

---

## 4. Backup System

### 4.1 Export Backup

**File:** `BackupRestoreModal.tsx` → `handleExport()`

**Process:**
```typescript
const backup = {
  exportDate: new Date().toISOString(),
  version: '1.0',
  data: {
    commonGroups: localStorage.getItem('boq_common_groups'),
    logicConfig: localStorage.getItem('logicConfig'),
    library: localStorage.getItem('boq_library'),
    templates: localStorage.getItem('boq_templates'),
    brands: localStorage.getItem('boq_brands')
  }
};

const blob = new Blob([JSON.stringify(backup, null, 2)], {
  type: 'application/json'
});

// File System Access API (Chrome/Edge)
const handle = await showSaveFilePicker({
  suggestedName: `boq-backup-${date}.json`,
  types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
});

const writable = await handle.createWritable();
await writable.write(blob);
await writable.close();
```

**Fallback (Firefox/Safari):**
```typescript
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url <a.download = `boq-backup-${date}.json`;
a.click();
URL.revokeObjectURL(url);
```

### 4.2 Import Backup

**Process:**
```typescript
const input = document.createElement('input');
input.type = 'file';
input.accept = '.json';
input.onchange = async (e) => {
  const file = e.target.files[0];
  const text = await file.text();
  const backup = JSON.parse(text);
  
  // Validate
  if (!backup.data || !backup.version) {
    throw new Error('Invalid backup file');
  }
  
  // Restore
  localStorage.setItem('boq_common_groups', backup.data.commonGroups);
  localStorage.setItem('logicConfig', backup.data.logicConfig);
  // ... restore all keys
  
  // Reload page to apply
  window.location.reload();
};
input.click();
```

---

## 5. Data Migration

### 5.1 Version Compatibility

**Schema evolution:**
```typescript
function migrateBackup(backup: any): BackupData {
  const version = backup.version || '0.1';
  
  if (version === '0.1') {
    // Migrate from v0.1 to v1.0
    backup.data.brands = backup.data.brands || [];
    backup.version = '1.0';
  }
  
  return backup;
}
```

### 5.2 localStorage Cleanup

**Remove old/unused keys:**
```typescript
function cleanupStorage() {
  const knownKeys = [
    'boq_library',
    'boq_common_groups',
    'logicConfig',
    'boq_templates',
    'boq_brands',
    'theme'
  ];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && !knownKeys.includes(key)) {
      console.warn(`Removing unknown key: ${key}`);
      localStorage.removeItem(key);
    }
  }
}
```

---

## 6. Google Drive Integration

### 6.1 Manual Workflow (Current)

```
1. Export backup → Download JSON file
2. Upload to Google Drive (manual)
3. Share across devices:
   - Download from Drive
   - Import backup → Restore
```

### 6.2 Auto-Sync (Future Enhancement)

**Using Google Drive API:**
```typescript
// Requires OAuth setup
async function syncToGoogleDrive() {
  const token = await getGoogleAuthToken();
  const backup = generateBackup();
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'boq-backup.json',
      mimeType: 'application/json',
      body: backup
    })
  });
}
```

---

## 7. Error Handling

### 7.1 Storage Quota

```typescript
try {
  localStorage.setItem(key, value);
} catch (e) {
  if (e.name === 'QuotaExceededError') {
    // Options:
    // 1. Alert user
    alert('Storage full! Please clear old data.');
    
    // 2. Auto-cleanup
    cleanupOldData();
    
    // 3. Suggest export
    if (confirm('Export backup to free space?')) {
      exportBackup();
    }
  }
}
```

### 7.2 Corrupted Data

```typescript
function safeLoad<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    
    const parsed = JSON.parse(saved);
    
    // Validate structure
    if (!isValidStructure(parsed)) {
      throw new Error('Invalid data structure');
    }
    
    return parsed;
  } catch (error) {
    console.error(`Failed to load ${key}:`, error);
    return fallback;
  }
}
```

---

## 8. Best Practices

### 8.1 Compression (If Needed)

```typescript
// Use LZ-string library
import LZString from 'lz-string';

const compressed = LZString.compress(JSON.stringify(data));
localStorage.setItem(key, compressed);

const decompressed = LZString.decompress(localStorage.getItem(key));
const data = JSON.parse(decompressed);
```

### 8.2 Backup Reminders

**Suggest backup periodically:**
```typescript
const lastBackup = localStorage.getItem('last_backup_date');
const daysSinceBackup = (Date.now() - new Date(lastBackup).getTime()) / 86400000;

if (daysSinceBackup > 7) {
  showToast('Reminder: Backup your data!', 'info');
}
```

### 8.3 Test Restore

**Always test restore after backup:**
```
1. Export backup
2. Clear localStorage
3. Import backup
4. Verify all data intact
```

---

**End Doc 09**
