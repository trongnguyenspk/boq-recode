
import React, { useMemo } from 'react';
import {
    X,
    Zap,
    Box,
    CheckCircle,
    TrendingUp,
    AlertTriangle,
    Activity
} from 'lucide-react';
import { KPICard } from './KPICard';
import { TypeDistributionChart } from './TypeDistributionChart';
import type { StarterConfig, BOMItem, ValidationResult } from '../../types';

interface DashboardProps {
    isOpen: boolean;
    onClose: () => void;
    starters: StarterConfig[];
    bom: BOMItem[];
    validation: ValidationResult;
}

export function Dashboard({ isOpen, onClose, starters, bom, validation }: DashboardProps) {
    // 1. Calculate Stats
    const stats = useMemo(() => {
        // Sum quantities instead of just counting configurations
        const totalStarters = starters.reduce((sum, s) => sum + (s.quantity || 1), 0);
        const totalItems = bom.length;

        // Count types (using quantity, not just config count)
        const typeCount: Record<string, number> = {};
        starters.forEach(s => {
            typeCount[s.type] = (typeCount[s.type] || 0) + (s.quantity || 1);
        });

        // Detailed breakdown (Type + Power)
        const typePowerCount: Record<string, number> = {};
        starters.forEach(s => {
            const key = `${s.type} - ${s.power}kW`;
            typePowerCount[key] = (typePowerCount[key] || 0) + (s.quantity || 1);
        });

        const detailedBreakdown = Object.entries(typePowerCount)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => {
                // Sort by Type first, then by Power (numeric)
                const [typeA, powerA] = a.label.split(' - ');
                const [typeB, powerB] = b.label.split(' - ');
                if (typeA !== typeB) return typeA.localeCompare(typeB);
                return parseFloat(powerA) - parseFloat(powerB);
            });

        // Dynamic color palette for different types
        const colorPalette = [
            'bg-blue-500', 'bg-purple-500', 'bg-indigo-500', 'bg-pink-500',
            'bg-green-500', 'bg-orange-500', 'bg-teal-500', 'bg-red-500'
        ];

        // Format for chart - dynamically from all types found in data
        const distributionData = Object.entries(typeCount)
            .filter(([_, value]) => value > 0)
            .map(([label, value], index) => ({
                label,
                value,
                color: colorPalette[index % colorPalette.length]
            }))
            .sort((a, b) => b.value - a.value);

        // Completion/Health
        const issueCount = validation.errors.length + validation.warnings.length;
        const healthScore = totalStarters > 0
            ? Math.max(0, 100 - (issueCount * 5))
            : 100;

        return {
            totalStarters,
            totalItems,
            typeCount,
            distributionData,
            detailedBreakdown,
            issueCount,
            healthScore
        };
    }, [starters, bom, validation]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-8 py-5 border-b dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                            <Activity className="w-6 h-6 text-blue-600" />
                            Project Dashboard
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Overview of BOQ metrics and health</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 overflow-y-auto">
                    {/* KPI Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        <KPICard
                            title="Total Starters"
                            value={stats.totalStarters}
                            icon={Zap}
                            trend={{ value: 12, isPositive: true }} // Mock trend
                            colorClass="bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/50"
                        />
                        <KPICard
                            title="Total Components"
                            value={stats.totalItems}
                            icon={Box}
                        />
                        <KPICard
                            title="Project Health"
                            value={`${stats.healthScore}%`}
                            icon={CheckCircle}
                            trend={{ value: 5, isPositive: stats.healthScore > 80 }}
                            colorClass={stats.healthScore > 80 ? 'bg-green-50/50 dark:bg-green-900/10' : 'bg-yellow-50/50 dark:bg-yellow-900/10'}
                        />
                        <KPICard
                            title="Total Issues"
                            value={stats.issueCount}
                            subtext="Errors & Warnings"
                            icon={AlertTriangle}
                            colorClass={stats.issueCount === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/50'}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Chart Column */}
                        <div className="lg:col-span-2">
                            <TypeDistributionChart
                                data={stats.distributionData}
                                total={stats.totalStarters}
                            />
                        </div>

                        {/* Recent Activity / Insights Column */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 h-full">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-gray-500" />
                                Insights
                            </h3>
                            <div className="space-y-4">
                                {stats.totalStarters === 0 ? (
                                    <p className="text-gray-500 text-sm">Add starters to generate insights.</p>
                                ) : (
                                    <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                                        <li className="flex gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5"></div>
                                            <span>
                                                Most used type: <strong>{stats.distributionData[0]?.label || 'N/A'}</strong>
                                            </span>
                                        </li>
                                        <li className="flex gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5"></div>
                                            <span>
                                                Average components per starter: <strong>{stats.totalStarters ? (stats.totalItems / stats.totalStarters).toFixed(1) : 0}</strong>
                                            </span>
                                        </li>
                                        {validation.errors.length > 0 && (
                                            <li className="flex gap-2 text-red-600 dark:text-red-400">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5"></div>
                                                <span>
                                                    <strong>{validation.errors.length} critical errors</strong> require attention.
                                                </span>
                                            </li>
                                        )}
                                    </ul>
                                )}
                            </div>

                            {/* Detailed Breakdown Section */}
                            {stats.totalStarters > 0 && (
                                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                        <Box className="w-5 h-5 text-gray-500" />
                                        Detailed Breakdown
                                    </h3>
                                    <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                        {stats.detailedBreakdown.map((item) => (
                                            <div key={item.label} className="text-sm">
                                                <div className="flex justify-between mb-1">
                                                    <span className="text-gray-600 dark:text-gray-300">{item.label}</span>
                                                    <span className="font-medium text-gray-900 dark:text-white">{item.value}</span>
                                                </div>
                                                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                                    <div
                                                        className="bg-blue-600 h-1.5 rounded-full"
                                                        style={{ width: `${(item.value / stats.totalStarters) * 100}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
