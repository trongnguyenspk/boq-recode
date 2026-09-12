import { useState, useEffect } from 'react';
import { getCommonGroups } from '../utils/common-logic';
import type { CommonItem, Product, CommonGroup } from '../types';
import { useToast } from './ui/Toast';
import { Plus, Settings, Pencil, Trash2, ArrowRight, RotateCcw, ArrowUp, ArrowDown } from 'lucide-react';
import defaultLogicConfig from '../data/logic-config.json';
import { LogicConfigEditor } from './LogicConfigEditor';
import type { LogicConfig } from '../types/logic';
import { evaluateAutoSelection, calculateQuantity, validateAndCleanConfig } from '../utils/logic-engine';

interface CommonViewProps {
    onAddToDetail: (items: CommonItem[]) => void;
    library: Product[];
    onImportToLibrary: (items: Product[]) => void;
}

export function CommonView({ onAddToDetail, library, onImportToLibrary }: CommonViewProps) {
    const { showToast } = useToast();

    // --- State: Groups ---
    const [groups, setGroups] = useState<CommonGroup[]>(() => {
        try {
            const saved = localStorage.getItem('boq_common_groups');
            if (saved) return JSON.parse(saved);
        } catch (e) { console.error("Group load error", e); }
        return getCommonGroups();
    });

    useEffect(() => {
        localStorage.setItem('boq_common_groups', JSON.stringify(groups));
    }, [groups]);

    // --- State: Logic Configuration ---
    const [config, setConfig] = useState<LogicConfig>(() => {
        try {
            const saved = localStorage.getItem('logicConfig');
            if (saved) return JSON.parse(saved);
        } catch (e) { }
        return defaultLogicConfig as unknown as LogicConfig;
    });

    // --- Sync to Library Logic ---
    const handleSyncToLibrary = () => {
        if (!confirm("This will collect all unique items from Common Groups and add them to the Product Library.\\n\\niBom Code will be synced to 'iBom Code'. Continue?")) return;

        const allItems = new Map<string, Product>();

        groups.forEach(group => {
            group.items.forEach(item => {
                // Use ProductCode as unique key (or iBomCode if preferred, but productCode is standard for Library)
                if (item.productCode && !allItems.has(item.productCode)) {
                    allItems.set(item.productCode, {
                        id: item.productCode,
                        code: item.productCode,
                        ibomCode: item.ibomCode, // Mapped correctly
                        description: item.description,
                        brand: item.brand as any,
                        unit: item.unit as any
                    });
                }
            });
        });

        const itemsToImport = Array.from(allItems.values());
        if (itemsToImport.length === 0) {
            alert("No items found to sync.");
            return;
        }

        onImportToLibrary(itemsToImport);
    };

    // --- State: Selection ---
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
    const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});

    // --- State: Inputs ---
    const [frameQty, setFrameQty] = useState<number>(1);
    const [panelQty, setPanelQty] = useState<number>(1);

    // --- State: UI ---
    const [showConfigEditor, setShowConfigEditor] = useState(false);

    // --- State: Group Editing ---
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingField, setEditingField] = useState<'id' | 'name' | null>(null);
    const [editingValue, setEditingValue] = useState('');

    // --- State: Move ---
    const [moveItemModal, setMoveItemModal] = useState<{ isOpen: boolean; sourceGroupId: string; itemIndex: number; item: CommonItem } | null>(null);


    // --- Initialization & Validation ---
    useEffect(() => {
        if (groups.length === 0) return;

        let workingConfig = { ...config };
        let configChanged = false;

        // 1. One-time Migration for GRP_3 -> CB_Tong
        // Must run BEFORE validation to prevent premature deletion
        const grp3Exists = groups.some(g => g.id === 'GRP_3');
        const cbTong = groups.find(g => g.id === 'CB_Tong' || g.id === 'CB_TONG' || g.logicText.includes('CB tổng'));

        if (!grp3Exists && cbTong) {
            console.log("Detected cleanup needed: Migrating GRP_3 -> CB_Tong");
            const migratedRules = workingConfig.rules.map(r => {
                if (r.mainGroup === 'GRP_3') { configChanged = true; return { ...r, mainGroup: cbTong.id }; }
                return r;
            });
            const migratedQRules = workingConfig.quantityRules.map(qr => {
                if ((qr.source === 'DEPENDENT' || qr.source === 'DEPENDENT_SUM') && (qr.mainGroupId === 'GRP_3' || qr.dependentGroupId === 'GRP_3')) {
                    configChanged = true;
                    return {
                        ...qr,
                        mainGroupId: qr.mainGroupId === 'GRP_3' ? cbTong.id : qr.mainGroupId,
                        dependentGroupId: qr.dependentGroupId === 'GRP_3' ? cbTong.id : qr.dependentGroupId
                    };
                }
                return qr;
            });

            if (configChanged) {
                workingConfig = { ...workingConfig, rules: migratedRules, quantityRules: migratedQRules };
            }
        }

        // 2. Validate and Clean (Run logic engine)
        const cleanConfig = validateAndCleanConfig(workingConfig, groups);

        // Save if ANY change occurred
        if (configChanged || JSON.stringify(cleanConfig) !== JSON.stringify(config)) {
            console.log("Configuration updated/cleaned on load.");
            setConfig(cleanConfig);
            localStorage.setItem('logicConfig', JSON.stringify(cleanConfig));
        }

    }, [groups.length]);


    // --- Handlers: Logic Engine ---

    const handleToggleGroup = (groupId: string) => {
        const isSelected = selectedGroups.has(groupId);
        const nextGroups = new Set(selectedGroups);
        const nextItems = new Set(selectedItems);

        if (isSelected) {
            // Deselect
            nextGroups.delete(groupId);
            // Also deselect items of this group
            const group = groups.find(g => g.id === groupId);
            if (group) group.items.forEach(i => nextItems.delete(i.ibomCode + i.productCode));

            const result = evaluateAutoSelection(groupId, false, { items: nextItems, groups: nextGroups }, groups, config);
            setSelectedItems(result.newItems);
            setSelectedGroups(result.newGroups);
            // Optional: Clean up quantities for deselected items?
            // For now, keeping them doesn't hurt as they won't be displayed.
        } else {
            // Select
            nextGroups.add(groupId);
            const result = evaluateAutoSelection(groupId, true, { items: nextItems, groups: nextGroups }, groups, config);
            setSelectedItems(result.newItems);
            setSelectedGroups(result.newGroups);
            if (result.newQuantities && Object.keys(result.newQuantities).length > 0) {
                setSelectedQuantities(prev => ({ ...prev, ...result.newQuantities }));
            }
        }
    };

    const handleToggleItem = (itemKey: string, groupId: string, item: CommonItem) => {
        const nextItems = new Set(selectedItems);
        let isSelecting = false;

        if (nextItems.has(itemKey)) {
            nextItems.delete(itemKey);
        } else {
            nextItems.add(itemKey);
            isSelecting = true;
        }

        // Ensure group is selected if an item is selected
        const nextGroups = new Set(selectedGroups);
        const group = groups.find(g => g.id === groupId);

        let hasAnyItem = false;
        if (group) {
            hasAnyItem = group.items.some(i => nextItems.has(i.ibomCode + i.productCode));
        }

        if (hasAnyItem) nextGroups.add(groupId);
        else nextGroups.delete(groupId);

        if (isSelecting && group) {
            const mockProduct: Product = {
                id: item.productCode,
                code: item.productCode,
                ibomCode: item.ibomCode,
                description: item.description,
                brand: item.brand as any,
                unit: item.unit as any
            };

            // Run Engine
            const result = evaluateAutoSelection(groupId, true, { items: nextItems, groups: nextGroups }, groups, config, mockProduct);
            setSelectedItems(result.newItems);
            setSelectedGroups(result.newGroups);
            if (result.newQuantities && Object.keys(result.newQuantities).length > 0) {
                setSelectedQuantities(prev => ({ ...prev, ...result.newQuantities }));
            }
        } else {
            setSelectedItems(nextItems);
            setSelectedGroups(nextGroups);
        }
    };

    // --- Quantity ---
    const handleQuantityChange = (key: string, val: number) => {
        setSelectedQuantities(prev => ({ ...prev, [key]: val }));
    };

    // --- UI Actions ---
    const handleDeleteGroup = (groupId: string) => {
        if (!confirm(`Delete group ${groupId} and all items?`)) return;

        const newGroups = groups.filter(g => g.id !== groupId);
        setGroups(newGroups);

        const newConf = validateAndCleanConfig(config, newGroups);
        setConfig(newConf);
        localStorage.setItem('logicConfig', JSON.stringify(newConf));

        if (selectedGroups.has(groupId)) {
            const nextGroups = new Set(selectedGroups);
            nextGroups.delete(groupId);
            setSelectedGroups(nextGroups);
        }
    };

    // Group Editing Handlers
    const startEditing = (groupId: string, field: 'id' | 'name', currentValue: string) => {
        setEditingGroupId(groupId);
        setEditingField(field);
        setEditingValue(currentValue);
    };

    const saveEditing = () => {
        if (!editingGroupId || !editingField) return;

        if (editingField === 'id') {
            const newId = editingValue;
            if (groups.find(g => g.id === newId)) { alert("ID exists"); return; }

            // Rename Group
            setGroups(groups.map(g => g.id === editingGroupId ? { ...g, id: newId } : g));

            // Rename in Config (Engine-like action)
            const newRules = config.rules.map(r => ({
                ...r,
                mainGroup: r.mainGroup === editingGroupId ? newId : r.mainGroup,
                dependentGroup: r.dependentGroup === editingGroupId ? newId : r.dependentGroup
            }));
            const newQRules = config.quantityRules.map(qr => {
                const isDep = qr.source === 'DEPENDENT' || qr.source === 'DEPENDENT_SUM';
                return {
                    ...qr,
                    groupId: qr.groupId === editingGroupId ? newId : qr.groupId,
                    mainGroupId: (isDep && qr.mainGroupId === editingGroupId) ? newId : qr.mainGroupId,
                    dependentGroupId: (isDep && qr.dependentGroupId === editingGroupId) ? newId : qr.dependentGroupId,
                };
            });
            const newConf = { ...config, rules: newRules, quantityRules: newQRules };
            setConfig(newConf);
            localStorage.setItem('logicConfig', JSON.stringify(newConf));

        } else {
            setGroups(groups.map(g => g.id === editingGroupId ? { ...g, logicText: editingValue } : g));
        }
        setEditingGroupId(null);
        setEditingField(null);
    };

    const saveEditingOnEnter = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') saveEditing();
    };

    // Move Handlers
    const handleMoveItem = (sourceGroupId: string, item: CommonItem, index: number) => {
        setMoveItemModal({ isOpen: true, sourceGroupId, itemIndex: index, item });
    };

    const confirmMoveItem = (targetGroupId: string) => {
        const newGroups = groups.map(g => {
            if (g.id === moveItemModal?.sourceGroupId) {
                return { ...g, items: g.items.filter((_, i) => i !== moveItemModal?.itemIndex) };
            }
            if (g.id === targetGroupId) {
                return { ...g, items: [...g.items, moveItemModal!.item] };
            }
            return g;
        });
        setGroups(newGroups);
        setMoveItemModal(null);
    };

    const handleAddGroup = () => {
        const id = prompt("Enter new Group ID (e.g., GRP_NEW):");
        if (!id) return;
        if (groups.find(g => g.id === id)) {
            alert("Group ID already exists!");
            return;
        }
        const newGroup: CommonGroup = {
            id,
            logicText: "Custom Group",
            logicType: 'SIMPLE',
            items: []
        };
        setGroups([...groups, newGroup]);
    };

    const handleResetConfig = () => {
        if (confirm('Are you sure you want to reset to default configuration?')) {
            localStorage.removeItem('logicConfig');
            window.location.reload();
        }
    };

    const handleMoveGroup = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === groups.length - 1) return;

        const newGroups = [...groups];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;

        [newGroups[index], newGroups[swapIndex]] = [newGroups[swapIndex], newGroups[index]];

        setGroups(newGroups);
    };

    const handleRemoveGroupItem = (groupId: string, itemCode: string) => {
        if (!confirm(`Remove item ${itemCode} from group?`)) return;

        setGroups(prev => prev.map(g => {
            if (g.id === groupId) {
                return {
                    ...g,
                    items: g.items.filter(i => i.productCode !== itemCode && i.ibomCode !== itemCode)
                };
            }
            return g;
        }));
    };

    // --- State: Product Picker ---
    const [productPicker, setProductPicker] = useState<{ isOpen: boolean; groupId: string | null } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const handleAddModelOpen = (groupId: string) => {
        setProductPicker({ isOpen: true, groupId });
        setSearchTerm('');
    };

    const handleAddItem = (product: Product) => {
        if (!productPicker?.groupId) return;

        const resolvedIbomCode = product.ibomCode || product.code; // fall back to product code only if ibomCode is missing
        let wasAdded = false;

        setGroups(prev => prev.map(g => {
            if (g.id === productPicker.groupId) {
                // Check duplicate using the same identity (ibomCode + productCode) used elsewhere
                // in the app (see logic-engine.ts). productCode alone is not unique: several
                // distinct variants (e.g. different current ratings) can share the same productCode.
                const isDuplicate = g.items.some(i => i.ibomCode === resolvedIbomCode && i.productCode === product.code);
                if (isDuplicate) return g;

                const newItem: CommonItem = {
                    ibomCode: resolvedIbomCode,
                    productCode: product.code,
                    description: product.description,
                    unit: product.unit,
                    brand: product.brand,
                    quantity: 0,
                    note: ''
                };
                wasAdded = true;
                return { ...g, items: [...g.items, newItem] };
            }
            return g;
        }));
        // Don't close immediately to allow multiple adds
        if (wasAdded) {
            showToast(`Added ${product.code}`, 'success');
        } else {
            showToast(`${product.code} đã có trong nhóm này`, 'info');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header / Global Inputs */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border dark:border-gray-700 space-y-4">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Frame Quantity</label>
                        <input type="number" min="1" value={frameQty} onChange={e => setFrameQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-32 p-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Panel Quantity</label>
                        <input type="number" min="1" value={panelQty} onChange={e => setPanelQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-32 p-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white" />
                    </div>

                    <div className="flex-1"></div>

                    <button onClick={handleSyncToLibrary} className="flex items-center gap-2 px-3 py-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg">
                        <RotateCcw className="w-4 h-4 rotate-180" /> Sync Data to Library
                    </button>
                    <button onClick={() => setShowConfigEditor(true)} className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <Settings className="w-4 h-4" /> Logic Config
                    </button>
                    <button onClick={handleResetConfig} className="flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg">
                        <RotateCcw className="w-4 h-4" /> Reset
                    </button>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">
                    <span className="font-semibold text-blue-600 dark:text-blue-400">Tip:</span>
                    Select items to add. Dependent items are auto-selected based on Config Logic. Quantity matches source where applicable.
                </div>
            </div>

            {/* Groups Render */}
            <div className="flex flex-col gap-6 max-w-5xl mx-auto">
                {groups.map(group => {
                    const isSelected = selectedGroups.has(group.id);
                    const isEditing = editingGroupId === group.id;

                    return (
                        <div key={group.id} className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 transition-all ${isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-blue-300 dark:hover:border-blue-500'}`}>
                            {/* Header */}
                            <div className="p-3 border-b dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50 rounded-t-xl">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => handleToggleGroup(group.id)}
                                        className="w-5 h-5 rounded border-gray-300 text-blue-600 cursor-pointer"
                                    />
                                    <div className="flex-1 min-w-0" onDoubleClick={() => startEditing(group.id, 'name', group.logicText)}>
                                        {isEditing && editingField === 'name' ? (
                                            <input
                                                autoFocus
                                                type="text"
                                                value={editingValue}
                                                onChange={e => setEditingValue(e.target.value)}
                                                onBlur={saveEditing}
                                                onKeyDown={saveEditingOnEnter}
                                                className="w-full p-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            />
                                        ) : (
                                            <div>
                                                <div className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                                    {group.id}
                                                    <button onClick={() => startEditing(group.id, 'id', group.id)} className="text-gray-300 hover:text-gray-500 dark:hover:text-gray-400"><Pencil className="w-3 h-3" /></button>
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate" title={group.logicText}>{group.logicText}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button onClick={() => handleMoveGroup(groups.indexOf(group), 'up')} disabled={groups.indexOf(group) === 0} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 disabled:opacity-30">
                                        <ArrowUp className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleMoveGroup(groups.indexOf(group), 'down')} disabled={groups.indexOf(group) === groups.length - 1} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 disabled:opacity-30">
                                        <ArrowDown className="w-4 h-4" />
                                    </button>
                                    <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                                    <button onClick={() => handleAddModelOpen(group.id)} className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400" title="Add Item from Library">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDeleteGroup(group.id)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-400"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>

                            {/* Items Table */}
                            <div className="p-4">
                                <div className="grid grid-cols-12 gap-4 border-b dark:border-gray-700 pb-2 mb-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    <div className="col-span-1"></div> {/* Checkbox */}
                                    <div className="col-span-2">Mã iBom</div>
                                    <div className="col-span-4">Mô Tả</div>
                                    <div className="col-span-2">Mã SP</div>
                                    <div className="col-span-1">Nhãn Hiệu</div>
                                    <div className="col-span-1">Đơn Vị</div>
                                    <div className="col-span-1 text-right">SL</div>
                                </div>

                                <div className="space-y-1">
                                    {group.items.length === 0 && <div className="text-center text-gray-400 text-xs italic py-4">No Items</div>}
                                    {group.items.map((item, idx) => {
                                        const key = item.ibomCode + item.productCode;
                                        const isItemSelected = selectedItems.has(key);

                                        // Calculate Quantity via Engine
                                        const calcQty = calculateQuantity(group.id, frameQty, panelQty, groups, { items: selectedItems, quantities: selectedQuantities }, config, item);
                                        const displayQty = selectedQuantities[key] ?? calcQty;

                                        return (
                                            <div key={idx} className={`group relative grid grid-cols-12 gap-4 items-center p-3 rounded-lg border transition-colors ${isItemSelected ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                                {/* Checkbox */}
                                                <div className="col-span-1 flex justify-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={isItemSelected}
                                                        onChange={() => handleToggleItem(key, group.id, item)}
                                                        className="w-5 h-5 rounded border-gray-300 text-blue-600 cursor-pointer"
                                                    />
                                                </div>

                                                {/* Mã iBom */}
                                                <div className="col-span-2 text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={item.ibomCode}>
                                                    {item.ibomCode || '-'}
                                                </div>

                                                {/* Mô Tả */}
                                                <div className="col-span-4 text-sm text-gray-600 dark:text-gray-300 truncate" title={item.description}>
                                                    {item.description}
                                                </div>

                                                {/* Mã SP */}
                                                <div className="col-span-2 text-sm text-gray-500 dark:text-gray-400 truncate" title={item.productCode}>
                                                    {item.productCode}
                                                </div>

                                                {/* Nhãn Hiệu */}
                                                <div className="col-span-1 text-sm text-gray-500 dark:text-gray-400 truncate">
                                                    {item.brand}
                                                </div>

                                                {/* Đơn Vị */}
                                                <div className="col-span-1 text-sm text-gray-500 dark:text-gray-400 truncate">
                                                    {item.unit}
                                                </div>

                                                {/* Quantity / Action */}
                                                <div className="col-span-1 flex justify-end">
                                                    {isItemSelected ? (
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={displayQty}
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value) || 0;
                                                                handleQuantityChange(key, val);
                                                            }}
                                                            className="w-full max-w-[60px] p-1 text-center text-sm border rounded bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white font-medium text-blue-700 focus:ring-2 focus:ring-blue-500"
                                                        />
                                                    ) : (
                                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => handleMoveItem(group.id, item, idx)}
                                                                className="text-gray-300 hover:text-blue-600"
                                                                title="Move Item"
                                                            >
                                                                <ArrowRight className="w-5 h-5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleRemoveGroupItem(group.id, item.productCode || item.ibomCode)}
                                                                className="text-gray-300 hover:text-red-500"
                                                                title="Remove Item from Group"
                                                            >
                                                                <Trash2 className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    )
                                                    }
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}

                <button onClick={handleAddGroup} className="flex items-center justify-center gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all py-8 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400">
                    <div className="p-2 bg-white dark:bg-gray-800 rounded-full shadow-sm"><Plus className="w-5 h-5" /></div>
                    <span className="font-medium">Add New Group</span>
                </button>
            </div >

            {/* Logic Editor */}
            {
                showConfigEditor && (
                    <LogicConfigEditor
                        config={config}
                        groups={groups}
                        onSave={(newConf) => { setConfig(newConf); localStorage.setItem('logicConfig', JSON.stringify(newConf)); setShowConfigEditor(false); }}
                        onClose={() => setShowConfigEditor(false)}
                        onReset={handleResetConfig}
                    />
                )
            }

            {/* Move Modal */}
            {
                moveItemModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl w-96 border dark:border-gray-700">
                            <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white">Move Item to Group</h3>
                            <div className="max-h-60 overflow-y-auto border dark:border-gray-700 rounded-lg divide-y dark:divide-gray-700">
                                {groups.map(g => (
                                    <button key={g.id} onClick={() => confirmMoveItem(g.id)} disabled={g.id === moveItemModal.sourceGroupId} className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 flex justify-between text-gray-700 dark:text-gray-300">
                                        <span className="font-medium">{g.id}</span>
                                        {g.id === moveItemModal.sourceGroupId && <span className="text-xs text-gray-400">Current</span>}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4 flex justify-end"><button onClick={() => setMoveItemModal(null)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button></div>
                        </div>
                    </div>
                )
            }

            {/* Product Picker Modal */}
            {
                productPicker?.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh] border dark:border-gray-700">
                            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white">Add Item to {productPicker.groupId}</h3>
                                <button onClick={() => setProductPicker(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400">
                                    <Plus className="w-6 h-6 rotate-45" />
                                </button>
                            </div>
                            <div className="p-4 border-b dark:border-gray-700">
                                <input
                                    type="text"
                                    placeholder="Search products..."
                                    className="w-full p-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="flex-1 overflow-y-auto p-2">
                                {library
                                    .filter(p => {
                                        const search = searchTerm.toLowerCase();
                                        const code = p.code ? String(p.code).toLowerCase() : '';
                                        const desc = p.description ? String(p.description).toLowerCase() : '';
                                        return !searchTerm || code.includes(search) || desc.includes(search);
                                    })
                                    .slice(0, 50)
                                    .map(product => (
                                        <div key={product.id} className="flex justify-between items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded border-b dark:border-gray-700 last:border-0">
                                            <div>
                                                <div className="font-semibold text-gray-800 dark:text-gray-200">{product.code}</div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400">{product.description}</div>
                                            </div>
                                            <button
                                                onClick={() => handleAddItem(product)}
                                                className="px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-800"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Footer Action */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg z-40">
                <div className="container mx-auto max-w-7xl flex items-center justify-between">
                    <div className="text-sm text-gray-600">Selected: <span className="font-bold text-gray-900">{selectedItems.size}</span> items</div>
                    <button
                        onClick={() => {
                            const itemsToAdd: CommonItem[] = [];
                            groups.forEach(g => {
                                g.items.forEach(i => {
                                    const key = i.ibomCode + i.productCode;
                                    if (selectedItems.has(key)) {
                                        const qty = selectedQuantities[key] ?? calculateQuantity(g.id, frameQty, panelQty, groups, { items: selectedItems, quantities: selectedQuantities }, config);
                                        itemsToAdd.push({ ...i, quantity: qty });
                                    }
                                });
                            });
                            onAddToDetail(itemsToAdd);
                            showToast(`Added ${itemsToAdd.length} items`, 'success');
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-md font-medium flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Add to Summary
                    </button>
                </div>
            </div>
        </div >
    );
}
