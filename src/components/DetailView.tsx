import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { BOMItem, Brand, StarterConfig } from '../types';
import { cn } from '../utils/cn';
import { isCableLargerThan, getCableSizeLabel } from '../utils/cable-detection';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface DetailViewProps {
    starters: StarterConfig[];
    bom: BOMItem[];
    onUpdateStarter: (id: string, updates: Partial<StarterConfig>) => void;
    onUpdateManualItemQuantity?: (id: string, quantity: number) => void;
    onUpdateBomItemQuantity?: (itemId: string, quantity: number | undefined) => void;
    bomQuantityOverrides?: Record<string, number>;
    onDeleteStarter?: (id: string) => void;
    /**
     * Danh sách nhãn hiệu. Trước đây hard-code 4 brand tại đây nên brand tuỳ chỉnh (vd OMEGA)
     * không có option khớp ⇒ select hiện trống và chạm vào là ghi đè mất brand thật (lỗi M10).
     * Nay nhận từ App.tsx (brands người dùng quản lý ∪ brand có thật trong library).
     */
    brands?: Brand[];
}

const FALLBACK_BRANDS: Brand[] = ['Schneider', 'Mitsubishi', 'LS', 'Hyundai'];

export function DetailView({ starters, bom, manualItems = [], onUpdateStarter, onUpdateManualItemQuantity, onUpdateBomItemQuantity, bomQuantityOverrides = {}, onDeleteStarter, brands }: DetailViewProps & { manualItems?: BOMItem[] }) {
    const BRANDS: Brand[] = brands && brands.length > 0 ? brands : FALLBACK_BRANDS;
    const [openStarters, setOpenStarters] = useState<{ [key: string]: boolean }>({});
    const [isManualOpen, setIsManualOpen] = useState(true);
    const [editingLoadName, setEditingLoadName] = useState<string | null>(null);
    const [loadNameValue, setLoadNameValue] = useState('');
    const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null);
    const [quantityValue, setQuantityValue] = useState('');
    // P4.3: xác nhận xoá starter bằng ConfirmDialog (thay window.confirm).
    const [pendingDeleteStarter, setPendingDeleteStarter] = useState<StarterConfig | null>(null);

    useEffect(() => {
        // Initialize all starters as open when the component mounts or starters change
        const initialOpenState: { [key: string]: boolean } = {};
        starters.forEach(starter => {
            initialOpenState[starter.id] = true;
        });
        setOpenStarters(initialOpenState);
    }, [starters]);

    const toggleStarter = (id: string) => {
        setOpenStarters(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors duration-200">
            <h2 className="text-xl font-bold text-white bg-blue-600 dark:bg-blue-700 p-3 rounded-t-lg flex items-center gap-2">
                Detail View (Chi tiết vật tư)
            </h2>
            <div className="p-4 border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-lg space-y-4">
                {/* Manual Items Section */}
                {manualItems.length > 0 && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <div
                            className="bg-purple-50 dark:bg-purple-900/20 p-3 flex items-center justify-between cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                            onClick={() => setIsManualOpen(!isManualOpen)}
                        >
                            <div className="flex items-center gap-2">
                                {isManualOpen ? <ChevronDown className="w-5 h-5 text-purple-600 dark:text-purple-400" /> : <ChevronRight className="w-5 h-5 text-gray-500 dark:text-gray-400" />}
                                <span className="font-medium text-purple-800 dark:text-purple-300">
                                    Manual Items (Qty: {manualItems.length})
                                </span>
                            </div>
                        </div>

                        {isManualOpen && (
                            <div className="p-4 overflow-x-auto">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                            <th className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">MÃ IBOM</th>
                                            <th className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">MÔ TẢ</th>
                                            <th className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">MÃ SP</th>
                                            <th className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">NHÃN HIỆU</th>
                                            <th className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">ĐƠN VỊ</th>
                                            <th className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300 text-right">KHỐI LƯỢNG</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {manualItems.map(item => {
                                            const isLargeCable = isCableLargerThan(item.description, item.productCode);
                                            const cableSize = isLargeCable ? getCableSizeLabel(item.description, item.productCode) : null;
                                            return (
                                                <tr key={item.id} className={cn(
                                                    "border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50",
                                                    isLargeCable && "bg-orange-50 dark:bg-orange-900/20"
                                                )}>
                                                    <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{item.ibomCode}</td>
                                                    <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">
                                                        {item.description}
                                                        {isLargeCable && (
                                                            <span className="ml-2 px-1.5 py-0.5 text-xs bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200 rounded" title={`Cable ${cableSize} > 1.5mm²`}>
                                                                ⚠️ {cableSize}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2 px-3 font-mono text-gray-600 dark:text-gray-400">{item.productCode}</td>
                                                    <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{item.brand}</td>
                                                    <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{item.unit}</td>
                                                    <td className="py-2 px-3 font-bold text-right">
                                                        {editingQuantityId === item.id ? (
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                value={quantityValue}
                                                                onChange={(e) => setQuantityValue(e.target.value)}
                                                                onBlur={() => {
                                                                    const newQty = parseFloat(quantityValue);
                                                                    if (!isNaN(newQty) && newQty >= 0 && onUpdateManualItemQuantity) {
                                                                        onUpdateManualItemQuantity(item.id, newQty);
                                                                    }
                                                                    setEditingQuantityId(null);
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        const newQty = parseFloat(quantityValue);
                                                                        if (!isNaN(newQty) && newQty >= 0 && onUpdateManualItemQuantity) {
                                                                            onUpdateManualItemQuantity(item.id, newQty);
                                                                        }
                                                                        setEditingQuantityId(null);
                                                                    } else if (e.key === 'Escape') {
                                                                        setEditingQuantityId(null);
                                                                    }
                                                                }}
                                                                className="w-20 px-2 py-1 text-right border border-blue-400 rounded bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <span
                                                                    className="cursor-pointer hover:underline text-blue-600 dark:text-blue-400"
                                                                    onClick={() => {
                                                                        setEditingQuantityId(item.id);
                                                                        setQuantityValue(String(Math.round(item.quantity * 100) / 100));
                                                                    }}
                                                                    title="Click to edit quantity"
                                                                >
                                                                    {Math.round(item.quantity * 100) / 100} 📝
                                                                </span>
                                                                {onUpdateManualItemQuantity && (
                                                                    <button
                                                                        onClick={() => onUpdateManualItemQuantity(item.id, 0)}
                                                                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-0.5 rounded transition-colors"
                                                                        title="Xóa linh kiện này"
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {starters.map(starter => {
                    const starterBom = bom.filter(item => item.starterId === starter.id);
                    const isOpen = openStarters[starter.id];

                    return (
                        <div key={starter.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <div
                                className="bg-blue-50 dark:bg-gray-700/50 p-3 flex items-center justify-between cursor-pointer hover:bg-blue-100 dark:hover:bg-gray-700 transition-colors"
                                onClick={() => toggleStarter(starter.id)}
                            >
                                <div className="flex items-center gap-2">
                                    {isOpen ? <ChevronDown className="w-5 h-5 text-blue-600 dark:text-blue-400" /> : <ChevronRight className="w-5 h-5 text-gray-500 dark:text-gray-400" />}
                                    <span className="font-medium text-blue-800 dark:text-blue-300 flex items-center gap-1">
                                        {starter.type} - {starter.power}kW (Qty: {starter.quantity})
                                        {onDeleteStarter && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPendingDeleteStarter(starter);
                                                }}
                                                className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded transition-colors ml-1"
                                                title="Xóa bộ khởi động này"
                                            >
                                                🗑️
                                            </button>
                                        )}
                                        {editingLoadName === starter.id ? (
                                            <input
                                                type="text"
                                                value={loadNameValue}
                                                onChange={(e) => setLoadNameValue(e.target.value)}
                                                onBlur={() => {
                                                    onUpdateStarter(starter.id, { loadName: loadNameValue });
                                                    setEditingLoadName(null);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        onUpdateStarter(starter.id, { loadName: loadNameValue });
                                                        setEditingLoadName(null);
                                                    } else if (e.key === 'Escape') {
                                                        setEditingLoadName(null);
                                                    }
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                autoFocus
                                                className="ml-2 px-2 py-0.5 text-sm border border-orange-400 rounded bg-white dark:bg-gray-700 text-orange-600 dark:text-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-500 w-48"
                                                placeholder="Enter load name..."
                                            />
                                        ) : (
                                            <span
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingLoadName(starter.id);
                                                    setLoadNameValue(starter.loadName || '');
                                                }}
                                                className="ml-2 font-normal italic text-[#ff6600] cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 px-1 rounded transition-colors"
                                                title="Click to edit load name"
                                            >
                                                {starter.loadName ? `- ${starter.loadName}` : '+ Add note'}
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                                    {/* Isolator Toggle */}
                                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">
                                        <input
                                            type="checkbox"
                                            checked={starter.isolator}
                                            onChange={(e) => onUpdateStarter(starter.id, { isolator: e.target.checked })}
                                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        />
                                        Isolator
                                    </label>

                                    {/* E-Stop Toggle */}
                                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">
                                        <input
                                            type="checkbox"
                                            checked={starter.signals.estop}
                                            onChange={(e) => onUpdateStarter(starter.id, { signals: { ...starter.signals, estop: e.target.checked } })}
                                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        />
                                        E-Stop
                                    </label>

                                    {/* Thermal Toggle */}
                                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">
                                        <input
                                            type="checkbox"
                                            checked={starter.signals.thermal}
                                            onChange={(e) => onUpdateStarter(starter.id, { signals: { ...starter.signals, thermal: e.target.checked } })}
                                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        />
                                        Thermal
                                    </label>

                                    {/* PTC Toggle */}
                                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">
                                        <input
                                            type="checkbox"
                                            checked={starter.signals.ptc}
                                            onChange={(e) => onUpdateStarter(starter.id, { signals: { ...starter.signals, ptc: e.target.checked } })}
                                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        />
                                        PTC
                                    </label>

                                    {/* Humidity Toggle */}
                                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">
                                        <input
                                            type="checkbox"
                                            checked={starter.signals.humidity}
                                            onChange={(e) => onUpdateStarter(starter.id, { signals: { ...starter.signals, humidity: e.target.checked } })}
                                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        />
                                        Humidity
                                    </label>

                                    {/* Isolator BFP Toggle */}
                                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">
                                        <input
                                            type="checkbox"
                                            checked={starter.signals.isolator_BFP}
                                            onChange={(e) => onUpdateStarter(starter.id, { signals: { ...starter.signals, isolator_BFP: e.target.checked } })}
                                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        />
                                        Iso BFP
                                    </label>

                                    {/* E-Stop BFP Toggle */}
                                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">
                                        <input
                                            type="checkbox"
                                            checked={starter.signals.estop_BFP}
                                            onChange={(e) => onUpdateStarter(starter.id, { signals: { ...starter.signals, estop_BFP: e.target.checked } })}
                                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        />
                                        E-Stop BFP
                                    </label>

                                    {/* Isolator/Estop Feedback Toggle */}
                                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">
                                        <input
                                            type="checkbox"
                                            checked={starter.signals.isolator_estop_FB ?? false}
                                            onChange={(e) => onUpdateStarter(starter.id, { signals: { ...starter.signals, isolator_estop_FB: e.target.checked } })}
                                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        />
                                        Iso/Estop FB
                                    </label>

                                    {/* Brand Selector */}
                                    <div
                                        className="flex items-center gap-2"
                                        title="Nhãn hiệu chỉ áp dụng cho thiết bị đóng cắt (CB, contactor, relay nhiệt, isolator). Các thiết bị khác giữ nhãn hiệu trong Product Library."
                                    >
                                        <span className="text-sm text-gray-600 dark:text-gray-400">Brand:</span>
                                        <select
                                            value={starter.brand}
                                            onChange={(e) => onUpdateStarter(starter.id, { brand: e.target.value as Brand })}
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-sm p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white outline-none"
                                        >
                                            {/* Luôn kèm brand hiện tại của starter để select không bao giờ hiện trống
                                                khi brand đó chưa có trong danh sách (vd dự án cũ). */}
                                            {(BRANDS.includes(starter.brand) ? BRANDS : [starter.brand, ...BRANDS])
                                                .map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {isOpen && (
                                <div className="p-4 overflow-x-auto">
                                    <table className="w-full text-sm text-left border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                                <th className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">MÃ IBOM</th>
                                                <th className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">MÔ TẢ</th>
                                                <th className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">MÃ SP</th>
                                                <th className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">NHÃN HIỆU</th>
                                                <th className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">ĐƠN VỊ</th>
                                                <th className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300 text-right">KHỐI LƯỢNG</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {starterBom.map(item => {
                                                const isLargeCable = isCableLargerThan(item.description, item.productCode);
                                                const cableSize = isLargeCable ? getCableSizeLabel(item.description, item.productCode) : null;
                                                const displayQty = bomQuantityOverrides[item.id] ?? item.quantity;
                                                const isExcluded = displayQty <= 0;
                                                return (
                                                    <tr key={item.id} className={cn(
                                                        "border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all duration-200",
                                                        isLargeCable && "bg-orange-50 dark:bg-orange-900/20",
                                                        isExcluded && "opacity-40 bg-gray-100/50 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500"
                                                    )}>
                                                        <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{item.ibomCode}</td>
                                                        <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">
                                                            {item.description}
                                                            {isLargeCable && (
                                                                <span className="ml-2 px-1.5 py-0.5 text-xs bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200 rounded" title={`Cable ${cableSize} > 1.5mm²`}>
                                                                    ⚠️ {cableSize}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className={cn(
                                                            "py-2 px-3 font-mono",
                                                            item.productCode === 'NOT_FOUND' ? "text-red-600 font-bold" : "text-gray-600 dark:text-gray-400"
                                                        )}>
                                                            {item.productCode}
                                                        </td>
                                                        <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{item.brand}</td>
                                                        <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{item.unit}</td>
                                                        <td className={cn(
                                                            "py-2 px-3 font-bold text-right",
                                                            isExcluded 
                                                                ? "text-gray-400 dark:text-gray-500 bg-transparent" 
                                                                : (!item.quantity || item.quantity <= 0
                                                                    ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30"
                                                                    : "text-blue-600 dark:text-blue-400")
                                                        )}>
                                                            {onUpdateBomItemQuantity ? (
                                                                // Editable quantity for warning items
                                                                editingQuantityId === item.id ? (
                                                                    <input
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        value={quantityValue}
                                                                        onChange={(e) => setQuantityValue(e.target.value)}
                                                                        onBlur={() => {
                                                                            const newQty = parseFloat(quantityValue);
                                                                            if (!isNaN(newQty) && newQty >= 0) {
                                                                                onUpdateBomItemQuantity(item.id, newQty);
                                                                            }
                                                                            setEditingQuantityId(null);
                                                                        }}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                const newQty = parseFloat(quantityValue);
                                                                                if (!isNaN(newQty) && newQty >= 0) {
                                                                                    onUpdateBomItemQuantity(item.id, newQty);
                                                                                }
                                                                                setEditingQuantityId(null);
                                                                            } else if (e.key === 'Escape') {
                                                                                setEditingQuantityId(null);
                                                                            }
                                                                        }}
                                                                        className="w-20 px-2 py-1 text-right border border-orange-400 rounded bg-white dark:bg-gray-700 text-orange-600 dark:text-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                                        autoFocus
                                                                    />
                                                                ) : (
                                                                    <div className="flex items-center justify-end gap-1.5">
                                                                        <span
                                                                            className="cursor-pointer hover:underline text-orange-600 dark:text-orange-400"
                                                                            onClick={() => {
                                                                                setEditingQuantityId(item.id);
                                                                                setQuantityValue(String(Math.round(displayQty * 100) / 100));
                                                                            }}
                                                                            title="Click to edit quantity"
                                                                        >
                                                                            {bomQuantityOverrides[item.id] !== undefined ? (
                                                                                <>
                                                                                    {Math.round(bomQuantityOverrides[item.id] * 100) / 100}
                                                                                    <span className="ml-1 text-xs">✏️</span>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    {Math.round(item.quantity * 100) / 100}
                                                                                    <span className="ml-1 text-xs">📝</span>
                                                                                </>
                                                                            )}
                                                                        </span>
                                                                        {bomQuantityOverrides[item.id] !== undefined && (
                                                                            <button
                                                                                onClick={() => onUpdateBomItemQuantity(item.id, undefined)}
                                                                                className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 p-0.5 rounded transition-colors"
                                                                                title="Khôi phục số lượng mặc định"
                                                                            >
                                                                                🔄
                                                                            </button>
                                                                        )}
                                                                        {!isExcluded && bomQuantityOverrides[item.id] === undefined && (
                                                                            <button
                                                                                onClick={() => onUpdateBomItemQuantity(item.id, 0)}
                                                                                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-0.5 rounded transition-colors"
                                                                                title="Xóa linh kiện này"
                                                                            >
                                                                                🗑️
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )
                                                            ) : (
                                                                // Non-editable quantity
                                                                !item.quantity || item.quantity <= 0 ? '⚠️ ?' : Math.round(item.quantity * 100) / 100
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {starterBom.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="py-4 text-center text-gray-500 dark:text-gray-400 italic">
                                                        No components found for this configuration.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
                {starters.length === 0 && manualItems.length === 0 && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No starters added yet. Use the Input Wizard to add some.
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={pendingDeleteStarter !== null}
                title="Xoá bộ khởi động"
                message={pendingDeleteStarter ? `Bạn có chắc chắn muốn xóa bộ khởi động "${pendingDeleteStarter.type} - ${pendingDeleteStarter.powerLabel ?? `${pendingDeleteStarter.power}kW`}" cùng toàn bộ linh kiện của nó?` : ''}
                confirmLabel="Xoá"
                danger
                onConfirm={() => {
                    if (pendingDeleteStarter) onDeleteStarter?.(pendingDeleteStarter.id);
                    setPendingDeleteStarter(null);
                }}
                onCancel={() => setPendingDeleteStarter(null)}
            />
        </div>
    );
}
