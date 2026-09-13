import { useState, useRef, useMemo, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Save, Download, Upload, Settings, Search, ChevronDown, ChevronRight, Code } from 'lucide-react';
import type { Product, TemplateItem, ComponentCondition, Brand, MatchKeyMetaMap, DeviceCategory } from '../types';
import { useToast } from './ui/Toast';
import { TemplateEditor } from './TemplateEditor';
import { convertLegacyTemplate, VALID_CONDITIONS, type TemplateDefinition } from '../utils/template-validation';
import { findMatchKeyMismatches } from '../utils/boq-logic';
import { categoryOf, defaultMetaFor, isBrandSensitive, normalizeMatchKey } from '../utils/brand-policy';
import { normalizePowerKey } from '../types';
import type { MatchKeyImportReport } from '../utils/excel-import';
import { parseUnknownImportDecision } from '../utils/import-validation';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface AdminPanelProps {
    library: Product[];
    templates: Record<string, Record<string, TemplateItem[]>>;
    onUpdateLibrary: (newLibrary: Product[]) => void;
    onUpdateTemplates: (newTemplates: Record<string, Record<string, TemplateItem[]>>) => void;
    brands: Brand[];
    /** Brand list shown in the UI. Library-only brands must not be persisted as managed brands. */
    managedBrands?: Brand[];
    onUpdateBrands: (newBrands: Brand[]) => void;
    /** Khai báo "matchKey nào phụ thuộc nhãn hiệu" — xem utils/brand-policy.ts */
    matchKeyMeta?: MatchKeyMetaMap;
    onUpdateMatchKeyMeta?: (next: MatchKeyMetaMap) => void;
    /** matchKey brand-agnostic đang có nhiều bản ghi trong library (cần dọn tay) */
    libraryConflicts?: string[];
    onClose: () => void;
}

