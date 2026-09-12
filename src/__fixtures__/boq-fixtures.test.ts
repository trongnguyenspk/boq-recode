import { describe, it, expect } from 'vitest';
import { generateDetailWithDiagnostics, generateSummary } from '../utils/boq-logic';
import { fixtureLibrary, fixtureTemplates, fixtureStarters, fixtureStarterMissingTemplate } from './boq-fixtures';

// P0.2: golden case — khóa hành vi core BOQ. Dùng lại cho P1.2 (so trước/sau migration power).
describe('BOQ fixture golden case', () => {
    it('generates the expected detail rows (incl. one NOT_FOUND)', () => {
        const { detail, diagnostics } = generateDetailWithDiagnostics(fixtureStarters, fixtureLibrary, fixtureTemplates);
        // 2 starters x 3 lines = 6 detail rows (includeMissingRows mặc định true).
        expect(detail).toHaveLength(6);

        // s1 (DOL 5.5, qty 2): 3 dòng, mỗi dòng quantity = 2.
        const s1 = detail.filter(d => d.starterId === 's1');
        expect(s1.map(d => d.quantity)).toEqual([2, 2, 2]);
        expect(s1.every(d => d.productCode !== 'NOT_FOUND')).toBe(true);

        // s2 (DOL 7.5, qty 1): MISSING_MK -> NOT_FOUND.
        const s2 = detail.filter(d => d.starterId === 's2');
        expect(s2).toHaveLength(3);
        expect(s2.some(d => d.productCode === 'NOT_FOUND' && d.matchKey === 'MISSING_MK')).toBe(true);
        expect(diagnostics.some(x => x.code === 'MISSING_PRODUCT')).toBe(true);
    });

    it('aggregates Summary by ibomCode, excluding NOT_FOUND', () => {
        const { detail } = generateDetailWithDiagnostics(fixtureStarters, fixtureLibrary, fixtureTemplates);
        const summary = generateSummary(detail);
        const byKey = Object.fromEntries(summary.map(s => [s.ibomCode, s.totalQuantity]));
        expect(byKey).toEqual({ 'IB-C12': 3, 'IB-T12': 3, 'IB-M32': 2 });
        // NOT_FOUND không bao giờ xuất hiện trong Summary.
        expect(summary.some(s => s.productCode === 'NOT_FOUND')).toBe(false);
    });

    it('reports MISSING_TEMPLATE for a starter whose tier has no template', () => {
        const { detail, diagnostics } = generateDetailWithDiagnostics([fixtureStarterMissingTemplate], fixtureLibrary, fixtureTemplates);
        expect(detail).toHaveLength(0);
        expect(diagnostics.some(x => x.code === 'MISSING_TEMPLATE')).toBe(true);
    });
});
