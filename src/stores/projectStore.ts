/**
 * Project Store
 * Part of E1: Project Management System
 * 
 * Uses Zustand with persist middleware for localStorage storage.
 * Following react-state-management skill patterns.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Project, StarterConfig, BOMItem } from '../types';
import {
    getDefaultStorage,
    migrateLegacyStorage,
    normalizeProjectState,
    type ProjectSnapshot,
} from '../utils/storage-registry';

export interface ProjectState {
    // State
    projects: Project[];
    currentProjectId: string | null;

    // Computed
    getCurrentProject: () => Project | undefined;

    // Actions
    createProject: (name: string, description?: string) => string;
    /** Clone the current source data into a new project and select it. */
    saveProjectAs: (name: string, description?: string) => string | undefined;
    /** Alias retained for callers that use the shorter command name. */
    saveAsProject: (name: string, description?: string) => string | undefined;
    updateProject: (id: string, updates: Partial<Pick<Project, 'metadata' | 'starters' | 'manualItems' | 'bomQuantityOverrides'>>) => void;
    deleteProject: (id: string) => void;
    loadProject: (id: string) => Project | undefined;
    setCurrentProject: (id: string | null) => void;

    // Replace/undo are used by backup restore and are also useful to import flows.
    getSnapshot: () => ProjectSnapshot;
    replaceProjectState: (snapshot: ProjectSnapshot) => void;
    undoProjectState: () => boolean;

    // Sync starters/manualItems/overrides to current project
    syncToCurrentProject: (starters: StarterConfig[], manualItems: BOMItem[], bomQuantityOverrides?: Record<string, number>) => void;
}

function generateId(): string {
    return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function nowISO(): string {
    return new Date().toISOString();
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeForStore(value: unknown): ProjectSnapshot {
    try {
        return normalizeProjectState(value);
    } catch (error) {
        console.warn('Project data migration failed; using an empty project state.', error);
        return { projects: [], currentProjectId: null };
    }
}

// Fold pre-registry manualItems/bomOverrides into the current project before
// Zustand rehydrates. Invalid legacy data is left untouched by the migration.
try {
    migrateLegacyStorage(getDefaultStorage());
} catch (error) {
    console.warn('Legacy project migration failed; existing storage was kept.', error);
}

let lastProjectSnapshot: ProjectSnapshot | undefined;

export const useProjectStore = create<ProjectState>()(
    persist(
        (set, get) => ({
            // Initial state
            projects: [],
            currentProjectId: null,

            // Get current project
            getCurrentProject: () => {
                const { projects, currentProjectId } = get();
                if (!currentProjectId) return undefined;
                return projects.find(p => p.id === currentProjectId);
            },

            // Create new project
            createProject: (name, description) => {
                const id = generateId();
                const now = nowISO();

                const newProject: Project = {
                    id,
                    metadata: {
                        name,
                        description,
                        createdAt: now,
                        updatedAt: now,
                    },
                    starters: [],
                    manualItems: [],
                    bomQuantityOverrides: {},
                };

                set(state => ({
                    projects: [...state.projects, newProject],
                    currentProjectId: id,
                }));

                return id;
            },

            saveProjectAs: (name, description) => {
                const source = get().getCurrentProject();
                if (!source) return undefined;
                const id = generateId();
                const now = nowISO();
                const copied: Project = {
                    ...clone(source),
                    id,
                    metadata: {
                        ...clone(source.metadata),
                        name,
                        ...(description === undefined ? {} : { description }),
                        createdAt: now,
                        updatedAt: now,
                    },
                };
                set(state => ({
                    projects: [...state.projects, copied],
                    currentProjectId: id,
                }));
                return id;
            },

            saveAsProject: (name, description) => get().saveProjectAs(name, description),

            // Update existing project
            updateProject: (id, updates) => {
                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id !== id) return p;
                        return {
                            ...p,
                            ...updates,
                            metadata: {
                                ...p.metadata,
                                ...(updates.metadata || {}),
                                updatedAt: nowISO(),
                            },
                        };
                    }),
                }));
            },

            // Delete project
            deleteProject: (id) => {
                set(state => ({
                    projects: state.projects.filter(p => p.id !== id),
                    currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
                }));
            },

            // Load project (set as current)
            loadProject: (id) => {
                const project = get().projects.find(p => p.id === id);
                if (project) {
                    set({ currentProjectId: id });
                }
                return project;
            },

            // Set current project by ID
            setCurrentProject: (id) => {
                if (id === null || get().projects.some(project => project.id === id)) {
                    set({ currentProjectId: id });
                }
            },

            getSnapshot: () => {
                const { projects, currentProjectId } = get();
                return clone({ projects, currentProjectId });
            },

            replaceProjectState: (snapshot) => {
                const normalized = normalizeForStore(snapshot);
                lastProjectSnapshot = get().getSnapshot();
                set({
                    projects: normalized.projects,
                    currentProjectId: normalized.currentProjectId,
                });
            },

            undoProjectState: () => {
                if (!lastProjectSnapshot) return false;
                const previous = lastProjectSnapshot;
                lastProjectSnapshot = undefined;
                set({
                    projects: clone(previous.projects),
                    currentProjectId: previous.currentProjectId,
                });
                return true;
            },

            // Sync current work to project
            syncToCurrentProject: (starters, manualItems, bomQuantityOverrides = {}) => {
                const { currentProjectId } = get();
                if (!currentProjectId) return;

                set(state => ({
                    projects: state.projects.map(p => {
                        if (p.id !== currentProjectId) return p;
                        return {
                            ...p,
                            starters: clone(starters),
                            manualItems: clone(manualItems),
                            bomQuantityOverrides: clone(bomQuantityOverrides),
                            metadata: {
                                ...p.metadata,
                                updatedAt: nowISO(),
                            },
                        };
                    }),
                }));
            },
        }),
        {
            name: 'boq_projects',
            storage: createJSONStorage(() => getDefaultStorage()),
            version: 1,
            migrate: (persistedState: unknown) => normalizeForStore(persistedState),
            merge: (persistedState: unknown, currentState) => {
                const normalized = normalizeForStore(persistedState);
                return {
                    ...currentState,
                    projects: normalized.projects,
                    currentProjectId: normalized.currentProjectId,
                };
            },
            // Only persist these keys
            partialize: (state) => ({
                projects: state.projects,
                currentProjectId: state.currentProjectId,
            }),
        }
    )
);

// Selector hooks for optimized re-renders
export const useProjects = () => useProjectStore(state => state.projects);
export const useCurrentProjectId = () => useProjectStore(state => state.currentProjectId);
export const useCurrentProject = () => useProjectStore(state => state.getCurrentProject());
