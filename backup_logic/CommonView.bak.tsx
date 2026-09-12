import { useState, useEffect } from 'react';
import { getCommonGroups } from '../utils/common-logic';
import type { CommonItem, Product, CommonGroup } from '../types';
import { Collapsible } from './ui/Collapsible';
import { useToast } from './ui/Toast';
import { Plus, Search, X, Settings, Pencil, Trash2, ArrowRight, Check, RotateCcw } from 'lucide-react';
import defaultLogicConfig from '../data/logic-config.json';
import { LogicConfigEditor } from './LogicConfigEditor';
import type { LogicConfig, DependencyRule, QuantityRule } from './LogicConfigEditor';

interface CommonViewProps {
    onAddToDetail: (items: CommonItem[]) => void;
    library: Product[];
}

export function CommonView({ onAddToDetail, library }: CommonViewProps) {
    const { showToast } = useToast();
    // --- Dynamic Groups State ---
    const [groups, setGroups] = useState<CommonGroup[]>(() => {
        const defaultGroups = getCommonGroups();
        try {
            const saved = localStorage.getItem('boq_common_groups');
            if (saved) {
                const parsedSaved = JSON.parse(saved) as CommonGroup[];
                const defaultMap = new Map(defaultGroups.map(g => [g.id, g]));

                // Merge logic:
                // 1. Update existing saved groups with latest static data (logicText, logicType) from default
                const mergedSaved = parsedSaved.map(savedGroup => {
                    const defaultGroup = defaultMap.get(savedGroup.id);
                    if (defaultGroup) {
                        return {
                            ...savedGroup,
                            logicText: savedGroup.logicText || defaultGroup.logicText, // Use saved name, fallback to default
                            logicType: defaultGroup.logicType, // Sync type from source
                            // Keep saved items to preserve user data
                        };
                    }
                    return savedGroup;
                });

                // 2. Add any new groups from default that are NOT in saved
                const savedIds = new Set(mergedSaved.map(g => g.id));
                const deletedIds = new Set(JSON.parse(localStorage.getItem('boq_deleted_groups') || '[]') as string[]);

                const newGroups = defaultGroups.filter(g => !savedIds.has(g.id) && !deletedIds.has(g.id));

                console.log('Debug Groups Init:', {
                    savedCount: mergedSaved.length,
                    newCount: newGroups.length,
                    deletedCount: deletedIds.size,
                    hasGRP3: [...mergedSaved, ...newGroups].some(g => g.id === 'GRP_3'),
                    grp3Data: [...mergedSaved, ...newGroups].find(g => g.id === 'GRP_3')
                });
                return [...mergedSaved, ...newGroups];
            }
        } catch (e) {
            console.error("Failed to parse saved groups", e);
        }
        return defaultGroups;
    });

    // Persist groups whenever they change
    useEffect(() => {
        localStorage.setItem('boq_common_groups', JSON.stringify(groups));
    }, [groups]);

    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

    // Logic Inputs
    const [frameQty, setFrameQty] = useState<number>(1);
    const [panelQty, setPanelQty] = useState<number>(1);

    // Quantity State (Manual Overrides)
    const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});

    // Product Picker State
    const [showPicker, setShowPicker] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [targetItemKey, setTargetItemKey] = useState<string | null>(null); // The item being overridden

    // Move Item State
    const [moveItemModal, setMoveItemModal] = useState<{
        isOpen: boolean;
        sourceGroupId: string;
        itemIndex: number;
        item: CommonItem;
    } | null>(null);

    // Editing Group Name State
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingField, setEditingField] = useState<'id' | 'name' | null>(null);
    const [editingValue, setEditingValue] = useState('');

    // Helper to calculate default quantity based on logic
    const getCalculatedQuantity = (groupId: string, frameQty: number, panelQty: number): number => {
        // 1. Check for custom Quantity Rules
        const rule = config.quantityRules?.find(r => r.groupId === groupId);
        if (rule) {
            switch (rule.source) {
                case 'FIXED':
                    // Just use adder/multiplier directly (usually multiplier * 1 + adder, or just adder?) 
                    // Let's assume formula is: (SourceValue * Multiplier) + Adder
                    // For FIXED, SourceValue is 1? Or 0? Let's say 1.
                    return (1 * rule.multiplier) + rule.adder;
                case 'FRAME_QTY':
                    return (frameQty * rule.multiplier) + rule.adder;
                case 'PANEL_QTY':
                    return (panelQty * rule.multiplier) + rule.adder;
                case 'DEPENDENT_SUM':
                    if (rule.dependentGroupId) {
                        // Find dependent group
                        const depGroup = groups.find(g => g.id === rule.dependentGroupId);
                        if (depGroup) {
                            // Sum quantities of SELECTED items in dependent group
                            let sum = 0;
                            depGroup.items.forEach(item => {
                                const key = item.ibomCode + item.productCode;
                                if (selectedItems.has(key)) {
                                    // Use manual quantity if set, otherwise RECURSIVELY calculate default
                                    // WARNING: Avoid infinite recursion. Simple dependency only for now.
                                    // For simplicity, use selectedQuantities if available, else 1 (or default of that group?)
                                    // To be safe and simple: use selectedQuantities[key] || 1
                                    sum += selectedQuantities[key] ?? 1;
                                }
                            });
                            return (sum * rule.multiplier) + rule.adder;
                        }
                    }
                    return 0;
                case 'FRAME_QTY_CONDITIONAL':
                    // Logic: If Panel Qty > 1, double the Frame Qty multiplier effect
                    // Formula: (FrameQty * Multiplier * (PanelQty > 1 ? 2 : 1)) + Adder
                    const effectiveMultiplier = rule.multiplier * (panelQty > 1 ? 2 : 1);
                    return (frameQty * effectiveMultiplier) + rule.adder;
            }
        }

        return 1;
    };

    // --- Logic Configuration State ---
    const [config, setConfig] = useState<LogicConfig>(() => {
        let loadedConfig: LogicConfig = defaultLogicConfig as unknown as LogicConfig;
        try {
            const saved = localStorage.getItem('logicConfig');
            if (saved) {
                loadedConfig = JSON.parse(saved);
            }
        } catch (e) {
            console.error("Failed to parse saved config", e);
        }

        // AUTO-MIGRATION: Fix mismatch if GRP_3 was renamed to CB_Tong (or similar)
        // We need to check if 'GRP_3' is in the rules but NOT in the current groups list,
        // AND if 'CB_Tong' (or user's renamed group) exists.
        // Since we can't easily access 'groups' state here (it's initialized above but might not be fully ready or accessible in this closure if we want to be pure),
        // we will do this check in a useEffect below.
        return loadedConfig;
    });

    // Sync Config with Groups (Fix for renamed groups like CB_Tong)
    useEffect(() => {
        if (groups.length === 0) return;

        let configChanged = false;
        const newRules = config.rules.map(r => {
            // Fix Main Group ID mismatch
            if (r.mainGroup === 'GRP_3' && !groups.find(g => g.id === 'GRP_3')) {
                // GRP_3 is missing. Check if we have a "CB_Tong" or similar
                // Or check if there's a group with the same logicText?
                // For now, specifically fix the user's reported issue: CB_Tong
                const cbTong = groups.find(g => g.id === 'CB_Tong' || g.id === 'CB_TONG' || g.logicText.includes('CB tổng'));
                if (cbTong) {
                    console.log(`Auto-migrating rule ${r.id} from GRP_3 to ${cbTong.id}`);
                    configChanged = true;
                    return { ...r, mainGroup: cbTong.id };
                }
            }
            // Fix Dependent Group ID mismatch (e.g. SHT)
            if (r.dependentGroup === 'SHT' && !groups.find(g => g.id === 'SHT')) {
                // If SHT is missing, maybe it was renamed?
                // But SHT is usually stable. If user renamed it, we might need similar logic.
            }


            // AUTO-MIGRATION: Fix legacy GRP_4 -> SHT
            // If we have a rule pointing to GRP_4, and SHT exists in groups,
            // we should technically use SHT.
            // But if we effectively have a Duplicate rule (one for GRP_4, one for SHT),
            // we should probably just DROP the GRP_4 rule to avoid overwriting the SHT rule's enabled state.
            if (r.dependentGroup === 'GRP_4') {
                const sht = groups.find(g => g.id === 'SHT');
                if (sht) {
                    // Check if an SHT rule already exists in the config (to avoid duplicates/overwrites)
                    const hasShtRule = config.rules.some(other => other.dependentGroup === 'SHT' && other.mainGroup === r.mainGroup);
                    if (hasShtRule) {
                        console.log(`Removing legacy GRP_4 rule ${r.id} generally because SHT rule exists`);
                        configChanged = true;
                        return null; // Update filter to remove nulls
                    } else {
                        // Convert to SHT if no SHT rule exists
                        console.log(`Auto-migrating rule ${r.id} from GRP_4 to SHT`);
                        configChanged = true;
                        return { ...r, dependentGroup: 'SHT' };
                    }
                }
            }

            return r;
        }).filter(Boolean) as DependencyRule[]; // Filter out nulls (deleted rules)

        // Deduplicate rules after migration
        const uniqueRules: DependencyRule[] = [];
        const seenRules = new Set<string>();

        newRules.forEach(r => {
            const key = `${r.mainGroup}-${r.dependentGroup}-${r.strategy}`;
            if (!seenRules.has(key)) {
                seenRules.add(key);
                uniqueRules.push(r);
            } else {
                // If duplicate exists, prefer the one that is ENABLED if the current one is disabled?
                // Or just keep the first one?
                // Better: if we find a duplicate, and the *new* one is enabled but the *stored* one was disabled, we might want to keep the enabled one?
                // For simplicity, let's just keep the first one encountered.
                // BUT, we should check if we already have this key.
                // If the existing one in uniqueRules is DISABLED, and this one is ENABLED, we should swap?
                const existingIndex = uniqueRules.findIndex(u => `${u.mainGroup}-${u.dependentGroup}-${u.strategy}` === key);
                if (existingIndex >= 0) {
                    // If duplicate found, prioritize the DISABLED one to respect user's "Uncheck" action.
                    if (!r.enabled && uniqueRules[existingIndex].enabled) {
                        uniqueRules[existingIndex] = r;
                    }
                } else {
                    uniqueRules.push(r);
                }
            }
        });

        // CRITICAL CLEANUP: Filter out rules that refer to non-existent groups
        // This stops "ghost rules" from renamed/deleted groups
        const validRules = uniqueRules.filter(r => {
            const mainExists = groups.some(g => g.id === r.mainGroup);
            const depExists = groups.some(g => g.id === r.dependentGroup);
            return mainExists && depExists;
        });



        // Migrate Quantity Rules as well (if GRP_3 renamed to CB_Tong)
        const newQuantityRules = config.quantityRules.map(qr => {
            if (qr.source === 'DEPENDENT' && qr.mainGroupId === 'GRP_3' && !groups.find(g => g.id === 'GRP_3')) {
                const cbTong = groups.find(g => g.id === 'CB_Tong' || g.id === 'CB_TONG' || g.logicText.includes('CB tổng'));
                if (cbTong) {
                    console.log(`Auto-migrating QuantityRule for ${qr.groupId} from GRP_3 to ${cbTong.id}`);
                    configChanged = true;
                    return { ...qr, mainGroupId: cbTong.id };
                }
            }
            // Also cleanup: if rule is for GRP_4, update to SHT?
            if (qr.groupId === 'GRP_4') {
                const sht = groups.find(g => g.id === 'SHT');
                if (sht) {
                    // If SHT quantity rule already exists, delete this one?
                    const hasSht = config.quantityRules.some(o => o.groupId === 'SHT');
                    if (hasSht) return null;

                    configChanged = true;
                    return { ...qr, groupId: 'SHT' };
                }
            }
            return qr;
        }).filter(Boolean) as QuantityRule[];

        // Save if config changed OR if we removed duplicates OR if specific rules were invalid
        if (configChanged || validRules.length !== config.rules.length || newQuantityRules.length !== config.quantityRules.length) {
            console.log("Config cleanup triggered:", {
                renamed: configChanged,
                originalCount: config.rules.length,
                finalCount: validRules.length,
                qRulesCount: newQuantityRules.length
            });
            const newConfig = { ...config, rules: validRules, quantityRules: newQuantityRules };
            setConfig(newConfig);
            localStorage.setItem('logicConfig', JSON.stringify(newConfig));
        }


    }, [groups]); // Run once when groups load (or change)

    const [showConfigEditor, setShowConfigEditor] = useState(false);

    const handleSaveConfig = (newConfig: LogicConfig) => {
        setConfig(newConfig);
        localStorage.setItem('logicConfig', JSON.stringify(newConfig));
        setShowConfigEditor(false);
    };

    const handleResetConfig = () => {
        if (confirm('Are you sure you want to reset to default configuration?')) {
            localStorage.removeItem('logicConfig');
            window.location.reload(); // Simple reload to re-init state
        }
    };
    // ---------------------------------

    // --- Group Management Handlers ---
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
            logicType: "SIMPLE",
            items: []
        };
        setGroups([...groups, newGroup]);
    };

    const handleDeleteGroup = (groupId: string) => {
        if (confirm(`Are you sure you want to delete group ${groupId} and all its items?`)) {
            setGroups(groups.filter(g => g.id !== groupId));

            // Track deleted group to prevent resurrection
            const deleted = JSON.parse(localStorage.getItem('boq_deleted_groups') || '[]') as string[];
            if (!deleted.includes(groupId)) {
                deleted.push(groupId);
                localStorage.setItem('boq_deleted_groups', JSON.stringify(deleted));
            }

            // Also cleanup selection state
            const newSelectedGroups = new Set(selectedGroups);
            newSelectedGroups.delete(groupId);
            setSelectedGroups(newSelectedGroups);

            // Cleanup rules referencing this group
            const newRules = config.rules.filter(r => r.mainGroup !== groupId && r.dependentGroup !== groupId);
            if (newRules.length !== config.rules.length) {
                handleSaveConfig({ ...config, rules: newRules });
            }
        }
    };

    const startEditing = (groupId: string, field: 'id' | 'name', currentValue: string) => {
        setEditingGroupId(groupId);
        setEditingField(field);
        setEditingValue(currentValue);
    };

    const saveEditing = () => {
        if (!editingGroupId || !editingField) return;

        if (editingField === 'name') {
            setGroups(groups.map(g => g.id === editingGroupId ? { ...g, logicText: editingValue } : g));
        } else if (editingField === 'id') {
            const newId = editingValue.trim();
            if (!newId) return;
            if (newId !== editingGroupId && groups.find(g => g.id === newId)) {
                alert("Group ID already exists!");
                return;
            }

            // 1. Update Groups
            setGroups(groups.map(g => g.id === editingGroupId ? { ...g, id: newId } : g));

            // 2. Update Config Rules
            // 2. Update Config Rules (Dependency & Quantity)
            let configChanged = false;

            const newRules = config.rules.map(r => {
                let updated = false;
                let newRule = { ...r };
                if (r.mainGroup === editingGroupId) {
                    newRule.mainGroup = newId;
                    updated = true;
                }
                if (r.dependentGroup === editingGroupId) {
                    newRule.dependentGroup = newId;
                    updated = true;
                }
                if (updated) configChanged = true;
                return updated ? newRule : r;
            });

            const newQuantityRules = (config.quantityRules || []).map(r => {
                let updated = false;
                let newRule = { ...r };
                if (r.groupId === editingGroupId) {
                    newRule.groupId = newId;
                    updated = true;
                }
                if (r.dependentGroupId === editingGroupId) {
                    newRule.dependentGroupId = newId;
                    updated = true;
                }
                if (updated) configChanged = true;
                return updated ? newRule : r;
            });

            if (configChanged) {
                handleSaveConfig({ ...config, rules: newRules, quantityRules: newQuantityRules });
            }

            // 3. Update Selection State
            if (selectedGroups.has(editingGroupId)) {
                const newSelectedGroups = new Set(selectedGroups);
                newSelectedGroups.delete(editingGroupId);
                newSelectedGroups.add(newId);
                setSelectedGroups(newSelectedGroups);
            }

            // 4. Track old ID as deleted to prevent resurrection during sync
            const deleted = JSON.parse(localStorage.getItem('boq_deleted_groups') || '[]') as string[];
            if (!deleted.includes(editingGroupId)) {
                deleted.push(editingGroupId);
                localStorage.setItem('boq_deleted_groups', JSON.stringify(deleted));
            }
        }

        setEditingGroupId(null);
        setEditingField(null);
        setEditingValue('');
    };

    const handleMoveItem = (targetGroupId: string) => {
        if (!moveItemModal) return;
        const { sourceGroupId, itemIndex, item } = moveItemModal;

        if (sourceGroupId === targetGroupId) {
            setMoveItemModal(null);
            return;
        }

        const newGroups = [...groups];
        const sourceGroup = newGroups.find(g => g.id === sourceGroupId);
        const targetGroup = newGroups.find(g => g.id === targetGroupId);

        if (sourceGroup && targetGroup) {
            // Remove from source
            sourceGroup.items.splice(itemIndex, 1);
            // Add to target
            targetGroup.items.push(item);
            setGroups(newGroups);
        }
        setMoveItemModal(null);
    };
    // ---------------------------------

    // Auto-select dependent items
    const handleAutoSelect = (
        groupId: string,
        isSelected: boolean,
        currentSelectedItems: Set<string>,
        currentSelectedGroups: Set<string>,
        productOverride?: Product | null
    ) => {
        const newSelectedItems = new Set(currentSelectedItems);
        const newSelectedGroups = new Set(currentSelectedGroups);
        const productToUse = productOverride !== undefined ? productOverride : selectedProduct;

        // Find active rules for this group
        const activeRules = config.rules.filter(r => r.mainGroup === groupId && r.enabled);

        if (activeRules.length > 0) {
            activeRules.forEach(rule => {
                const depGroup = groups.find(g => g.id === rule.dependentGroup);
                if (depGroup) {
                    if (isSelected) {
                        // Extract rating if we have a product
                        let rating = 0;
                        if (productToUse) {
                            const ratingMatch = productToUse.description.match(/(\d+)A/);
                            const ratingStr = ratingMatch ? ratingMatch[1] : null;
                            rating = ratingStr ? parseInt(ratingStr) : 0;
                        }

                        let matchedItems: CommonItem[] = [];

                        if (rule.strategy === 'SAME_RATING' && rating > 0) {
                            // Strategy: Same Rating
                            // Try exact match first
                            let match = depGroup.items.find(i => i.ibomCode.includes(`${rating}/`) || i.description.includes(`${rating}/`));

                            // Fallback: match number in description
                            if (!match) {
                                match = depGroup.items.find(i => {
                                    const itemRatingMatch = i.description.match(/(\d+)\/5/); // Specific for MCT/PCT pattern if needed, or generalize
                                    return itemRatingMatch && parseInt(itemRatingMatch[1]) === rating;
                                });
                            }
                            if (match) matchedItems.push(match);

                        } else if (rule.strategy === 'SIZE_MAPPING' && rating > 0 && rule.mappingKey) {
                            // Strategy: Size Mapping
                            const mappingTable = config.mappings[rule.mappingKey];
                            if (mappingTable && mappingTable[rating]) {
                                const sizes = mappingTable[rating]; // { main: "20x5", neutral: "20x5", ... }
                                const targetSizes = Object.values(sizes).filter(Boolean);

                                matchedItems = depGroup.items.filter(i => {
                                    // Check if item code/desc contains any of the target sizes
                                    // For Busbar: productCode is usually the size (e.g. "20x5")
                                    // For Heat Shrink: note might contain "Size: 20x5"
                                    return targetSizes.some(size =>
                                        i.productCode === size ||
                                        i.note.includes(`Size: ${size}`) ||
                                        i.description.includes(size)
                                    );
                                });
                            }
                        } else {
                            // Default fallback if no rating or simple dependency
                            // Just select the first item if nothing specific matched
                            if (depGroup.items.length > 0) {
                                matchedItems.push(depGroup.items[0]);
                            }
                        }

                        if (matchedItems.length > 0) {
                            matchedItems.forEach(item => {
                                newSelectedItems.add(item.ibomCode + item.productCode);
                            });
                            newSelectedGroups.add(rule.dependentGroup);
                        }

                    } else {
                        // Deselect all items of dependent group
                        depGroup.items.forEach(item => {
                            newSelectedItems.delete(item.ibomCode + item.productCode);
                        });
                        newSelectedGroups.delete(rule.dependentGroup);
                    }
                }
            });
        }
        return { newSelectedItems, newSelectedGroups };
    };

    // Toggle group selection
    const toggleGroup = (groupId: string, items: CommonItem[], logicType: string) => {
        if (logicType === 'SELECT_ONE') return; // Cannot select all for SELECT_ONE

        let newSelectedGroups = new Set(selectedGroups);
        let newSelectedItems = new Set(selectedItems);

        const isSelecting = !newSelectedGroups.has(groupId);

        if (!isSelecting) {
            newSelectedGroups.delete(groupId);
            // Deselect all items in group
            items.forEach(item => newSelectedItems.delete(item.ibomCode + item.productCode));
        } else {
            newSelectedGroups.add(groupId);
            // Select all items in group
            items.forEach(item => newSelectedItems.add(item.ibomCode + item.productCode));
        }

        // Handle auto-selection (dynamic based on config)
        const result = handleAutoSelect(groupId, isSelecting, newSelectedItems, newSelectedGroups);
        newSelectedItems = result.newSelectedItems;
        newSelectedGroups = result.newSelectedGroups;

        setSelectedGroups(newSelectedGroups);
        setSelectedItems(newSelectedItems);
    };

    // Toggle item selection
    const toggleItem = (groupId: string, itemKey: string, groupItems: CommonItem[], logicType: string) => {
        let newSelectedItems = new Set(selectedItems);
        let newSelectedGroups = new Set(selectedGroups);

        let isSelecting = false;

        if (logicType === 'SELECT_ONE') {
            // Deselect other items in the same group
            groupItems.forEach(i => {
                const key = i.ibomCode + i.productCode;
                if (key !== itemKey) newSelectedItems.delete(key);
            });
            // Select the clicked item (radio behavior: always select)
            newSelectedItems.add(itemKey);
            isSelecting = true;
        } else {
            // Checkbox behavior
            if (newSelectedItems.has(itemKey)) {
                newSelectedItems.delete(itemKey);
                isSelecting = false;
            } else {
                newSelectedItems.add(itemKey);
                isSelecting = true;
            }
        }

        // Update group selection state based on items
        if (logicType !== 'SELECT_ONE') {
            const allSelected = groupItems.every(i => newSelectedItems.has(i.ibomCode + i.productCode));
            if (allSelected) {
                newSelectedGroups.add(groupId);
            } else {
                newSelectedGroups.delete(groupId);
            }
        } else {
            // For SELECT_ONE, if any item is selected, the group is selected
            if (isSelecting) {
                newSelectedGroups.add(groupId);
            }
        }

        // Handle auto-selection (dynamic based on config)
        // Check if this group triggers any rules
        const result = handleAutoSelect(groupId, isSelecting, newSelectedItems, newSelectedGroups);
        newSelectedItems = result.newSelectedItems;
        newSelectedGroups = result.newSelectedGroups;

        setSelectedItems(newSelectedItems);
        setSelectedGroups(newSelectedGroups);
    };

    const handleOpenPicker = (itemKey: string) => {
        setTargetItemKey(itemKey);
        setShowPicker(true);
    };

    const handleSelectProduct = (product: Product) => {
        setSelectedProduct(product);
        setShowPicker(false);

        // Auto-select the item in the list
        if (targetItemKey) {
            let newSelectedItems = new Set(selectedItems);
            newSelectedItems.add(targetItemKey);

            // Find the group this item belongs to
            const group = groups.find(g => g.items.some(i => (i.ibomCode + i.productCode) === targetItemKey));
            if (group) {
                // Re-run auto-select for this group with the NEW product
                const result = handleAutoSelect(group.id, true, newSelectedItems, selectedGroups, product);
                setSelectedItems(result.newSelectedItems);
                setSelectedGroups(result.newSelectedGroups);
            } else {
                setSelectedItems(newSelectedItems);
            }
        }
    };

    const handleAdd = () => {
        const itemsToAdd: CommonItem[] = [];
        groups.forEach(group => {
            group.items.forEach(item => {
                const itemKey = item.ibomCode + item.productCode;
                if (selectedItems.has(itemKey)) {
                    // Get quantity: either manually set or calculated default
                    const quantity = selectedQuantities[itemKey] ?? getCalculatedQuantity(group.id, frameQty, panelQty);

                    // Check if we have a selected product for this specific item
                    if (selectedProduct && targetItemKey === itemKey) {
                        itemsToAdd.push({
                            ...item,
                            ibomCode: selectedProduct.ibomCode || '',
                            productCode: selectedProduct.code,
                            description: selectedProduct.description,
                            brand: selectedProduct.brand,
                            unit: selectedProduct.unit,
                            note: `Selected: ${selectedProduct.code}`,
                            quantity: 1 // Main item usually 1
                        });
                    } else {
                        itemsToAdd.push({
                            ...item,
                            quantity: quantity
                        });
                    }
                }
            });
        });
        onAddToDetail(itemsToAdd);
        // Optional: clear selection after add
        setSelectedItems(new Set());
        setSelectedGroups(new Set());
        setSelectedProduct(null);
        setSelectedQuantities({});
    };

    const [showGuide, setShowGuide] = useState(false);

    const filteredLibrary = library.filter(p =>
        p.code.toLowerCase().includes(pickerSearch.toLowerCase()) ||
        p.description.toLowerCase().includes(pickerSearch.toLowerCase())
    );

    const handleSyncGroups = () => {
        const defaultGroups = getCommonGroups();
        const currentGroups = [...groups];
        const defaultMap = new Map(defaultGroups.map(g => [g.id, g]));

        // 1. Update existing
        const updatedGroups = currentGroups.map(g => {
            const def = defaultMap.get(g.id);
            if (def) {
                // Only sync logicType, PRESERVE user's logicText (description) and items
                return { ...g, logicType: def.logicType };
            }
            return g;
        });

        // 2. Add new
        const currentIds = new Set(updatedGroups.map(g => g.id));
        const deletedIds = new Set(JSON.parse(localStorage.getItem('boq_deleted_groups') || '[]') as string[]);

        const newGroups = defaultGroups.filter(g => !currentIds.has(g.id) && !deletedIds.has(g.id));

        const finalGroups = [...updatedGroups, ...newGroups];
        setGroups(finalGroups);
        // Force save to local storage immediately to be safe
        localStorage.setItem('boq_common_groups', JSON.stringify(finalGroups));
        alert(`Đã đồng bộ dữ liệu! Tổng số nhóm: ${finalGroups.length}. Đã thêm mới: ${newGroups.length}`);
    };

    return (
        <div className="space-y-6 p-6 pb-24 relative">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Common Logic & Data</h2>
                    <p className="text-gray-500">Select standardized items to add to your BOQ</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSyncGroups}
                        className="text-sm text-gray-600 hover:text-blue-600 font-medium flex items-center gap-1"
                        title="Đồng bộ dữ liệu gốc"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Sync Data
                    </button>
                    <button
                        onClick={() => setShowConfigEditor(true)}
                        className="text-sm text-gray-600 hover:text-blue-600 font-medium flex items-center gap-1"
                    >
                        <Settings className="w-4 h-4" />
                        Configure Logic
                    </button>
                    <button
                        onClick={() => setShowGuide(true)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                        <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px]">?</span>
                        Guide
                    </button>
                    <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium">
                        {selectedItems.size} items selected
                    </div>
                </div>
            </div>

            {/* Global Inputs for Logic */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số khung tủ (Frame Qty)</label>
                    <input
                        type="number"
                        min="1"
                        value={frameQty}
                        onChange={(e) => setFrameQty(parseInt(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số mặt tủ (Panel Qty)</label>
                    <input
                        type="number"
                        min="1"
                        value={panelQty}
                        onChange={(e) => setPanelQty(parseInt(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>
            </div>

            <div className="space-y-4">
                {groups.map(group => (
                    <Collapsible
                        key={group.id}
                        title={
                            <div className="flex items-center gap-3 w-full" onClick={(e) => e.stopPropagation()}>
                                {group.logicType !== 'SELECT_ONE' && (
                                    <input
                                        type="checkbox"
                                        checked={selectedGroups.has(group.id)}
                                        onChange={() => toggleGroup(group.id, group.items, group.logicType)}
                                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                )}
                                <div className="flex flex-col text-left flex-1">
                                    {/* Group ID */}
                                    <div className="flex items-center gap-2 group/id">
                                        {editingGroupId === group.id && editingField === 'id' ? (
                                            <input
                                                type="text"
                                                value={editingValue}
                                                onChange={(e) => setEditingValue(e.target.value)}
                                                className="font-semibold text-sm p-0 border-b border-blue-500 focus:outline-none bg-transparent w-full max-w-[150px]"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveEditing();
                                                    if (e.key === 'Escape') { setEditingGroupId(null); setEditingField(null); }
                                                }}
                                                onBlur={saveEditing}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <>
                                                <span className="font-semibold">{group.id}</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        startEditing(group.id, 'id', group.id);
                                                    }}
                                                    className="opacity-0 group-hover/id:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity p-1"
                                                    title="Rename ID"
                                                >
                                                    <Pencil className="w-3 h-3" />
                                                </button>
                                            </>
                                        )}
                                    </div>

                                    {/* Group Name (Logic Text) */}
                                    {editingGroupId === group.id && editingField === 'name' ? (
                                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="text"
                                                value={editingValue}
                                                onChange={(e) => setEditingValue(e.target.value)}
                                                className="text-xs p-1 border rounded w-full max-w-[200px]"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveEditing();
                                                    if (e.key === 'Escape') { setEditingGroupId(null); setEditingField(null); }
                                                }}
                                            />
                                            <button onClick={saveEditing} className="text-green-600 hover:text-green-700">
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => { setEditingGroupId(null); setEditingField(null); }} className="text-red-600 hover:text-red-700">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 group/title">
                                            <span className="text-xs font-normal text-gray-500 line-clamp-1">{group.logicText}</span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    startEditing(group.id, 'name', group.logicText);
                                                }}
                                                className="opacity-0 group-hover/title:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity"
                                                title="Rename Description"
                                            >
                                                <Pencil className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${group.logicType === 'APPLY_ALL' ? 'bg-green-100 text-green-700' :
                                    group.logicType === 'SELECT_ONE' ? 'bg-purple-100 text-purple-700' :
                                        group.logicType === 'DEPENDENT' ? 'bg-orange-100 text-orange-700' :
                                            'bg-gray-100 text-gray-700'
                                    }`}>
                                    {group.logicType}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteGroup(group.id);
                                    }}
                                    className="ml-2 text-gray-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50"
                                    title="Delete Group"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        }
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                    <tr>
                                        <th className="p-2 w-10"></th>
                                        <th className="p-2 w-20">Qty</th>
                                        <th className="p-2">iBom Code</th>
                                        <th className="p-2">Description</th>
                                        <th className="p-2">Product Code</th>
                                        <th className="p-2">Brand</th>
                                        <th className="p-2">Unit</th>
                                        <th className="p-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {group.items.map((item, idx) => {
                                        const itemKey = item.ibomCode + item.productCode;
                                        const isSelected = selectedItems.has(itemKey);
                                        const isCBGroup = group.id === 'GRP_3' && item.description.includes('CB tổng');

                                        // Calculate default quantity
                                        const defaultQty = getCalculatedQuantity(group.id, frameQty, panelQty);
                                        // Use manual quantity if set, otherwise default


                                        return (
                                            <tr key={idx} className={`border-b hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                                                <td className="p-2">
                                                    <input
                                                        type={group.logicType === 'SELECT_ONE' ? 'radio' : 'checkbox'}
                                                        name={`group-${group.id}`} // Group radio buttons by logic group
                                                        checked={isSelected}
                                                        onChange={() => toggleItem(group.id, itemKey, group.items, group.logicType)}
                                                        className={`w-4 h-4 text-blue-600 focus:ring-blue-500 ${group.logicType === 'SELECT_ONE' ? 'border-gray-300' : 'rounded border-gray-300'}`}
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={isSelected ? (selectedQuantities[itemKey] ?? getCalculatedQuantity(group.id, frameQty, panelQty)) : ''}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 1;
                                                            setSelectedQuantities(prev => ({ ...prev, [itemKey]: val }));
                                                        }}
                                                        disabled={!isSelected}
                                                        className={`w-16 p-1 border rounded text-center text-sm ${!isSelected ? 'bg-gray-100 text-gray-400' : 'border-gray-300'}`}
                                                    />
                                                </td>
                                                <td className="p-2 font-medium text-gray-900">
                                                    {isCBGroup && selectedProduct ? selectedProduct.ibomCode : item.ibomCode}
                                                </td>
                                                <td className="p-2 text-gray-600">
                                                    {isCBGroup && selectedProduct ? selectedProduct.description : item.description}
                                                </td>
                                                <td className="p-2 text-gray-500">
                                                    {isCBGroup ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono">{selectedProduct ? selectedProduct.code : ''}</span>
                                                            <button
                                                                onClick={() => handleOpenPicker(itemKey)}
                                                                className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded flex items-center gap-1"
                                                            >
                                                                <Search className="w-3 h-3" />
                                                                {selectedProduct ? 'Change' : 'Select'}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        item.productCode
                                                    )}
                                                </td>
                                                <td className="p-2 text-gray-500">
                                                    {isCBGroup && selectedProduct ? selectedProduct.brand : item.brand}
                                                </td>
                                                <td className="p-2 text-gray-500">
                                                    {isCBGroup && selectedProduct ? selectedProduct.unit : item.unit}
                                                </td>
                                                <td className="p-2">
                                                    <button
                                                        onClick={() => setMoveItemModal({ isOpen: true, sourceGroupId: group.id, itemIndex: idx, item })}
                                                        className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50"
                                                        title="Move Item"
                                                    >
                                                        <ArrowRight className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Collapsible>
                ))}
            </div>

            {/* Floating Action Buttons */}
            <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-10">
                <button
                    onClick={handleAddGroup}
                    className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-full shadow-lg font-medium transition-all transform hover:scale-105 border border-gray-200"
                >
                    <Plus className="w-5 h-5" />
                    Add Group
                </button>
                {selectedItems.size > 0 && (
                    <button
                        onClick={handleAdd}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full shadow-lg font-medium transition-all transform hover:scale-105"
                    >
                        <Plus className="w-5 h-5" />
                        Add {selectedItems.size} Items to Detail
                    </button>
                )}
            </div>

            {/* Move Item Modal */}
            {moveItemModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <h3 className="font-bold text-lg mb-4">Move Item</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Move <strong>{moveItemModal.item.ibomCode}</strong> from <strong>{moveItemModal.sourceGroupId}</strong> to:
                        </p>
                        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                            {groups.map(g => (
                                <button
                                    key={g.id}
                                    onClick={() => handleMoveItem(g.id)}
                                    disabled={g.id === moveItemModal.sourceGroupId}
                                    className={`w-full text-left p-3 rounded-lg border transition-colors ${g.id === moveItemModal.sourceGroupId
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'hover:bg-blue-50 hover:border-blue-200'
                                        }`}
                                >
                                    <div className="font-medium">{g.id}</div>
                                    <div className="text-xs text-gray-500">{g.logicText}</div>
                                </button>
                            ))}
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setMoveItemModal(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Product Picker Modal */}
            {showPicker && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b flex items-center justify-between">
                            <h3 className="font-bold text-lg">Select Product</h3>
                            <button onClick={() => setShowPicker(false)} className="p-1 hover:bg-gray-100 rounded-full">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 border-b">
                            <div className="relative">
                                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search products..."
                                    value={pickerSearch}
                                    onChange={(e) => setPickerSearch(e.target.value)}
                                    className="w-full pl-10 p-2 border rounded-lg"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {filteredLibrary.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">No products found</div>
                            ) : (
                                <div className="grid gap-2">
                                    {filteredLibrary.map(product => (
                                        <button
                                            key={product.code}
                                            onClick={() => handleSelectProduct(product)}
                                            className="text-left p-3 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-200 transition-colors group"
                                        >
                                            <div className="font-medium text-gray-900 group-hover:text-blue-700">{product.code}</div>
                                            <div className="text-sm text-gray-600">{product.description}</div>
                                            <div className="text-xs text-gray-500 mt-1 flex gap-2">
                                                <span>{product.brand}</span>
                                                <span>•</span>
                                                <span>{product.unit}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Guide Modal */}
            {showGuide && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="p-4 border-b flex items-center justify-between">
                            <h3 className="font-bold text-lg">Hướng dẫn Cấu hình Logic</h3>
                            <button onClick={() => setShowGuide(false)} className="p-1 hover:bg-gray-100 rounded-full">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <section>
                                <h4 className="font-bold text-blue-800 mb-2">1. Thay đổi Mapping (Rating -&gt; Size)</h4>
                                <p className="text-sm text-gray-600 mb-2">
                                    Để thay đổi kích thước Busbar/Heat Shrink tương ứng với từng dòng định mức (VD: 100A dùng thanh cái 20x5):
                                </p>
                                <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1 ml-2">
                                    <li>Mở file Excel <code>Logic theo Group.xlsx</code></li>
                                    <li>Vào sheet <strong>Busbar</strong></li>
                                    <li>Chỉnh sửa các cột <code>3P</code> (Main), <code>N</code> (Neutral), <code>PE</code> (Earth) tương ứng với cột <code>CB</code> (Rating)</li>
                                    <li>Lưu file Excel</li>
                                    <li>Chạy script cập nhật: <code>python generate_busbar_group.py</code></li>
                                </ol>
                            </section>

                            <section>
                                <h4 className="font-bold text-blue-800 mb-2">2. Thay đổi Luật Phụ Thuộc</h4>
                                <p className="text-sm text-gray-600 mb-2">
                                    Để thêm/bớt nhóm thiết bị phụ thuộc (VD: thêm nhóm Quạt vào CB):
                                </p>
                                <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1 ml-2">
                                    <li>Mở file <code>generate_busbar_group.py</code></li>
                                    <li>Tìm đoạn code định nghĩa <code>dependencies</code></li>
                                    <li>Thêm/Bớt ID nhóm vào danh sách</li>
                                    <li>Chạy lại script: <code>python generate_busbar_group.py</code></li>
                                </ol>
                            </section>

                            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                                <p className="text-sm text-yellow-800">
                                    <strong>Lưu ý:</strong> File <code>src/data/logic-config.json</code> là nơi lưu trữ cấu hình cuối cùng. Bạn có thể xem file này để kiểm tra kết quả sau khi chạy script.
                                </p>
                            </div>
                        </div>
                        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end">
                            <button
                                onClick={() => setShowGuide(false)}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Logic Config Editor */}
            {showConfigEditor && (
                <LogicConfigEditor
                    config={config}
                    groups={groups}
                    onSave={handleSaveConfig}
                    onClose={() => setShowConfigEditor(false)}
                    onReset={handleResetConfig}
                />
            )}
        </div>
    );
}
