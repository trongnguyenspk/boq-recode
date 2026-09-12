import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from './ui/Toast';
import { InputWizard } from './InputWizard';
import type { StarterConfig } from '../types';
import { importStartersFromExcelDetailed } from '../utils/excel-import';

vi.mock('../utils/excel-import', () => ({
    importStartersFromExcelDetailed: vi.fn(),
    exportInputToExcel: vi.fn(),
    downloadImportTemplate: vi.fn(),
}));

const makeStarter = (overrides: Partial<StarterConfig> = {}): StarterConfig => ({
    id: 'imported-1',
    type: 'Valve',
    power: 5.5,
    powerKey: '5.5',
    quantity: 1,
    brand: 'OMEGA',
    isolator: false,
    signals: {
        thermal: false,
        ptc: false,
        estop: false,
        humidity: false,
        isolator_BFP: false,
        estop_BFP: false,
        isolator_estop_FB: false,
    },
    ...overrides,
});

const detailedResult = {
    starters: [makeStarter()],
    issues: [
        {
            field: 'Type' as const,
            value: 'Valve',
            fallback: 'DOL',
            policy: 'keep' as const,
            message: 'unknown type',
        },
        {
            field: 'Brand' as const,
            value: 'OMEGA',
            fallback: 'Schneider',
            policy: 'keep' as const,
            message: 'unknown brand',
        },
    ],
};

function renderWizard(onImportStarters = vi.fn()) {
    return render(
        <ToastProvider>
            <InputWizard
                onAddStarter={vi.fn()}
                templates={{ DOL: { '5.5': [] } }}
                brands={['Schneider']}
                onImportStarters={onImportStarters}
                onAddBrand={vi.fn()}
                onAddStarterType={vi.fn()}
            />
        </ToastProvider>,
    );
}

describe('InputWizard import decisions', () => {
    let fileInput: HTMLInputElement | undefined;
    let createElement: typeof document.createElement;

    beforeEach(() => {
        vi.clearAllMocks();
        fileInput = undefined;
        createElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
            const element = createElement(tagName, options);
            if (tagName.toLowerCase() === 'input') fileInput = element as HTMLInputElement;
            return element;
        }) as typeof document.createElement);
        vi.spyOn(window, 'prompt').mockReturnValue('ADD');
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        vi.mocked(importStartersFromExcelDetailed).mockResolvedValue(detailedResult);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('ADD reports unknown values and updates both catalogs before import', async () => {
        const onImportStarters = vi.fn();
        const onAddBrand = vi.fn();
        const onAddStarterType = vi.fn();
        render(
            <ToastProvider>
                <InputWizard
                    onAddStarter={vi.fn()}
                    templates={{ DOL: { '5.5': [] } }}
                    brands={['Schneider']}
                    onImportStarters={onImportStarters}
                    onAddBrand={onAddBrand}
                    onAddStarterType={onAddStarterType}
                />
            </ToastProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: /Nhập Input/i }));
        expect(fileInput).toBeDefined();
        const file = new File(['xlsx'], 'inputs.xlsx');
        Object.defineProperty(fileInput, 'files', { value: [file] });
        fireEvent.change(fileInput!);

        await waitFor(() => {
            expect(window.prompt).toHaveBeenCalledWith(expect.stringContaining('OMEGA'));
            expect(onAddBrand).toHaveBeenCalledWith('OMEGA');
            expect(onAddStarterType).toHaveBeenCalledWith('Valve');
            expect(onImportStarters).toHaveBeenCalledWith(detailedResult.starters, 'append');
        });
    });

    it('SKIP re-reads with skip policy and leaves source data untouched', async () => {
        vi.mocked(window.prompt).mockReturnValue('SKIP');
        vi.mocked(importStartersFromExcelDetailed)
            .mockResolvedValueOnce(detailedResult)
            .mockResolvedValueOnce({ starters: [], issues: detailedResult.issues });
        const onImportStarters = vi.fn();
        renderWizard(onImportStarters);

        fireEvent.click(screen.getByRole('button', { name: /Nhập Input/i }));
        const file = new File(['xlsx'], 'inputs.xlsx');
        Object.defineProperty(fileInput, 'files', { value: [file] });
        fireEvent.change(fileInput!);

        await waitFor(() => {
            expect(importStartersFromExcelDetailed).toHaveBeenCalledTimes(2);
            expect(importStartersFromExcelDetailed).toHaveBeenLastCalledWith(
                file,
                ['DOL'],
                ['Schneider'],
                { unknownType: 'skip', unknownBrand: 'skip' },
            );
            expect(onImportStarters).not.toHaveBeenCalled();
            expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('không có dòng'));
        });
    });
});
