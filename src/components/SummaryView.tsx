import type { SummaryItem } from '../types';
import { cn } from '../utils/cn';
import { isCableLargerThan, getCableSizeLabel } from '../utils/cable-detection';

interface SummaryViewProps {
    summary: SummaryItem[];
}

export function SummaryView({ summary }: SummaryViewProps) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors duration-200">
            <div className="p-4 bg-green-600 dark:bg-green-700 text-white font-bold text-lg">
                Summary View (Tổng hợp vật tư)
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 min-h-[200px]">
                {summary.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                            <thead>
                                <tr className="bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Mã iBom</th>
                                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Mô tả</th>
                                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Mã SP</th>
                                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Nhãn hiệu</th>
                                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Đơn vị</th>
                                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 text-right">Tổng KL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...summary].sort((a, b) => a.description.localeCompare(b.description, 'vi')).map((item, index) => {
                                    const isLargeCable = isCableLargerThan(item.description, item.productCode);
                                    const cableSize = isLargeCable ? getCableSizeLabel(item.description, item.productCode) : null;

                                    return (
                                        <tr key={index} className={cn(
                                            "border-b border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-gray-700/50 transition-colors",
                                            isLargeCable && "bg-orange-50 dark:bg-orange-900/20"
                                        )}>
                                            <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{item.ibomCode}</td>
                                            <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                                                {item.description}
                                                {isLargeCable && (
                                                    <span
                                                        className="ml-2 text-orange-600 dark:text-orange-400"
                                                        title={`Cable ${cableSize} > 1.5mm²`}
                                                    >
                                                        ⚠️
                                                    </span>
                                                )}
                                            </td>
                                            <td className={cn(
                                                "px-4 py-2 font-mono",
                                                item.productCode === 'NOT_FOUND' ? "text-red-600 font-bold" : "text-gray-700 dark:text-gray-300"
                                            )}>
                                                {item.productCode}
                                            </td>
                                            <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{item.brand}</td>
                                            <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{item.unit}</td>
                                            <td className={cn(
                                                "px-4 py-2 text-right font-bold",
                                                !item.totalQuantity || item.totalQuantity <= 0
                                                    ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30"
                                                    : "text-green-600 dark:text-green-400"
                                            )}>
                                                {!item.totalQuantity || item.totalQuantity <= 0
                                                    ? '⚠️ ?'
                                                    : Math.round(item.totalQuantity * 100) / 100}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center text-gray-500 dark:text-gray-400 italic py-8">
                        No summary data generated yet.
                    </div>
                )}
            </div>
        </div>
    );
}
