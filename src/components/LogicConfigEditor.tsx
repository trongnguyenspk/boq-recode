
import { useState } from 'react';
import { X, Plus, Trash2, Save, RotateCcw, Check, Edit2 } from 'lucide-react';
import type { CommonGroup } from '../types';
import type { DependencyRule, SizeMapping, QuantityRule, LogicConfig } from '../types/logic';

export type { DependencyRule, SizeMapping, QuantityRule, LogicConfig };

interface LogicConfigEditorProps {
    config: LogicConfig;
    groups: CommonGroup[];
    onSave: (newConfig: LogicConfig) => void;
    onClose: () => void;
    onReset: () => void;
}

const STRATEGY_OPTIONS = [
    { value: 'SAME_RATING', label: 'Match Rating (e.g. 100A -> 100A)', description: 'Matches items based on Ampere rating in description.' },
    { value: 'SIZE_MAPPING', label: 'Use Size Mapping Table', description: 'Uses a lookup table (e.g. Busbar Size) based on rating or size.' },
    { value: 'SAME_SIZE', label: 'Match Size (e.g. 20x5 -> 20x5)', description: 'Matches items based on physical size in description.' },
];

const QUANTITY_SOURCE_OPTIONS = [
    { value: 'FIXED', label: 'Fixed Quantity' },
    { value: 'FRAME_QTY', label: 'Equal to Frame Quantity' },
    { value: 'PANEL_QTY', label: 'Equal to Panel Quantity' },
    { value: 'FRAME_QTY_CONDITIONAL', label: 'Frame Qty (Double if Multiple Panels)' },
    { value: 'DEPENDENT', label: 'Dependent on Main Item' },
    { value: 'DEPENDENT_SUM', label: 'Sum of Dependent Items' },
    { value: 'MATCH_SIZE', label: 'Match Size (Same Qty)' },
    { value: 'MATCH_SIZE_PHASE_SPLIT', label: 'Match Size (Phase Split /3)' }
];

