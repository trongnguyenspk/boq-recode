import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from './projectStore';

describe('project store source snapshots', () => {
    beforeEach(() => {
        localStorage.clear();
        useProjectStore.setState({ projects: [], currentProjectId: null });
    });

    it('keeps create empty and exposes explicit save-as cloning', () => {
        const store = useProjectStore.getState();
        const sourceId = store.createProject('Source');
        store.syncToCurrentProject([], [], { 'line-1': 2 });
        const copiedId = useProjectStore.getState().saveProjectAs('Copy');

        expect(copiedId).toBeDefined();
        expect(copiedId).not.toBe(sourceId);
        const copied = useProjectStore.getState().getCurrentProject();
        expect(copied?.metadata.name).toBe('Copy');
        expect(copied?.bomQuantityOverrides).toEqual({ 'line-1': 2 });
        expect(copied?.bomQuantityOverrides).not.toBe(
            useProjectStore.getState().projects.find(project => project.id === sourceId)?.bomQuantityOverrides,
        );
    });

    it('does not carry source data into a newly created empty project', () => {
        const store = useProjectStore.getState();
        store.createProject('Source');
        const starter = {
            id: 'starter-1',
            type: 'DOL',
            powerKey: '5.5',
            quantity: 1,
            brand: 'LS',
            isolator: false,
            signals: {
                thermal: false,
                ptc: false,
                estop: false,
                humidity: false,
                isolator_BFP: false,
                estop_BFP: false,
                isolator_estop_FB: false,
            },
        };
        store.syncToCurrentProject([starter], [], { 'line-1': 2 });

        const newId = useProjectStore.getState().createProject('Empty');
        const created = useProjectStore.getState().projects.find(project => project.id === newId);
        expect(created?.starters).toEqual([]);
        expect(created?.manualItems).toEqual([]);
        expect(created?.bomQuantityOverrides).toEqual({});
    });

    it('replaces and undoes one project snapshot', () => {
        const store = useProjectStore.getState();
        const id = store.createProject('Original');
        const replacement = { projects: [{
            ...store.getCurrentProject()!,
            id: 'replacement',
            metadata: { ...store.getCurrentProject()!.metadata, name: 'Replacement' },
        }], currentProjectId: 'replacement' };
        store.replaceProjectState(replacement);
        expect(useProjectStore.getState().currentProjectId).toBe('replacement');
        expect(useProjectStore.getState().undoProjectState()).toBe(true);
        expect(useProjectStore.getState().currentProjectId).toBe(id);
        expect(useProjectStore.getState().undoProjectState()).toBe(false);
    });
});
