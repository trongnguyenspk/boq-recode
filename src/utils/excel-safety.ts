/**
 * P3.1: Boundary hardening cho đường đọc Excel (giữ xlsx@0.18.5).
 * - Giới hạn kích thước file / số sheet / số dòng / tổng cell TRƯỚC khi xử lý sâu,
 *   để bao biên thời gian parse (giảm phơi nhiễm ReDoS) và chặn workbook khổng lồ.
 * - Sanitize khóa nguy hiểm (__proto__/constructor/prototype) khỏi hàng đã parse
 *   để chặn prototype pollution từ dữ liệu người dùng.
 * Lưu ý: đây là lớp hardening đồng bộ. Cô lập parser trong Web Worker + timeout
 * là bước phòng thủ chiều sâu còn lại (refactor async, tách riêng).
 */
import * as XLSX from 'xlsx';

export interface ExcelLimits {
    maxFileBytes: number;
    maxSheets: number;
    maxRowsPerSheet: number;
    maxCellsPerWorkbook: number;
}

export const EXCEL_LIMITS: ExcelLimits = {
    maxFileBytes: 10 * 1024 * 1024, // 10 MiB
    maxSheets: 32,
    maxRowsPerSheet: 10_000,
    maxCellsPerWorkbook: 250_000,
};

/** Chặn file vượt giới hạn kích thước trước khi đọc. */
export function assertFileWithinLimit(file: { size?: number } | null | undefined, limits: ExcelLimits = EXCEL_LIMITS): void {
    const size = file && typeof file.size === 'number' ? file.size : 0;
    if (size > limits.maxFileBytes) {
        throw new Error(`[EXCEL_FILE_TOO_LARGE] File ${(size / 1048576).toFixed(1)}MB vượt giới hạn ${(limits.maxFileBytes / 1048576).toFixed(0)}MB.`);
    }
}

/** Chặn workbook vượt giới hạn số sheet / dòng / tổng cell sau khi đọc cấu trúc. */
export function assertWorkbookWithinLimits(workbook: XLSX.WorkBook, limits: ExcelLimits = EXCEL_LIMITS): void {
    const names = workbook?.SheetNames ?? [];
    if (names.length > limits.maxSheets) {
        throw new Error(`[EXCEL_TOO_MANY_SHEETS] Workbook có ${names.length} sheet, vượt giới hạn ${limits.maxSheets}.`);
    }
    let totalCells = 0;
    for (const name of names) {
        const sheet = workbook.Sheets?.[name];
        const ref = sheet && (sheet['!ref'] as string | undefined);
        if (!ref) continue;
        const range = XLSX.utils.decode_range(ref);
        const rows = range.e.r - range.s.r + 1;
        const cols = range.e.c - range.s.c + 1;
        if (rows > limits.maxRowsPerSheet) {
            throw new Error(`[EXCEL_TOO_MANY_ROWS] Sheet "${name}" có ${rows} dòng, vượt giới hạn ${limits.maxRowsPerSheet}.`);
        }
        totalCells += rows * cols;
        if (totalCells > limits.maxCellsPerWorkbook) {
            throw new Error(`[EXCEL_TOO_MANY_CELLS] Workbook vượt giới hạn ${limits.maxCellsPerWorkbook} cell.`);
        }
    }
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Loại khóa nguy hiểm khỏi mỗi hàng đã parse và trả về object null-proto.
 * Chặn prototype pollution khi hàng được lặp/spread ở hạ nguồn.
 */
export function sanitizeParsedRows<T>(rows: readonly T[]): T[] {
    return (rows || []).map(row => {
        if (!row || typeof row !== 'object') return row;
        const clean: Record<string, unknown> = Object.create(null);
        for (const key of Object.keys(row as object)) {
            if (DANGEROUS_KEYS.has(key)) continue;
            clean[key] = (row as Record<string, unknown>)[key];
        }
        return clean as T;
    });
}
