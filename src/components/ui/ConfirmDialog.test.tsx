import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

// P4.3: dialog xác nhận dùng chung — huỷ/Escape không được gọi onConfirm.
describe('ConfirmDialog', () => {
    const setup = (over = {}) => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(<ConfirmDialog open message="Xoá cái này?" onConfirm={onConfirm} onCancel={onCancel} {...over} />);
        return { onConfirm, onCancel };
    };

    it('renders nothing when closed', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        const { container } = render(<ConfirmDialog open={false} message="x" onConfirm={onConfirm} onCancel={onCancel} />);
        expect(container.firstChild).toBeNull();
    });

    it('shows the message and title when open', () => {
        setup({ title: 'Xoá dự án' });
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(screen.getByText('Xoá cái này?')).toBeTruthy();
        expect(screen.getByText('Xoá dự án')).toBeTruthy();
    });

    it('calls onConfirm when the confirm button is clicked', () => {
        const { onConfirm, onCancel } = setup({ confirmLabel: 'Xoá' });
        fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('calls onCancel (not onConfirm) when cancel is clicked', () => {
        const { onConfirm, onCancel } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('cancels on Escape', () => {
        const { onConfirm, onCancel } = setup();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('disables confirm and ignores Escape while busy', () => {
        const { onConfirm, onCancel } = setup({ busy: true, confirmLabel: 'Xoá' });
        expect((screen.getByRole('button', { name: /Đang xử lý/ }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onCancel).not.toHaveBeenCalled();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('shows an error message when provided', () => {
        setup({ error: 'Không xoá được' });
        expect(screen.getByRole('alert').textContent).toContain('Không xoá được');
    });
});
