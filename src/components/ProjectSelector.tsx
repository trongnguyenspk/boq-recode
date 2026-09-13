/**
 * ProjectSelector Component
 * Part of E1: Project Management System
 * 
 * Allows users to:
 * - View and select existing projects
 * - Create new projects
 * - Delete projects
 * - See the current project name
 */

import { useState } from 'react';
import { FolderOpen, Plus, Trash2, ChevronDown, Save, X } from 'lucide-react';
import { useProjectStore, useProjects, useCurrentProjectId } from '../stores/projectStore';
import type { StarterConfig, BOMItem } from '../types';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface ProjectSelectorProps {
    starters: StarterConfig[];
    manualItems: BOMItem[];
    bomQuantityOverrides: Record<string, number>;
    onLoadProject: (starters: StarterConfig[], manualItems: BOMItem[], bomQuantityOverrides: Record<string, number>) => void;
    className?: string;
}

export function ProjectSelector({
    starters,
    manualItems,
    bomQuantityOverrides,
    onLoadProject,
    className = ''
}: ProjectSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createMode, setCreateMode] = useState<'empty' | 'copy'>('empty');
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');

    const projects = useProjects();
    const currentProjectId = useCurrentProjectId();
    const {
        createProject,
        deleteProject,
        loadProject,
        syncToCurrentProject,
        getCurrentProject
    } = useProjectStore();

    const currentProject = getCurrentProject();

    const handleCreateProject = () => {
        if (!newProjectName.trim()) return;

        // Preserve edits that have not reached the debounced App auto-save
        // before switching the store's current project to the new one.
        if (currentProjectId) {
            syncToCurrentProject(starters, manualItems, bomQuantityOverrides);
        }

        createProject(newProjectName.trim(), newProjectDesc.trim() || undefined);
        const nextStarters = createMode === 'copy' ? starters : [];
        const nextManualItems = createMode === 'copy' ? manualItems : [];
        const nextOverrides = createMode === 'copy' ? bomQuantityOverrides : {};
        syncToCurrentProject(nextStarters, nextManualItems, nextOverrides);
        onLoadProject(nextStarters, nextManualItems, nextOverrides);

        setNewProjectName('');
        setNewProjectDesc('');
        setIsCreating(false);
        setIsOpen(false);
    };

    const handleLoadProject = (projectId: string) => {
        // Save current project first if exists
        if (currentProjectId) {
            syncToCurrentProject(starters, manualItems, bomQuantityOverrides);
        }

        const project = loadProject(projectId);
        if (project) {
            onLoadProject(project.starters, project.manualItems || [], project.bomQuantityOverrides || {});
        }
        setIsOpen(false);
    };

    // P4.3: thay window.confirm bằng ConfirmDialog dùng chung.
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    const handleDeleteProject = (projectId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setPendingDeleteId(projectId);
    };

    const confirmDeleteProject = () => {
        const projectId = pendingDeleteId;
        if (!projectId) return;
        const deletingCurrent = projectId === currentProjectId;
        deleteProject(projectId);
        // Deleting the selected project is also an explicit "no project"
        // state; do not leave its rows on the working board.
        if (deletingCurrent) onLoadProject([], [], {});
        setPendingDeleteId(null);
    };

    const handleSaveProject = () => {
        if (currentProjectId) {
            syncToCurrentProject(starters, manualItems, bomQuantityOverrides);
        }
    };

    const openCreateForm = (mode: 'empty' | 'copy') => {
        setCreateMode(mode);
        setIsCreating(true);
    };

    return (
        <div className={`relative ${className}`}>
            {/* Main Button */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 
                               text-white rounded-lg transition shadow-sm font-medium"
                >
                    <FolderOpen className="w-4 h-4" />
                    <span className="max-w-[150px] truncate">
                        {currentProject?.metadata.name || 'Dự án mới'}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {currentProjectId && (
                    <button
                        onClick={handleSaveProject}
                        className="p-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition"
                        title="Lưu dự án"
                    >
                        <Save className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-gray-800 
                                rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 
                                z-50 overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 
                                    bg-gray-50 dark:bg-gray-900">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Quản lý dự án</h3>
                    </div>

                    {/* Actions */}
                    <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex gap-2">
                        <button
                            onClick={() => openCreateForm('empty')}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 
                                       bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 
                                       rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 transition"
                        >
                            <Plus className="w-4 h-4" />
                            Dự án mới
                        </button>
                        <button
                            onClick={() => openCreateForm('copy')}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 
                                       bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 
                                       rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                        >
                            Lưu thành bản khác
                        </button>
                    </div>

                    {/* Create Project Form */}
                    {isCreating && (
                        <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-950">
                            <input
                                type="text"
                                placeholder="Tên dự án *"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 
                                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white mb-2"
                                autoFocus
                            />
                            <input
                                type="text"
                                placeholder="Mô tả (tùy chọn)"
                                value={newProjectDesc}
                                onChange={(e) => setNewProjectDesc(e.target.value)}
                                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 
                                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white mb-2"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={handleCreateProject}
                                    disabled={!newProjectName.trim()}
                                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md 
                                               hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {createMode === 'copy' ? 'Lưu bản sao' : 'Tạo dự án'}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsCreating(false);
                                        setNewProjectName('');
                                        setNewProjectDesc('');
                                    }}
                                    className="px-3 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 
                                               rounded-md hover:bg-gray-400 dark:hover:bg-gray-500"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Project List */}
                    <div className="max-h-60 overflow-y-auto">
                        {projects.length === 0 ? (
                            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                                Chưa có dự án nào
                            </div>
                        ) : (
                            projects.map(project => (
                                <div
                                    key={project.id}
                                    onClick={() => handleLoadProject(project.id)}
                                    className={`px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 
                                                flex items-center justify-between group transition
                                                ${project.id === currentProjectId ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-900 dark:text-white truncate">
                                            {project.metadata.name}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {project.starters.length} starters •
                                            {new Date(project.metadata.updatedAt).toLocaleDateString('vi-VN')}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleDeleteProject(project.id, e)}
                                        className="p-1 opacity-0 group-hover:opacity-100 text-red-500 
                                                   hover:bg-red-100 dark:hover:bg-red-900/50 rounded transition"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Click outside to close */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* P4.3: xác nhận xoá dự án (thay window.confirm) */}
            <ConfirmDialog
                open={pendingDeleteId !== null}
                title="Xoá dự án"
                message="Xóa dự án này? Hành động này không thể hoàn tác."
                confirmLabel="Xoá"
                danger
                onConfirm={confirmDeleteProject}
                onCancel={() => setPendingDeleteId(null)}
            />
        </div>
    );
}

export default ProjectSelector;
