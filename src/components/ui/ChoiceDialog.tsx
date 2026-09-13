/**
 * P4.3: Modal lựa chọn nhiều nút (thay prompt()/confirm() nhiều nhánh).
 * Dùng với helper Promise: mỗi nút resolve về `value` của nó; Escape/overlay = onCancel.
 * Không tự thực hiện hành động — chỉ phát lựa chọn, nên huỷ không bao giờ ghi dữ liệu.
 */
import { useEffect } from 'react';

export interface ChoiceButton<V = string> {
    label: string;
    value: V;
    variant?: 'primary' | 'danger' | 'neutral';
}

export interface ChoiceDialogProps<V = string> {
    open: boolean;
    message: string;
    title?: string;
    buttons: ChoiceButton<V>[];
    busy?: boolean;
    onChoose: (value: V) => void;
    onCancel: () => void;
}

const VARIANT_CLASS: Record<string, string> = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    neutral: 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700',
};

export function ChoiceDialog<V = string>({ open, message, title = 'Chọn thao tác', buttons, busy = false, onChoose, onCancel }: ChoiceDialogProps<V>) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) { e.preventDefault(); onCancel(); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, busy, onCancel]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!busy) onCancel(); }}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line max-h-72 overflow-auto">{message}</p>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                    {buttons.map((b, i) => (
                        <button
                            key={i}
                            type="button"
                            disabled={busy}
                            onClick={() => onChoose(b.value)}
                            className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASS[b.variant || 'primary']}`}
                        >
                            {b.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
