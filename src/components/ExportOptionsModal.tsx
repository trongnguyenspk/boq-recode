import { useState } from 'react';
import { X, Download, FileSpreadsheet, FileText, Loader2, CheckSquare, Square } from 'lucide-react';
import type { ExportOptions, ExportFormat } from '../utils/excel-export';

interface ExportOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (options: ExportOptions) => Promise<void>;
    projectName?: string;
    projectDescription?: string;
    itemCount: number;
    summaryCount: number;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string; icon: React.ReactNode }[] = [
    {
        value: 'full',
        label: 'Full Export',
        description: 'Cả Detail và Summary sheets',
        icon: <FileSpreadsheet className="w-5 h-5" />
    },
    {
        value: 'summary_only',
        label: 'Summary Only',
        description: 'Chỉ bảng tổng hợp',
        icon: <FileText className="w-5 h-5" />
    },
    {
        value: 'detail_only',
        label: 'Detail Only',
        description: 'Chỉ bảng chi tiết',
        icon: <FileText className="w-5 h-5" />
    }
];

const DETAIL_COLUMNS = [
    { key: 'starterName', label: 'Tên bộ khởi động', default: true },
    { key: 'ibomCode', label: 'Mã iBom', default: true },
    { key: 'description', label: 'Mô tả', default: true },
    { key: 'productCode', label: 'Mã sản phẩm', default: true },
    { key: 'brand', label: 'Nhãn hiệu', default: true },
    { key: 'unit', label: 'Đơn vị', default: true },
    { key: 'quantity', label: 'Khối lượng', default: true },
    { key: 'loadName', label: 'Ghi chú', default: false }
];

const SUMMARY_COLUMNS = [
    { key: 'ibomCode', label: 'Mã iBom', default: true },
    { key: 'description', label: 'Mô tả', default: true },
    { key: 'productCode', label: 'Mã SP', default: true },
    { key: 'brand', label: 'Nhãn hiệu', default: true },
    { key: 'unit', label: 'Đơn vị', default: true },
    { key: 'totalQuantity', label: 'Tổng KL', default: true }
];

export function ExportOptionsModal({
    isOpen,
    onClose,
    onExport,
    projectName,
    projectDescription,
    itemCount,
    summaryCount
}: ExportOptionsModalProps) {
    // Form state
    const [format, setFormat] = useState<ExportFormat>('full');
    const [includeMetadata, setIncludeMetadata] = useState(true);
    const [selectedDetailCols, setSelectedDetailCols] = useState<string[]>(
        DETAIL_COLUMNS.filter(c => c.default).map(c => c.key)
    );
    const [selectedSummaryCols, setSelectedSummaryCols] = useState<string[]>(
        SUMMARY_COLUMNS.filter(c => c.default).map(c => c.key)
    );

    // UI state (following react-ui-patterns skill)
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleExport = async () => {
        // Button loading state pattern from react-ui-patterns
        setIsExporting(true);
        setError(null);

        try {
            const options: ExportOptions = {
                format,
                includeMetadata,
                projectName,
                projectDescription,
                columns: {
                    detail: selectedDetailCols as (keyof import('../types').BOMItem | 'starterName')[],
                    summary: selectedSummaryCols as (keyof import('../types').SummaryItem)[]
                }
            };

            await onExport(options);
            onClose();
        } catch (err) {
            // Error handling pattern: Always surface errors
            console.error('Export failed:', err);
            setError(err instanceof Error ? err.message : 'Export failed');
        } finally {
            setIsExporting(false);
        }
    };

    const toggleDetailColumn = (key: string) => {
        setSelectedDetailCols(prev =>
            prev.includes(key)
                ? prev.filter(k => k !== key)
                : [...prev, key]
        );
    };

    const toggleSummaryColumn = (key: string) => {
        setSelectedSummaryCols(prev =>
            prev.includes(key)
                ? prev.filter(k => k !== key)
                : [...prev, key]
        );
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <FileSpreadsheet className="w-6 h-6 text-green-600" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Export Options
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isExporting}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-6">
                    {/* Error Banner (following react-ui-patterns error hierarchy) */}
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
                            <p className="font-medium">Export Error</p>
                            <p className="text-sm">{error}</p>
                        </div>
                    )}

                    {/* Stats */}
                    <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-full">
                            📋 {itemCount} items
                        </span>
                        <span className="px-3 py-1 bg-green-50 dark:bg-green-900/20 rounded-full">
                            📊 {summaryCount} unique products
                        </span>
                    </div>

                    {/* Format Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Export Format
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {FORMAT_OPTIONS.map(option => (
                                <button
                                    key={option.value}
                                    onClick={() => setFormat(option.value)}
                                    disabled={isExporting}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${format === option.value
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        {option.icon}
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {option.label}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {option.description}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Project Metadata Toggle */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                                Include Project Info
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {projectName ? `Project: ${projectName}` : 'Add metadata sheet with export details'}
                            </p>
                        </div>
                        <button
                            onClick={() => setIncludeMetadata(!includeMetadata)}
                            disabled={isExporting}
                            className={`w-12 h-6 rounded-full transition-colors relative ${includeMetadata ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                                }`}
                            role="switch"
                            aria-checked={includeMetadata}
                        >
                            <span
                                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${includeMetadata ? 'translate-x-7' : 'translate-x-1'
                                    }`}
                            />
                        </button>
                    </div>

                    {/* Column Selection - Detail */}
                    {format !== 'summary_only' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Detail Columns
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {DETAIL_COLUMNS.map(col => (
                                    <button
                                        key={col.key}
                                        onClick={() => toggleDetailColumn(col.key)}
                                        disabled={isExporting}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedDetailCols.includes(col.key)
                                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                            }`}
                                    >
                                        {selectedDetailCols.includes(col.key)
                                            ? <CheckSquare className="w-4 h-4" />
                                            : <Square className="w-4 h-4" />
                                        }
                                        {col.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Column Selection - Summary */}
                    {format !== 'detail_only' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Summary Columns
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {SUMMARY_COLUMNS.map(col => (
                                    <button
                                        key={col.key}
                                        onClick={() => toggleSummaryColumn(col.key)}
                                        disabled={isExporting}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedSummaryCols.includes(col.key)
                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                            }`}
                                    >
                                        {selectedSummaryCols.includes(col.key)
                                            ? <CheckSquare className="w-4 h-4" />
                                            : <Square className="w-4 h-4" />
                                        }
                                        {col.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <button
                        onClick={onClose}
                        disabled={isExporting}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    {/* Button loading state pattern from react-ui-patterns */}
                    <button
                        onClick={handleExport}
                        disabled={isExporting || selectedDetailCols.length === 0 && selectedSummaryCols.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    >
                        {isExporting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4" />
                                Export Excel
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
