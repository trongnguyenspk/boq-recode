import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { assertFileWithinLimit, assertWorkbookWithinLimits, sanitizeParsedRows, EXCEL_LIMITS } from './excel-safety';

function workbookWithRange(rows: number, cols: number, sheets = 1): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();
    for (let s = 0; s < sheets; s++) {
        const aoa = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 'x'));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), `S${s}`);
    }
    return wb;
}

describe('P3.1 excel-safety limits', () => {
    it('accepts a small file and a small workbook', () => {
        expect(() => assertFileWithinLimit({ size: 1024 })).not.toThrow();
        expect(() => assertWorkbookWithinLimits(workbookWithRange(10, 5))).not.toThrow();
    });

    it('rejects an oversized file before parse', () => {
        expect(() => assertFileWithinLimit({ size: EXCEL_LIMITS.maxFileBytes + 1 })).toThrow('EXCEL_FILE_TOO_LARGE');
    });

    it('rejects too many sheets', () => {
        const wb = workbookWithRange(1, 1, EXCEL_LIMITS.maxSheets + 1);
        expect(() => assertWorkbookWithinLimits(wb)).toThrow('EXCEL_TOO_MANY_SHEETS');
    });

    it('rejects too many rows in a sheet', () => {
        const wb = workbookWithRange(EXCEL_LIMITS.maxRowsPerSheet + 1, 1);
        expect(() => assertWorkbookWithinLimits(wb)).toThrow('EXCEL_TOO_MANY_ROWS');
    });

    it('rejects too many cells across the workbook', () => {
        // 5000 rows x 60 cols = 300k cells > 250k cap, but under per-sheet row cap.
        const wb = workbookWithRange(5000, 60);
        expect(() => assertWorkbookWithinLimits(wb)).toThrow('EXCEL_TOO_MANY_CELLS');
    });
});

describe('P3.1 excel-safety sanitize', () => {
    it('strips dangerous keys and returns null-proto rows', () => {
        const malicious = JSON.parse('[{"__proto__":{"polluted":true},"MatchKey":"X","qty":2}]');
        const clean = sanitizeParsedRows<any>(malicious);
        expect(clean[0].MatchKey).toBe('X');
        expect(clean[0].qty).toBe(2);
        expect(Object.prototype.hasOwnProperty.call(clean[0], '__proto__')).toBe(false);
        // Object.prototype must not have been polluted for plain objects.
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('keeps normal rows intact', () => {
        const rows = [{ a: 1, b: 'two' }];
        const clean = sanitizeParsedRows(rows);
        expect(clean).toEqual([{ a: 1, b: 'two' }]);
    });
});
