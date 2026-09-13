/**
 * P3.1 (Worker isolation): hàm parse THUẦN, không DOM/Worker.
 * Dùng CHUNG bởi Web Worker (`xlsx.worker.ts`) và đường fallback main-thread
 * (`xlsx-parse-boundary.ts`) → hành vi parse y hệt ở cả hai môi trường.
 * Giữ nguyên guard: giới hạn sheet/dòng/cell + sanitize prototype-pollution.
 */
import * as XLSX from 'xlsx';
import { assertWorkbookWithinLimits, sanitizeParsedRows } from './excel-safety';

/** buffer .xlsx → rows sheet đầu, đã qua limit + sanitize. Ném lỗi (có mã) khi vượt giới hạn. */
export function parseFirstSheetRows(buffer: ArrayBuffer): Record<string, unknown>[] {
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    assertWorkbookWithinLimits(workbook);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    return sanitizeParsedRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet));
}
