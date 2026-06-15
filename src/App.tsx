import { useState, useEffect, useMemo } from 'react';
import { InputWizard } from './components/InputWizard';
import { DetailView } from './components/DetailView';
import { SummaryView } from './components/SummaryView';
import { AdminPanel } from './components/AdminPanel';
import type { StarterConfig, BOMItem, SummaryItem, Product } from './types';
import { generateDetail, generateSummary, createLibraryIndex } from './utils/boq-logic';
import { validateBOM, shouldBlockExport } from './utils/validation';
import { exportToExcel } from './utils/excel-export';

import { LayoutDashboard, FileText, Settings, Sun, Moon, Database } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { PRODUCT_LIBRARY, STARTER_TEMPLATES } from './data/library';
import { useToast } from './components/ui/Toast';

import { CommonView } from './components/CommonView';
import type { CommonItem, Unit } from './types';
import { BackupRestoreModal } from './components/BackupRestoreModal';
import { ValidationWarnings } from './components/ValidationWarnings';
import { ProjectSelector } from './components/ProjectSelector';
import { ProjectMetadataDisplay } from './components/ProjectMetadataDisplay';
import { ExportOptionsModal } from './components/ExportOptionsModal';
import type { StarterConfig as StarterConfigType, BOMItem as BOMItemType } from './types';
import type { ExportOptions } from './utils/excel-export';

import { Dashboard } from './components/Dashboard/Dashboard';