export function AdminPanel({ library, templates, brands, managedBrands = brands, onUpdateLibrary, onUpdateTemplates, onUpdateBrands, matchKeyMeta = {}, onUpdateMatchKeyMeta, libraryConflicts = [], onClose }: AdminPanelProps) {
    // P4.3: ConfirmDialog dùng chung thay window.confirm (các hành động phá huỷ).
    const [confirmState, setConfirmState] = useState<{ message: string; title?: string; confirmLabel?: string; onConfirm: () => void } | null>(null);
    const requestConfirm = (message: string, onConfirm: () => void, opts?: { title?: string; confirmLabel?: string }) =>
        setConfirmState({ message, onConfirm, title: opts?.title, confirmLabel: opts?.confirmLabel });
    const [activeTab, setActiveTab] = useState<'products' | 'templates' | 'matchKeys'>('products');
    const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showBrandManager, setShowBrandManager] = useState(false);
    const [newBrandName, setNewBrandName] = useState('');
    // Báo cáo chi tiết sau khi Import Matrix (thay cho console.log cũ).
    const [importReport, setImportReport] = useState<MatchKeyImportReport | null>(null);

    // Key template lệch chuỗi so với library ("nhìn giống mà máy báo Missing").
    const keyMismatches = useMemo(() => findMatchKeyMismatches(library, templates), [library, templates]);
    const [searchTerm, setSearchTerm] = useState('');
    const [matchKeySearchTerm, setMatchKeySearchTerm] = useState('');
    const [showTemplateEditor, setShowTemplateEditor] = useState(false);
    const [editingTemplateType, setEditingTemplateType] = useState<string | null>(null);
    const [editorInitialTemplate, setEditorInitialTemplate] = useState<TemplateDefinition | undefined>(undefined);

    // Template State
    const [addingComponentTo, setAddingComponentTo] = useState<{ type: string; power: string } | null>(null);
    const [newComponentKey, setNewComponentKey] = useState('');
    const [newComponentQty, setNewComponentQty] = useState(1);
    const [newComponentCondition, setNewComponentCondition] = useState<ComponentCondition>('always');

    const [addingPowerTo, setAddingPowerTo] = useState<string | null>(null);
    const [newPowerValue, setNewPowerValue] = useState('');

    const [isAddingType, setIsAddingType] = useState(false);
    const [newTypeName, setNewTypeName] = useState('');

    // Inline Quantity Editing
    const [editingQty, setEditingQty] = useState<{ type: string; power: string; matchKey: string } | null>(null);
    const [editingQtyValue, setEditingQtyValue] = useState<number>(1);

    // Bulk Quantity Update
    const [bulkUpdateKey, setBulkUpdateKey] = useState<string>('');
    const [bulkUpdateQty, setBulkUpdateQty] = useState<number>(1);

    // Collapse/Expand State for Templates
    const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());

    // Initialize all power keys as collapsed by default
    const allPowerKeys = useMemo(() => {
        const keys = new Set<string>();
        Object.entries(templates).forEach(([type, powers]) => {
            Object.keys(powers).forEach(power => {
                keys.add(`${type}-${power}`);
            });
        });
        return keys;
    }, [templates]);

    const [collapsedPowers, setCollapsedPowers] = useState<Set<string>>(() => {
        // Start with all powers collapsed
        const keys = new Set<string>();
        Object.entries(templates).forEach(([type, powers]) => {
            Object.keys(powers).forEach(power => {
                keys.add(`${type}-${power}`);
            });
        });
        return keys;
    });

    // Sync new power keys to collapsed state when templates change
    useEffect(() => {
        setCollapsedPowers(prev => {
            const newSet = new Set(prev);
            // Validating logic placeholder
            return newSet;
        });
    }, [allPowerKeys]);

    const toggleTypeCollapse = (type: string) => {
        setCollapsedTypes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(type)) {
                newSet.delete(type);
            } else {
                newSet.add(type);
            }
            return newSet;
        });
    };

    // --- Product Logic ---
    const handleSaveProduct = () => {
        // Brand KHÔNG còn bắt buộc với matchKey không phụ thuộc nhãn hiệu — trước đây yêu cầu
        // brand cho mọi sản phẩm nên không thể tạo hàng brand-agnostic mà không đóng dấu bừa.
        if (!editingProduct) return;

        // Product.code is optional for iBom-only rows such as MCT/PCT. Keep
        // the other identity fields explicit before writing to the catalog.
        const code = String(editingProduct.code ?? '').trim();
        const ibomCode = String(editingProduct.ibomCode ?? '').trim();
        const description = String(editingProduct.description ?? '').trim();
        const matchKey = normalizeMatchKey(editingProduct.matchKey ?? '');
        const brand = String(editingProduct.brand ?? '').trim();
        const unit = String(editingProduct.unit ?? '').trim();
        if (!description || !unit || (!code && !ibomCode && !matchKey) || !brand) {
            showToast('Enter description, unit, brand, and at least one iBom, product, or Match Key identifier.', 'error');
            return;
        }

        const newProduct: Product = {
            ...editingProduct,
            id: editingProduct.id || crypto.randomUUID(),
            code,
            ibomCode: ibomCode || undefined,
            description,
            matchKey: matchKey || undefined,
            brand,
            unit: unit as Product['unit'],
        };

        if (editingProduct.id) {
            onUpdateLibrary(library.map(p => p.id === newProduct.id ? newProduct : p));
        } else {
            onUpdateLibrary([...library, newProduct]);
        }
        setEditingProduct(null);
    };

    const handleDeleteProduct = (id: string) => {
        requestConfirm('Are you sure you want to delete this product?', () => {
            onUpdateLibrary(library.filter(p => p.id !== id));
        });
    };

    const handleExportLibrary = async () => {
        try {
            const { exportLibraryToExcel } = await import('../utils/excel-export');
            await exportLibraryToExcel(library);
            showToast("Library Exported!", "success");
        } catch (error) {
            showToast("Export failed", "error");
        }
    };

    const handleImportLibrary = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const { importLibraryFromExcelDetailed } = await import('../utils/excel-import');
            // P0-4: whitelist brand hợp lệ = brands (khai báo) + brand đang có trong library
            // (giữ OMEGA cho MCT/PCT và mọi brand tuỳ chỉnh, không ép về Schneider).
            const allowedBrands = Array.from(
                new Set([...brands, ...library.map(p => p.brand)].filter(Boolean))
            ) as string[];
            let detailed = await importLibraryFromExcelDetailed(file, allowedBrands, { unknownBrand: 'keep' });
            let brandsToAdd: string[] = [];
            const unknownBrands = Array.from(new Set(
                detailed.issues.filter(issue => issue.field === 'Brand').map(issue => issue.value)
            ));

            if (unknownBrands.length > 0) {
                const decision = parseUnknownImportDecision(prompt(
                    `File có nhãn hiệu chưa nằm trong catalog:\n\n` +
                    `${unknownBrands.slice(0, 20).map(value => `• ${value}`).join('\n')}` +
                    `${unknownBrands.length > 20 ? '\n…' : ''}\n\n` +
                    `Gõ ADD để thêm vào catalog và giữ nguyên, hoặc SKIP để bỏ các dòng đó. ` +
                    `Không tự đổi nhãn hiệu lạ về nhãn hiệu mặc định. Cancel để không nhập file:`
                ));

                // D-07: the explicit catalog import flow must never silently
                // rewrite an unknown brand to Schneider. Keep the fallback
                // branch in the compatibility parser, but reject it here.
                if (decision === 'cancel' || decision === 'fallback') {
                    showToast('Đã huỷ nhập vì chưa chọn cách xử lý brand lạ', 'info');
                    return;
                }
                if (decision === 'add') {
                    brandsToAdd = unknownBrands.filter(value => !managedBrands.includes(value));
                } else {
                    detailed = await importLibraryFromExcelDetailed(file, allowedBrands, {
                        unknownBrand: decision === 'skip' ? 'skip' : 'fallback',
                    });
                }
            }

            const imported = detailed.products;
            if (imported.length === 0) {
                showToast('Không còn dòng sản phẩm nào sau khi áp dụng lựa chọn nhập', 'info');
                return;
            }

            // P0-3: mặc định GỘP (merge) an toàn; THAY THẾ (replace) phải gõ xác nhận.
            const mergeChosen = confirm(
                `Nhập ${imported.length} sản phẩm từ Excel.\n\n` +
                `• OK  = GỘP (merge) vào thư viện hiện có (${library.length} SP) — khuyến nghị\n` +
                `• Cancel = chế độ THAY THẾ (replace) toàn bộ thư viện`
            );

            if (mergeChosen) {
                // MERGE theo (matchKey||code)|brand — cùng khoá với App.handleImportToLibrary
                const keyOf = (p: Product) => `${p.matchKey || p.code || p.ibomCode || p.id}|${p.brand}`;
                const libMap = new Map(library.map(p => [keyOf(p), p]));
                let added = 0, updated = 0;
                imported.forEach(item => {
                    const key = keyOf(item);
                    const existing = libMap.get(key);
                    if (existing) { libMap.set(key, { ...existing, ...item }); updated++; }
                    else { libMap.set(key, item); added++; }
                });
                onUpdateLibrary(Array.from(libMap.values()));
                if (brandsToAdd.length > 0) onUpdateBrands(Array.from(new Set([...managedBrands, ...brandsToAdd])));
                showToast(`Đã GỘP: ${added} mới, ${updated} cập nhật`, "success");
            } else {
                const typed = prompt(
                    `⚠️ THAY THẾ sẽ XOÁ toàn bộ ${library.length} sản phẩm hiện có và thay bằng ${imported.length} sản phẩm mới.\n\n` +
                    `Hãy Export backup trước nếu chưa!\n\nGõ chính xác REPLACE để xác nhận:`
                );
                if (typed !== 'REPLACE') {
                    showToast("Đã huỷ THAY THẾ (xác nhận không khớp)", "info");
                } else {
                    onUpdateLibrary(imported);
                    if (brandsToAdd.length > 0) onUpdateBrands(Array.from(new Set([...managedBrands, ...brandsToAdd])));
                    showToast(`Đã THAY THẾ: ${imported.length} sản phẩm`, "success");
                }
            }
        } catch (error) {
            showToast("Import failed", "error");
        }
        e.target.value = '';
    };

    // --- Template Logic ---
    const handleAddComponent = () => {
        const matchKey = normalizeMatchKey(newComponentKey);
        if (!addingComponentTo || !matchKey) return;
        const { type, power } = addingComponentTo;
        if (!Number.isFinite(newComponentQty) || newComponentQty <= 0) {
            showToast('Quantity phải lớn hơn 0', 'error');
            return;
        }

        // Check if product exists
        const productExists = library.some(p => normalizeMatchKey(p.matchKey) === matchKey);
        if (!productExists) {
            const ibomInput = document.getElementById('new-product-ibom') as HTMLInputElement;
            const descInput = document.getElementById('new-product-desc') as HTMLInputElement;
            const codeInput = document.getElementById('new-product-code') as HTMLInputElement;
            const brandInput = document.getElementById('new-product-brand') as HTMLSelectElement | null;
            const ibomCode = String(ibomInput?.value ?? '').trim();
            const description = String(descInput?.value ?? '').trim();
            const code = String(codeInput?.value ?? '').trim();
            const brand = String(brandInput?.value ?? '').trim()
                || (isBrandSensitive(matchKey, matchKeyMeta) ? (brands[0] || 'Schneider') : '');

            if (ibomCode && description && brand) {
                const newProduct: Product = {
                    id: crypto.randomUUID(),
                    matchKey,
                    ibomCode,
                    description,
                    // iBom-only products (MCT/PCT) intentionally keep an
                    // empty product code; do not invent a placeholder.
                    code,
                    // Lấy theo ô Brand người dùng chọn. Chỉ tự điền brands[0] cho món ĐI THEO
                    // nhãn hiệu khi ô để trống; món không phụ thuộc nhãn hiệu giữ nguyên trống
                    // (trước đây luôn bị gán brands[0] = Schneider, kể cả MCT/PCT — lỗi M12).
                    brand,
                    unit: 'Cái',
                    price: 0
                };
                onUpdateLibrary([...library, newProduct]);
                showToast(`Created new product: ${newComponentKey}`, "success");
            } else {
                // If fields are missing but user wants to proceed, we could alert or just add the template item.
                // For now, let's require at least iBom and Description for new products to avoid bad data.
                if (!confirm("New product detected but details missing. Add to template anyway? (Product will be missing in Library)")) {
                    return;
                }
            }
        }

        const newTemplates = { ...templates };
        newTemplates[type][power] = [...newTemplates[type][power], {
            id: `line-${crypto.randomUUID()}`,
            matchKey,
            qty: newComponentQty,
            condition: newComponentCondition
        }];
        onUpdateTemplates(newTemplates);
        setAddingComponentTo(null);
        setNewComponentKey('');
        setNewComponentQty(1);
        setNewComponentCondition('always');
    };

    const handleAddPower = () => {
        if (!addingPowerTo || !newPowerValue) return;
        const powerKey = normalizePowerKey(newPowerValue);
        if (!powerKey) {
            showToast('Power rating phải là số thập phân không âm.', 'error');
            return;
        }
        const newTemplates = { ...templates };
        const existingPower = Object.keys(newTemplates[addingPowerTo] || {})
            .find(power => normalizePowerKey(power) === powerKey);
        if (existingPower) {
            showToast('Power rating already exists!', 'error');
            return;
        }
        newTemplates[addingPowerTo][powerKey] = []; // Initialize empty
        onUpdateTemplates(newTemplates);
        setAddingPowerTo(null);
        setNewPowerValue('');
    };

    const handleAddType = () => {
        if (!newTypeName) return;
        if (templates[newTypeName]) {
            showToast('Type already exists!', 'error');
            return;
        }
        const newTemplates = { ...templates };
        newTemplates[newTypeName] = {};
        onUpdateTemplates(newTemplates);
        setIsAddingType(false);
        setNewTypeName('');
    };

    const handleSaveQtyEdit = () => {
        if (!editingQty) return;
        const { type, power, matchKey } = editingQty;
        const newTemplates = { ...templates };
        if (newTemplates[type] && newTemplates[type][power]) {
            const componentIndex = newTemplates[type][power].findIndex(c => c.matchKey === matchKey);
            if (componentIndex !== -1) {
                newTemplates[type][power][componentIndex].qty = editingQtyValue;
                onUpdateTemplates(newTemplates);
                showToast(`Updated ${matchKey} qty to ${editingQtyValue}`, "success");
            }
        }
        setEditingQty(null);
    };

    const handleBulkUpdateQty = () => {
        if (!bulkUpdateKey || bulkUpdateQty <= 0) {
            showToast("Please select a match key and enter valid quantity", "error");
            return;
        }

        const newTemplates = { ...templates };
        let updateCount = 0;

        // Iterate through all starter types and power ratings
        Object.keys(newTemplates).forEach(type => {
            Object.keys(newTemplates[type]).forEach(power => {
                newTemplates[type][power] = newTemplates[type][power].map(comp => {
                    if (comp.matchKey === bulkUpdateKey) {
                        updateCount++;
                        return { ...comp, qty: bulkUpdateQty };
                    }
                    return comp;
                });
            });
        });

        if (updateCount > 0) {
            onUpdateTemplates(newTemplates);
            showToast(`Updated ${bulkUpdateKey} qty to ${bulkUpdateQty} in ${updateCount} templates`, "success");
            setBulkUpdateKey('');
            setBulkUpdateQty(1);
        } else {
            showToast(`No templates found with ${bulkUpdateKey}`, "error");
        }
    };

    // --- Match Key Logic ---
    const getMatchKeys = () => {
        const keys = new Set<string>();
        library.forEach(p => { if (p.matchKey) keys.add(p.matchKey); });
        // Also add keys from templates that might not be in library yet (though Quick Create minimizes this)
        Object.values(templates).forEach(powers => {
            Object.values(powers).forEach(comps => {
                comps.forEach(c => keys.add(c.matchKey));
            });
        });
        return Array.from(keys).sort();
    };

    const [selectedMatchKey, setSelectedMatchKey] = useState<string | null>(null);

    // Handle saving template from JSON Editor
    const handleSaveTemplate = (newTemplate: TemplateDefinition) => {
        // Convert back to legacy format for storage
        // The editor uses a richer format, but we currently store as Record<string, Record<string, Component[]>>
        const legacyFormat: Record<string, TemplateItem[]> = {};

        // Map ratings back. P0-1: GIỮ `condition` (trước đây bị bỏ → mọi dòng optional
        // thành 'always' và luôn bị tính vào BOQ, sai khối lượng). undefined -> 'always'.
        Object.entries(newTemplate.ratings).forEach(([rating, components]) => {
            legacyFormat[rating] = components.map(c => ({
                ...(c.id ? { id: c.id } : {}),
                matchKey: c.matchKey,
                qty: c.qty,
                condition: c.condition ?? 'always'
            }));
        });

        // Update templates state
        const updatedTemplates = { ...templates };
        updatedTemplates[newTemplate.type] = legacyFormat;

        onUpdateTemplates(updatedTemplates);
        showToast(`Template ${newTemplate.type} updated successfully!`, 'success');
    };

    const openTemplateEditor = (type: string) => {
        const legacyParams = templates[type];
        if (legacyParams) {
            // Convert existing template to editor format
            const templateDef = convertLegacyTemplate(type as any, legacyParams as any);
            setEditorInitialTemplate(templateDef);
        } else {
            setEditorInitialTemplate(undefined);
        }
        setEditingTemplateType(type);
        setShowTemplateEditor(true);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 w-full max-w-7xl h-[90vh] rounded-lg shadow-xl flex flex-col overflow-hidden transition-colors duration-200">
                {/* Header */}
                <div className="p-4 bg-gray-800 dark:bg-gray-900 text-white flex items-center justify-between shrink-0">
                    <h2 className="text-xl font-bold">Admin Panel</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800">
                    <button
                        className={`px-6 py-3 font-medium transition-colors ${activeTab === 'products' ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                        onClick={() => setActiveTab('products')}
                    >
                        Product Library
                    </button>
                    <button
                        className={`px-6 py-3 font-medium transition-colors ${activeTab === 'templates' ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                        onClick={() => setActiveTab('templates')}
                    >
                        Starter Templates
                    </button>
                    <button
                        className={`px-6 py-3 font-medium transition-colors ${activeTab === 'matchKeys' ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                        onClick={() => setActiveTab('matchKeys')}
                    >
                        Match Key Manager
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 bg-gray-50 dark:bg-gray-900/50">
                    {activeTab === 'products' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center flex-wrap gap-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Products ({library.length})</h3>
                                <div className="flex gap-2 flex-wrap">
                                    <button
                                        onClick={handleExportLibrary}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm"
                                    >
                                        <Download className="w-4 h-4" /> Export
                                    </button>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm"
                                    >
                                        <Upload className="w-4 h-4" /> Import
                                    </button>
                                    <button
                                        onClick={() => {
                                            requestConfirm("WARNING: This will delete ALL products from your library.\n\nAre you sure you want to continue?", () => {
                                                onUpdateLibrary([]);
                                                showToast("Library cleared!", "success");
                                            });
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition text-sm"
                                    >
                                        <Trash2 className="w-4 h-4" /> Clear
                                    </button>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleImportLibrary}
                                        accept=".xlsx, .xls"
                                        className="hidden"
                                    />
                                    <button
                                        onClick={() => setEditingProduct({ unit: 'Cái', brand: brands[0] || 'Schneider' })}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm"
                                    >
                                        <Plus className="w-4 h-4" /> Add Product
                                    </button>
                                </div>
                            </div>

                            {/* Search Bar */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Search by Description, Brand, Match Key, Code..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                                />
                            </div>

                            {/* Edit Form */}
                            {editingProduct && (
                                <div className="bg-white dark:bg-gray-800 p-4 rounded shadow border border-blue-200 dark:border-blue-900 mb-4">
                                    <h4 className="font-bold mb-2 text-gray-900 dark:text-white">{editingProduct.id ? 'Edit Product' : 'New Product'}</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <input
                                            placeholder="Product Code"
                                            value={editingProduct.code || ''}
                                            onChange={e => setEditingProduct({ ...editingProduct, code: e.target.value })}
                                            className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <input
                                            placeholder="iBom Code"
                                            value={editingProduct.ibomCode || ''}
                                            onChange={e => setEditingProduct({ ...editingProduct, ibomCode: e.target.value })}
                                            className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <input
                                            placeholder="Description"
                                            value={editingProduct.description || ''}
                                            onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                                            className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <select
                                            // KHÔNG fallback sang 'Schneider': sản phẩm brand rỗng từng hiển thị
                                            // như thể nó là hàng Schneider.
                                            value={editingProduct.brand ?? ''}
                                            onChange={e => setEditingProduct({ ...editingProduct, brand: e.target.value as any })}
                                            className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="">— chưa đặt nhãn hiệu —</option>
                                            {/* Dùng danh sách brand động — hard-code 4 brand ở đây từng làm
                                                sản phẩm OMEGA hiện select trống rồi bị ghi đè (lỗi M10). */}
                                            {(editingProduct.brand && !brands.includes(editingProduct.brand)
                                                ? [editingProduct.brand, ...brands]
                                                : brands
                                            ).map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                        <input
                                            placeholder="Match Key (e.g. CONTACTOR_9A)"
                                            value={editingProduct.matchKey || ''}
                                            onChange={e => setEditingProduct({ ...editingProduct, matchKey: normalizeMatchKey(e.target.value) })}
                                            className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <div className="flex gap-2 col-span-2 md:col-span-5 justify-end">
                                            <button onClick={() => setEditingProduct(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                                            <button onClick={handleSaveProduct} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Table */}
                            <div className="bg-white dark:bg-gray-800 shadow rounded overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                                        <tr>
                                            <th className="p-3">Code</th>
                                            <th className="p-3">iBom Code</th>
                                            <th className="p-3">Description</th>
                                            <th className="p-3">Brand</th>
                                            <th className="p-3">Match Key</th>
                                            <th className="p-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {library.filter(product => {
                                            const term = searchTerm.toLowerCase();
                                            const desc = product.description ? String(product.description).toLowerCase() : '';
                                            const brand = product.brand ? String(product.brand).toLowerCase() : '';
                                            const matchKey = product.matchKey ? String(product.matchKey).toLowerCase() : '';
                                            const code = product.code ? String(product.code).toLowerCase() : '';
                                            const ibom = product.ibomCode ? String(product.ibomCode).toLowerCase() : '';

                                            return (
                                                desc.includes(term) ||
                                                brand.includes(term) ||
                                                matchKey.includes(term) ||
                                                code.includes(term) ||
                                                ibom.includes(term)
                                            );
                                        }).map(product => (
                                            <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                                <td className="p-3 font-mono text-gray-900 dark:text-gray-100">{product.code}</td>
                                                <td className="p-3 font-mono text-sm text-gray-600 dark:text-gray-400">{product.ibomCode || '-'}</td>
                                                <td className="p-3 text-gray-900 dark:text-gray-100">{product.description}</td>
                                                <td className="p-3 text-gray-600 dark:text-gray-400">{product.brand}</td>
                                                <td className="p-3 text-sm text-gray-500 dark:text-gray-400">{product.matchKey}</td>
                                                <td className="p-3 text-right flex justify-end gap-2">
                                                    <button onClick={() => setEditingProduct(product)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDeleteProduct(product.id)} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'templates' && (
                        <div className="space-y-6">
                            {/* Key trong template "nhìn giống hệt" key trong library nhưng lệch khoảng trắng
                                hoặc hoa/thường ⇒ BOQ báo Missing dù Admin vẫn hiện key đó. */}
                            {keyMismatches.length > 0 && (
                                <div className="p-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
                                    <div className="font-semibold text-amber-800 dark:text-amber-300 text-sm mb-2">
                                        ⚠️ {keyMismatches.length} Match Key trong template lệch chuỗi so với Product Library
                                    </div>
                                    <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
                                        Hai chuỗi nhìn giống nhau nhưng khác khoảng trắng hoặc hoa/thường. BOQ vẫn chạy được
                                        (đã tự dò lại), nhưng nên bấm <b>Sửa</b> để chuẩn hoá về đúng key của thư viện.
                                    </p>
                                    <ul className="space-y-1">
                                        {keyMismatches.map(m => (
                                            <li key={m.templateKey} className="flex items-center justify-between gap-3 text-xs">
                                                <span className="font-mono text-gray-700 dark:text-gray-300 truncate">
                                                    "{m.templateKey}" → "{m.libraryKey}"
                                                    <span className="text-gray-500 dark:text-gray-500"> · {m.where.join(', ')}</span>
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        const next = { ...templates };
                                                        Object.keys(next).forEach(type => {
                                                            Object.keys(next[type]).forEach(power => {
                                                                next[type][power] = next[type][power].map(c =>
                                                                    c.matchKey === m.templateKey ? { ...c, matchKey: m.libraryKey } : c
                                                                );
                                                            });
                                                        });
                                                        onUpdateTemplates(next);
                                                        showToast(`Đã chuẩn hoá "${m.templateKey}"`, 'success');
                                                    }}
                                                    className="shrink-0 px-2 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-700"
                                                >
                                                    Sửa
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="flex justify-between items-center flex-wrap gap-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Starter Templates</h3>
                                <div className="flex gap-2 flex-wrap">
                                    <button
                                        onClick={async () => {
                                            try {
                                                const { exportTemplatesToExcel } = await import('../utils/excel-export');
                                                await exportTemplatesToExcel(templates);
                                                showToast("Templates Exported!", "success");
                                            } catch (error) {
                                                showToast("Export failed", "error");
                                            }
                                        }}
                                        className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                                    >
                                        <Download className="w-4 h-4" /> Export
                                    </button>
                                    <button
                                        onClick={() => {
                                            const input = document.createElement('input');
                                            input.type = 'file';
                                            input.accept = '.xlsx, .xls';
                                            input.onchange = async (e) => {
                                                const file = (e.target as HTMLInputElement).files?.[0];
                                                if (!file) return;
                                                try {
                                                    const { importTemplatesFromExcel, mergeTemplatesWithReport, untouchedTiers } =
                                                        await import('../utils/excel-import');
                                                    const { templates: incoming, report } = await importTemplatesFromExcel(file);

                                                    // P3: condition gõ sai làm linh kiện im lặng biến mất khỏi BOQ ⇒ CHẶN cả lần nhập.
                                                    if (report.invalidConditions.length > 0) {
                                                        const list = report.invalidConditions.slice(0, 10)
                                                            .map(e => `  • Dòng ${e.row}: ${e.type} ${e.power}kW · ${e.matchKey} · Condition="${e.condition}"`)
                                                            .join('\n');
                                                        alert(
                                                            `❌ Không nhập được: ${report.invalidConditions.length} dòng có Condition không hợp lệ.\n\n` +
                                                            `${list}${report.invalidConditions.length > 10 ? '\n  …' : ''}\n\n` +
                                                            `Giá trị hợp lệ: ${VALID_CONDITIONS.join(', ')}\n\n` +
                                                            `Hãy sửa file rồi nhập lại. Chưa có gì bị thay đổi.`
                                                        );
                                                        return;
                                                    }

                                                    if (report.tiers.length === 0) {
                                                        showToast('File không có dòng dữ liệu hợp lệ nào. Chưa có gì bị thay đổi.', 'info');
                                                        return;
                                                    }

                                                    const keep = untouchedTiers(templates, incoming);
                                                    const mergePreview = mergeTemplatesWithReport(templates, incoming);
                                                    const tierList = report.tiers.slice(0, 12)
                                                        .map(t => `  • ${t.type} ${t.power}kW — ${t.count} linh kiện`).join('\n');
                                                    const collisionWarning = mergePreview.report.collisions.length > 0
                                                        ? `\n⚠️ ${mergePreview.report.collisions.length} collision PowerKey sẽ được gom lại ` +
                                                          `(${mergePreview.report.collisions.slice(0, 5).map(c => `${c.type} ${c.power}kW: ${c.rawPowers.join(' / ')}`).join(', ')}).`
                                                        : '';

                                                    const ok = confirm(
                                                        `Nhập ${report.rows} dòng từ file.\n\n` +
                                                        `SẼ CẬP NHẬT ${report.tiers.length} mức công suất:\n${tierList}` +
                                                        `${report.tiers.length > 12 ? '\n  …' : ''}\n\n` +
                                                        `GIỮ NGUYÊN ${keep.length} mức không có trong file` +
                                                        `${keep.length > 0 ? ` (${keep.slice(0, 5).map(t => `${t.type} ${t.power}kW`).join(', ')}${keep.length > 5 ? '…' : ''})` : ''}.\n` +
                                                        `${report.skipped > 0 ? `\nBỏ qua ${report.skipped} dòng thiếu StarterType/Power/MatchKey.` : ''}` +
                                                        `${report.fixedQuantities.length > 0 ? `\nChuẩn hoá ${report.fixedQuantities.length} Quantity không hợp lệ về 1.` : ''}` +
                                                        collisionWarning +
                                                        `\n\nTiếp tục?`
                                                    );
                                                    if (!ok) { showToast('Đã huỷ nhập template', 'info'); return; }

                                                    onUpdateTemplates(mergePreview.templates);
                                                    showToast(`Đã cập nhật ${report.tiers.length} mức công suất`, "success");
                                                } catch (error) {
                                                    showToast("Import failed", "error");
                                                }
                                            };
                                            input.click();
                                        }}
                                        className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                                    >
                                        <Upload className="w-4 h-4" /> Import
                                    </button>
                                    <button
                                        onClick={() => {
                                            requestConfirm("WARNING: This will delete ALL starter templates.\n\nAre you sure you want to continue?", () => {
                                                onUpdateTemplates({});
                                                showToast("Templates cleared!", "success");
                                            });
                                        }}
                                        className="flex items-center gap-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                                    >
                                        <Trash2 className="w-4 h-4" /> Clear
                                    </button>
                                    <button
                                        onClick={() => setIsAddingType(true)}
                                        className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                                    >
                                        <Plus className="w-4 h-4" /> Add Starter Type
                                    </button>
                                </div>
                            </div>

                            {/* Bulk Quantity Update */}
                            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 p-4 rounded-lg border-2 border-purple-200 dark:border-purple-800">
                                <div className="flex items-center gap-2 mb-3">
                                    <Settings className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                    <h4 className="font-bold text-purple-900 dark:text-purple-300">Bulk Quantity Update</h4>
                                </div>
                                <div className="flex gap-3 items-end flex-wrap">
                                    <div className="flex-1 min-w-[250px]">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Match Key</label>
                                        <select
                                            value={bulkUpdateKey}
                                            onChange={e => setBulkUpdateKey(e.target.value)}
                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="">Select a Match Key...</option>
                                            {getMatchKeys().map(key => (
                                                <option key={key} value={key}>{key}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="w-28">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Qty</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            value={bulkUpdateQty}
                                            onChange={e => setBulkUpdateQty(Number(e.target.value))}
                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <button
                                        onClick={handleBulkUpdateQty}
                                        disabled={!bulkUpdateKey}
                                        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 transition"
                                    >
                                        <Save className="w-4 h-4" /> Update All
                                    </button>
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                                    This will update the quantity for the selected Match Key across <strong>ALL</strong> starter templates.
                                </p>
                            </div>

                            {isAddingType && (
                                <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded flex gap-2 items-center border border-blue-100 dark:border-blue-800">
                                    <input
                                        placeholder="New Type Name (e.g. Soft-Starter)"
                                        value={newTypeName}
                                        onChange={e => setNewTypeName(e.target.value)}
                                        className="p-2 border border-gray-300 dark:border-gray-600 rounded flex-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                    <button onClick={handleAddType} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Add</button>
                                    <button onClick={() => setIsAddingType(false)} className="text-gray-500 dark:text-gray-400 px-2 hover:text-gray-700 dark:hover:text-gray-200">Cancel</button>
                                </div>
                            )}
                            {Object.entries(templates).map(([type, powers]) => {
                                const isTypeCollapsed = collapsedTypes.has(type);
                                return (
                                    <div key={type} className="bg-white dark:bg-gray-800 p-4 rounded shadow border border-blue-200 dark:border-blue-900">
                                        <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-2 mb-4">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    {collapsedTypes.has(type) ? (
                                                        <button onClick={() => toggleTypeCollapse(type)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"><ChevronRight className="w-5 h-5" /></button>
                                                    ) : (
                                                        <button onClick={() => toggleTypeCollapse(type)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"><ChevronDown className="w-5 h-5" /></button>
                                                    )}
                                                    <h4 className="text-lg font-bold text-blue-600 dark:text-blue-400">{type}</h4>
                                                    <button
                                                        onClick={() => openTemplateEditor(type)}
                                                        className="ml-2 flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-xs rounded text-gray-600 dark:text-gray-300 transition-colors"
                                                        title="Edit as JSON"
                                                    >
                                                        <Code className="w-3 h-3" /> JSON
                                                    </button>
                                                </div>
                                                <div className="flex gap-2">
                                                    {!isTypeCollapsed && (
                                                        <button
                                                            onClick={() => setAddingPowerTo(type)}
                                                            className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1 transition-colors"
                                                        >
                                                            <Plus className="w-3 h-3" /> Add Power Rating
                                                        </button>
                                                    )}
                                                </div>

                                                {!isTypeCollapsed && (
                                                    <>
                                                        {addingPowerTo === type && (
                                                            <div className="mb-4 bg-gray-50 dark:bg-gray-700/50 p-2 rounded flex gap-2 items-center">
                                                                <input
                                                                    placeholder="Power (kW) e.g. 15"
                                                                    value={newPowerValue}
                                                                    onChange={e => setNewPowerValue(e.target.value)}
                                                                    className="p-1 border border-gray-300 dark:border-gray-600 rounded w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                                />
                                                                <button onClick={handleAddPower} className="bg-blue-600 text-white px-2 py-1 rounded text-sm hover:bg-blue-700">Save</button>
                                                                <button onClick={() => setAddingPowerTo(null)} className="text-gray-500 dark:text-gray-400 px-2 text-sm hover:text-gray-700 dark:hover:text-gray-200">Cancel</button>
                                                            </div>
                                                        )}

                                                        <div className="space-y-4">
                                                            {Object.entries(powers)
                                                                .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
                                                                .map(([power, components]) => {
                                                                    const powerKey = `${type}-${power}`;
                                                                    const isPowerCollapsed = collapsedPowers.has(powerKey);
                                                                    return (
                                                                        <div key={power} className="bg-gray-50 dark:bg-gray-700/30 p-3 rounded border border-gray-200 dark:border-gray-700">
                                                                            <div
                                                                                className="flex justify-between items-center mb-2 cursor-pointer"
                                                                                onClick={() => {
                                                                                    const newSet = new Set(collapsedPowers);
                                                                                    isPowerCollapsed ? newSet.delete(powerKey) : newSet.add(powerKey);
                                                                                    setCollapsedPowers(newSet);
                                                                                }}
                                                                            >
                                                                                <div className="flex items-center gap-2">
                                                                                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isPowerCollapsed ? '-rotate-90' : ''}`} />
                                                                                    <h4 className="font-semibold text-gray-700 dark:text-gray-300">{power} kW</h4>
                                                                                    <span className="text-xs text-gray-400">({components.length} items)</span>
                                                                                </div>
                                                                                {!isPowerCollapsed && (
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); setAddingComponentTo({ type, power }); }}
                                                                                        className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-1 rounded hover:bg-blue-200 dark:hover:bg-blue-900/70 transition-colors"
                                                                                    >
                                                                                        + Add Component
                                                                                    </button>
                                                                                )}
                                                                            </div>

                                                                            {!isPowerCollapsed && (
                                                                                <>
                                                                                    <ul className="space-y-1">
                                                                                        {[...components].sort((a, b) => {
                                                                                            const isOptionalA = a.condition && a.condition !== 'always';
                                                                                            const isOptionalB = b.condition && b.condition !== 'always';
                                                                                            if (isOptionalA === isOptionalB) return 0;
                                                                                            return isOptionalA ? 1 : -1;
                                                                                        }).map((comp, idx) => (
                                                                                            <li key={idx} className="flex items-center justify-between text-sm bg-white dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-600">
                                                                                                <div className="flex items-center gap-2 flex-1">
                                                                                                    <span className="font-mono text-gray-600 dark:text-gray-400">
                                                                                                        {comp.matchKey}
                                                                                                        {editingQty?.type === type && editingQty?.power === power && editingQty?.matchKey === comp.matchKey ? (
                                                                                                            <span className="inline-flex items-center ml-1">
                                                                                                                (Qty:
                                                                                                                <input
                                                                                                                    type="number"
                                                                                                                    step="0.1"
                                                                                                                    min="0"
                                                                                                                    value={editingQtyValue}
                                                                                                                    onChange={e => setEditingQtyValue(Number(e.target.value))}
                                                                                                                    onBlur={handleSaveQtyEdit}
                                                                                                                    onKeyDown={e => e.key === 'Enter' && handleSaveQtyEdit()}
                                                                                                                    autoFocus
                                                                                                                    className="w-16 mx-1 px-1 py-0.5 border border-blue-400 rounded text-center bg-blue-50 dark:bg-blue-900/30 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                                                                                />)
                                                                                                            </span>
                                                                                                        ) : (
                                                                                                            <span
                                                                                                                onClick={() => {
                                                                                                                    setEditingQty({ type, power, matchKey: comp.matchKey });
                                                                                                                    setEditingQtyValue(comp.qty || 0);
                                                                                                                }}
                                                                                                                className={`cursor-pointer px-1 rounded transition ${!comp.qty || comp.qty <= 0
                                                                                                                    ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 font-bold'
                                                                                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                                                                                                                    }`}
                                                                                                                title={!comp.qty || comp.qty <= 0 ? '⚠️ Missing quantity! Click to edit' : 'Click to edit quantity'}
                                                                                                            >
                                                                                                                {!comp.qty || comp.qty <= 0
                                                                                                                    ? ' ⚠️ Qty: ?'
                                                                                                                    : ` (Qty: ${comp.qty})`}
                                                                                                            </span>
                                                                                                        )}
                                                                                                    </span>
                                                                                                    {comp.condition && comp.condition !== 'always' && (
                                                                                                        <span className="text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 rounded-full border border-yellow-200 dark:border-yellow-800">
                                                                                                            {comp.condition}
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                                <button
                                                                                                    onClick={() => {
                                                                                                        if (confirm(`Remove ${comp.matchKey}?`)) {
                                                                                                            const newTemplates = { ...templates };
                                                                                                            newTemplates[type][power] = components.filter((_, i) => i !== idx);
                                                                                                            onUpdateTemplates(newTemplates);
                                                                                                        }
                                                                                                    }}
                                                                                                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                                                                                >
                                                                                                    <X className="w-3 h-3" />
                                                                                                </button>
                                                                                            </li>
                                                                                        ))}
                                                                                    </ul>
                                                                                    {/* Add Component Logic */}
                                                                                    {addingComponentTo?.type === type && addingComponentTo?.power === power && (
                                                                                        <div className="mt-2 bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-800">
                                                                                            <h5 className="text-xs font-bold text-blue-800 dark:text-blue-400 mb-2 uppercase">Add Component</h5>
                                                                                            <div className="grid grid-cols-1 gap-2">
                                                                                                {/* Row 1: Key & Qty & Condition */}
                                                                                                <div className="flex gap-2">
                                                                                                    <div className="flex-1">
                                                                                                        <input
                                                                                                            placeholder="Match Key (e.g. CONTACTOR_9A)"
                                                                                                            value={newComponentKey}
                                                                                                            // Chuẩn hoá ngay khi gõ: dán từ Excel rất dễ kèm khoảng trắng / NBSP,
                                                                                                            // và tra cứu library là so khớp chuỗi tuyệt đối.
                                                                                                            onChange={e => setNewComponentKey(normalizeMatchKey(e.target.value))}
                                                                                                            list="match-key-options"
                                                                                                            className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                                                                        />
                                                                                                        <datalist id="match-key-options">
                                                                                                            {Array.from(new Set(library.map(p => p.matchKey).filter(Boolean))).map(key => (
                                                                                                                <option key={key} value={key} />
                                                                                                            ))}
                                                                                                        </datalist>
                                                                                                    </div>
                                                                                                    <input
                                                                                                        type="number"
                                                                                                        placeholder="Qty"
                                                                                                        value={newComponentQty}
                                                                                                        onChange={e => setNewComponentQty(Number(e.target.value))}
                                                                                                        className="w-16 p-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                                                                    />
                                                                                                    <select
                                                                                                        value={newComponentCondition}
                                                                                                        onChange={e => setNewComponentCondition(e.target.value as ComponentCondition)}
                                                                                                        className="w-24 p-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                                                                        title="Condition"
                                                                                                    >
                                                                                                        <option value="always">Always</option>
                                                                                                        <option value="isolator">Isolator</option>
                                                                                                        <option value="thermal">Thermal</option>
                                                                                                        <option value="ptc">PTC</option>
                                                                                                        <option value="estop">E-Stop</option>
                                                                                                        <option value="humidity">Humidity</option>
                                                                                                        <option value="isolator_BFP">Iso BFP</option>
                                                                                                        <option value="estop_BFP">E-Stop BFP</option>
                                                                                                        <option value="isolator_estop_FB">Iso/Estop FB</option>
                                                                                                    </select>
                                                                                                </div>

                                                                                                {/* Row 2: New Product Details (Conditional) */}
                                                                                                {newComponentKey && !library.some(p => normalizeMatchKey(p.matchKey) === normalizeMatchKey(newComponentKey)) && (
                                                                                                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded border border-yellow-200 dark:border-yellow-800 text-sm">
                                                                                                        <div className="text-yellow-800 dark:text-yellow-200 text-xs font-semibold mb-1 flex items-center gap-1">
                                                                                                            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                                                                                            New Product Detected - Please fill details:
                                                                                                        </div>
                                                                                                        <div className="grid grid-cols-4 gap-2">
                                                                                                            <input
                                                                                                                placeholder="iBom Code"
                                                                                                                className="p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                                                                                id="new-product-ibom"
                                                                                                            />
                                                                                                            <input
                                                                                                                placeholder="Description"
                                                                                                                className="p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                                                                                id="new-product-desc"
                                                                                                            />
                                                                                                            <input
                                                                                                                placeholder="Product Code"
                                                                                                                className="p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                                                                                id="new-product-code"
                                                                                                            />
                                                                                                            {/* Ô Brand: trước đây không có, sản phẩm luôn bị đóng dấu brands[0].
                                                                                                                Món không phụ thuộc nhãn hiệu mặc định để trống để người dùng nhập hãng thật. */}
                                                                                                            <select
                                                                                                                id="new-product-brand"
                                                                                                                defaultValue={isBrandSensitive(newComponentKey, matchKeyMeta) ? (brands[0] || '') : ''}
                                                                                                                className="p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                                                                                title="Nhãn hiệu của sản phẩm này"
                                                                                                            >
                                                                                                                <option value="">— chưa đặt nhãn hiệu —</option>
                                                                                                                {brands.map(b => <option key={b} value={b}>{b}</option>)}
                                                                                                            </select>
                                                                                                        </div>
                                                                                                        <div className="mt-1 text-[11px] text-yellow-700 dark:text-yellow-300">
                                                                                                            {isBrandSensitive(newComponentKey, matchKeyMeta)
                                                                                                                ? 'Key này ĐI THEO nhãn hiệu người dùng chọn — nhớ tạo đủ sản phẩm cho từng hãng ở tab Match Keys.'
                                                                                                                : 'Key này KHÔNG đi theo nhãn hiệu — hãy điền đúng hãng thật của vật tư (vd OMEGA, Selec…).'}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                )}

                                                                                                {/* Row 3: Actions */}
                                                                                                <div className="flex justify-end gap-2 mt-1">
                                                                                                    <button onClick={() => setAddingComponentTo(null)} className="px-3 py-1 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-sm">
                                                                                                        Cancel
                                                                                                    </button>
                                                                                                    <button onClick={handleAddComponent} className="px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 rounded text-sm flex items-center gap-1">
                                                                                                        <Save className="w-3 h-3" /> Save Component
                                                                                                    </button>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {activeTab === 'matchKeys' && (
                        <div className="flex flex-col h-full">
                            <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Match Key Manager</h3>
                                <div className="flex gap-2 flex-wrap">
                                    <button
                                        onClick={async () => {
                                            try {
                                                const { exportMatchKeysToExcel } = await import('../utils/excel-export');
                                                // Truyền brands + meta để file có đủ cột brand (kể cả OMEGA) và cột BrandSensitive.
                                                await exportMatchKeysToExcel(library, brands, matchKeyMeta);
                                                showToast("Match Keys Exported!", "success");
                                            } catch (error) {
                                                showToast("Export failed", "error");
                                            }
                                        }}
                                        className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                                    >
                                        <Download className="w-4 h-4" /> Export Matrix
                                    </button>
                                    <button
                                        onClick={() => {
                                            const input = document.createElement('input');
                                            input.type = 'file';
                                            input.accept = '.xlsx, .xls';
                                            input.onchange = async (e) => {
                                                const file = (e.target as HTMLInputElement).files?.[0];
                                                if (!file) return;
                                                try {
                                                    const { importMatchKeysFromExcel } = await import('../utils/excel-import');
                                                    const result = await importMatchKeysFromExcel(file, library, brands, matchKeyMeta);
                                                    const { report } = result;
                                                    const summary =
                                                        `Kết quả đọc file:\n` +
                                                        `• Thêm mới: ${report.added}\n` +
                                                        `• Cập nhật: ${report.updated}\n` +
                                                        `• Bỏ qua (thiếu MatchKey): ${report.skipped}\n` +
                                                        `• Xung đột brand-agnostic: ${report.conflicts.length}\n` +
                                                        `• Ô code bị xoá trắng (KHÔNG tự xoá): ${report.cleared.length}\n\n` +
                                                        `Thư viện sau khi nhập: ${result.library.length} sản phẩm.\n\nTiếp tục?`;
                                                    if (confirm(summary)) {
                                                        onUpdateLibrary(result.library);
                                                        onUpdateMatchKeyMeta?.(result.meta);
                                                        setImportReport(report);
                                                        showToast("Match Keys Imported!", "success");
                                                    }
                                                } catch (error) {
                                                    showToast("Import failed", "error");
                                                }
                                            };
                                            input.click();
                                        }}
                                        className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                                    >
                                        <Upload className="w-4 h-4" /> Import Matrix
                                    </button>
                                    <button
                                        onClick={() => {
                                            const doomed = library.filter(p => p.matchKey);
                                            // Sản phẩm mang brand KHÔNG nằm trong danh sách brand hiện tại (vd OMEGA)
                                            // sẽ không được Import Matrix tạo lại ⇒ phải cảnh báo rõ trước khi xoá.
                                            const orphanBrands = Array.from(new Set(
                                                doomed.filter(p => p.brand && !brands.includes(p.brand)).map(p => p.brand)
                                            ));
                                            const agnostic = doomed.filter(p => p.matchKey && !isBrandSensitive(p.matchKey, matchKeyMeta));

                                            const warning =
                                                `CẢNH BÁO: sẽ xoá ${doomed.length} sản phẩm có Match Key khỏi thư viện.\n\n` +
                                                `• Trong đó ${agnostic.length} sản phẩm thuộc nhóm KHÔNG phụ thuộc nhãn hiệu.\n` +
                                                (orphanBrands.length > 0
                                                    ? `• ${orphanBrands.join(', ')}: brand không nằm trong danh sách hiện tại ⇒ Import Matrix sẽ KHÔNG tạo lại được.\n`
                                                    : '') +
                                                `\nHãy Export Matrix / Backup trước nếu chưa!\n\nGõ chính xác CLEAR để xác nhận:`;

                                            const typed = prompt(warning);
                                            if (typed !== 'CLEAR') {
                                                if (typed !== null) showToast('Đã huỷ — bạn chưa gõ đúng chữ CLEAR', 'info');
                                                return;
                                            }
                                            onUpdateLibrary(library.filter(p => !p.matchKey));
                                            setSelectedMatchKey(null);
                                            showToast("All Match Keys cleared!", "success");
                                        }}
                                        className="flex items-center gap-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                                        title="Clear all Match Keys to perform a clean import"
                                    >
                                        <Trash2 className="w-4 h-4" /> Clear Data
                                    </button>
                                    <button
                                        onClick={() => setShowBrandManager(true)}
                                        className="flex items-center gap-2 px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm"
                                    >
                                        <Settings className="w-4 h-4" /> Brands
                                    </button>
                                </div>
                            </div>

                            {/* Báo cáo Import Matrix — thay cho console.log cũ (lỗi M8) */}
                            {importReport && (
                                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                                        <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Kết quả Import Match Key Matrix</h3>

                                        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 mb-4">
                                            <li>• Thêm mới: <b>{importReport.added}</b></li>
                                            <li>• Cập nhật: <b>{importReport.updated}</b></li>
                                            <li>• Bỏ qua (thiếu MatchKey): <b>{importReport.skipped}</b></li>
                                        </ul>

                                        {importReport.missingBrandSensitiveColumn && (
                                            <div className="mb-4 p-3 rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-800 dark:text-blue-300">
                                                File không có cột <b>BrandSensitive</b> (file mẫu cũ). Đã giữ khai báo hiện có / suy luận theo tên Match Key.
                                                Nên bấm <b>Export Matrix</b> để lấy file mẫu mới.
                                            </div>
                                        )}

                                        {importReport.conflicts.length > 0 && (
                                            <div className="mb-4">
                                                <div className="font-semibold text-amber-700 dark:text-amber-400 mb-1 text-sm">
                                                    ⚠️ Xung đột ({importReport.conflicts.length}) — key không phụ thuộc nhãn hiệu nhưng file điền nhiều cột brand:
                                                </div>
                                                <ul className="text-xs font-mono text-gray-600 dark:text-gray-400 space-y-0.5 max-h-40 overflow-y-auto">
                                                    {importReport.conflicts.map(c => (
                                                        <li key={c.matchKey}>{c.matchKey}: dùng <b>{c.used}</b>, bỏ qua {c.ignored.join(', ')}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {importReport.cleared.length > 0 && (
                                            <div className="mb-4">
                                                <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1 text-sm">
                                                    Ô code bị xoá trắng trong file ({importReport.cleared.length}) — <b>KHÔNG</b> tự xoá khỏi thư viện:
                                                </div>
                                                <ul className="text-xs font-mono text-gray-600 dark:text-gray-400 space-y-0.5 max-h-40 overflow-y-auto">
                                                    {importReport.cleared.map((c, i) => (
                                                        <li key={`${c.matchKey}-${c.brand}-${i}`}>{c.matchKey} · {c.brand} · {c.code}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => setImportReport(null)}
                                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                            >
                                                Đóng
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Brand Manager Modal */}
                            {showBrandManager && (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-96 border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Manage Brands</h3>

                                        <div className="flex gap-2 mb-4">
                                            <input
                                                value={newBrandName}
                                                onChange={e => setNewBrandName(e.target.value)}
                                                placeholder="New Brand Name"
                                                className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            />
                                            <button
                                                onClick={() => {
                                                    if (newBrandName && !managedBrands.includes(newBrandName)) {
                                                        onUpdateBrands([...managedBrands, newBrandName]);
                                                        setNewBrandName('');
                                                    }
                                                }}
                                                className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded">
                                            {brands.map(brand => (
                                                <div key={brand} className="flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                    <span className="text-gray-900 dark:text-gray-100">{brand}</span>
                                                    <button
                                                        onClick={() => {
                                                            const productsWithBrand = library.filter(p => p.brand === brand);
                                                            if (productsWithBrand.length > 0) {
                                                                if (!confirm(`Brand "${brand}" has ${productsWithBrand.length} products.\n\nDelete brand and REMOVE these products?`)) {
                                                                    return;
                                                                }
                                                                // Remove products
                                                                onUpdateLibrary(library.filter(p => p.brand !== brand));
                                                            }
                                                            onUpdateBrands(managedBrands.filter(b => b !== brand));
                                                        }}
                                                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-4 flex justify-end">
                                            <button
                                                onClick={() => setShowBrandManager(false)}
                                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-1 gap-4 overflow-hidden">
                                {/* Left Sidebar: Key List */}
                                <div className="w-1/4 bg-white dark:bg-gray-800 rounded shadow border border-gray-200 dark:border-gray-700 overflow-y-auto">
                                    <div className="p-3 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 font-bold text-gray-700 dark:text-gray-200 sticky top-0">
                                        Match Keys
                                        <div className="mt-2 relative">
                                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                                            <input
                                                type="text"
                                                placeholder="Search keys..."
                                                value={matchKeySearchTerm}
                                                onChange={(e) => setMatchKeySearchTerm(e.target.value)}
                                                className="w-full pl-7 pr-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs font-normal bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                                            />
                                        </div>
                                    </div>
                                    <ul>
                                        {getMatchKeys().filter(key => String(key).toLowerCase().includes(matchKeySearchTerm.toLowerCase())).map(key => (
                                            <li
                                                key={key}
                                                onClick={() => setSelectedMatchKey(key)}
                                                className={`p-2 cursor-pointer border-b border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm transition-colors flex items-center justify-between gap-2 ${selectedMatchKey === key ? 'bg-blue-100 dark:bg-blue-900/40 font-semibold text-blue-800 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}
                                            >
                                                <span className="truncate">{key}</span>
                                                <span className="flex items-center gap-1 shrink-0">
                                                    {!isBrandSensitive(String(key), matchKeyMeta) && (
                                                        <span
                                                            className="text-[10px] px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
                                                            title="Không phụ thuộc nhãn hiệu — giữ brand trong Product Library"
                                                        >
                                                            —
                                                        </span>
                                                    )}
                                                    {libraryConflicts.includes(String(key)) && (
                                                        <span
                                                            className="text-[10px] px-1 py-0.5 rounded bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-bold"
                                                            title="Key không phụ thuộc nhãn hiệu nhưng đang có nhiều bản ghi brand khác nhau — cần dọn tay"
                                                        >
                                                            !
                                                        </span>
                                                    )}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* Right Content: Brand Matrix */}
                                <div className="flex-1 bg-white dark:bg-gray-800 rounded shadow border border-gray-200 dark:border-gray-700 p-6 overflow-y-auto">
                                    {selectedMatchKey ? (
                                        <div>
                                            <div className="flex justify-between items-center mb-6">
                                                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                                    <span className="text-blue-600 dark:text-blue-400">Key:</span> {selectedMatchKey}
                                                </h3>
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`Are you sure you want to delete Match Key "${selectedMatchKey}"?\n\nThis will:\n1. Delete ALL products with this key from the Library.\n2. Remove this key from ALL Starter Templates.`)) {
                                                            // 1. Delete from Library
                                                            const newLibrary = library.filter(p => p.matchKey !== selectedMatchKey);
                                                            onUpdateLibrary(newLibrary);

                                                            // 2. Remove from Templates
                                                            const newTemplates = { ...templates };
                                                            Object.keys(newTemplates).forEach(type => {
                                                                Object.keys(newTemplates[type]).forEach(power => {
                                                                    newTemplates[type][power] = newTemplates[type][power].filter(item => item.matchKey !== selectedMatchKey);
                                                                    // Clean up empty arrays/objects if needed, but keeping empty array is fine for now
                                                                });
                                                            });
                                                            onUpdateTemplates(newTemplates);

                                                            setSelectedMatchKey(null);
                                                            showToast(`Deleted Match Key: ${selectedMatchKey}`, "success");
                                                        }
                                                    }}
                                                    className="flex items-center gap-2 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 text-sm font-medium transition"
                                                >
                                                    <Trash2 className="w-4 h-4" /> Delete Key
                                                </button>
                                            </div>

                                            {/* Khai báo brand cho matchKey — nguồn sự thật thay cho việc đoán theo tên key */}
                                            <div className="mb-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/20 flex flex-wrap items-center gap-4">
                                                <label className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={isBrandSensitive(selectedMatchKey, matchKeyMeta)}
                                                        disabled={!onUpdateMatchKeyMeta}
                                                        onChange={(e) => {
                                                            const base = matchKeyMeta[selectedMatchKey] ?? defaultMetaFor(selectedMatchKey);
                                                            onUpdateMatchKeyMeta?.({
                                                                ...matchKeyMeta,
                                                                [selectedMatchKey]: { ...base, matchKey: selectedMatchKey, brandSensitive: e.target.checked },
                                                            });
                                                        }}
                                                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    Phụ thuộc nhãn hiệu
                                                </label>

                                                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                    Nhóm thiết bị:
                                                    <select
                                                        value={categoryOf(selectedMatchKey, matchKeyMeta)}
                                                        disabled={!onUpdateMatchKeyMeta}
                                                        onChange={(e) => {
                                                            const base = matchKeyMeta[selectedMatchKey] ?? defaultMetaFor(selectedMatchKey);
                                                            onUpdateMatchKeyMeta?.({
                                                                ...matchKeyMeta,
                                                                [selectedMatchKey]: { ...base, matchKey: selectedMatchKey, category: e.target.value as DeviceCategory },
                                                            });
                                                        }}
                                                        className="p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                    >
                                                        {(['BREAKER', 'CONTACTOR', 'THERMAL', 'ISOLATOR', 'DRIVE', 'CT', 'ACCESSORY', 'CABLE', 'OTHER'] as DeviceCategory[])
                                                            .map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </label>

                                                <span className="text-xs text-gray-500 dark:text-gray-400 flex-1 min-w-[16rem]">
                                                    {isBrandSensitive(selectedMatchKey, matchKeyMeta)
                                                        ? 'Đi theo nhãn hiệu người dùng chọn ở Input Wizard / Detail View.'
                                                        : 'Giữ nguyên nhãn hiệu của bản ghi trong Product Library (vd MCT/PCT = OMEGA).'}
                                                </span>
                                            </div>

                                            {libraryConflicts.includes(selectedMatchKey) && (
                                                <div className="mb-6 p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300">
                                                    ⚠️ Key này KHÔNG phụ thuộc nhãn hiệu nhưng đang có{' '}
                                                    <b>{library.filter(p => p.matchKey === selectedMatchKey).length}</b> bản ghi ở các brand khác nhau.
                                                    Hãy giữ lại đúng một bản ghi — phần còn lại là dữ liệu nhân bản do Import Matrix cũ.
                                                </div>
                                            )}

                                            <div className="grid grid-cols-1 gap-6">
                                                {(isBrandSensitive(selectedMatchKey, matchKeyMeta)
                                                    ? brands
                                                    // Không phụ thuộc nhãn hiệu ⇒ chỉ hiện các bản ghi đang có,
                                                    // không ép tạo 1 sản phẩm cho MỖI brand. Chưa có bản ghi nào thì
                                                    // hiện 1 thẻ trống ('') để thêm sản phẩm mà KHÔNG gán sẵn brand.
                                                    : (() => {
                                                        const existing = Array.from(new Set(
                                                            library.filter(p => p.matchKey === selectedMatchKey).map(p => p.brand)
                                                        ));
                                                        return existing.length > 0 ? existing : [''];
                                                    })()
                                                ).map(brand => {
                                                    const product = library.find(p => p.matchKey === selectedMatchKey && p.brand === brand);
                                                    return (
                                                        <div key={brand} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 relative hover:shadow-md transition bg-gray-50 dark:bg-gray-700/20">
                                                            <div className="absolute top-0 left-0 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-br-lg text-xs font-bold text-gray-600 dark:text-gray-300 uppercase border-r border-b border-gray-200 dark:border-gray-600">
                                                                {brand || 'Không phân biệt nhãn hiệu'}
                                                            </div>

                                                            {product ? (
                                                                <div className="mt-4">
                                                                    <div className="flex justify-between items-start">
                                                                        <div>
                                                                            <div className="font-mono text-lg font-bold text-gray-900 dark:text-white">{product.code}</div>
                                                                            <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">{product.description}</div>
                                                                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">iBom: {product.ibomCode}</div>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => setEditingProduct(product)}
                                                                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 p-1"
                                                                        >
                                                                            <Edit2 className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="text-center mt-4">
                                                                    <button
                                                                        onClick={() => setEditingProduct({
                                                                            matchKey: selectedMatchKey,
                                                                            // Key brand-agnostic: KHÔNG gán sẵn brand, để người dùng nhập brand thật.
                                                                            ...(brand ? { brand: brand as any } : {}),
                                                                            unit: 'Cái'
                                                                        })}
                                                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                                                                    >
                                                                        <Plus className="w-4 h-4" /> {brand ? `Add Product for ${brand}` : 'Add Product'}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                                            <Search className="w-12 h-12 mb-4 opacity-20" />
                                            <p>Select a Match Key from the left to view the Brand Matrix</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <TemplateEditor
                isOpen={showTemplateEditor}
                onClose={() => setShowTemplateEditor(false)}
                initialTemplate={editorInitialTemplate}
                templateType={editingTemplateType || ''}
                onSave={handleSaveTemplate}
            />

            {/* Global Product Edit Modal - Works from any tab including Match Key Manager */}
            {editingProduct && activeTab === 'matchKeys' && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-2xl w-full mx-4">
                        <h4 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
                            {editingProduct.id ? 'Edit Product' : 'Add New Product'}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                                placeholder="Product Code"
                                value={editingProduct.code || ''}
                                onChange={e => setEditingProduct({ ...editingProduct, code: e.target.value })}
                                className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <input
                                placeholder="iBom Code"
                                value={editingProduct.ibomCode || ''}
                                onChange={e => setEditingProduct({ ...editingProduct, ibomCode: e.target.value })}
                                className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <input
                                placeholder="Description"
                                value={editingProduct.description || ''}
                                onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                                className="col-span-2 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <select
                                value={editingProduct.brand ?? ''}
                                onChange={e => setEditingProduct({ ...editingProduct, brand: e.target.value as any })}
                                className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                <option value="">— chưa đặt nhãn hiệu —</option>
                                {(editingProduct.brand && !brands.includes(editingProduct.brand)
                                    ? [editingProduct.brand, ...brands]
                                    : brands
                                ).map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <input
                                placeholder="Match Key"
                                value={editingProduct.matchKey || ''}
                                onChange={e => setEditingProduct({ ...editingProduct, matchKey: normalizeMatchKey(e.target.value) })}
                                className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                readOnly={!!editingProduct.matchKey}
                            />
                            <input
                                placeholder="Unit (e.g. Cái, m)"
                                value={editingProduct.unit || ''}
                                onChange={e => setEditingProduct({ ...editingProduct, unit: e.target.value as any })}
                                className="p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div className="flex gap-2 justify-end mt-6">
                            <button
                                onClick={() => setEditingProduct(null)}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveProduct}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                Save Product
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirmState !== null}
                danger
                title={confirmState?.title ?? 'Xác nhận'}
                message={confirmState?.message ?? ''}
                confirmLabel={confirmState?.confirmLabel ?? 'Xác nhận'}
                onConfirm={() => { const s = confirmState; setConfirmState(null); s?.onConfirm(); }}
                onCancel={() => setConfirmState(null)}
            />
        </div>
    );
}
