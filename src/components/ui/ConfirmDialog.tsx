/**
 * P4.3: Dialog xác nhận dùng chung, thay cho window.confirm native.
 * - accept / cancel / Escape(=cancel) / busy / error states.
 * - Không tự thực hiện hành động: chỉ phát onConfirm/onCancel để caller xử lý,
 *   nên huỷ (cancel/Escape) không bao giờ ghi dữ liệu.
 */
import { useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
    open: boolean;
    message: string;
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Kiểu nguy hiểm (nút xác nhận đỏ) cho hành động phá huỷ. */
    danger?: boolean;
    /** Đang xử lý: khoá nút và chặn Escape/cancel. */
    busy?: boolean;
    /** Thông báo lỗi hiển thị trong dialog (nếu có). */
    error?: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    open,
    message,
    title = 'Xác nhận',
    confirmLabel = 'Xác nhận',
    cancelLabel = 'Huỷ',
    danger = false,
    busy = false,
    error = null,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const confirmRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        confirmRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) {
                e.preventDefault();
                onCancel();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, busy, onCancel]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => { if (!busy) onCancel(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{message}</p>
                {error && (
                    <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
                )}
                <div className="mt-6 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition hover:bg-gray-50 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmRef}
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {busy ? 'Đang xử lý…' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
