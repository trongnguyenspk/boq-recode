
import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface KPICardProps {
    title: string;
    value: string | number;
    subtext?: string;
    icon: LucideIcon;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    colorClass?: string;
}

export function KPICard({ title, value, subtext, icon: Icon, trend, colorClass = "bg-white dark:bg-gray-800" }: KPICardProps) {
    return (
        <div className={`p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 ${colorClass} transition-all duration-200 hover:shadow-md`}>
            <div className="flex items-center justify-between mb-4">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                {trend && (
                    <span className={`text-sm font-medium px-2 py-1 rounded-full ${trend.isPositive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                        {trend.isPositive ? '+' : ''}{trend.value}%
                    </span>
                )}
            </div>
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide">{title}</h3>
            <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
                {subtext && <span className="text-sm text-gray-500 dark:text-gray-400">{subtext}</span>}
            </div>
        </div>
    );
}
