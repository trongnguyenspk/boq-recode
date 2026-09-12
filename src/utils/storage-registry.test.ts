import { describe, expect, it } from 'vitest';
import type { BOMItem, Project } from '../types';
import {
    BACKUP_SCHEMA,
    BACKUP_VERSION,
    CATALOG_SCHEMA_VERSION,
    InMemoryStorage,
    canUndoLastRestore,
    createBackupEnvelope,
    inspectBackupEnvelope,
    migrateBackup,
    migrateLegacyStorage,
    restoreBackup,
    undoLastRestore,
    UNDO_SNAPSHOT_KEY,
    validateBackupEnvelope,
} from './storage-registry';
import { PRODUCT_LIBRARY } from '../data/library';

function project(id = 'project-1'): Project {
    return {
        id,
        metadata: {
            name: 'Test project',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        starters: [],
        manualItems: [],
        bomQuantityOverrides: {},
    };
}

function seedStorage(storage: InMemoryStorage): void {
    storage.setItem('boq_library', JSON.stringify([{
        id: 'p1', code: 'P1', description: 'Product 1', brand: 'LS', unit: 'Cái', matchKey: 'P1', price: 1,
    }]));
    storage.setItem('boq_templates', JSON.stringify({ DOL: { '5.5': [{ matchKey: 'P1', qty: 1 }] } }));
    storage.setItem('boq_brands', JSON.stringify(['LS']));
    storage.setItem('boq_matchkey_meta', JSON.stringify({ P1: { matchKey: 'P1', category: 'OTHER', brandSensitive: false } }));
    storage.setItem('boq_common_groups', JSON.stringify([]));
    storage.setItem('logicConfig', JSON.stringify({ version: 1 }));
    storage.setItem('boq_schema_version', String(CATALOG_SCHEMA_VERSION));
}

describe('storage registry and backup envelope', () => {
    it('accepts catalog products identified by iBom when code is empty', () => {
        const storage = new InMemoryStorage();
        seedStorage(storage);
        storage.setItem('boq_library', JSON.stringify(PRODUCT_LIBRARY));

        const envelope = createBackupEnvelope({ storage });
        const mct = envelope.catalog.library.find(product => product.matchKey === 'MCT_100A');
        expect(mct).toBeDefined();
        expect(mct?.code).toBe('');
        expect(mct?.ibomCode).toBeTruthy();
    });

    it('accepts canonical string PowerKey values and powerKey-only starters', () => {
        const starter = {
            id: 'starter-1',
            type: 'DOL',
            power: '5.50',
            powerKey: '5,5',
            quantity: 1,
            brand: 'Schneider',
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
        const powerKeyOnlyStarter = { ...starter, id: 'starter-2', power: undefined };
        const envelope = {
            schema: BACKUP_SCHEMA,
            version: BACKUP_VERSION,
            exportedAt: '2026-01-01T00:00:00.000Z',
            catalog: {
                library: [],
                templates: {},
                brands: [],
                matchKeyMeta: {},
                schemaVersion: CATALOG_SCHEMA_VERSION,
            },
            projects: [
                {
                    ...project('project-power'),
                    starters: [starter, powerKeyOnlyStarter],
                },
            ],
            currentProjectId: 'project-power',
        };

        expect(validateBackupEnvelope(envelope)).toBe(true);
    });

    it('accepts canonical template quantity alongside the legacy qty field', () => {
        const storage = new InMemoryStorage();
        seedStorage(storage);
        storage.setItem('boq_templates', JSON.stringify({ DOL: { '5.5': [{ matchKey: 'P1', quantity: 1 }] } }));

        const templates = createBackupEnvelope({ storage }).catalog.templates;
        expect(Array.isArray(templates)).toBe(false);
        if (Array.isArray(templates)) throw new Error('Expected legacy template map in this fixture');
        expect(templates.DOL['5.5'][0]?.quantity).toBe(1);
    });

    it('preserves manual lines whose product code is empty but iBom is present', () => {
        const storage = new InMemoryStorage();
        seedStorage(storage);
        const manualLine: BOMItem = {
            id: 'manual-mct',
            starterId: 'common',
            starterName: 'Common Items',
            ibomCode: 'MCT_100-5_CL.1_5VA',
            productCode: '',
            description: 'MCT 100/5',
            brand: 'OMEGA',
            unit: 'Cái',
            quantity: 1,
        };
        const saved = createBackupEnvelope({
            storage,
            projects: [{ ...project('project-manual'), manualItems: [manualLine] }],
            currentProjectId: 'project-manual',
        });
        expect(saved.projects[0]?.manualItems?.[0]?.productCode).toBe('');
    });

    it('exports source catalog, projects and current id while excluding theme/dead keys', () => {
        const storage = new InMemoryStorage();
        seedStorage(storage);
        storage.setItem('boq_theme', 'dark');
        storage.setItem('boq_manual_items', JSON.stringify([{ stale: true }]));
        const saved = { projects: [project()], currentProjectId: 'project-1' };
        storage.setItem('boq_projects', JSON.stringify({ state: saved, version: 0 }));

        const envelope = createBackupEnvelope({ storage });
        expect(envelope.schema).toBe(BACKUP_SCHEMA);
        expect(envelope.version).toBe(BACKUP_VERSION);
        expect(envelope.catalog.library).toHaveLength(1);
        expect(envelope.projects[0]?.id).toBe('project-1');
        expect(envelope.currentProjectId).toBe('project-1');
        expect(JSON.stringify(envelope)).not.toContain('boq_theme');
        expect(JSON.stringify(envelope)).not.toContain('boq_manual_items');
        expect(validateBackupEnvelope(envelope)).toBe(true);
    });

    it('migrates the legacy data.* string envelope and folds old project fields', () => {
        const legacy = {
            exportDate: '2026-01-02T00:00:00.000Z',
            version: '1.0',
            data: {
                library: JSON.stringify([]),
                templates: JSON.stringify({}),
                brands: JSON.stringify([]),
                matchKeyMeta: JSON.stringify({}),
                projects: JSON.stringify({ state: { projects: [project()], currentProjectId: 'project-1' }, version: 0 }),
                manualItems: JSON.stringify([]),
                bomOverrides: JSON.stringify({}),
            },
        };
        const migrated = migrateBackup(legacy);
        expect(migrated.schema).toBe(BACKUP_SCHEMA);
        expect(migrated.exportedAt).toBe('2026-01-02T00:00:00.000Z');
        expect(validateBackupEnvelope(migrated)).toBe(true);
    });

    it('reports deep validation errors for malformed nested source data', () => {
        const result = inspectBackupEnvelope({
            schema: BACKUP_SCHEMA,
            version: BACKUP_VERSION,
            exportedAt: '2026-01-01T00:00:00.000Z',
            catalog: {
                library: [{ id: 'p1', code: 'P1', description: 'bad', brand: 'LS', unit: 'Cái', price: -1 }],
                templates: { DOL: { '5.5': [{ matchKey: '', qty: -1 }] } },
                brands: ['LS'],
                matchKeyMeta: {},
                schemaVersion: CATALOG_SCHEMA_VERSION,
            },
            projects: [project()],
            currentProjectId: 'project-1',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(error => error.includes('price'))).toBe(true);
        expect(result.errors.some(error => error.includes('matchKey'))).toBe(true);
    });

    it('restores atomically, removes dead keys, and allows exactly one undo', () => {
        const storage = new InMemoryStorage();
        seedStorage(storage);
        storage.setItem('boq_theme', 'dark');
        storage.setItem('boq_manual_items', JSON.stringify([{ stale: true }]));
        storage.setItem('boq_projects', JSON.stringify({ state: { projects: [project()], currentProjectId: 'project-1' }, version: 0 }));
        const original = createBackupEnvelope({ storage });
        const replacement = {
            ...original,
            catalog: { ...original.catalog, brands: ['Schneider'] },
            projects: [project('project-2')],
            currentProjectId: 'project-2',
        };

        restoreBackup(replacement, { storage });
        expect(JSON.parse(storage.getItem('boq_brands') || '[]')).toEqual(['Schneider']);
        expect(storage.getItem('boq_manual_items')).toBeNull();
        expect(storage.getItem(UNDO_SNAPSHOT_KEY)).not.toBeNull();
        expect(canUndoLastRestore(storage)).toBe(true);
        expect(undoLastRestore(storage)).toBe(true);
        expect(JSON.parse(storage.getItem('boq_brands') || '[]')).toEqual(['LS']);
        expect(storage.getItem(UNDO_SNAPSHOT_KEY)).toBeNull();
        expect(canUndoLastRestore(storage)).toBe(false);
        expect(undoLastRestore(storage)).toBe(false);
    });

    it('keeps restored storage intact when the undo state callback fails', () => {
        const storage = new InMemoryStorage();
        seedStorage(storage);
        storage.setItem('boq_projects', JSON.stringify({ state: { projects: [project()], currentProjectId: 'project-1' }, version: 0 }));
        const original = createBackupEnvelope({ storage });
        const replacement = {
            ...original,
            catalog: { ...original.catalog, brands: ['Schneider'] },
            projects: [project('project-2')],
            currentProjectId: 'project-2',
        };

        restoreBackup(replacement, { storage });
        expect(undoLastRestore(storage, () => { throw new Error('state update failed'); })).toBe(false);
        expect(JSON.parse(storage.getItem('boq_brands') || '[]')).toEqual(['Schneider']);
        expect(JSON.parse(storage.getItem('boq_projects') || '{}').state.currentProjectId).toBe('project-2');
        expect(canUndoLastRestore(storage)).toBe(true);
    });

    it('can undo from the persisted snapshot after a process reload', () => {
        const storage = new InMemoryStorage();
        seedStorage(storage);
        storage.setItem('boq_projects', JSON.stringify({ state: { projects: [project()], currentProjectId: 'project-1' }, version: 0 }));
        const original = createBackupEnvelope({ storage });
        const replacement = {
            ...original,
            catalog: { ...original.catalog, brands: ['Schneider'] },
            projects: [project('project-2')],
            currentProjectId: 'project-2',
        };

        restoreBackup(replacement, { storage });
        const reloadedStorage = new InMemoryStorage();
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key) reloadedStorage.setItem(key, storage.getItem(key) ?? '');
        }

        expect(canUndoLastRestore(reloadedStorage)).toBe(true);
        expect(undoLastRestore(reloadedStorage)).toBe(true);
        expect(JSON.parse(reloadedStorage.getItem('boq_brands') || '[]')).toEqual(['LS']);
        expect(canUndoLastRestore(reloadedStorage)).toBe(false);
    });

    it('folds legacy local keys into the current project before deleting them', () => {
        const storage = new InMemoryStorage();
        const current = project();
        storage.setItem('boq_projects', JSON.stringify({ state: { projects: [current], currentProjectId: current.id }, version: 0 }));
        const manual: unknown[] = [];
        storage.setItem('boq_manual_items', JSON.stringify(manual));
        storage.setItem('boq_bom_overrides', JSON.stringify({ 'line-1': 2 }));
        const result = migrateLegacyStorage(storage);
        expect(result.migrated).toBe(true);
        expect(storage.getItem('boq_manual_items')).toBeNull();
        expect(storage.getItem('boq_bom_overrides')).toBeNull();
        const saved = JSON.parse(storage.getItem('boq_projects') || '{}');
        expect(saved.state.projects[0].bomQuantityOverrides).toEqual({ 'line-1': 2 });
    });
});
