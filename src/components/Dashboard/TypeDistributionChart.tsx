
import React from 'react';

interface TypeDistributionChartProps {
    data: { label: string; value: number; color: string }[];
    total: number;
}

export function TypeDistributionChart({ data, total }: TypeDistributionChartProps) {
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Starters by Type</h3>

            <div className="space-y-4">
                {data.map((item) => (
                    <div key={item.label}>
                        <div className="flex justify-between items-center mb-1 text-sm">
                            <span className="font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                            <span className="text-gray-500 dark:text-gray-400">
                                {item.value} ({total > 0 ? Math.round((item.value / total) * 100) : 0}%)
                            </span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div
                                className={`h-2.5 rounded-full ${item.color} transition-all duration-500 ease-out`}
                                style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {total === 0 && (
                <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                    No starters derived yet
                </div>
            )}
        </div>
    );
}