export function LogicConfigEditor({ config, groups, onSave, onClose, onReset }: LogicConfigEditorProps) {
    const [activeTab, setActiveTab] = useState<'rules' | 'mappings' | 'quantities'>('rules');
    const [localConfig, setLocalConfig] = useState<LogicConfig>(config);
    const [selectedMappingKey, setSelectedMappingKey] = useState<string>(Object.keys(config.mappings)[0] || 'busbar');

    // Mapping creation state
    const [isAddingMapping, setIsAddingMapping] = useState(false);
    const [newMappingName, setNewMappingName] = useState('');

    const handleSave = () => {
        onSave(localConfig);
    };

    const addRule = () => {
        const newRule: DependencyRule = {
            id: Math.random().toString(36).substring(2, 9),
            mainGroup: groups[0]?.id || 'GRP_1',
            dependentGroup: groups[1]?.id || 'GRP_2',
            strategy: 'SAME_RATING',
            enabled: true
        };
        setLocalConfig(prev => ({
            ...prev,
            rules: [...prev.rules, newRule]
        }));
    };

    const updateRule = (id: string, updates: Partial<DependencyRule>) => {
        setLocalConfig(prev => ({
            ...prev,
            rules: prev.rules.map(r => r.id === id ? { ...r, ...updates } : r)
        }));
    };

    const removeRule = (id: string) => {
        setLocalConfig(prev => ({
            ...prev,
            rules: prev.rules.filter(r => r.id !== id)
        }));
    };

    const updateMapping = (rating: string, key: string, value: string) => {
        setLocalConfig(prev => ({
            ...prev,
            mappings: {
                ...prev.mappings,
                [selectedMappingKey]: {
                    ...prev.mappings[selectedMappingKey],
                    [rating]: {
                        ...prev.mappings[selectedMappingKey]?.[rating],
                        [key]: value
                    }
                }
            }
        }));
    };

    const handleAddMappingTable = () => {
        if (!newMappingName.trim()) return;

        setLocalConfig(prev => {
            const currentTable = prev.mappings[selectedMappingKey] || {};
            const defaultRatings = ["100", "125", "150", "160", "200", "225", "250", "300", "320", "350", "400", "500", "600", "630", "800", "1000", "1200", "1250", "1600", "2000", "2500", "3000", "3200", "4000", "5000", "6300"];
            const ratingsToUse = Object.keys(currentTable).length > 0 ? Object.keys(currentTable) : defaultRatings;

            const newTable = ratingsToUse.reduce((acc, rating) => {
                acc[rating] = { "Value": "" };
                return acc;
            }, {} as Record<string, Record<string, string>>);

            return { ...prev, mappings: { ...prev.mappings, [newMappingName]: newTable } };
        });
        setSelectedMappingKey(newMappingName);
        setIsAddingMapping(false);
        setNewMappingName('');
    };

    const handleAddColumn = () => {
        const colName = prompt("Enter new column name:");
        if (!colName) return;

        setLocalConfig(prev => {
            const table = prev.mappings[selectedMappingKey] || {};
            const newTable = { ...table };
            Object.keys(newTable).forEach(rating => {
                newTable[rating] = { ...newTable[rating], [colName]: "" };
            });
            return {
                ...prev,
                mappings: { ...prev.mappings, [selectedMappingKey]: newTable }
            };
        });
    };

    const handleAddRow = () => {
        const rowKey = prompt("Enter new Key (Rating or Size, e.g. 100 or 20x5):");
        if (!rowKey) return;

        setLocalConfig(prev => {
            const table = prev.mappings[selectedMappingKey] || {};
            if (table[rowKey]) {
                alert("Key already exists!");
                return prev;
            }
            const firstRow = Object.values(table)[0] || {};
            const columns = Object.keys(firstRow);
            const newRow: Record<string, string> = {};
            columns.forEach(col => newRow[col] = "");

            if (columns.length === 0) newRow["Default"] = "";

            return {
                ...prev,
                mappings: {
                    ...prev.mappings,
                    [selectedMappingKey]: { ...table, [rowKey]: newRow }
                }
            };
        });
    };

    const handleRemoveRow = (rowKey: string) => {
        if (!confirm(`Remove row '${rowKey}'?`)) return;
        setLocalConfig(prev => {
            const table = { ...prev.mappings[selectedMappingKey] };
            delete table[rowKey];
            return {
                ...prev,
                mappings: { ...prev.mappings, [selectedMappingKey]: table }
            };
        });
    };

    const handleRemoveColumn = (colName: string) => {
        if (!confirm(`Are you sure you want to remove column '${colName}'?`)) return;

        setLocalConfig(prev => {
            const table = prev.mappings[selectedMappingKey] || {};
            const newTable = { ...table };
            Object.keys(newTable).forEach(rating => {
                const newRow = { ...newTable[rating] };
                delete newRow[colName];
                newTable[rating] = newRow;
            });
            return {
                ...prev,
                mappings: { ...prev.mappings, [selectedMappingKey]: newTable }
            };
        });
    };

    const handleRemoveMappingTable = () => {
        if (!selectedMappingKey) return;
        if (!confirm(`Are you sure you want to delete the mapping table '${selectedMappingKey}'?`)) return;

        setLocalConfig(prev => {
            const newMappings = { ...prev.mappings };
            delete newMappings[selectedMappingKey];
            return { ...prev, mappings: newMappings };
        });
        const remainingKeys = Object.keys(localConfig.mappings).filter(k => k !== selectedMappingKey);
        setSelectedMappingKey(remainingKeys[0] || '');
    };

    const handleRenameMappingTable = () => {
        if (!selectedMappingKey) return;
        const newName = prompt("Enter new name for mapping table:", selectedMappingKey);
        if (!newName || newName === selectedMappingKey) return;
        if (localConfig.mappings[newName]) {
            alert("A table with this name already exists.");
            return;
        }

        setLocalConfig(prev => {
            const newMappings = { ...prev.mappings };
            newMappings[newName] = newMappings[selectedMappingKey];
            delete newMappings[selectedMappingKey];
            return { ...prev, mappings: newMappings };
        });
        setSelectedMappingKey(newName);
    };

    // Quantity Handlers
    const addQuantityRule = () => {
        setLocalConfig(prev => ({
            ...prev,
            quantityRules: [
                ...prev.quantityRules,
                { groupId: groups[0]?.id || '', source: 'FIXED', multiplier: 1, adder: 0 }
            ]
        }));
    };

    const updateQuantityRule = (index: number, updates: Partial<QuantityRule>) => {
        setLocalConfig(prev => ({
            ...prev,
            quantityRules: prev.quantityRules.map((r, i) => i === index ? { ...r, ...updates } : r)
        }));
    };

    const removeQuantityRule = (index: number) => {
        setLocalConfig(prev => ({
            ...prev,
            quantityRules: prev.quantityRules.filter((_, i) => i !== index)
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl border border-gray-700">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-white">Logic Configuration <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded-full">Beta</span></h2>
                        <div className="flex bg-gray-800 rounded-lg p-1">
                            <button
                                onClick={() => setActiveTab('rules')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'rules' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                Dependency Rules
                            </button>
                            <button
                                onClick={() => setActiveTab('mappings')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'mappings' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                Size Mappings
                            </button>
                            <button
                                onClick={() => setActiveTab('quantities')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'quantities' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                Quantities
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onReset} className="text-gray-400 hover:text-white flex items-center gap-1 px-3 py-1.5 rounded hover:bg-gray-800">
                            <RotateCcw className="w-4 h-4" /> Reset
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2 rounded hover:bg-gray-800">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 bg-gray-50 dark:bg-gray-800/50">

                    {/* RULES TAB */}
                    {activeTab === 'rules' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-200">Values Dependency Rules</h3>
                                <button onClick={addRule} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-md text-sm">
                                    <Plus className="w-4 h-4" /> Add Rule
                                </button>
                            </div>

                            <div className="space-y-3">
                                {localConfig.rules.map((rule) => {
                                    const mainGroup = groups.find(g => g.id === rule.mainGroup);
                                    const depGroup = groups.find(g => g.id === rule.dependentGroup);

                                    return (
                                        <div key={rule.id} className={`p-4 rounded-lg border ${rule.enabled ? 'border-gray-600 bg-gray-800' : 'border-gray-700 bg-gray-800/50 opacity-70'}`}>
                                            <div className="flex items-start gap-4 flex-wrap">
                                                <div className="flex-1 min-w-[200px]">
                                                    <label className="block text-xs text-gray-400 mb-1">Trigger Group</label>
                                                    <select
                                                        value={rule.mainGroup}
                                                        onChange={(e) => updateRule(rule.id, { mainGroup: e.target.value })}
                                                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white"
                                                    >
                                                        {groups.map(g => (
                                                            <option key={g.id} value={g.id}>{g.id} - {g.logicText}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="flex-1 min-w-[200px]">
                                                    <label className="block text-xs text-gray-400 mb-1">Strategy</label>
                                                    <select
                                                        value={rule.strategy}
                                                        onChange={(e) => updateRule(rule.id, { strategy: e.target.value as any })}
                                                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white"
                                                    >
                                                        {STRATEGY_OPTIONS.map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {rule.strategy === 'SIZE_MAPPING' && (
                                                    <div className="flex-1 min-w-[150px]">
                                                        <label className="block text-xs text-indigo-400 mb-1">Mapping Table</label>
                                                        <select
                                                            value={rule.mappingKey || ''}
                                                            onChange={(e) => updateRule(rule.id, { mappingKey: e.target.value })}
                                                            className="w-full bg-gray-900 border border-indigo-900/50 rounded px-3 py-2 text-sm text-white"
                                                        >
                                                            <option value="">Select Table...</option>
                                                            {Object.keys(localConfig.mappings).map(key => (
                                                                <option key={key} value={key}>{key}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}

                                                <div className="flex-1 min-w-[200px]">
                                                    <label className="block text-xs text-gray-400 mb-1">Dependent Group (Action)</label>
                                                    <select
                                                        value={rule.dependentGroup}
                                                        onChange={(e) => updateRule(rule.id, { dependentGroup: e.target.value })}
                                                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white"
                                                    >
                                                        {groups.map(g => (
                                                            <option key={g.id} value={g.id}>{g.id} - {g.logicText}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="flex items-center gap-2 pt-6">
                                                    <button
                                                        onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                                                        title={rule.enabled ? "Disable Rule" : "Enable Rule"}
                                                        className={`p-2 rounded ${rule.enabled ? 'text-green-400 bg-green-900/20' : 'text-gray-500 bg-gray-800'}`}
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => removeRule(rule.id)}
                                                        className="p-2 rounded text-red-400 hover:bg-red-900/20"
                                                        title="Delete Rule"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>



                                            {/* Quantity Configuration (Merged) */}
                                            <div className="mt-3 pt-3 border-t border-gray-700 bg-gray-900/30 p-2 rounded">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Quantity Logic</span>
                                                    {!rule.quantityConfig && (
                                                        <button
                                                            onClick={() => updateRule(rule.id, { quantityConfig: { source: 'FIXED', multiplier: 1, adder: 0 } })}
                                                            className="text-xs bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded hover:bg-indigo-900"
                                                        >
                                                            + Configure
                                                        </button>
                                                    )}
                                                    {rule.quantityConfig && (
                                                        <button
                                                            onClick={() => updateRule(rule.id, { quantityConfig: undefined })}
                                                            className="text-xs text-red-400 hover:text-red-300 ml-auto"
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>

                                                {rule.quantityConfig && (
                                                    <div className="flex items-start gap-3 flex-wrap animate-in fade-in slide-in-from-top-1">
                                                        <div className="flex-1 min-w-[200px]">
                                                            <select
                                                                value={rule.quantityConfig.source}
                                                                onChange={(e) => updateRule(rule.id, { quantityConfig: { ...rule.quantityConfig!, source: e.target.value as any } })}
                                                                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                                                            >
                                                                {QUANTITY_SOURCE_OPTIONS.map(opt => (
                                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div className="flex items-center gap-2 text-sm text-gray-300">
                                                            <span className="text-gray-500">x</span>
                                                            <input
                                                                type="number"
                                                                step="0.1"
                                                                value={rule.quantityConfig.multiplier ?? 1}
                                                                onChange={(e) => updateRule(rule.id, { quantityConfig: { ...rule.quantityConfig!, multiplier: parseFloat(e.target.value) } })}
                                                                className="w-16 bg-gray-900 border border-gray-600 rounded px-1 text-center text-white"
                                                                placeholder="1"
                                                            />
                                                            <span className="text-gray-500">+</span>
                                                            <input
                                                                type="number"
                                                                step="1"
                                                                value={rule.quantityConfig.adder ?? 0}
                                                                onChange={(e) => updateRule(rule.id, { quantityConfig: { ...rule.quantityConfig!, adder: parseFloat(e.target.value) } })}
                                                                className="w-12 bg-gray-900 border border-gray-600 rounded px-1 text-center text-white"
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* MAPPINGS TAB */}
                    {activeTab === 'mappings' && (
                        <div className="h-full flex flex-col">
                            <div className="flex items-center gap-4 mb-4">
                                <label className="text-gray-300 font-medium">Select Mapping Table:</label>
                                <select
                                    value={selectedMappingKey}
                                    onChange={(e) => setSelectedMappingKey(e.target.value)}
                                    className="bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-white min-w-[200px]"
                                >
                                    {Object.keys(localConfig.mappings).map(key => (
                                        <option key={key} value={key}>{key}</option>
                                    ))}
                                </select>

                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setIsAddingMapping(true)}
                                        className="p-1.5 bg-indigo-600 rounded text-white hover:bg-indigo-700"
                                        title="New Table"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleRenameMappingTable}
                                        className="p-1.5 bg-gray-700 rounded text-gray-300 hover:bg-gray-600"
                                        title="Rename Table"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleRemoveMappingTable}
                                        className="p-1.5 bg-red-900/50 rounded text-red-400 hover:bg-red-900"
                                        title="Delete Table"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {isAddingMapping && (
                                    <div className="flex items-center gap-2 bg-gray-800 p-1 rounded ml-4 animate-in fade-in slide-in-from-left-4">
                                        <input
                                            type="text"
                                            placeholder="New Table Name"
                                            value={newMappingName}
                                            onChange={(e) => setNewMappingName(e.target.value)}
                                            className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                                        />
                                        <button onClick={handleAddMappingTable} className="text-green-500 hover:text-green-400"><Check className="w-4 h-4" /></button>
                                        <button onClick={() => setIsAddingMapping(false)} className="text-red-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                                    </div>
                                )}
                            </div>

                            {/* Table Editor */}
                            {selectedMappingKey && localConfig.mappings[selectedMappingKey] && (
                                <div className="border border-gray-700 rounded-lg overflow-hidden flex-1 flex flex-col bg-gray-900">
                                    <div className="bg-gray-800 p-2 border-b border-gray-700 flex justify-end gap-2">
                                        <button onClick={handleAddRow} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">
                                            + Add Row
                                        </button>
                                        <button onClick={handleAddColumn} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">
                                            + Add Column
                                        </button>
                                    </div>
                                    <div className="overflow-auto flex-1">
                                        <table className="w-full text-sm text-left text-gray-300">
                                            <thead className="text-xs text-gray-400 uppercase bg-gray-800 sticky top-0 z-10">
                                                <tr>
                                                    <th className="p-3 w-32 bg-gray-100 dark:bg-gray-800">Key (Rating/Size)</th>
                                                    {Object.keys(Object.values(localConfig.mappings[selectedMappingKey])[0] || {}).map(col => (
                                                        <th key={col} className="p-3 border-l border-gray-700 group relative">
                                                            {col}
                                                            <button
                                                                onClick={() => handleRemoveColumn(col)}
                                                                className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-700">
                                                {Object.entries(localConfig.mappings[selectedMappingKey]).map(([rating, rowData]) => (
                                                    <tr key={rating} className="hover:bg-gray-800/50">
                                                        <td className="p-3 font-medium bg-gray-50/50 dark:bg-gray-900/50 relative group border-r border-gray-700">
                                                            {rating}
                                                            <button
                                                                onClick={() => handleRemoveRow(rating)}
                                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 p-1"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </td>
                                                        {Object.keys(Object.values(localConfig.mappings[selectedMappingKey])[0] || {}).map(col => (
                                                            <td key={col} className="p-0 border-l border-gray-700">
                                                                <input
                                                                    type="text"
                                                                    value={rowData[col] || ''}
                                                                    onChange={(e) => updateMapping(rating, col, e.target.value)}
                                                                    className="w-full bg-transparent p-3 outline-none focus:bg-indigo-900/20 text-white"
                                                                />
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* QUANTITIES TAB */}
                    {activeTab === 'quantities' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-200">Quantity Calculation Rules</h3>
                                <button onClick={addQuantityRule} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-md text-sm">
                                    <Plus className="w-4 h-4" /> Add Rule
                                </button>
                            </div>

                            <div className="grid gap-4">
                                {localConfig.quantityRules.map((rule, idx) => (
                                    <div key={idx} className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
                                        <div className="flex items-start gap-4 flex-wrap">
                                            <div className="flex-1 min-w-[250px]">
                                                <label className="block text-xs text-gray-400 mb-1">Target Group</label>
                                                <select
                                                    value={rule.groupId}
                                                    onChange={(e) => updateQuantityRule(idx, { groupId: e.target.value })}
                                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
                                                >
                                                    {groups.map(g => (
                                                        <option key={g.id} value={g.id}>{g.id} - {g.logicText}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="flex-1 min-w-[200px]">
                                                <label className="block text-xs text-gray-400 mb-1">Source Logic</label>
                                                <select
                                                    value={rule.source}
                                                    onChange={(e) => updateQuantityRule(idx, { source: e.target.value as any })}
                                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
                                                >
                                                    {QUANTITY_SOURCE_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {(rule.source === 'DEPENDENT' || rule.source === 'DEPENDENT_SUM' || rule.source === 'MATCH_SIZE' || rule.source === 'MATCH_SIZE_PHASE_SPLIT') && (
                                                <div className="flex-1 min-w-[200px]">
                                                    <label className="block text-xs text-indigo-400 mb-1">Base Group (Trigger)</label>
                                                    <select
                                                        value={rule.source === 'DEPENDENT_SUM' ? rule.dependentGroupId : rule.mainGroupId}
                                                        onChange={(e) => updateQuantityRule(idx, rule.source === 'DEPENDENT_SUM' ? { dependentGroupId: e.target.value } : { mainGroupId: e.target.value })}
                                                        className="w-full bg-gray-900 border border-indigo-900/50 rounded px-2 py-1.5 text-sm text-white"
                                                    >
                                                        <option value="">Select Group...</option>
                                                        {groups.map(g => (
                                                            <option key={g.id} value={g.id}>{g.id} - {g.logicText}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-end gap-2 text-sm text-gray-300 bg-gray-900/50 p-3 rounded">
                                            <span>Formula:</span>
                                            <span className="font-mono text-indigo-400">
                                                (SourceValue x
                                                <input
                                                    type="number"
                                                    value={rule.multiplier ?? 1}
                                                    onChange={(e) => updateQuantityRule(idx, { multiplier: parseFloat(e.target.value) })}
                                                    className="w-16 bg-gray-800 border border-gray-600 rounded mx-1 px-1 text-center text-white"
                                                    step="0.1"
                                                />
                                                ) +
                                                <input
                                                    type="number"
                                                    value={rule.adder ?? 0}
                                                    onChange={(e) => updateQuantityRule(idx, { adder: parseFloat(e.target.value) })}
                                                    className="w-16 bg-gray-800 border border-gray-600 rounded mx-1 px-1 text-center text-white"
                                                />
                                            </span>
                                            <div className="flex-1"></div>
                                            <button
                                                onClick={() => removeQuantityRule(idx)}
                                                className="text-red-400 hover:text-red-300 border border-red-900/50 p-1 rounded hover:bg-red-900/20"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 flex justify-end gap-3 bg-gray-800 rounded-b-lg">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-300 hover:text-white border border-gray-600 rounded-lg hover:bg-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-indigo-900/20"
                    >
                        <Save className="w-4 h-4" /> Save Configuration
                    </button>
                </div>
            </div>
        </div >
    );
}