export function safeSaveToStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Failed to save to localStorage for key "${key}":`, error);
    return false;
  }
}

function App() {
  const { theme, toggleTheme } = useTheme();
  const [showDashboard, setShowDashboard] = useState(false);

  // Data State (persisted)
  const [library, setLibrary] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('boq_library');
      return saved ? JSON.parse(saved) : PRODUCT_LIBRARY;
    } catch (e) {
      console.error("Failed to parse boq_library", e);
      return PRODUCT_LIBRARY;
    }
  });

  const [templates, setTemplates] = useState<Record<string, Record<string, { matchKey: string; qty: number }[]>>>(() => {
    try {
      const saved = localStorage.getItem('boq_templates');
      return saved ? JSON.parse(saved) : STARTER_TEMPLATES;
    } catch (e) {
      console.error("Failed to parse boq_templates", e);
      return STARTER_TEMPLATES;
    }
  });

  const [brands, setBrands] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('boq_brands');
      return saved ? JSON.parse(saved) : ['Schneider', 'Mitsubishi', 'LS', 'Hyundai'];
    } catch (e) {
      console.error("Failed to parse boq_brands", e);
      return ['Schneider', 'Mitsubishi', 'LS', 'Hyundai'];
    }
  });

  const [starters, setStarters] = useState<StarterConfig[]>([]);

  // Derived state replaces BOM and Summary state management
  const [showAdmin, setShowAdmin] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [boqViewMode, setBoqViewMode] = useState<'detail' | 'summary'>('detail');
  const [activeTab, setActiveTab] = useState<'boq' | 'common'>('boq');

  // Persist Data Changes
  useEffect(() => {
    safeSaveToStorage('boq_library', JSON.stringify(library));
  }, [library]);

  useEffect(() => {
    safeSaveToStorage('boq_templates', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    safeSaveToStorage('boq_brands', JSON.stringify(brands));
  }, [brands]);

  // Performance Optimization: Index library for O(1) lookups
  const libraryIndex = useMemo(() => createLibraryIndex(library), [library]);

  const [manualItems, setManualItems] = useState<BOMItem[]>([]);
  const [bomQuantityOverrides, setBomQuantityOverrides] = useState<Record<string, number>>({});

  // Auto-load project data on page refresh
  useEffect(() => {
    const storedData = localStorage.getItem('boq_projects');
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        const { projects, currentProjectId } = parsed.state || parsed;
        if (currentProjectId && Array.isArray(projects)) {
          const currentProject = projects.find((p: { id: string }) => p.id === currentProjectId);
          if (currentProject) {
            setStarters(currentProject.starters || []);
            setManualItems(currentProject.manualItems || []);
            setBomQuantityOverrides(currentProject.bomQuantityOverrides || {});
          }
        }
      } catch (e) {
        console.error('Failed to load project from localStorage:', e);
      }
    }
  }, []);

  // Derived BOM and Summary (Memoized)
  const bom = useMemo(() => {
    const generated = generateDetail(starters, libraryIndex, templates);
    return [...generated, ...manualItems];
  }, [starters, libraryIndex, templates, manualItems]);

  // Apply overrides to BOM for summary calculation
  const bomWithOverrides = useMemo(() => {
    return bom.map(item =>
      bomQuantityOverrides[item.id] !== undefined
        ? { ...item, quantity: bomQuantityOverrides[item.id] }
        : item
    );
  }, [bom, bomQuantityOverrides]);

  const summary = useMemo(() => generateSummary(bomWithOverrides), [bomWithOverrides]);

  // Validation (E2: Validation & Warnings feature)
  const validation = useMemo(() => validateBOM(bomWithOverrides, starters), [bomWithOverrides, starters]);

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
        if (key.startsWith(`${id}-`)) {
          delete next[key];
        }
      });
      return next;
    });
  };

  const { showToast } = useToast();

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
      await exportToExcel(bomWithOverrides, summary, options);
      showToast("Export successful!", "success");
    } catch (error) {
      console.error("Export failed:", error);
      showToast("Export failed! See console.", "error");
      throw error; // Re-throw for modal error handling
    }
  };

  const handleImportToLibrary = (items: Product[]) => {
    let addedCount = 0;
    let updatedCount = 0;
    // OPTIMIZATION: Use Map for O(1) lookup instead of O(N) findIndex
    const libMap = new Map(library.map(p => [p.code, p]));

    items.forEach(item => {
      const existing = libMap.get(item.code);
      if (!existing) {
        libMap.set(item.code, item);
        addedCount++;
      } else {
        // Update existing item
        libMap.set(item.code, {
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
            <button
              onClick={() => setActiveTab('common')}
              className={`px-4 py-2 rounded-md transition-all ${activeTab === 'common' ? 'bg-white text-blue-900 shadow' : 'text-blue-200 hover:text-white'}`}
            >
              Common Logic
            </button>
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
              </div>

              <button
                onClick={() => setShowBackup(true)}
                className="flex items-center gap-2 px-3 py-2 bg-purple-600 rounded hover:bg-purple-500 transition text-white font-medium"
                title="Backup & Restore Data"
              >
                <Database className="w-4 h-4" /> Back-up/Restore
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
        {activeTab === 'boq' ? (
          <>
            {/* Validation Warnings */}
            <ValidationWarnings
              validation={validation}
              className="mb-6"
            />

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2">
                <InputWizard onAddStarter={handleAddStarter} templates={templates} brands={brands} />
              </div>
            </div>

            <div className="mt-8">
              <div className="w-full">
                {boqViewMode === 'detail' ? (
                  <DetailView starters={starters} bom={bom} manualItems={manualItems} onUpdateStarter={handleUpdateStarter} onUpdateManualItemQuantity={handleUpdateManualItemQuantity} onUpdateBomItemQuantity={handleUpdateBomItemQuantity} bomQuantityOverrides={bomQuantityOverrides} onDeleteStarter={handleDeleteStarter} />
                ) : (
                  <SummaryView summary={summary} />
                )}
              </div>
            </div>
          </>
        ) : (
          <CommonView onAddToDetail={handleAddToDetail} library={library} onImportToLibrary={handleImportToLibrary} />
        )}
      </main>

      {/* Admin Modal */}
      {showAdmin && (
        <AdminPanel
          library={library}
          templates={templates}
          brands={brands}
          onUpdateLibrary={setLibrary}
          onUpdateTemplates={setTemplates}
          onUpdateBrands={setBrands}
          onClose={() => setShowAdmin(false)}
        />
      )}

      {/* Backup/Restore Modal */}
      {showBackup && (
        <BackupRestoreModal
          onClose={() => setShowBackup(false)}
          onImport={() => {/* handled in modal */ }}
        />
      )}

      {/* Export Options Modal (P2.1 Feature) */}
      <ExportOptionsModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExportWithOptions}
        itemCount={bom.length}
        summaryCount={summary.length}
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
