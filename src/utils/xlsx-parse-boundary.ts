/**
 * P3.1 (Worker isolation): CỬA đọc file import duy nhất.
 * 1) chặn file vượt giới hạn (fail-fast, trước khi đọc byte);
 * 2) parse sheet đầu trong Web Worker với timeout — quá hạn thì `terminate()` (giết parse treo);
 * 3) fallback parse main-thread khi môi trường không có Worker (test/SSR).
 *
 * Phân biệt lỗi HẠ TẦNG worker (→ fallback, parse lại main-thread) với lỗi PARSE thật
 * hoặc TIMEOUT (→ ném ra ngoài, KHÔNG chạy lại để tránh treo UI trên file bệnh lý).
 */
import { parseFirstSheetRows } from './xlsx-parse-core';
import { assertFileWithinLimit } from './excel-safety';

/** Trần thời gian parse 1 file (ms). Quá hạn = huỷ Worker + ném timeout. */
export const XLSX_PARSE_TIMEOUT_MS = 20_000;

export class XlsxParseTimeoutError extends Error {
    constructor(ms: number) {
        super(`[XLSX_PARSE_TIMEOUT] Đọc file quá ${ms}ms — file có thể lỗi/độc, đã huỷ.`);
        this.name = 'XlsxParseTimeoutError';
    }
}

interface InfraError extends Error { __xlsxInfra?: boolean }
const infra = (msg: string): InfraError => Object.assign(new Error(msg), { __xlsxInfra: true });

let seq = 0;

function runInWorker(buffer: ArrayBuffer, timeoutMs: number): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
        let worker: Worker;
        try {
            worker = new Worker(new URL('./xlsx.worker.ts', import.meta.url), { type: 'module' });
        } catch {
            reject(infra('worker-unavailable'));
            return;
        }
        const id = ++seq;
        let done = false;
        const finish = (fn: () => void) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            worker.terminate();
            fn();
        };
        const timer = setTimeout(() => finish(() => reject(new XlsxParseTimeoutError(timeoutMs))), timeoutMs);
        worker.onmessage = (e: MessageEvent) => {
            const d = (e.data ?? {}) as { id: number; ok: boolean; rows?: Record<string, unknown>[]; error?: string };
            if (d.id !== id) return;
            if (d.ok) finish(() => resolve(d.rows ?? []));
            else finish(() => reject(new Error(d.error ?? 'Đọc workbook thất bại.')));
        };
        worker.onerror = (ev: ErrorEvent) => {
            ev.preventDefault?.();
            finish(() => reject(infra('worker-error')));
        };
        // buffer là bản sao (xem readFirstSheetRowsSafe) → transfer zero-copy vào worker an toàn.
        worker.postMessage({ id, buffer }, [buffer]);
    });
}

/**
 * Đọc rows sheet đầu của file import một cách an toàn.
 * @param file  file người dùng chọn
 * @param timeoutMs  trần parse; quá hạn ném `XlsxParseTimeoutError`
 */
export async function readFirstSheetRowsSafe(
    file: File,
    timeoutMs: number = XLSX_PARSE_TIMEOUT_MS,
): Promise<Record<string, unknown>[]> {
    assertFileWithinLimit(file);
    const buffer = await file.arrayBuffer();
    if (typeof Worker === 'undefined') {
        return parseFirstSheetRows(buffer); // môi trường không Worker → parse main-thread
    }
    try {
        // truyền BẢN SAO vào worker (bị detach khi transfer); giữ `buffer` gốc cho fallback.
        return await runInWorker(buffer.slice(0), timeoutMs);
    } catch (err) {
        if (err && (err as InfraError).__xlsxInfra) {
            return parseFirstSheetRows(buffer); // hạ tầng worker hỏng → parse main-thread (buffer gốc còn nguyên)
        }
        throw err; // lỗi parse thật / timeout → ném ra ngoài
    }
}
