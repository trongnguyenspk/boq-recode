import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkbookTransferModal } from './WorkbookTransferModal';
import type { WorkbookDiff } from '../utils/workbook-pipeline';

function emptyDiff(): WorkbookDiff {
    const emptySheet = (sheet: WorkbookDiff['sheets'][keyof WorkbookDiff['sheets']]['sheet']) => ({
        sheet,
        added: [],
        updated: [],
        deleted: [],
        skipped: [],
        additions: [],
        updates: [],
        deletes: [],
    });
    const sheets = {
        _Meta: emptySheet('_Meta'),
        Products: emptySheet('Products'),
        MatchKeys: emptySheet('MatchKeys'),
        Templates: emptySheet('Templates'),
        Brands: emptySheet('Brands'),
        Project: emptySheet('Project'),
        Starters: emptySheet('Starters'),
        ManualLines: emptySheet('ManualLines'),
        Overrides: emptySheet('Overrides'),
    };
    return { schema: 'boq-workbook', schemaVersion: 1, sheets, issues: [], changes: [] };
}

describe('WorkbookTransferModal', () => {
    it('locks every close path while loading', () => {
        const onClose = vi.fn();
        render(
            <WorkbookTransferModal
                isOpen
                isLoading
                diff={null}
                onClose={onClose}
                onApply={vi.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: 'Close workbook preview' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('allows Escape when the preview is idle', () => {
        const onClose = vi.fn();
        render(
            <WorkbookTransferModal
                isOpen
                diff={emptyDiff()}
                onClose={onClose}
                onApply={vi.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: 'Close workbook preview' })).toBeEnabled();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
