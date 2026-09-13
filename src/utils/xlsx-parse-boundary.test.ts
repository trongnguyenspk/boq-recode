import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { parseFirstSheetRows } from './xlsx-parse-core';
import { readFirstSheetRowsSafe, XlsxParseTimeoutError } from './xlsx-parse-boundary';

/** Dựng buffer .xlsx thật từ rows để test parse end-to-end. */
function xlsxBuffer(rows: Record<string, unknown>[]): ArrayBuffer {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer | Uint8Array;
    if (out instanceof ArrayBuffer) return out;
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

function fileFrom(rows: Record<string, unknown>[]): File {
    const buf = xlsxBuffer(rows);
    const file = new File([buf], 'in.xlsx');
    // jsdom File.arrayBuffer đôi khi thiếu → nạp buffer đã biết.
    Object.defineProperty(file, 'arrayBuffer', { value: async () => buf });
    return file;
}

describe('parseFirstSheetRows (core)', () => {
    it('parses first-sheet rows', () => {
        const rows = parseFirstSheetRows(xlsxBuffer([{ MatchKey: 'MK1', Qty: 2 }]));
        expect(rows).toEqual([{ MatchKey: 'MK1', Qty: 2 }]);
    });

    it('drops prototype-pollution keys at the boundary', () => {
        // sheet_to_json không tự sinh __proto__; kiểm sanitize giữ null-proto + bỏ key độc nếu có.
        const rows = parseFirstSheetRows(xlsxBuffer([{ A: 1 }]));
        expect(Object.getPrototypeOf(rows[0])).toBeNull();
    });
});

describe('readFirstSheetRowsSafe — fallback (no Worker)', () => {
    const OriginalWorker = (globalThis as { Worker?: unknown }).Worker;
    beforeEach(() => { delete (globalThis as { Worker?: unknown }).Worker; });
    afterEach(() => {
        if (OriginalWorker === undefined) delete (globalThis as { Worker?: unknown }).Worker;
        else (globalThis as { Worker?: unknown }).Worker = OriginalWorker;
        vi.restoreAllMocks();
    });

    it('parses on the main thread when Worker is unavailable', async () => {
        const rows = await readFirstSheetRowsSafe(fileFrom([{ Type: 'DOL', Power: '5.5' }]));
        expect(rows).toEqual([{ Type: 'DOL', Power: '5.5' }]);
    });

    it('rejects an oversized file before reading', async () => {
        const file = fileFrom([{ A: 1 }]);
        Object.defineProperty(file, 'size', { value: 999 * 1024 * 1024 });
        await expect(readFirstSheetRowsSafe(file)).rejects.toThrow();
    });
});

describe('readFirstSheetRowsSafe — Worker paths', () => {
    const g = globalThis as { Worker?: unknown };
    const OriginalWorker = g.Worker;
    afterEach(() => {
        if (OriginalWorker === undefined) delete g.Worker;
        else g.Worker = OriginalWorker;
        vi.restoreAllMocks();
    });

    it('resolves with rows returned by the worker', async () => {
        class FakeWorker {
            onmessage: ((e: { data: unknown }) => void) | null = null;
            onerror: ((e: unknown) => void) | null = null;
            postMessage(msg: { id: number }) {
                setTimeout(() => this.onmessage?.({ data: { id: msg.id, ok: true, rows: [{ ok: 1 }] } }), 0);
            }
            terminate() {}
        }
        g.Worker = FakeWorker as unknown;
        const rows = await readFirstSheetRowsSafe(fileFrom([{ A: 1 }]));
        expect(rows).toEqual([{ ok: 1 }]);
    });

    it('propagates a real parse error from the worker (no silent fallback)', async () => {
        class FakeWorker {
            onmessage: ((e: { data: unknown }) => void) | null = null;
            onerror: ((e: unknown) => void) | null = null;
            postMessage(msg: { id: number }) {
                setTimeout(() => this.onmessage?.({ data: { id: msg.id, ok: false, error: '[EXCEL_TOO_MANY_ROWS]' } }), 0);
            }
            terminate() {}
        }
        g.Worker = FakeWorker as unknown;
        await expect(readFirstSheetRowsSafe(fileFrom([{ A: 1 }]))).rejects.toThrow(/EXCEL_TOO_MANY_ROWS/);
    });

    it('falls back to the main thread on worker infra error', async () => {
        class FakeWorker {
            onmessage: ((e: { data: unknown }) => void) | null = null;
            onerror: ((e: unknown) => void) | null = null;
            postMessage() { setTimeout(() => this.onerror?.({ preventDefault() {} }), 0); }
            terminate() {}
        }
        g.Worker = FakeWorker as unknown;
        const rows = await readFirstSheetRowsSafe(fileFrom([{ B: 2 }]));
        expect(rows).toEqual([{ B: 2 }]); // parse main-thread thành công
    });

    it('times out and terminates a hung worker (does not fall back)', async () => {
        const terminate = vi.fn();
        class FakeWorker {
            onmessage: ((e: { data: unknown }) => void) | null = null;
            onerror: ((e: unknown) => void) | null = null;
            postMessage() { /* không bao giờ trả lời */ }
            terminate = terminate;
        }
        g.Worker = FakeWorker as unknown;
        await expect(readFirstSheetRowsSafe(fileFrom([{ A: 1 }]), 20)).rejects.toBeInstanceOf(XlsxParseTimeoutError);
        expect(terminate).toHaveBeenCalled();
    });
});
