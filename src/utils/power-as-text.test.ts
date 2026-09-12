import { describe, it, expect } from 'vitest';
import { generateDetailWithDiagnostics } from './boq-logic';
import type { Product, StarterConfig } from '../types';

// P1.2 (PA-1): công suất thành text hiển thị (powerLabel) + tier chọn bằng tierKey tự do.
// Dữ liệu legacy (chỉ có `power` số) phải giữ nguyên hành vi.

const unit = 'Cái' as const;
const library: Product[] = [
    { id: 'c12', matchKey: 'CONTACTOR_12A', code: 'LC1D12', ibomCode: 'IB-C12', description: 'Contactor 12A', brand: 'Schneider', unit },
];
const templates: Record<string, Record<string, { matchKey: string; qty: number }[]>> = {
    DOL: {
        '5.5': [{ matchKey: 'CONTACTOR_12A', qty: 1 }],
        'tu-bien-tan': [{ matchKey: 'CONTACTOR_12A', qty: 2 }], // tierKey tự do, phi số
    },
};
const signalsOff = { thermal: false, ptc: false, estop: false, humidity: false, isolator_BFP: false, estop_BFP: false, isolator_estop_FB: false };
const base = { type: 'DOL', quantity: 1, brand: 'Schneider', isolator: false, signals: { ...signalsOff } };

describe('P1.2 power-as-text (PA-1)', () => {
    it('resolves a free-text tierKey and displays the free-text powerLabel', () => {
        const starter: StarterConfig = { ...base, id: 's1', tierKey: 'tu-bien-tan', powerLabel: '11kW (biến tần)' };
        const { detail } = generateDetailWithDiagnostics([starter], library, templates);
        expect(detail).toHaveLength(1);
        expect(detail[0].quantity).toBe(2); // tier 'tu-bien-tan' => qty 2
        expect(detail[0].starterName).toBe('DOL - 11kW (biến tần)'); // powerLabel hiển thị
    });

    it('keeps numeric power untouched when only powerLabel is set (label is display-only)', () => {
        const starter: StarterConfig = { ...base, id: 's2', power: '5.5', powerLabel: '5.5 kW (dự phòng)' };
        const { detail } = generateDetailWithDiagnostics([starter], library, templates);
        expect(detail).toHaveLength(1);
        expect(detail[0].quantity).toBe(1); // tier '5.5'
        expect(detail[0].starterName).toBe('DOL - 5.5 kW (dự phòng)');
    });

    it('legacy starter with only numeric power is unchanged', () => {
        const starter: StarterConfig = { ...base, id: 's3', power: '5.5' };
        const { detail } = generateDetailWithDiagnostics([starter], library, templates);
        expect(detail).toHaveLength(1);
        expect(detail[0].starterName).toBe('DOL - 5.5kW');
    });

    it('tierKey takes precedence over numeric power for tier selection', () => {
        const starter: StarterConfig = { ...base, id: 's4', power: '5.5', tierKey: 'tu-bien-tan' };
        const { detail } = generateDetailWithDiagnostics([starter], library, templates);
        expect(detail[0].quantity).toBe(2); // dùng tier tierKey, không phải '5.5'
    });
});
