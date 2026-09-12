import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeFileMock = vi.hoisted(() => vi.fn());
vi.mock('xlsx', async () => {
    const actual = await vi.importActual<typeof import('xlsx')>('xlsx');
    return { ...actual, writeFile: writeFileMock };
});

import * as XLSX from 'xlsx';
import type { BOMItem, SummaryItem, ValidationResult } from '../types';
import { exportToExcel, prepareExportRows } from './excel-export';

const detailItem = (overrides: Partial<BOMItem> = {}): BOMItem => ({
    id: 'line-1',
    starterId: 'starter-1',
    starterName: 'DOL - 5.5kW',
    ibomCode: 'IB-1',
    productCode: 'P-1',
    description: 'Contactor',
    brand: 'Schneider',
    unit: 'Cái',
    quantity: 2,
    ...overrides,
});

const summaryItem = (overrides: Partial<SummaryItem> = {}): SummaryItem => ({
    id: 'IB-1',
    ibomCode: 'IB-1',
    productCode: 'P-1',
    description: 'Contactor',
    brand: 'Schneider',
    unit: 'Cái',
    totalQuantity: 2,
    ...overrides,
});

describe('exportToExcel export boundary', () => {
    beforeEach(() => writeFileMock.mockClear());

    it('filters disabled/missing rows and counts the actual output in metadata', async () => {
        await exportToExcel(
            [
                detailItem(),
                detailItem({ id: 'deleted', quantity: 0 }),
            ],
            [
                summaryItem(),
                summaryItem({ id: 'deleted', ibomCode: 'IB-0', totalQuantity: 0 }),
                summaryItem({ id: 'missing', ibomCode: 'IB-NF', productCode: 'NOT_FOUND', totalQuantity: 5 }),
            ],
            {
                format: 'full',
                includeMetadata: true,
                projectName: 'Project A',
                projectDescription: 'Description A',
            },
        );

        const workbook = writeFileMock.mock.calls[0]?.[0] as XLSX.WorkBook;
        expect(workbook.SheetNames).toEqual(['Project Info', 'Detail', 'Summary']);

        const detailRows = XLSX.utils.sheet_to_json(workbook.Sheets.Detail);
        const summaryRows = XLSX.utils.sheet_to_json(workbook.Sheets.Summary);
        expect(detailRows).toHaveLength(1);
        expect(summaryRows).toHaveLength(1);

        const metadataRows = XLSX.utils.sheet_to_json(workbook.Sheets['Project Info'], { header: 1 }) as unknown[][];
        expect(metadataRows).toContainEqual(['Project Name:', 'Project A']);
        expect(metadataRows).toContainEqual(['Description:', 'Description A']);
        expect(metadataRows).toContainEqual(['Total Items:', 1]);
        expect(metadataRows).toContainEqual(['Unique Products:', 1]);
    });

    it('blocks unresolved detail rows even when the sentinel has casing/spacing differences', async () => {
        await expect(exportToExcel(
            [detailItem({ productCode: ' not_found ' })],
            [],
            { format: 'detail_only' },
        )).rejects.toThrow('chưa tìm thấy sản phẩm');
    });

    it('rejects non-finite summary totals instead of serializing invalid Excel values', async () => {
        await expect(exportToExcel(
            [detailItem()],
            [summaryItem({ totalQuantity: Number.NaN })],
            { format: 'summary_only' },
        )).rejects.toThrow('tổng khối lượng không hợp lệ');
        expect(writeFileMock).not.toHaveBeenCalled();
    });

    it('lets direct callers supply the validation/diagnostic gate', async () => {
        const validation: ValidationResult = {
            isValid: false,
            hasWarnings: false,
            errors: [{
                id: 'missing-template:starter-1',
                code: 'MISSING_TEMPLATE',
                severity: 'error',
                message: 'No template found for DOL 5.5kW',
            }],
            warnings: [],
            infos: [],
        };

        await expect(exportToExcel(
            [detailItem()],
            [summaryItem()],
            { format: 'full', validation },
        )).rejects.toThrow('MISSING_TEMPLATE');

        await expect(exportToExcel(
            [detailItem()],
            [summaryItem()],
            {
                format: 'full',
                validation: {
                    isValid: true,
                    hasWarnings: true,
                    errors: [],
                    warnings: [{
                        id: 'duplicate-starter',
                        severity: 'warning',
                        message: 'Duplicate starter',
                    }],
                    infos: [],
                },
                diagnostics: [{
                    id: 'missing-template-warning',
                    code: 'MISSING_TEMPLATE_WARNING',
                    severity: 'warning',
                    message: 'Template warning',
                }],
            },
        )).resolves.toBe(true);
        expect(writeFileMock).toHaveBeenCalledTimes(1);
    });

    it('rejects an inconsistent validation result even when errors are omitted', async () => {
        await expect(exportToExcel(
            [detailItem()],
            [summaryItem()],
            {
                format: 'full',
                validation: { isValid: false, hasWarnings: false, errors: [], warnings: [], infos: [] },
            },
        )).rejects.toThrow('INVALID_VALIDATION_RESULT');
        expect(writeFileMock).not.toHaveBeenCalled();
    });
});

describe('prepareExportRows', () => {
    it('uses the same positive/not-found rules as workbook export', () => {
        const prepared = prepareExportRows(
            [detailItem(), detailItem({ id: 'zero', quantity: 0 }), detailItem({ id: 'nf', productCode: 'NOT_FOUND' })],
            [summaryItem(), summaryItem({ id: 'zero', totalQuantity: 0 }), summaryItem({ id: 'nf', productCode: 'NOT_FOUND' })],
        );

        expect(prepared.detail.map(row => row.id)).toEqual(['line-1']);
        expect(prepared.summary.map(row => row.id)).toEqual(['IB-1']);
    });

    // P1.3: Summary phải derive từ Detail; caller Summary lệch => chặn export.
    it('derives Summary from Detail when caller passes no summary', () => {
        const prepared = prepareExportRows([detailItem()], []);
        expect(prepared.summary).toHaveLength(1);
        expect(prepared.summary[0].ibomCode).toBe('IB-1');
        expect(prepared.summary[0].totalQuantity).toBe(2);
    });

    it('passes reconciliation when caller Summary matches Detail aggregate', () => {
        const prepared = prepareExportRows([detailItem()], [summaryItem()]);
        expect(prepared.summary.map(r => r.id)).toEqual(['IB-1']);
        expect(prepared.summary[0].totalQuantity).toBe(2);
    });

    it('blocks a stale Summary total that disagrees with Detail', () => {
        expect(() => prepareExportRows([detailItem()], [summaryItem({ totalQuantity: 5 })]))
            .toThrow('SUMMARY_DETAIL_MISMATCH');
    });

    it('blocks when caller Summary is missing a key present in Detail', () => {
        // Detail has IB-1; caller Summary only lists an unrelated IB-2.
        expect(() => prepareExportRows(
            [detailItem()],
            [summaryItem({ id: 'IB-2', ibomCode: 'IB-2', productCode: 'P-2' })],
        )).toThrow('SUMMARY_DETAIL_MISMATCH');
    });

    it('aggregates multiple Detail rows of the same key before comparing', () => {
        // Two DOL starters contribute qty 2 each to IB-1 => expected total 4.
        const prepared = prepareExportRows(
            [detailItem(), detailItem({ id: 'line-2', starterId: 'starter-2' })],
            [summaryItem({ totalQuantity: 4 })],
        );
        expect(prepared.summary).toHaveLength(1);
        expect(prepared.summary[0].totalQuantity).toBe(4);
    });
});
