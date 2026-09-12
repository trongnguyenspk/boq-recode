/**
 * ProjectMetadataDisplay Component
 * Part of P2.2: Project Metadata Display
 * 
 * Shows project information in the header when a project is loaded.
 * Follows frontend-design skill for distinctive aesthetics.
 */

import { useCurrentProject } from '../stores/projectStore';
import { Info, Clock } from 'lucide-react';

interface ProjectMetadataDisplayProps {
    className?: string;
}

function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN');
}

export function ProjectMetadataDisplay({ className = '' }: ProjectMetadataDisplayProps) {
    const currentProject = useCurrentProject();

    if (!currentProject) {
        return (
            <div className={`flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 
                            rounded-lg text-gray-500 dark:text-gray-400 text-sm ${className}`}>
                <Info className="w-4 h-4" />
                <span>Chưa chọn dự án</span>
            </div>
        );
    }

    const { metadata, starters, manualItems } = currentProject;
    const totalItems = starters.length + (manualItems?.length || 0);

    return (
        <div className={`group relative ${className}`}>
            {/* Main Display */}
            <div className="flex items-center gap-3 px-3 py-1.5 bg-gradient-to-r from-indigo-100 to-purple-100 
                           dark:from-indigo-900/30 dark:to-purple-900/30 rounded-lg 
                           border border-indigo-200 dark:border-indigo-800 transition-all">
                {/* Project Name & Stats */}
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Đang hoạt động" />
                    <span className="font-medium text-indigo-700 dark:text-indigo-300 max-w-[150px] truncate">
                        {metadata.name}
                    </span>
                </div>

                {/* Separator */}
                <div className="w-px h-4 bg-indigo-300 dark:bg-indigo-700" />

                {/* Last Updated */}
                <div className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400">
                    <Clock className="w-3 h-3" />
                    <span>{formatRelativeTime(metadata.updatedAt)}</span>
                </div>

                {/* Item Count Badge */}
                <div className="px-2 py-0.5 bg-white dark:bg-gray-800 rounded-full text-xs 
                               font-medium text-indigo-600 dark:text-indigo-400">
                    {totalItems} items
                </div>
            </div>

            {/* Tooltip on Hover - Project Description */}
            {metadata.description && (
                <div className="absolute top-full left-0 mt-2 w-64 p-3 bg-white dark:bg-gray-800 
                               rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 
                               opacity-0 invisible group-hover:opacity-100 group-hover:visible 
                               transition-all duration-200 z-50">
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                        {metadata.description}
                    </p>
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 
                                   text-xs text-gray-500 dark:text-gray-400">
                        Tạo: {new Date(metadata.createdAt).toLocaleDateString('vi-VN', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export default ProjectMetadataDisplay;
