import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { Product, Project, Unit } from '../types';
import {
    WORKBOOK_SHEETS,
    applyWorkbookDiff,
    buildWorkbookDiff,
    buildWorkbookRows,
    createWorkbook,
    diffWorkbook,
    parseWorkbook,
    toWorkbookState,
    validateWorkbookState,
    writeWorkbook,
    type WorkbookRows,
    type WorkbookState,
} from './workbook-pipeline';

const unit = 'Cái' as Unit;

function sampleState(): WorkbookState {
    const library: Product[] = [
        { id: 'p-1', matchKey: 'CONTACTOR_9A', code: 'LC1D09', ibomCode: 'IBOM-1', description: 'Contactor 9A', brand: 'Schneider', unit },
        { id: 'p-2', matchKey: 'CONTACTOR_9A', code: 'S-T10', description: 'Contactor 10A', brand: 'Mitsubishi', unit },
        { id: 'p-no-key', code: 'CABLE-1', description: 'Cable', brand: 'Schneider', unit },
    ];
    const project: Project = {
        id: 'project-1',
        metadata: { name: 'Demo', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', tags: ['demo'] },
        starters: [{
            id: 'starter-1', type: 'DOL', power: '5.5', powerKey: '5.5', quantity: 1, brand: 'Schneider', isolator: false,
            signals: { thermal: false, ptc: false, estop: false, humidity: false, isolator_BFP: false, estop_BFP: false, isolator_estop_FB: false }, loadName: 'Pump',
        }],
        manualItems: [{ id: 'manual-1', starterId: 'starter-1', starterName: 'DOL - 5.5kW', ibomCode: 'MAN-1', productCode: 'MAN-1', description: 'Manual row', brand: 'Schneider', unit, quantity: 2, source: 'manual' }],
        bomQuantityOverrides: { 'generated:starter-1:line-1': 3 },
    };
    return toWorkbookState({ library, templates: { DOL: { '5.5': [{ id: 'line-1', matchKey: 'CONTACTOR_9A', qty: 1, condition: 'always' }] } }, brands: ['Schneider'], matchKeyMeta: { CONTACTOR_9A: { matchKey: 'CONTACTOR_9A', category: 'CONTACTOR', brandSensitive: true } }, project });
}

function emptyIncomingRows(): WorkbookRows {
    return { _Meta: [], Products: [], MatchKeys: [], Templates: [], Brands: [], Project: [], Starters: [], ManualLines: [], Overrides: [] };
}

describe('generic workbook pipeline', () => {
    it('exports all source sheets with metadata and stable keys', () => {
        const workbook = createWorkbook(sampleState());
        expect(workbook.SheetNames).toEqual([...WORKBOOK_SHEETS]);
        const productRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Products);
        expect(productRows[0]).toMatchObject({ Action: 'upsert', RowKey: 'p-1', MatchKey: 'CONTACTOR_9A' });
        expect(productRows[2]).toMatchObject({ RowKey: 'p-no-key', MatchKey: '' });
        expect(XLSX.utils.sheet_to_json(workbook.Sheets._Meta)[0]).toMatchObject({ Schema: 'boq-workbook', SchemaVersion: 1 });
    });

    it('round-trips a binary workbook without changing source values', () => {
        const parsed = parseWorkbook(writeWorkbook(sampleState()));
        expect(parsed.issues.filter(issue => issue.severity === 'error')).toEqual([]);
        expect(parsed.rows.Products).toHaveLength(3);
        expect(parsed.rows.Starters[0]).toMatchObject({ RowKey: 'starter-1', Power: '5.5', LoadName: 'Pump' });
        expect(parsed.rows.Templates[0]).toMatchObject({ StarterType: 'DOL', Power: '5.5', ComponentMatchKey: 'CONTACTOR_9A', TemplateLineId: 'line-1' });
        const diff = diffWorkbook(sampleState(), writeWorkbook(sampleState()));
        expect(diff.changes).toEqual([]);
    });

    it('treats omitted rows as untouched and only explicit delete as removal', () => {
        const current = sampleState();
        const incoming = emptyIncomingRows();
        incoming.Products = [{ Action: 'upsert', RowKey: 'p-1', MatchKey: 'CONTACTOR_9A', Brand: 'Schneider', Code: 'LC1D12', iBomCode: 'IBOM-1', Description: 'Contactor 12A', Unit: unit, Price: 0 }];
        const update = buildWorkbookDiff(current, incoming);
        expect(update.sheets.Products.updated).toHaveLength(1);
        const afterUpdate = applyWorkbookDiff(current, update);
        expect(afterUpdate.library.find(product => product.id === 'p-1')?.code).toBe('LC1D12');
        expect(afterUpdate.library.some(product => product.id === 'p-2')).toBe(true);
        expect(afterUpdate.project?.starters).toHaveLength(1);

        const deletion = emptyIncomingRows();
        deletion.Products = [{ Action: 'delete', RowKey: 'p-2', MatchKey: 'CONTACTOR_9A', Brand: 'Mitsubishi' }];
        const deleteDiff = buildWorkbookDiff(afterUpdate, deletion);
        expect(deleteDiff.sheets.Products.deleted).toHaveLength(1);
        const afterDelete = applyWorkbookDiff(afterUpdate, deleteDiff);
        expect(afterDelete.library.some(product => product.id === 'p-2')).toBe(false);
    });

    it('rejects invalid conditions before applying any change', () => {
        const incoming = emptyIncomingRows();
        incoming.Products = [{ Action: 'upsert', RowKey: 'new-product', MatchKey: 'NEW_KEY', Brand: 'Schneider', Code: 'X', Description: 'X', Unit: unit }];
        incoming.Templates = [{ Action: 'upsert', StarterType: 'DOL', Power: '5.5', ComponentMatchKey: 'NEW_KEY', Quantity: 1, Condition: 'thermall' }];
        const diff = buildWorkbookDiff(sampleState(), incoming);
        expect(diff.issues.some(issue => issue.code === 'INVALID_CONDITION' && issue.severity === 'error')).toBe(true);
        expect(() => applyWorkbookDiff(sampleState(), diff)).toThrow(/Cannot apply workbook diff/);
    });

    it('reports cross-sheet unknown keys as warnings while allowing explicit repair', () => {
        const incoming = emptyIncomingRows();
        incoming.Templates = [{ Action: 'upsert', StarterType: 'DOL', Power: '7.5', ComponentMatchKey: 'UNKNOWN', Quantity: 1, Condition: 'always', TemplateLineId: 'line-new' }];
        const diff = buildWorkbookDiff(sampleState(), incoming);
        expect(diff.issues.some(issue => issue.code === 'UNKNOWN_MATCH_KEY' && issue.severity === 'warning')).toBe(true);
        expect(() => applyWorkbookDiff(sampleState(), diff)).not.toThrow();
    });

    it('validates brand-agnostic conflicts without mutating state', () => {
        const state = sampleState();
        state.matchKeyMeta.CONTACTOR_9A = { matchKey: 'CONTACTOR_9A', category: 'CONTACTOR', brandSensitive: false };
        const issues = validateWorkbookState(state);
        expect(issues.some(issue => issue.code === 'BRAND_AGNOSTIC_CONFLICT')).toBe(true);
        expect(state.library).toHaveLength(3);
    });

    it('replaces only an explicitly marked template tier and keeps absent tiers', () => {
        const current = sampleState();
        current.templates.DOL['5.5'] = [
            { id: 'line-1', matchKey: 'CONTACTOR_9A', qty: 1, condition: 'always' },
            { id: 'line-2', matchKey: 'CONTACTOR_9A', qty: 1, condition: 'thermal' },
        ];
        current.templates.DOL['0.18'] = [{ id: 'other-tier', matchKey: 'CONTACTOR_9A', qty: 1, condition: 'always' }];
        const incoming = emptyIncomingRows();
        incoming.Templates = [{
            Action: 'replace-tier', StarterType: 'DOL', Power: '5.50', ComponentMatchKey: 'CONTACTOR_9A',
            Quantity: 3, Condition: 'always', TemplateLineId: 'line-1',
        }];

        const diff = buildWorkbookDiff(current, incoming);
        expect(diff.sheets.Templates.updated).toHaveLength(1);
        expect(diff.sheets.Templates.deleted).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: expect.stringContaining('line:line-2'), action: 'delete' }),
        ]));

        const next = applyWorkbookDiff(current, diff);
        expect(next.templates.DOL['5.5']).toEqual([
            expect.objectContaining({ id: 'line-1', qty: 3 }),
        ]);
        expect(next.templates.DOL['0.18']).toEqual([
            expect.objectContaining({ id: 'other-tier' }),
        ]);
    });

    it('supports a blank replace-tier marker to clear a tier', () => {
        const current = sampleState();
        const incoming = emptyIncomingRows();
        incoming.Templates = [{ Action: 'replace-tier', StarterType: 'DOL', Power: '5.5', ComponentMatchKey: '' }];

        const diff = buildWorkbookDiff(current, incoming);
        expect(diff.issues.filter(issue => issue.severity === 'error')).toEqual([]);
        expect(diff.sheets.Templates.deleted).toHaveLength(1);
        const next = applyWorkbookDiff(current, diff);
        expect(next.templates.DOL['5.5']).toEqual([]);
    });

    it('uses TemplateLineId to update duplicate matchKey lines independently', () => {
        const current = sampleState();
        current.templates.DOL['5.5'] = [
            { id: 'line-always', matchKey: 'CONTACTOR_9A', qty: 1, condition: 'always' },
            { id: 'line-thermal', matchKey: 'CONTACTOR_9A', qty: 2, condition: 'thermal' },
        ];
        const incoming = emptyIncomingRows();
        incoming.Templates = [
            { Action: 'upsert', StarterType: 'DOL', Power: '5.5', ComponentMatchKey: 'CONTACTOR_9A', Quantity: 4, Condition: 'always', TemplateLineId: 'line-always' },
            { Action: 'upsert', StarterType: 'DOL', Power: '5.5', ComponentMatchKey: 'CONTACTOR_9A', Quantity: 5, Condition: 'thermal', TemplateLineId: 'line-thermal' },
        ];
        const diff = buildWorkbookDiff(current, incoming);
        expect(diff.issues.filter(issue => issue.severity === 'error')).toEqual([]);
        expect(diff.sheets.Templates.updated).toHaveLength(2);
        const next = applyWorkbookDiff(current, diff);
        expect(next.templates.DOL['5.5'].map(line => [line.id, line.qty])).toEqual([
            ['line-always', 4], ['line-thermal', 5],
        ]);
    });

    it('deletes a template line by TemplateLineId without requiring its matchKey', () => {
        const current = sampleState();
        const incoming = emptyIncomingRows();
        incoming.Templates = [{ Action: 'delete', StarterType: 'DOL', Power: '5.5', TemplateLineId: 'line-1' }];
        const diff = buildWorkbookDiff(current, incoming);
        expect(diff.issues.filter(issue => issue.severity === 'error')).toEqual([]);
        expect(diff.sheets.Templates.deleted).toHaveLength(1);
        const next = applyWorkbookDiff(current, diff);
        expect(next.templates.DOL['5.5']).toEqual([]);
    });

    it('adapts legacy Template sheets without metadata to replace-tier actions', () => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
            { StarterType: 'DOL', Power: '5.5', ComponentMatchKey: 'CONTACTOR_9A', Quantity: 2, Condition: 'always' },
        ]), 'Template');
        const parsed = parseWorkbook(workbook);
        expect(parsed.legacy).toBe(true);
        expect(parsed.rows.Templates[0]).toMatchObject({ Action: 'replace-tier', StarterType: 'DOL', Power: '5.5' });
        expect(parsed.issues.some(issue => issue.code === 'LEGACY_REPLACE_TIER')).toBe(true);
    });

    it('validates references against products and match keys supplied in the same file', () => {
        const incoming = emptyIncomingRows();
        incoming.Products = [{ Action: 'upsert', RowKey: 'new-product', MatchKey: 'NEW_KEY', Brand: 'Schneider', Code: 'NEW', Description: 'New', Unit: unit, Price: 0 }];
        incoming.Templates = [{ Action: 'upsert', StarterType: 'DOL', Power: '7.5', ComponentMatchKey: 'NEW_KEY', Quantity: 1, Condition: 'always', TemplateLineId: 'new-line' }];
        const diff = buildWorkbookDiff(sampleState(), incoming);
        expect(diff.issues.some(issue => issue.code === 'UNKNOWN_MATCH_KEY')).toBe(false);
    });

    it('blocks an incoming unmanaged brand unless the file adds it to Brands', () => {
        const incoming = emptyIncomingRows();
        incoming.Products = [{ Action: 'upsert', RowKey: 'unknown-brand', MatchKey: 'NEW_KEY', Brand: 'Acme', Code: 'NEW', Description: 'New', Unit: unit, Price: 0 }];
        const blocked = buildWorkbookDiff(sampleState(), incoming);
        expect(blocked.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'UNKNOWN_BRAND', severity: 'error', sheet: 'Products' }),
        ]));
        expect(() => applyWorkbookDiff(sampleState(), blocked)).toThrow(/Brands|skip/);

        incoming.Brands = [{ Action: 'upsert', Brand: 'Acme' }];
        const accepted = buildWorkbookDiff(sampleState(), incoming);
        expect(accepted.issues.some(issue => issue.code === 'UNKNOWN_BRAND')).toBe(false);
    });

    it('applies the same unmanaged-brand gate to manual lines', () => {
        const incoming = emptyIncomingRows();
        incoming.ManualLines = [{
            Action: 'upsert',
            RowKey: 'manual-unknown-brand',
            Description: 'Manual item',
            Brand: 'Acme',
            Unit: unit,
            Quantity: 1,
        }];
        const diff = buildWorkbookDiff(sampleState(), incoming);
        expect(diff.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'UNKNOWN_BRAND', severity: 'error', sheet: 'ManualLines' }),
        ]));
        expect(() => applyWorkbookDiff(sampleState(), diff)).toThrow(/Brands|skip/);
    });

    it('reports metadata count drift without blocking parse', () => {
        const workbook = createWorkbook(sampleState());
        const metadata = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets._Meta)[0];
        workbook.Sheets._Meta = XLSX.utils.json_to_sheet([{ ...metadata, Counts_Products: 999 }]);
        const parsed = parseWorkbook(workbook);
        expect(parsed.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'META_COUNT_MISMATCH', severity: 'warning', field: 'Counts_Products' }),
        ]));
    });

    it('normalizes non-positive template and starter quantities to one after warning', () => {
        const incoming = emptyIncomingRows();
        incoming.Starters = [{
            Action: 'upsert', RowKey: 'starter-1', Type: 'DOL', Power: '5.5', Quantity: 0,
            Brand: 'Schneider', Isolator: 'No', Thermal: 'No', PTC: 'No', Estop: 'No',
            Humidity: 'No', IsolatorBFP: 'No', EstopBFP: 'No', IsolatorEstopFB: 'No',
        }];
        incoming.Templates = [{
            Action: 'upsert', StarterType: 'DOL', Power: '5.5', ComponentMatchKey: 'CONTACTOR_9A',
            Quantity: 0, Condition: 'always', TemplateLineId: 'line-1',
        }];

        const diff = buildWorkbookDiff(sampleState(), incoming);
        expect(diff.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'INVALID_STARTER_QUANTITY', severity: 'warning' }),
            expect.objectContaining({ code: 'INVALID_QUANTITY', severity: 'warning' }),
        ]));

        const next = applyWorkbookDiff(sampleState(), diff);
        expect(next.project?.starters[0].quantity).toBe(1);
        expect(next.templates.DOL['5.5'][0].qty).toBe(1);
    });

    it('rejects a diff with an unsupported schema version before applying', () => {
        const diff = buildWorkbookDiff(sampleState(), emptyIncomingRows());
        expect(() => applyWorkbookDiff(sampleState(), { ...diff, schemaVersion: 2 })).toThrow(/schema version/);
    });
});
