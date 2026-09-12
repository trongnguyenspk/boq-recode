import { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { InputWizard } from './components/InputWizard';
import { DetailView } from './components/DetailView';
import { SummaryView } from './components/SummaryView';
import { AdminPanel } from './components/AdminPanel';
import type { StarterConfig, BOMItem, Product, MatchKeyMetaMap } from './types';
import { computeBoq, createLibraryIndex } from './utils/boq-logic';
import { seedMeta } from './utils/brand-policy';
import { shouldBlockExport } from './utils/validation';

import { LayoutDashboard, FileText, Settings, Sun, Moon, Database, Download, Upload, Undo2 } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { PRODUCT_LIBRARY, STARTER_TEMPLATES } from './data/library';
import { useToast } from './components/ui/Toast';

import type { CommonItem, Unit } from './types';
import { BackupRestoreModal } from './components/BackupRestoreModal';
import { ValidationWarnings } from './components/ValidationWarnings';
import { ProjectSelector } from './components/ProjectSelector';
import { ProjectMetadataDisplay } from './components/ProjectMetadataDisplay';
import { ExportOptionsModal } from './components/ExportOptionsModal';
import type { StarterConfig as StarterConfigType, BOMItem as BOMItemType } from './types';
import type { ExportOptions } from './utils/excel-export';

import { Dashboard } from './components/Dashboard/Dashboard';
import { useDebounce } from './hooks/useDebounce';
import { useProjectStore, useCurrentProject } from './stores/projectStore';
import type { BackupEnvelope, ProjectSnapshot, StoredTemplateCatalog } from './utils/storage-registry';
import { toAppTemplateMap, type AppTemplateMap } from './utils/template-catalog';
import {
  applyWorkbookDiff,
  buildWorkbookDiff,
  readWorkbookFile,
  writeWorkbook,
  type WorkbookDiff,
  type WorkbookState,
} from './utils/workbook-pipeline';
import { WorkbookTransferModal } from './components/WorkbookTransferModal';

// PA B: cờ bật/tắt tab "Common Logic". Đặt false để ẩn (giữ nguyên toàn bộ file & dữ liệu).
// Bật lại chỉ cần đổi thành true.
const ENABLE_COMMON_LOGIC = false;

// Keep the Common Logic implementation out of the initial BOQ bundle while it
// remains available for a later, separately validated feature rollout.
const CommonView = lazy(async () => {
  const module = await import('./components/CommonView');
  return { default: module.CommonView };
});

// Brand model (PLAN-BRAND-MODEL-2026-09-11): cờ an toàn.
// Đặt false ⇒ `matchKeyMeta` không được truyền xuống BOQ engine nữa, mọi thứ rơi về
// suy luận theo tên matchKey (hành vi mặc định) ⇒ rollback tức thì nếu meta bị lỗi dữ liệu.
const ENABLE_BRAND_POLICY = true;

function isStoredProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const product = value as Record<string, unknown>;
  return ['id', 'code', 'description', 'brand', 'unit']
    .every(field => typeof product[field] === 'string');
}

