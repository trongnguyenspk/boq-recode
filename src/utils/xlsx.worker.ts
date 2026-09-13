/**
 * P3.1 (Worker isolation): đọc/parse workbook trong Web Worker, tách khỏi main thread.
 * Main thread (`xlsx-parse-boundary.ts`) đặt timeout + `terminate()` để giết Worker khi
 * parse treo (phòng thủ chiều sâu ReDoS/hang) mà UI không đơ.
 * Worker chỉ nhận buffer → trả rows/mã lỗi; không truy cập DOM.
 */
import { parseFirstSheetRows } from './xlsx-parse-core';

// lib=DOM khiến `self` mang kiểu Window; cast về đúng shape của DedicatedWorkerGlobalScope đang dùng.
const ctx = self as unknown as {
    onmessage: ((e: MessageEvent) => void) | null;
    postMessage: (msg: unknown) => void;
};

ctx.onmessage = (e: MessageEvent) => {
    const { id, buffer } = (e.data ?? {}) as { id: number; buffer: ArrayBuffer };
    try {
        const rows = parseFirstSheetRows(buffer);
        ctx.postMessage({ id, ok: true, rows });
    } catch (err) {
        ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
};
