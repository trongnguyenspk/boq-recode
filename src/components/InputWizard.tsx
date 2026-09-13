import { useState, useEffect as React_useEffect } from 'react';
import * as React from 'react';
import { Plus, Download, Upload, FileSpreadsheet } from 'lucide-react';
import { normalizePowerKey } from '../types';
import type { Brand, StarterConfig, StarterType } from '../types';
import { useToast } from './ui/Toast';
import { ChoiceDialog } from './ui/ChoiceDialog';

interface InputWizardProps {
    onAddStarter: (starter: StarterConfig) => void;
    templates: Record<string, Record<string, any[]>>;
    brands: Brand[];
    /** Danh sách starter hiện có — để xuất ra Excel. */
    starters?: StarterConfig[];
    /** Nhập hàng loạt starter từ Excel. Bỏ trống ⇒ ẩn nhóm nút Excel. */
    onImportStarters?: (starters: StarterConfig[], mode: 'append' | 'replace') => void;
    /** Called when an import explicitly chooses ADD for an unknown brand. */
    onAddBrand?: (brand: Brand) => void;
    /** Called when an import explicitly chooses ADD for an unknown starter type. */
    onAddStarterType?: (type: StarterType) => void;
}

export function InputWizard({ onAddStarter, templates, brands, starters = [], onImportStarters, onAddBrand, onAddStarterType }: InputWizardProps) {
    const { showToast } = useToast();

    // Get available starter types from templates
    const availableTypes = Object.keys(templates).length > 0
        ? Object.keys(templates) as StarterType[]
        : ['DOL', 'Star-Delta', 'VFD', 'Soft-Starter'] as StarterType[];

    const [type, setType] = useState<StarterType>(availableTypes[0] || 'DOL');
    const [power, setPower] = useState<number>(0.18);
    const [quantity, setQuantity] = useState<number>(1);
    // Mặc định lấy brand đầu tiên trong danh sách động, không hard-code 'Schneider'.
    const [brand, setBrand] = useState<Brand>(brands[0] ?? 'Schneider');
    const [isolator, setIsolator] = useState<boolean>(false);
    const [isolatorBrand, setIsolatorBrand] = useState<Brand>(brands[0] ?? 'Schneider');
    const [signals, setSignals] = useState({
        thermal: true,
        ptc: false,
        estop: false,
        humidity: false,
        isolator_BFP: false,
        estop_BFP: false,
        isolator_estop_FB: false,
    });
    const [loadName, setLoadName] = useState('');
    // P1.2b (PA-1): công suất hiển thị là text tự do; mặc định `<tier>kW`, user sửa được.
    const [powerLabel, setPowerLabel] = useState<string>('');
    // P4.3: modal lựa chọn Promise-based (thay prompt/confirm nhiều nhánh khi import).
    type ChoiceBtn = { label: string; value: string; variant?: 'primary' | 'danger' | 'neutral' };
    const [choice, setChoice] = useState<{ message: string; title: string; buttons: ChoiceBtn[]; resolve: (v: string) => void } | null>(null);
    const ask = (message: string, buttons: ChoiceBtn[], title = 'Chọn thao tác') =>
        new Promise<string>(resolve => setChoice({ message, title, buttons, resolve }));

    // Get available power ratings for selected starter type
    const getAvailablePowers = (): number[] => {
        const powers = templates[type] ? Object.keys(templates[type]).map(Number).sort((a, b) => a - b) : [];
        return powers.length > 0 ? powers : [0.18]; // Fallback to 0.18 if no templates
    };

    const availablePowers = getAvailablePowers();

    // React to type changes - ensure selected power is valid
    React.useEffect(() => {
        if (!availablePowers.includes(power)) {
            setPower(availablePowers[0] || 0.18);
        }
    }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

    // P1.2b: đặt lại nhãn công suất hiển thị về mặc định mỗi khi đổi tier/power.
    React.useEffect(() => {
        setPowerLabel(`${power}kW`);
    }, [power]);

    // --- Vòng Excel cho danh sách phụ tải ---

    const handleExportInput = async () => {
        try {
            const { exportInputToExcel } = await import('../utils/excel-export');
            await exportInputToExcel(starters);
            showToast(`Đã xuất ${starters.length} phụ tải`, 'success');
        } catch {
            showToast('Xuất Input thất bại', 'error');
        }
    };

    const handleDownloadTemplate = async () => {
        try {
            const { downloadImportTemplate } = await import('../utils/excel-import');
            await downloadImportTemplate();
            showToast('Đã tải file mẫu', 'success');
        } catch {
            showToast('Tải file mẫu thất bại', 'error');
        }
    };

    const handleImportInput = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx, .xls';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
                const { importStartersFromExcelDetailed } = await import('../utils/excel-import');
                // Whitelist động: starter type lấy từ template đang có, brand lấy từ danh sách động.
                let detailed = await importStartersFromExcelDetailed(file, availableTypes, brands, {
                    unknownType: 'keep',
                    unknownBrand: 'keep',
                });
                let brandsToAdd: string[] = [];
                let typesToAdd: string[] = [];
                const unknownValues = Array.from(new Set(
                    detailed.issues.map(issue => `${issue.field}: ${issue.value}`)
                ));
                if (unknownValues.length > 0) {
                    // P4.3: modal nút bấm thay prompt gõ ADD/SKIP. Bỏ nhánh FALLBACK (D-07: brand lạ không fallback).
                    const decision = await ask(
                        `File có giá trị chưa nằm trong catalog:\n\n` +
                        `${unknownValues.slice(0, 20).map(value => `• ${value}`).join('\n')}` +
                        `${unknownValues.length > 20 ? '\n…' : ''}`,
                        [
                            { label: 'Thêm vào catalog', value: 'add', variant: 'primary' },
                            { label: 'Bỏ qua dòng lạ', value: 'skip', variant: 'neutral' },
                            { label: 'Huỷ', value: 'cancel', variant: 'neutral' },
                        ],
                        'Giá trị lạ trong file',
                    );
                    if (decision !== 'add' && decision !== 'skip') {
                        showToast('Đã huỷ nhập vì chưa chọn cách xử lý giá trị lạ', 'info');
                        return;
                    }
                    if (decision === 'add') {
                        const unknownBrands = Array.from(new Set(
                            detailed.issues
                                .filter(issue => issue.field === 'Brand' || issue.field === 'IsolatorBrand')
                                .map(issue => issue.value)
                        ));
                        const unknownTypes = Array.from(new Set(
                            detailed.issues.filter(issue => issue.field === 'Type').map(issue => issue.value)
                        ));
                        brandsToAdd = unknownBrands.filter(value => !brands.includes(value));
                        typesToAdd = unknownTypes.filter(value => !availableTypes.includes(value));
                    } else {
                        detailed = await importStartersFromExcelDetailed(file, availableTypes, brands, {
                            unknownType: 'skip',
                            unknownBrand: 'skip',
                        });
                    }
                }

                const imported = detailed.starters;
                if (imported.length === 0) {
                    showToast('File không có dòng phụ tải nào. Chưa có gì thay đổi.', 'info');
                    return;
                }

                // Mức công suất không có template ⇒ sẽ không sinh được vật tư. Cảnh báo trước.
                const noTemplate = imported.filter(s => {
                    const powerKey = normalizePowerKey(s.powerKey ?? s.power);
                    return !powerKey || !Object.keys(templates[s.type] || {})
                        .some(rawPower => normalizePowerKey(rawPower) === powerKey);
                });
                const warn = noTemplate.length > 0
                    ? `\n\n⚠️ ${noTemplate.length} dòng có mức công suất chưa có template ` +
                      `(${Array.from(new Set(noTemplate.map(s => `${s.type} ${normalizePowerKey(s.powerKey ?? s.power) ?? '??'}kW`))).slice(0, 5).join(', ')}) ` +
                      `⇒ sẽ không sinh ra vật tư nào.`
                    : '';

                const mode = await ask(
                    `Đọc được ${imported.length} phụ tải từ file.${warn}`,
                    [
                        { label: `Thêm vào (${starters.length} hiện có)`, value: 'append', variant: 'primary' },
                        { label: 'Thay thế toàn bộ', value: 'replace', variant: 'danger' },
                        { label: 'Huỷ', value: 'cancel', variant: 'neutral' },
                    ],
                    'Nhập phụ tải',
                );
                if (mode !== 'append' && mode !== 'replace') {
                    showToast('Đã huỷ nhập', 'info');
                    return;
                }
                if (mode === 'replace') {
                    const ok = await ask(
                        `⚠️ THAY THẾ sẽ xoá toàn bộ ${starters.length} phụ tải đang có. Tiếp tục?`,
                        [
                            { label: 'Thay thế', value: 'yes', variant: 'danger' },
                            { label: 'Huỷ', value: 'no', variant: 'neutral' },
                        ],
                        'Xác nhận thay thế',
                    );
                    if (ok !== 'yes') {
                        showToast('Đã huỷ THAY THẾ', 'info');
                        return;
                    }
                }

                onImportStarters?.(imported, mode as 'append' | 'replace');
                brandsToAdd.forEach(value => onAddBrand?.(value));
                typesToAdd.forEach(value => onAddStarterType?.(value));
                showToast(`Đã nhập ${imported.length} phụ tải`, 'success');
            } catch {
                showToast('Nhập Input thất bại', 'error');
            }
        };
        input.click();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newStarter: StarterConfig = {
            id: crypto.randomUUID(),
            type,
            power,
            // P1.2b (PA-1): tierKey chọn tier (= giá trị dropdown), powerLabel là text hiển thị tự do.
            tierKey: String(power),
            powerLabel: powerLabel.trim() || `${power}kW`,
            quantity,
            brand,
            isolator,
            isolatorBrand: isolator ? isolatorBrand : undefined,
            signals,
            loadName: loadName.trim() || undefined,
        };
        onAddStarter(newStarter);
        showToast(`Added ${type} Starter (${powerLabel.trim() || `${power}kW`})`, "success");
        setLoadName(''); // Reset load name after add
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors duration-200">
            <h2 className="text-xl font-bold text-blue-600 dark:text-blue-400 mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5" /> Input Wizard
            </h2>

            {/* Vòng Excel cho danh sách phụ tải. Ba hàm này đã có sẵn trong excel-export/excel-import
                nhưng trước đây KHÔNG có nút nào gọi tới (code chết). */}
            {onImportStarters && (
                <div className="flex flex-wrap gap-2 mb-4">
                    <button
                        type="button"
                        onClick={handleExportInput}
                        disabled={starters.length === 0}
                        title="Xuất danh sách phụ tải đang có ra Excel"
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Download className="w-3.5 h-3.5" /> Xuất Input
                    </button>
                    <button
                        type="button"
                        onClick={handleImportInput}
                        title="Nhập hàng loạt phụ tải từ Excel"
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                    >
                        <Upload className="w-3.5 h-3.5" /> Nhập Input
                    </button>
                    <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        title="Tải file Excel mẫu để điền danh sách phụ tải"
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-gray-600 text-white hover:bg-gray-700"
                    >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> File mẫu
                    </button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Starter Type & Power */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Starter Type</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as StarterType)}
                            className="w-full p-2 bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                        >
                            {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Power (kW)</label>
                        <select
                            value={power}
                            onChange={(e) => setPower(Number(e.target.value))}
                            className="w-full p-2 bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                        >
                            {availablePowers.map(p => (
                                <option key={p} value={p}>{p} kW</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* P1.2b (PA-1): Công suất hiển thị — text tự do, không dùng để tính toán */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Công suất (hiển thị)</label>
                    <input
                        type="text"
                        value={powerLabel}
                        onChange={(e) => setPowerLabel(e.target.value)}
                        placeholder="vd: 5.5kW, 11kW (biến tần)"
                        className="w-full p-2 bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    />
                </div>

                {/* Load Name */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Load Name (Note)</label>
                    <input
                        type="text"
                        placeholder="e.g. Pump 1, Fan 2..."
                        value={loadName}
                        onChange={(e) => setLoadName(e.target.value)}
                        className="w-full p-2 bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    />
                </div>

                {/* Quantity & Brand */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity</label>
                        <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                            className="w-full p-2 bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Brand</label>
                        <select
                            value={brand}
                            onChange={(e) => setBrand(e.target.value as Brand)}
                            className="w-full p-2 bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                        >
                            {brands.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>
                </div>

                {/* Isolator */}
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center gap-2 mb-2">
                        <input
                            type="checkbox"
                            id="isolator"
                            checked={isolator}
                            onChange={(e) => setIsolator(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="isolator" className="font-medium text-gray-700 dark:text-gray-300">Include Isolator?</label>
                    </div>

                    {isolator && (
                        <div className="mt-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Isolator Brand</label>
                            <select
                                value={isolatorBrand}
                                onChange={(e) => setIsolatorBrand(e.target.value as Brand)}
                                className="w-full p-2 bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                            >
                                {brands.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                    )}
                </div>

                {/* Optional Signals */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Optional Signals</label>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-100 dark:border-gray-600 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700">
                            <input
                                type="checkbox"
                                checked={signals.thermal}
                                onChange={(e) => setSignals({ ...signals, thermal: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className="text-sm dark:text-gray-300">Thermal Trip</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-100 dark:border-gray-600 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700">
                            <input
                                type="checkbox"
                                checked={signals.ptc}
                                onChange={(e) => setSignals({ ...signals, ptc: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className="text-sm dark:text-gray-300">PTC</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-100 dark:border-gray-600 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700">
                            <input
                                type="checkbox"
                                checked={signals.estop}
                                onChange={(e) => setSignals({ ...signals, estop: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className="text-sm dark:text-gray-300">E-Stop</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-100 dark:border-gray-600 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700">
                            <input
                                type="checkbox"
                                checked={signals.humidity}
                                onChange={(e) => setSignals({ ...signals, humidity: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className="text-sm dark:text-gray-300">Humidity</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-100 dark:border-gray-600 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700">
                            <input
                                type="checkbox"
                                checked={signals.isolator_BFP}
                                onChange={(e) => setSignals({ ...signals, isolator_BFP: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className="text-sm dark:text-gray-300">Isolator BFP</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-100 dark:border-gray-600 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700">
                            <input
                                type="checkbox"
                                checked={signals.estop_BFP}
                                onChange={(e) => setSignals({ ...signals, estop_BFP: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className="text-sm dark:text-gray-300">E-Stop BFP</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-100 dark:border-gray-600 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700">
                            <input
                                type="checkbox"
                                checked={signals.isolator_estop_FB}
                                onChange={(e) => setSignals({ ...signals, isolator_estop_FB: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className="text-sm dark:text-gray-300">Isolator/Estop Feedback</span>
                        </label>
                    </div>
                </div>

                <button
                    type="submit"
                    className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded shadow transition-colors flex items-center justify-center gap-2"
                >
                    <Plus className="w-5 h-5" /> ADD TO BOQ
                </button>
            </form>

            <ChoiceDialog
                open={choice !== null}
                title={choice?.title ?? ''}
                message={choice?.message ?? ''}
                buttons={choice?.buttons ?? []}
                onChoose={(v) => { const r = choice?.resolve; setChoice(null); r?.(v); }}
                onCancel={() => { const r = choice?.resolve; setChoice(null); r?.('cancel'); }}
            />
        </div>
    );
}