// Kept exported for the existing storage-safety test; this helper can move to
// a storage utility when the App module is split into feature boundaries.
// eslint-disable-next-line react-refresh/only-export-components
export function safeSaveToStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Failed to save to localStorage for key "${key}":`, error);
    return false;
  }
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeWorkbookName(name: string | undefined): string {
  const trimmed = name?.trim() || 'BOQ_Workbook';
  return trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\.+$/g, '') || 'BOQ_Workbook';
}

interface WorkbookUndoState {
  source: WorkbookState;
  projectSnapshot: ProjectSnapshot;
}

function App() {
  const { theme, toggleTheme } = useTheme();
  const [showDashboard, setShowDashboard] = useState(false);

  // Data State (persisted)
  const [library, setLibrary] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('boq_library');
      const parsed: unknown = saved ? JSON.parse(saved) : undefined;
      if (!Array.isArray(parsed)) return PRODUCT_LIBRARY;
      const valid = parsed.filter(isStoredProduct);
      // Preserve an intentional empty catalog, but recover from a completely
      // malformed array instead of allowing null/primitive entries to reach
      // the BOQ index and crash the application.
      return parsed.length === 0 ? [] : valid.length > 0 ? valid : PRODUCT_LIBRARY;
    } catch (e) {
      console.error("Failed to parse boq_library", e);
      return PRODUCT_LIBRARY;
    }
  });

  const [templates, setTemplates] = useState<AppTemplateMap>(() => {
    try {
      const saved = localStorage.getItem('boq_templates');
      if (!saved) return STARTER_TEMPLATES;
      const parsed: unknown = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object') return STARTER_TEMPLATES;
      return toAppTemplateMap(parsed as StoredTemplateCatalog);
    } catch (e) {
      console.error("Failed to parse boq_templates", e);
      return STARTER_TEMPLATES;
    }
  });

  const [brands, setBrands] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('boq_brands');
      const parsed: unknown = saved ? JSON.parse(saved) : undefined;
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : ['Schneider', 'Mitsubishi', 'LS', 'Hyundai'];
    } catch (e) {
      console.error("Failed to parse boq_brands", e);
      return ['Schneider', 'Mitsubishi', 'LS', 'Hyundai'];
    }
  });

  // Khai báo "matchKey nào phụ thuộc nhãn hiệu". Nguồn sự thật cho brand model.
  const [matchKeyMeta, setMatchKeyMeta] = useState<MatchKeyMetaMap>(() => {
    try {
      const saved = localStorage.getItem('boq_matchkey_meta');
      const parsed: unknown = saved ? JSON.parse(saved) : undefined;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as MatchKeyMetaMap
        : {};
    } catch (e) {
      console.error("Failed to parse boq_matchkey_meta", e);
      return {};
    }
  });

  const [starters, setStarters] = useState<StarterConfig[]>([]);

  // Derived state replaces BOM and Summary state management
  const [showAdmin, setShowAdmin] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showWorkbookTransfer, setShowWorkbookTransfer] = useState(false);
  const [workbookFileName, setWorkbookFileName] = useState('');
  const [workbookDiff, setWorkbookDiff] = useState<WorkbookDiff | null>(null);
  const [workbookBusy, setWorkbookBusy] = useState(false);
  const [canUndoWorkbook, setCanUndoWorkbook] = useState(false);
  const [boqViewMode, setBoqViewMode] = useState<'detail' | 'summary'>('detail');
  const [activeTab, setActiveTab] = useState<'boq' | 'common'>('boq');
  const workbookInputRef = useRef<HTMLInputElement>(null);
  const workbookUndoRef = useRef<WorkbookUndoState | null>(null);

  // Toast hook - khai báo sớm để các useEffect lưu trữ có thể sử dụng
  const { showToast } = useToast();
  const currentProject = useCurrentProject();

  // Persist Data Changes
  useEffect(() => {
    const ok = safeSaveToStorage('boq_library', JSON.stringify(library));
    if (!ok) {
      showToast('⚠️ Không thể lưu thư viện sản phẩm do bộ nhớ trình duyệt đã đầy! Vui lòng xuất backup hoặc xóa bớt dữ liệu cũ.', 'error');
    }
  }, [library, showToast]);

  useEffect(() => {
    const ok = safeSaveToStorage('boq_templates', JSON.stringify(templates));
    if (!ok) {
      showToast('⚠️ Không thể lưu template do bộ nhớ trình duyệt đã đầy! Vui lòng xuất backup hoặc xóa bớt dữ liệu cũ.', 'error');
    }
  }, [templates, showToast]);

  useEffect(() => {
    const ok = safeSaveToStorage('boq_brands', JSON.stringify(brands));
    if (!ok) {
      showToast('⚠️ Không thể lưu cấu hình nhãn hàng do bộ nhớ trình duyệt đã đầy! Vui lòng xuất backup hoặc xóa bớt dữ liệu cũ.', 'error');
    }
  }, [brands, showToast]);

  useEffect(() => {
    const ok = safeSaveToStorage('boq_matchkey_meta', JSON.stringify(matchKeyMeta));
    if (!ok) {
      showToast('⚠️ Không thể lưu khai báo nhãn hiệu theo Match Key do bộ nhớ trình duyệt đã đầy!', 'error');
    }
  }, [matchKeyMeta, showToast]);

  // Migration một lần: sinh meta từ dữ liệu đang có. KHÔNG ghi đè khai báo người dùng đã sửa.
  useEffect(() => {
    try {
      const version = Number(localStorage.getItem('boq_schema_version') || '1');
      if (version >= 2) return;
      const seeded = seedMeta(library, templates);
      setMatchKeyMeta(prev => ({ ...seeded, ...prev }));   // prev thắng: giữ khai báo cũ
      localStorage.setItem('boq_schema_version', '2');
    } catch (e) {
      console.error('Brand policy migration failed:', e);
    }
    // Chạy đúng 1 lần lúc khởi động, dùng library/templates đã nạp từ localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cờ ENABLE_BRAND_POLICY tắt ⇒ không truyền meta ⇒ rơi về suy luận theo tên matchKey.
  const activeMeta = useMemo(
    () => (ENABLE_BRAND_POLICY ? matchKeyMeta : {}),
    [matchKeyMeta]
  );

  // Danh sách nhãn hiệu HIỂN THỊ = brand người dùng quản lý ∪ brand có thật trong library.
  // KHÔNG ghi ngược vào state `brands`/localStorage để tránh vòng lặp ghi; `brands` vẫn là
  // danh sách do người dùng tự thêm/xoá trong Brand Manager. Trước đây hai nguồn này tách rời
  // nên OMEGA (có trong library) vô hình với toàn bộ tầng quản trị brand (lỗi M13).
  const allBrands = useMemo(() => {
    const seen = new Set<string>(brands);
    library.forEach(p => { if (p.brand) seen.add(p.brand); });
    return Array.from(seen);
  }, [brands, library]);

  // Performance Optimization: Index library for O(1) lookups
  const libraryIndex = useMemo(() => createLibraryIndex(library, activeMeta), [library, activeMeta]);

  // Cảnh báo MỘT LẦN khi thư viện còn bản ghi nhân bản của Import Matrix cũ: matchKey không phụ
  // thuộc nhãn hiệu mà lại có nhiều brand. KHÔNG tự xoá — người dùng dọn trong Admin → Match Keys.
  const conflictNoticeRef = useRef(false);
  useEffect(() => {
    if (conflictNoticeRef.current) return;
    if (libraryIndex.conflicts.length === 0) return;
    conflictNoticeRef.current = true;
    showToast(
      `⚠️ ${libraryIndex.conflicts.length} Match Key không phụ thuộc nhãn hiệu đang có nhiều bản ghi brand ` +
      `(${libraryIndex.conflicts.slice(0, 3).join(', ')}${libraryIndex.conflicts.length > 3 ? '…' : ''}). ` +
      `Mở Admin → Match Keys để dọn.`,
      'warning'
    );
  }, [libraryIndex.conflicts, showToast]);

  const [manualItems, setManualItems] = useState<BOMItem[]>([]);
  const [bomQuantityOverrides, setBomQuantityOverrides] = useState<Record<string, number>>({});

  // Workbook export/import works on the same source state that drives the BOQ.
  // The project store can be one debounce behind the visible editor, so use the
  // current React source arrays when creating a workbook snapshot.
  const workbookProject = useMemo(() => currentProject ? {
    ...cloneData(currentProject),
    starters: cloneData(starters),
    manualItems: cloneData(manualItems),
    bomQuantityOverrides: cloneData(bomQuantityOverrides),
  } : undefined, [currentProject, starters, manualItems, bomQuantityOverrides]);
  const workbookState = useMemo<WorkbookState>(() => ({
    library: cloneData(library),
    templates: cloneData(templates),
    brands: cloneData(brands),
    matchKeyMeta: cloneData(matchKeyMeta),
    project: workbookProject,
  }), [library, templates, brands, matchKeyMeta, workbookProject]);

  // The project store owns the persisted representation. Wait for its public
  // hydration signal instead of parsing Zustand's internal storage envelope.
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const loadCurrentProject = () => {
      if (cancelled) return;
      const project = useProjectStore.getState().getCurrentProject();
      setStarters(project?.starters ?? []);
      setManualItems(project?.manualItems ?? []);
      setBomQuantityOverrides(project?.bomQuantityOverrides ?? {});
      hasLoadedRef.current = true;
    };

    // Register first, then check the flag to close the race where synchronous
    // storage hydration finishes between those two operations.
    const unsubscribe = useProjectStore.persist.onFinishHydration(loadCurrentProject);
    if (useProjectStore.persist.hasHydrated()) loadCurrentProject();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // ---- P0-2: Auto-save vào dự án hiện tại (có guard chống ghi rỗng đè dữ liệu) ----
  // Guard 1 is armed by the store hydration callback above. The payload is
  // debounced so rapid edits result in one source snapshot write.
  const autoSavePayload = useMemo(
    () => ({ starters, manualItems, bomQuantityOverrides }),
    [starters, manualItems, bomQuantityOverrides]
  );
  const debouncedPayload = useDebounce(autoSavePayload, 1000);

  useEffect(() => {
    if (!hasLoadedRef.current) return;                          // Guard 1
    const state = useProjectStore.getState();                   // đọc, KHÔNG subscribe
    const pid = state.currentProjectId;
    if (!pid) return;                                           // Guard 3: chưa chọn dự án
    const proj = state.projects.find(p => p.id === pid);
    if (!proj) return;
    // Guard 2: chỉ ghi khi thực sự khác dữ liệu đã lưu (tránh bump updatedAt vô ích)
    const same =
      JSON.stringify(proj.starters ?? []) === JSON.stringify(debouncedPayload.starters) &&
      JSON.stringify(proj.manualItems ?? []) === JSON.stringify(debouncedPayload.manualItems) &&
      JSON.stringify(proj.bomQuantityOverrides ?? {}) === JSON.stringify(debouncedPayload.bomQuantityOverrides);
    if (same) return;
    state.syncToCurrentProject(
      debouncedPayload.starters,
      debouncedPayload.manualItems,
      debouncedPayload.bomQuantityOverrides
    );
  }, [debouncedPayload]);

  // Lưới an toàn: cảnh báo khi F5/đóng tab lúc còn thay đổi CHƯA lưu (bù cho debounce 1s).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const state = useProjectStore.getState();
      const pid = state.currentProjectId;
      if (!pid) return;
      const proj = state.projects.find(p => p.id === pid);
      if (!proj) return;
      const dirty =
        JSON.stringify(proj.starters ?? []) !== JSON.stringify(starters) ||
        JSON.stringify(proj.manualItems ?? []) !== JSON.stringify(manualItems) ||
        JSON.stringify(proj.bomQuantityOverrides ?? {}) !== JSON.stringify(bomQuantityOverrides);
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [starters, manualItems, bomQuantityOverrides]);

  // BOQ is a pure derived result. Keeping generation, overrides, summary and
  // diagnostics in one call prevents the UI from showing a different Detail
  // and Summary after a template/product change.
  const computedBoq = useMemo(() => computeBoq(
    { library, templates, matchKeyMeta: activeMeta },
    { starters, manualItems, bomQuantityOverrides },
  ), [library, templates, activeMeta, starters, manualItems, bomQuantityOverrides]);
  const bom = computedBoq.detail;
  const bomWithOverrides = bom;
  const summary = computedBoq.summary;
  const validation = computedBoq.validation;

  const handleAddStarter = (starter: StarterConfig) => {
    setStarters(prev => [...prev, starter]);
  };

  const handleUpdateStarter = (id: string, updates: Partial<StarterConfig>) => {
    setStarters(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleUpdateManualItemQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      setManualItems(prev => prev.filter(item => item.id !== id));
    } else {
      setManualItems(prev => prev.map(item =>
        item.id === id ? { ...item, quantity } : item
      ));
    }
  };

  const handleUpdateBomItemQuantity = (itemId: string, quantity: number | undefined) => {
    setBomQuantityOverrides(prev => {
      const next = { ...prev };
      if (quantity === undefined) {
        delete next[itemId];
      } else {
        next[itemId] = quantity;
      }
      return next;
    });
  };

  const handleDeleteStarter = (id: string) => {
    setStarters(prev => prev.filter(s => s.id !== id));
    // Dọn dẹp các overrides liên quan đến starter bị xóa
    setBomQuantityOverrides(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (key.startsWith(`generated:${id}:`) || key.startsWith(`${id}-`)) {
          delete next[key];
        }
      });
      return next;
    });
  };

  const handleExportExcel = async () => {
    // Check for critical errors before export
    if (shouldBlockExport(validation)) {
      const errorDetails = validation.errors.map(err => err.message).join("; ");
      showToast(`Không thể xuất. Lỗi cần sửa: ${errorDetails}`, "error");
      return;
    }

    // Open export options modal instead of direct export
    setShowExportModal(true);
  };

  // Handler for export with options (P2.1: Export Options UI Modal)
  const handleExportWithOptions = async (options: ExportOptions) => {
    // Show warning if there are warnings but proceed anyway
    if (validation.hasWarnings) {
      showToast(`Xuất với ${validation.warnings.length} cảnh báo`, "warning");
    }

    try {
      const { exportToExcel } = await import('./utils/excel-export');
      await exportToExcel(bomWithOverrides, summary, {
        ...options,
        projectName: options.projectName || currentProject?.metadata.name,
        projectDescription: options.projectDescription || currentProject?.metadata.description,
        validation,
        diagnostics: computedBoq.diagnostics,
      });
      showToast("Export successful!", "success");
    } catch (error) {
      console.error("Export failed:", error);
      showToast("Export failed! See console.", "error");
      throw error; // Re-throw for modal error handling
    }
  };

  const handleExportWorkbook = () => {
    try {
      const bytes = writeWorkbook(workbookState);
      // Copy into an ArrayBuffer-backed view so DOM typings do not reject the
      // `ArrayBufferLike` returned by SheetJS on environments with SAB types.
      const blobBytes = new Uint8Array(bytes.byteLength);
      blobBytes.set(bytes);
      const blob = new Blob([blobBytes.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const projectName = workbookProject?.metadata.name;
      anchor.href = url;
      anchor.download = `${safeWorkbookName(projectName)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast('Đã xuất workbook nguồn', 'success');
    } catch (error) {
      console.error('Workbook export failed:', error);
      showToast('Xuất workbook thất bại', 'error');
    }
  };

  const handleWorkbookFile = async (file: File) => {
    setWorkbookBusy(true);
    try {
      const parsed = await readWorkbookFile(file);
      const diff = buildWorkbookDiff(workbookState, parsed);
      setWorkbookFileName(file.name);
      setWorkbookDiff(diff);
      setShowWorkbookTransfer(true);
    } catch (error) {
      console.error('Workbook import failed:', error);
      showToast(error instanceof Error ? `Không thể đọc workbook: ${error.message}` : 'Không thể đọc workbook', 'error');
    } finally {
      setWorkbookBusy(false);
    }
  };

  const handleWorkbookInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void handleWorkbookFile(file);
  };

  const handleApplyWorkbook = async () => {
    if (!workbookDiff) return;
    setWorkbookBusy(true);
    const store = useProjectStore.getState();
    const beforeProjectSnapshot = store.getSnapshot();
    try {
      const next = applyWorkbookDiff(workbookState, workbookDiff);
      workbookUndoRef.current = {
        source: cloneData(workbookState),
        projectSnapshot: cloneData(beforeProjectSnapshot),
      };

      setLibrary(next.library);
      setTemplates(toAppTemplateMap(next.templates as StoredTemplateCatalog));
      setBrands(next.brands);
      setMatchKeyMeta(next.matchKeyMeta);

      if (next.project) {
        const project = cloneData(next.project);
        const projects = [...beforeProjectSnapshot.projects];
        const existingIndex = projects.findIndex(item => item.id === project.id);
        if (existingIndex >= 0) projects[existingIndex] = project;
        else projects.push(project);
        store.replaceProjectState({ projects, currentProjectId: project.id });
        setStarters(project.starters ?? []);
        setManualItems(project.manualItems ?? []);
        setBomQuantityOverrides(project.bomQuantityOverrides ?? {});
      } else if (workbookState.project) {
        const deletedId = workbookState.project.id;
        store.replaceProjectState({
          projects: beforeProjectSnapshot.projects.filter(project => project.id !== deletedId),
          currentProjectId: beforeProjectSnapshot.currentProjectId === deletedId ? null : beforeProjectSnapshot.currentProjectId,
        });
        setStarters([]);
        setManualItems([]);
        setBomQuantityOverrides({});
      }

      setCanUndoWorkbook(true);
      setShowWorkbookTransfer(false);
      showToast('Đã áp dụng workbook', 'success');
    } catch (error) {
      console.error('Workbook apply failed:', error);
      showToast(error instanceof Error ? error.message : 'Không thể áp dụng workbook', 'error');
      throw error;
    } finally {
      setWorkbookBusy(false);
    }
  };

  const handleUndoWorkbook = () => {
    const undo = workbookUndoRef.current;
    if (!undo) return;
    setLibrary(cloneData(undo.source.library));
    setTemplates(toAppTemplateMap(undo.source.templates as StoredTemplateCatalog));
    setBrands(cloneData(undo.source.brands));
    setMatchKeyMeta(cloneData(undo.source.matchKeyMeta));
    useProjectStore.getState().replaceProjectState(cloneData(undo.projectSnapshot));
    setStarters(cloneData(undo.source.project?.starters ?? []));
    setManualItems(cloneData(undo.source.project?.manualItems ?? []));
    setBomQuantityOverrides(cloneData(undo.source.project?.bomQuantityOverrides ?? {}));
    workbookUndoRef.current = null;
    setCanUndoWorkbook(false);
    showToast('Đã hoàn tác workbook gần nhất', 'success');
  };

  // Nhập hàng loạt phụ tải từ Excel (nút "Nhập Input" trong Input Wizard).
  const handleImportStarters = (imported: StarterConfig[], mode: 'append' | 'replace') => {
    setStarters(prev => (mode === 'append' ? [...prev, ...imported] : imported));
  };

  const handleImportToLibrary = (items: Product[]) => {
    let addedCount = 0;
    let updatedCount = 0;
    // Key by matchKey+brand (falling back to code+brand when matchKey is missing) instead of
    // code alone: `code` is a base/frame code that different variants (e.g. different current
    // ratings) can share, and dedup-by-code-only silently overwrote one variant's library entry
    // with another's. Including brand also prevents cross-brand collisions.
    const keyOf = (p: Product) => `${p.matchKey || p.code || p.ibomCode || p.id}|${p.brand}`;
    // OPTIMIZATION: Use Map for O(1) lookup instead of O(N) findIndex
    const libMap = new Map(library.map(p => [keyOf(p), p]));

    items.forEach(item => {
      const key = keyOf(item);
      const existing = libMap.get(key);
      if (!existing) {
        libMap.set(key, item);
        addedCount++;
      } else {
        // Update existing item
        libMap.set(key, {
          ...existing,
          ...item
        });
        updatedCount++;
      }
    });

    const newLibrary = Array.from(libMap.values());

    if (addedCount > 0 || updatedCount > 0) {
      setLibrary(newLibrary);
      showToast(`Synced: ${addedCount} new, ${updatedCount} updated`, "success");
    } else {
      showToast("No changes needed", "success");
    }
  };

  const handleAddToDetail = (items: CommonItem[]) => {
    const newManualItems: BOMItem[] = items.map(item => ({
      id: `common-${Date.now()}-${Math.random()}`,
      starterId: 'common',
      starterName: 'Common Items',
      ibomCode: item.ibomCode,
      productCode: item.productCode,
      description: item.description,
      brand: item.brand,
      unit: item.unit as Unit, // Cast to Unit
      quantity: item.quantity || 1, // Use item quantity or default to 1
      loadName: item.note
    }));

    setManualItems(prev => [...prev, ...newManualItems]);
    showToast(`Added ${items.length} items to Detail`, "success");
  };

  // Handler for loading project data
  const handleLoadProject = (loadedStarters: StarterConfigType[], loadedManualItems: BOMItemType[], loadedOverrides: Record<string, number> = {}) => {
    setStarters(loadedStarters);
    setManualItems(loadedManualItems);
    setBomQuantityOverrides(loadedOverrides);
  };

  // Restore commits through the storage registry first, then refresh every
  // local React source state from the same envelope. This keeps the visible UI
  // correct in embedded contexts where a browser reload is unavailable.
  const handleBackupImport = (envelope: BackupEnvelope) => {
    setLibrary(envelope.catalog.library);
    setTemplates(toAppTemplateMap(envelope.catalog.templates));
    setBrands(envelope.catalog.brands);
    setMatchKeyMeta(envelope.catalog.matchKeyMeta);

    const current = envelope.projects.find(project => project.id === envelope.currentProjectId);
    handleLoadProject(
      current?.starters ?? [],
      current?.manualItems ?? [],
      current?.bomQuantityOverrides ?? {},
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 font-sans text-gray-900 dark:text-gray-100 transition-colors duration-200">
      {/* Header */}
      <header className="bg-blue-800 dark:bg-blue-950 text-white shadow-lg transition-colors duration-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Make logo clickable to show dashboard */}
            <button onClick={() => setShowDashboard(true)} className="flex items-center gap-2 hover:opacity-80 transition-opacity" title="Open Dashboard">
              <LayoutDashboard className="w-8 h-8" />
              <div>
                <h1 className="text-2xl font-bold">BOQ Generator</h1>
                <p className="text-blue-200 text-sm">Automated Bill of Quantities System</p>
              </div>
            </button>
          </div>

          {/* Project Selector (E1 Feature) */}
          <ProjectSelector
            starters={starters}
            manualItems={manualItems}
            bomQuantityOverrides={bomQuantityOverrides}
            onLoadProject={handleLoadProject}
          />

          {/* Project Metadata Display (P2.2 Feature) */}
          <ProjectMetadataDisplay />

          {/* Navigation Tabs */}
          <div className="flex bg-blue-900/50 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('boq')}
              className={`px-4 py-2 rounded-md transition-all ${activeTab === 'boq' ? 'bg-white text-blue-900 shadow' : 'text-blue-200 hover:text-white'}`}
            >
              BOQ Builder
            </button>
            {ENABLE_COMMON_LOGIC && (
              <button
                onClick={() => setActiveTab('common')}
                className={`px-4 py-2 rounded-md transition-all ${activeTab === 'common' ? 'bg-white text-blue-900 shadow' : 'text-blue-200 hover:text-white'}`}
              >
                Common Logic
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-4">
              {/* Add dedicated Dashboard button */}
              <button
                onClick={() => setShowDashboard(true)}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-600 rounded hover:bg-indigo-500 transition text-white font-medium"
                title="View Dashboard"
              >
                <LayoutDashboard className="w-4 h-4" /> Dashboard
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBoqViewMode(prev => prev === 'detail' ? 'summary' : 'detail')}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 rounded hover:bg-blue-500 transition text-white font-medium shadow-sm"
                  title={boqViewMode === 'detail' ? "Chuyển sang xem bảng tổng hợp vật tư" : "Chuyển sang xem chi tiết vật tư"}
                >
                  <FileText className="w-4 h-4" />
                  {boqViewMode === 'detail' ? 'Xem Tổng hợp' : 'Xem Chi tiết'}
                </button>
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 rounded hover:bg-green-500 transition shadow-sm font-medium text-white"
                  title="Export BOQ (Detail & Summary)"
                >
                  <FileText className="w-4 h-4" /> Export BOQ
                </button>
                <button
                  onClick={handleExportWorkbook}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-700 rounded hover:bg-emerald-600 transition shadow-sm font-medium text-white"
                  title="Xuất toàn bộ dữ liệu nguồn thành một workbook"
                >
                  <Download className="w-4 h-4" /> Export Workbook
                </button>
                <button
                  onClick={() => workbookInputRef.current?.click()}
                  disabled={workbookBusy}
                  className="flex items-center gap-2 px-3 py-2 bg-cyan-700 rounded hover:bg-cyan-600 transition shadow-sm font-medium text-white disabled:opacity-50"
                  title="Nhập workbook và xem trước thay đổi"
                >
                  <Upload className="w-4 h-4" /> Import Workbook
                </button>
                <input
                  ref={workbookInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleWorkbookInputChange}
                  className="hidden"
                  aria-label="Chọn workbook để nhập"
                />
              </div>

              <button
                onClick={() => setShowBackup(true)}
                className="flex items-center gap-2 px-3 py-2 bg-purple-600 rounded hover:bg-purple-500 transition text-white font-medium"
                title="Backup & Restore Data"
              >
                <Database className="w-4 h-4" /> Back-up/Restore
              </button>

              <button
                onClick={handleUndoWorkbook}
                disabled={!canUndoWorkbook}
                className="flex items-center gap-2 px-3 py-2 bg-slate-600 rounded hover:bg-slate-500 transition text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                title="Hoàn tác lần áp dụng workbook gần nhất"
              >
                <Undo2 className="w-4 h-4" /> Hoàn tác Workbook
              </button>

              <button
                onClick={() => setShowAdmin(true)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded hover:bg-gray-600 transition text-white"
                title="Manage Library & Templates"
              >
                <Settings className="w-4 h-4" /> Admin
              </button>

              <button
                onClick={toggleTheme}
                className="p-2 bg-blue-700 dark:bg-blue-900 rounded-full hover:bg-blue-600 dark:hover:bg-blue-800 transition text-white"
                title="Toggle Theme"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {(activeTab === 'boq' || !ENABLE_COMMON_LOGIC) ? (
          <>
            {/* Validation Warnings */}
            <ValidationWarnings
              validation={validation}
              className="mb-6"
            />

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2">
                <InputWizard
                  onAddStarter={handleAddStarter}
                  templates={templates}
                  brands={allBrands}
                  starters={starters}
                  onImportStarters={handleImportStarters}
                  onAddBrand={(brand) => setBrands(prev => prev.includes(brand) ? prev : [...prev, brand])}
                  onAddStarterType={(starterType) => setTemplates(prev => prev[starterType] ? prev : { ...prev, [starterType]: {} })}
                />
              </div>
            </div>

            <div className="mt-8">
              <div className="w-full">
                {boqViewMode === 'detail' ? (
                  <DetailView starters={starters} bom={bom} manualItems={manualItems} onUpdateStarter={handleUpdateStarter} onUpdateManualItemQuantity={handleUpdateManualItemQuantity} onUpdateBomItemQuantity={handleUpdateBomItemQuantity} bomQuantityOverrides={bomQuantityOverrides} onDeleteStarter={handleDeleteStarter} brands={allBrands} />
                ) : (
                  <SummaryView summary={summary} />
                )}
              </div>
            </div>
          </>
        ) : (
          <Suspense fallback={null}>
            <CommonView onAddToDetail={handleAddToDetail} library={library} onImportToLibrary={handleImportToLibrary} />
          </Suspense>
        )}
      </main>

      {/* Admin Modal */}
      {showAdmin && (
        <AdminPanel
          library={library}
          templates={templates}
          /* allBrands (không phải `brands`) để Brand Manager / Brand Matrix / dropdown nhìn thấy
             cả brand chỉ tồn tại trong library như OMEGA. Khi người dùng sửa danh sách,
             onUpdateBrands ghi nguyên hợp của hai nguồn vào boq_brands — chuẩn hoá một lần. */
          brands={allBrands}
          managedBrands={brands}
          matchKeyMeta={matchKeyMeta}
          libraryConflicts={libraryIndex.conflicts}
          onUpdateLibrary={setLibrary}
          onUpdateTemplates={setTemplates}
          onUpdateBrands={setBrands}
          onUpdateMatchKeyMeta={setMatchKeyMeta}
          onClose={() => setShowAdmin(false)}
        />
      )}

      {/* Backup/Restore Modal */}
      {showBackup && (
        <BackupRestoreModal
          onClose={() => setShowBackup(false)}
          beforeExport={() => useProjectStore.getState().syncToCurrentProject(starters, manualItems, bomQuantityOverrides)}
          onImport={handleBackupImport}
          onUndo={(_snapshot, envelope) => handleBackupImport(envelope)}
        />
      )}

      {/* Export Options Modal (P2.1 Feature) */}
      <ExportOptionsModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExportWithOptions}
        projectName={currentProject?.metadata.name}
        projectDescription={currentProject?.metadata.description}
        itemCount={bom.length}
        summaryCount={summary.length}
      />

      <WorkbookTransferModal
        isOpen={showWorkbookTransfer}
        fileName={workbookFileName}
        diff={workbookDiff}
        isApplying={workbookBusy}
        onClose={() => {
          if (workbookBusy) return;
          setShowWorkbookTransfer(false);
          setWorkbookDiff(null);
          setWorkbookFileName('');
        }}
        onApply={handleApplyWorkbook}
      />

      {/* Dashboard Modal */}
      <Dashboard
        isOpen={showDashboard}
        onClose={() => setShowDashboard(false)}
        starters={starters}
        bom={bomWithOverrides}
        validation={validation}
      />
    </div>
  );
}

export default App;
